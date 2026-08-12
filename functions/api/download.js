// /api/download — PDF 下载/上传管理
// POST {company, year, url?}  — 有 url：服务端抓取存 R2；无 url 返回 {needUpload:true} 提示前端走上传
// POST multipart（file 字段）   — 直接上传 PDF 文件存 R2
// GET  ?company=&year=          — 查询某公司 PDF 是否已存在
import { route, ok, fail } from '../_lib/auth.js';
import { exists, readJSON } from '../_lib/db.js';

export async function onRequest(request, env) {
  return route(request, env, {
    methods: ['GET', 'POST'],
    admin: true,
    handler: async (req) => {
      if (req.method === 'GET') {
        const url = new URL(req.url);
        const company = url.searchParams.get('company') || '';
        const year = url.searchParams.get('year') || '2025年度';
        const key = `${env.PDF_PREFIX || 'pdfs/'}${company}_${year}.pdf`;
        const has = await exists(env, key);
        return ok({ company, year, pdfKey: key, hasPdf: has });
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
        await env.STORE.put(key, file.stream(), {
          httpMetadata: { contentType: file.type || 'application/pdf' }
        });
        return ok({ company, year, pdfKey: key, action: 'uploaded' });
      }

      // ===== JSON 模式（url 下载）=====
      const body = await req.json().catch(() => ({}));
      const company = (body.company || '').trim();
      const year = (body.year || '2025年度').trim();
      const urlToFetch = (body.url || '').trim();
      if (!company) return fail('缺少 company 参数');

      if (!urlToFetch) {
        // 无 URL：查 sources.json 映射表
        const sources = (await readJSON(env, env.SOURCES_KEY || 'sources.json', {})) || {};
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
  const key = `${env.PDF_PREFIX || 'pdfs/'}${company}_${year}.pdf`;
  await env.STORE.put(key, buf, { httpMetadata: { contentType: 'application/pdf' } });
  return ok({ company, year, pdfKey: key, bytes: buf.byteLength, action: 'downloaded' });
}
