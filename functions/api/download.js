// /api/download — PDF 下载/上传管理
// GET  ?company=&year=                    — 查询某公司 PDF 是否已存在【公开】
// POST {company, year, url?}              — 有 url：服务端抓取存存储；无 url 查 sources.json 自动下载地址【需管理密码】
// POST {companies:[...], year}            — 批量下载（并发3），每家公司独立结果【需管理密码】
// POST multipart（file 字段）             — 直接上传 PDF 文件存存储【需管理密码】
import { route, ok, fail, checkAuth } from '../_lib/auth.js';
import { exists, readJSON, storePut } from '../_lib/db.js';

// 公司名归一化：全称/别名 → sources.json 的 key（简称）。
// 前端选择器已保证传简称，此函数兜底手输全称的情况。
export function normalizeCompany(company, sources) {
  const key = String(company || '').trim();
  if (!key) return '';
  if (sources[key]) return key;
  // 去常见后缀：保险股份有限公司 / 保险有限公司 / 有限责任公司 / 股份有限公司 / 有限公司 / 保险股份
  const stripped = key
    .replace(/保险股份有限公司$/, '')
    .replace(/保险有限公司$/, '')
    .replace(/保险有限责任公司$/, '')
    .replace(/有限责任公司$/, '')
    .replace(/股份有限公司$/, '')
    .replace(/有限公司$/, '');
  const noChina = stripped.replace(/^中国/, '');
  for (const c of [stripped, noChina, key.replace(/^中国/, '')]) {
    if (c && sources[c]) return c;
  }
  // 双向包含匹配（如 sources key 含简称，或简称含 sources key）
  for (const k of Object.keys(sources)) {
    if ((k.includes(key) && key.length >= 2) || (key.includes(k) && k.length >= 2)) return k;
  }
  return key; // 未匹配，原样返回
}

export async function onRequest({ request, env }) {
  return route(request, env, {
    methods: ['GET', 'POST'],
    handler: async (req) => {
      if (req.method === 'GET') {
        const url = new URL(req.url);
        const company = url.searchParams.get('company') || '';
        const year = url.searchParams.get('year') || '2025年度';
        const key = `${env.PDF_PREFIX || 'pdfs/'}${company}_${year}.pdf`;
        const has = await exists(env, key);
        return ok({ company, year, pdfKey: key, hasPdf: has });
      }

      // ===== 写操作需管理密码 =====
      if (!checkAuth(req, env)) {
        return fail('未授权：请先在页面设置管理密码', 401);
      }

      const contentType = req.headers.get('Content-Type') || '';

      // ===== 上传模式（multipart，file 字段）=====
      if (contentType.includes('multipart/form-data')) {
        const form = await req.formData();
        const file = form.get('file');
        if (!file) return fail('缺少 file 字段');
        const company = String(form.get('company') || '').trim();
        const year = String(form.get('year') || '2025年度').trim();
        if (!company) return fail('缺少 company 参数');
        const key = `${env.PDF_PREFIX || 'pdfs/'}${company}_${year}.pdf`;
        await storePut(env.STORE, key, file.stream(), file.type || 'application/pdf');
        return ok({ company, year, pdfKey: key, action: 'uploaded' });
      }

      // ===== JSON 模式 =====
      const body = await req.json().catch(() => ({}));
      const year = (body.year || '2025年度').trim();
      const sources = (await readJSON(env, env.SOURCES_KEY || 'sources.json', {})) || {};

      // ===== 批量下载 =====
      if (Array.isArray(body.companies)) {
        const list = [...new Set(body.companies.map(c => normalizeCompany(c, sources)).filter(Boolean))];
        if (!list.length) return fail('缺少有效的 companies 列表');
        const results = [];
        const queue = [...list];
        const CONCURRENCY = 3;
        const worker = async () => {
          while (queue.length) {
            const company = queue.shift();
            const src = sources[company];
            const mappedUrl = (src && src[year]) || (src && src.url) || '';
            if (!mappedUrl) {
              results.push({ company, ok: false, needUpload: true, message: '未配置自动下载地址' });
              continue;
            }
            try {
              const r = await doFetch(env, company, year, mappedUrl);
              const d = await r.json();
              results.push(d.ok
                ? { company, ok: true, bytes: d.bytes, pdfKey: d.pdfKey }
                : { company, ok: false, error: d.error || '下载失败' });
            } catch (e) {
              results.push({ company, ok: false, error: e.message });
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
        return ok({ batch: true, total: list.length, okCount: results.filter(r => r.ok).length, results });
      }

      // ===== 单公司下载 =====
      const company = normalizeCompany((body.company || '').trim(), sources);
      if (!company) return fail('缺少 company 参数');
      const urlToFetch = (body.url || '').trim();

      if (!urlToFetch) {
        const src = sources[company];
        const mappedUrl = (src && src[year]) || (src && src.url) || '';
        if (!mappedUrl) {
          return ok({ company, year, needUpload: true, message: '未配置下载地址，请手动下载后上传 PDF' });
        }
        return doFetch(env, company, year, mappedUrl);
      }
      return doFetch(env, company, year, urlToFetch);
    }
  });
}

async function doFetch(env, company, year, url) {
  let resp;
  try {
    resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
      redirect: 'follow'
    });
  } catch (e) {
    return fail(`抓取失败：${e.message}`);
  }
  if (!resp.ok) return fail(`下载失败 HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  if (buf.byteLength < 1000) return fail('下载内容过小，可能不是 PDF');
  const head = new Uint8Array(buf.slice(0, 4));
  if (!(head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46)) {
    return fail('下载内容不是有效 PDF（%PDF 头缺失，可能被反爬或地址错误）');
  }
  const key = `${env.PDF_PREFIX || 'pdfs/'}${company}_${year}.pdf`;
  await storePut(env.STORE, key, buf, 'application/pdf');
  return ok({ company, year, pdfKey: key, bytes: buf.byteLength, action: 'downloaded' });
}
