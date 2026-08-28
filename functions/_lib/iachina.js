// functions/_lib/iachina.js
// 中保协信息披露系统 (icidp.iachina.cn) 客户端 — 云端直连抓取保险公司年报
// 2026-08-24 实测打通的全链路（反爬机制见下）：
//   1. 生成 clientIdCard（30位洗牌随机串 + 毫秒时间戳），放入 Accept-Encodings 请求头
//   2. GET /front 首页           → 拿到 JSESSIONID + SF_cookie_28（缺这一步后续 API 全部 404）
//   3. POST /front/captchaCheck.do（body: clientIdCard=xxx）
//                                  → 响应 msg 为 AES-128-CBC 密文（零填充，非 PKCS7）
//                                    key='0d36c68466e06b99' iv='0840e274812143f5'（captchaCheck.js 源码明文）
//                                    解密后 JSON 中 clientIpStatus==='success' 表示免验证码
//   4. POST /front/getAllInfosByCid.do?columnid=201510010001（body: pageNo=1）
//                                  → 一次返回全部约3100条披露记录（GBK 编码 HTML，翻页无效）
//                                    columnid=201510010001 = 保险公司年度信息披露
//                                    每条记录：title="公司全称+年份+报告类型" + onclick="info('info_no','attr','col')"
//   5. POST /front/infoDetail.do?informationno={info_no} → 详情页 HTML（GBK）
//                                    含 down3('UUID.PDF') 即 PDF 附件文件名
//   6. GET /files/piluxinxi/pdf/{UUID.PDF} → 直接返回 PDF 二进制（%PDF 头）
// 注意事项：
//   - 请求间需 300~800ms 限速（避免触发 WAF 限流）
//   - 文本响应为 GBK 编码；captchaCheck 响应为 UTF-8 JSON
//   - 此模块全部使用 Web API + node:crypto，可直接在 Cloudflare Workers 运行
import crypto from 'node:crypto';

const BASE = 'https://icidp.iachina.cn';
const COLUMN_ANNUAL = '201510010001'; // 保险公司年度信息披露栏目
const AES_KEY = '0d36c68466e06b99';   // captchaCheck.js 中的 AES key（utf8）
const AES_IV = '0840e274812143f5';    // captchaCheck.js 中的 AES IV（utf8）
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_SLEEP = 400;

// 模块级列表缓存（同一 isolate 内跨请求共享，避免每次下载都重新拉 ~1MB 全量列表）
// 年报列表一天最多更新几条，6 小时 TTL 足够新鲜
const LIST_TTL = 6 * 60 * 60 * 1000;
let _listCache = null; // { records, ts }

// ---------- 工具 ----------

// 生成 clientIdCard：30位 Fisher-Yates 洗牌随机串 + 毫秒时间戳
export function genClientId() {
  const chars = 'abcdefghijABCDEFGHIJKL0123456789MNOPQRSTUVWXYZklmnopqrstuvwxyz';
  const arr = chars.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 30).join('') + Date.now();
}

// AES-128-CBC 解密（零填充 → 必须 setAutoPadding(false)，WebCrypto 无法直接解密）
export function decryptIachina(msg) {
  const b64 = String(msg).replaceAll('_', '+');
  const d = crypto.createDecipheriv('aes-128-cbc', Buffer.from(AES_KEY, 'utf8'), Buffer.from(AES_IV, 'utf8'));
  d.setAutoPadding(false);
  let out = d.update(b64, 'base64', 'utf8');
  out += d.final('utf8');
  return out;
}

// 解析披露列表 HTML（GBK 已解码）→ 记录数组
function parseInfoList(html) {
  const records = [];
  const infoRe = /onclick="info\('([^']+)','([^']+)','([^']+)'\)"/g;
  const titleRe = /title="([^"]+)"/g;
  const dateRe = /<p class="kk"[^>]*>([^<]+)<\/p>/g;
  const infos = [], titles = [], dates = [];
  let m;
  while ((m = infoRe.exec(html)) !== null) infos.push({ info_no: m[1], attr: m[2], col: m[3] });
  while ((m = titleRe.exec(html)) !== null) titles.push(m[1]);
  while ((m = dateRe.exec(html)) !== null) dates.push(m[1].trim());
  const n = Math.max(infos.length, titles.length, dates.length);
  for (let i = 0; i < n; i++) {
    records.push({ info_no: (infos[i] && infos[i].info_no) || '', title: titles[i] || '', date: dates[i] || '' });
  }
  return records;
}

// ---------- 客户端 ----------

