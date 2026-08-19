// /api/sources — 自动下载地址配置管理
// GET   返回当前 sources.json 配置【公开】
// POST  保存配置 {sources: {公司简称: {url} 或 {年度: url}}}【需管理密码】
import { route, ok, fail, checkAuth } from '../_lib/auth.js';
import { readJSON, writeJSON } from '../_lib/db.js';

export async function onRequest({ request, env }) {
  return route(request, env, {
    methods: ['GET', 'POST'],
    handler: async (req) => {
      if (req.method === 'GET') {
        const sources = (await readJSON(env, env.SOURCES_KEY || 'sources.json', {})) || {};
        const count = Object.keys(sources).length;
        return ok({ count, sources });
      }

      // POST：保存配置（需管理密码）
      if (!checkAuth(req, env)) {
        return fail('未授权：请先在页面设置管理密码', 401);
      }
      const body = await req.json().catch(() => ({}));
      const sources = body.sources || {};
      if (typeof sources !== 'object' || Array.isArray(sources)) {
        return fail('sources 格式错误：应为 {公司简称: {url 或 {年度: url}}}');
      }
      // 清洗：只保留字符串/对象值
      const clean = {};
      for (const [k, v] of Object.entries(sources)) {
        if (!k) continue;
        if (typeof v === 'string' && v.trim()) clean[k] = v;
        else if (v && typeof v === 'object') {
          const o = {};
          for (const [yk, yv] of Object.entries(v)) {
            if (typeof yv === 'string' && yv.trim()) o[yk] = yv.trim();
          }
          if (Object.keys(o).length) clean[k] = o;
        }
      }
      await writeJSON(env, env.SOURCES_KEY || 'sources.json', clean);
      return ok({ count: Object.keys(clean).length, sources: clean });
    }
  });
}
