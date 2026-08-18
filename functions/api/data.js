// /api/data — 数据库管理
// GET    返回全部数据（前端动态加载）与统计 【公开：页面加载/云模式探测依赖】
// DELETE 范围删除 {companies:[], periods:[], codes:[]}（任一命中即删）【需管理密码】
// POST   上传合并 {rows:[...]}（upsert）【需管理密码】
import { route, ok, fail, checkAuth } from '../_lib/auth.js';
import { readDB, writeDB, deleteRows, upsertRows } from '../_lib/db.js';

export async function onRequest(request, env) {
  return route(request, env, {
    methods: ['GET', 'POST', 'DELETE'],
    handler: async (req) => {
      // ===== GET：读数据库（公开，云模式探测依赖它）=====
      if (req.method === 'GET') {
        const rows = await readDB(env);
        const companies = [...new Set(rows.map(r => r['公司名称']))].sort();
        const periods = [...new Set(rows.map(r => r['报告期']))];
        const indicators = [...new Set(rows.map(r => r['指标编号']))];
        return ok({
          rows,
          stats: { total: rows.length, companies: companies.length, periods, indicators: indicators.length }
        });
      }

      // ===== 写操作需管理密码 =====
      if (!checkAuth(req, env)) {
        return fail('未授权：请先在页面设置管理密码', 401);
      }

      // ===== DELETE：范围删除 =====
      if (req.method === 'DELETE') {
        const body = await req.json().catch(() => ({}));
        const companies = (body.companies || []).map(String);
        const periods = (body.periods || []).map(String);
        const codes = (body.codes || []).map(String);
        if (companies.length + periods.length + codes.length === 0) {
          return fail('请至少提供一个删除条件（公司/报告期/指标）');
        }
        const rows = await readDB(env);
        const { rows: kept, deleted } = deleteRows(rows, {
          '公司名称': companies, '报告期': periods, '指标编号': codes
        });
        await writeDB(env, kept);
        return ok({ deleted, remaining: kept.length });
      }

      // ===== POST：上传合并 =====
      const body = await req.json().catch(() => ({}));
      const rows = body.rows;
      if (!Array.isArray(rows) || rows.length === 0) return fail('rows 必须是非空数组');
      const clean = rows.map(r => {
        const o = {};
        ['公司类型', '公司名称', '报告期', '报表类型', '报表名称', '指标编号', '指标名称',
          '指标来源', '关键词', '期间', '计量单位-披露', '计量单位-换算', '数值-披露', '数值-换算',
          '来源表', '行序号', '列序号'].forEach(k => {
          o[k] = (r[k] !== undefined && r[k] !== null) ? r[k] : '';
        });
        if (o['数值-换算'] !== '' && o['数值-换算'] !== null) {
          const n = Number(o['数值-换算']);
          o['数值-换算'] = isNaN(n) ? o['数值-换算'] : n;
        }
        if (o['数值-披露'] !== '' && o['数值-披露'] !== null) {
          const n = Number(o['数值-披露']);
          o['数值-披露'] = isNaN(n) ? o['数值-披露'] : n;
        }
        return o;
      });
      const existing = await readDB(env);
      const merged = upsertRows(existing, clean);
      await writeDB(env, merged);
      return ok({ added: clean.length, total: merged.length });
    }
  });
}