// 创建带 cookie 会话 / 列表缓存的客户端。同一 client 可复用于批量下载（列表只拉一次）。
export function createIachinaClient({ timeout = 29000, sleepMs = DEFAULT_SLEEP } = {}) {
  const clientId = genClientId();
  const cookies = new Map();
  let sessionDone = false;
  let list = null;

  const client = {
    clientId,
    sleep: (ms = sleepMs) => new Promise(r => setTimeout(r, ms)),

    // 核心请求：自动携带 clientIdCard/timestamp/cookie，收集 set-cookie
    async req(method, path, { body, binary = false } = {}) {
      const headers = {
        'Accept-Encodings': clientId,
        'timestamp': String(Date.now()),
        'User-Agent': UA,
        'Referer': BASE + '/',
      };
      if (body != null) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      if (cookies.size) {
        headers['Cookie'] = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
      }
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeout);
      try {
        let resp;
        try {
          resp = await fetch(BASE + path, {
            method,
            headers,
            body: body != null ? body : undefined,
            redirect: 'follow',
            signal: ctl.signal,
          });
        } catch (e) {
          // 超时中断等网络异常转为可控返回（aborted 标记供上层重试）
          const aborted = e && (e.name === 'AbortError' || /aborted/i.test(e.message || ''));
          return { status: 0, ok: false, aborted, error: (e && e.message) || String(e) };
        }
        // 收集 set-cookie（Workers 与 Node 19.7+ 均支持 getSetCookie）
        const setCookie = typeof resp.headers.getSetCookie === 'function'
          ? resp.headers.getSetCookie()
          : (resp.headers.get('set-cookie') ? [resp.headers.get('set-cookie')] : []);
        for (const c of setCookie) {
          const eq = c.indexOf('=');
          if (eq > 0) {
            const semi = c.indexOf(';');
            cookies.set(c.slice(0, eq).trim(), c.slice(eq + 1, semi > 0 ? semi : undefined).trim());
          }
        }
        const buf = await resp.arrayBuffer();
        return { status: resp.status, ok: resp.ok, buf, headers: resp.headers };
      } finally {
        clearTimeout(timer);
      }
    },

    // 步骤1+2：GET 首页建会话 → captchaCheck 验证
    async ensureSession() {
      if (sessionDone) return { ok: true };
      const home = await this.req('GET', '/');
      if (!home.ok) return { ok: false, error: `中保协首页访问失败 HTTP ${home.status}` };
      await this.sleep();
      const cap = await this.req('POST', '/front/captchaCheck.do', { body: 'clientIdCard=' + clientId });
      let status = '';
      try {
        const text = new TextDecoder().decode(cap.buf).replace(/<html>[\s\S]*$/i, '');
        const j = JSON.parse(text);
        if (j && j.msg) {
          const dec = decryptIachina(j.msg);
          const m = /"clientIpStatus"\s*:\s*"([^"]+)"/.exec(dec);
          status = m ? m[1] : '';
        }
      } catch (e) {
        // 解密/解析失败不阻塞：继续尝试列表请求（老接口可能已放宽）
      }
      if (status && status !== 'success') {
        return { ok: false, error: `中保协验证未通过：clientIpStatus=${status}（可能触发验证码）` };
      }
      sessionDone = true;
      return { ok: true };
    },

    // 步骤3：拉取全量披露列表（一次返回全部，约3100条，GBK）
    // 优先用模块级缓存（同 isolate 跨请求共享）；拉取超时会重试一次
    async loadList() {
      if (_listCache && Date.now() - _listCache.ts < LIST_TTL) {
        return { ok: true, records: _listCache.records, cached: true };
      }
      if (list) return { ok: true, records: list };
      const s = await this.ensureSession();
      if (!s.ok) return s;
      await this.sleep();
      let r;
      for (let attempt = 1; attempt <= 2; attempt++) {
        r = await this.req('POST', `/front/getAllInfosByCid.do?columnid=${COLUMN_ANNUAL}`, { body: 'pageNo=1' });
        if (r.ok || !r.aborted) break;
        if (attempt < 2) await this.sleep(1500); // 超时后等 1.5s 重试一次
      }
      if (!r.ok) return { ok: false, error: `中保协年报列表获取失败 HTTP ${r.status}${r.aborted ? '（超时）' : ''}` };
      const html = new TextDecoder('gbk').decode(r.buf);
      list = parseInfoList(html);
      if (!list.length) return { ok: false, error: '中保协年报列表为空' };
      _listCache = { records: list, ts: Date.now() };
      return { ok: true, records: list };
    },

    // 按 公司名（简称/全称）+ 年度 过滤列表。
    // 分层匹配（前一层有结果就不用后一层，避免「中国人寿」命中财险/资管子公司）：
    //   1. 全称精确匹配（title 含 fullName）
    //   2. 核心名匹配（去「保险股份有限公司/有限责任公司」等后缀）——
    //      兼容公司注册类型变更：如泰康人寿 股份有限公司(2016前) → 有限责任公司(2016后)
    //   3. 简称匹配
    async search(company, fullName, year) {
      const lst = await this.loadList();
      if (!lst.ok) return lst;
      const yearNum = String(year || '').replace(/\s+/g, '').replace(/年度$/, '').replace(/年$/, '');
      const full = (fullName || '').trim();
      const short = (company || '').trim();
      const coreOf = s => (s || '')
        .replace(/保险股份有限公司$/, '')
        .replace(/保险有限责任公司$/, '')
        .replace(/保险有限公司$/, '')
        .replace(/股份有限公司$/, '')
        .replace(/有限责任公司$/, '')
        .replace(/有限公司$/, '');
      // 关键字按特异性降序：全称 → 全称核心名 → 简称核心名 → 简称
      const keywords = [...new Set([full, coreOf(full), coreOf(short), short].filter(k => k && k.length >= 2))];
      const yearOk = t => !yearNum || t.includes(yearNum + '年年度') || t.includes(yearNum + '年度');
      let matched = [];
      for (const kw of keywords) {
        const hits = lst.records.filter(r => {
          const t = r.title || '';
          return t.includes(kw) && t.includes('年度') && yearOk(t);
        });
        if (hits.length) { matched = hits; break; }
      }
      return { ok: true, records: matched };
    },

    // 步骤4：详情页 → 提取 PDF 文件名（down3('UUID.PDF')）
    async getPdfName(infoNo) {
      await this.sleep();
      const r = await this.req('POST', `/front/infoDetail.do?informationno=${infoNo}`, { body: '' });
      if (!r.ok) return { ok: false, error: `中保协详情页获取失败 HTTP ${r.status}` };
      const html = new TextDecoder('gbk').decode(r.buf);
      const m = /down3\('([^']+)'\)/.exec(html);
      if (!m) return { ok: false, error: '中保协详情页未找到 PDF 附件' };
      return { ok: true, fileName: m[1] };
    },

    // 步骤5：下载 PDF 二进制
    async downloadPdf(fileName) {
      await this.sleep();
      const r = await this.req('GET', `/files/piluxinxi/pdf/${fileName}`);
      if (!r.ok) {
        // 超时通常是年报 PDF 较大（10MB+），Cloudflare 服务器抓取超过时限；与用户本地网络无关
        return { ok: false, error: r.aborted
          ? `中保协 PDF 下载超时（${Math.round(timeout / 1000)}s 限制，年报文件较大时易触发），可稍后重试或手动下载后上传`
          : `中保协 PDF 下载失败 HTTP ${r.status}` };
      }
      return { ok: true, buf: r.buf };
    },
  };
  return client;
}

