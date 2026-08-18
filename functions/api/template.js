// /api/template — 163行模板管理
// GET   返回当前模板（存储优先，未初始化用内置）【公开】
// POST  上传覆盖模板（JSON 数组，163行）【需管理密码】
import { route, ok, fail, checkAuth } from '../_lib/auth.js';
import { readJSON, writeJSON } from '../_lib/db.js';
import { BUILTIN_TEMPLATE } from '../_lib/template_data.js';

export async function onRequest(request, env) {
  return route(request, env, {
    methods: ['GET', 'POST'],
    handler: async (req) => {
      if (req.method === 'GET') {
        let template = await readJSON(env, env.TPL_KEY || 'template_163.json', null);
        if (!template || !template.length) template = BUILTIN_TEMPLATE;
        return ok({ count: template.length, template });
      }

      // POST：覆盖模板（需管理密码）
      if (!checkAuth(req, env)) {
        return fail('未授权：请先在页面设置管理密码', 401);
      }
      const body = await req.json().catch(() => ({}));
      const template = body.template;
      if (!Array.isArray(template) || template.length === 0) {
        return fail('template 必须是非空 JSON 数组（163行）');
      }
      // 基础校验：每行 17 字段
      const bad = template.find(r => !Array.isArray(r) || r.length < 5);
      if (bad) return fail('模板行格式错误：每行应为数组');
      await writeJSON(env, env.TPL_KEY || 'template_163.json', template);
      return ok({ count: template.length, updated: true });
    }
  });
}