// ---------- 一站式：搜索 + 详情 + 下载 ----------

// 返回：{ ok:true, buf, source:'iachina', title, date, fileName } 或 { ok:false, error, notFound? }
export async function fetchAnnualPdf({ company, fullName, year } = {}, opts = {}) {
  const client = opts.client || createIachinaClient();
  try {
    const s = await client.ensureSession();
    if (!s.ok) return s;
    const lst = await client.loadList();
    if (!lst.ok) return lst;
    const found = await client.search(company, fullName, year);
    if (!found.ok) return found;
    if (!found.records.length) {
      return {
        ok: false,
        notFound: true,
        error: `中保协未找到「${company}」${year || ''} 的年报（已搜全部披露记录，可能公司名写法不同）`,
      };
    }
    const best = found.records[0];
    const det = await client.getPdfName(best.info_no);
    if (!det.ok) return det;
    const dl = await client.downloadPdf(det.fileName);
    if (!dl.ok) return dl;
    const head = new Uint8Array(dl.buf.slice(0, 4));
    const isPdf = head.length === 4 && head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
    if (!isPdf) return { ok: false, error: '中保协返回的文件不是有效 PDF（%PDF 头缺失）' };
    return {
      ok: true,
      buf: dl.buf,
      source: 'iachina',
      title: best.title,
      date: best.date,
      fileName: det.fileName,
    };
  } catch (e) {
    return { ok: false, error: '中保协连接失败：' + ((e && e.message) || e), retryable: true };
  }
}

// 导出列，便于外部测试
export const _internal = { parseInfoList, BASE, COLUMN_ANNUAL };
