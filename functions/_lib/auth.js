// 鉴权：管理操作需要 ADMIN_PASS（环境变量）或与页面 localStorage 中的 token 一致
// 前端：用户首次使用输入管理密码 → 存 localStorage → 请求带 X-Admin-Token

// 校验请求是否通过管理鉴权
export function checkAuth(request, env) {
  const pass = env?.ADMIN_PASS;
  if (!pass) return true; // 未配置密码则不校验（测试模式）
  const token = request.headers.get('X-Admin-Token') || '';
  return token === pass;
}

// 生成响应（统一 JSON + CORS）
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
    }
  });
}

export function ok(data) { return json({ ok: true, ...data }); }
export function fail(msg, status = 400) { return json({ ok: false, error: msg }, status); }

// 统一入口封装：method 白名单 + 鉴权 + 错误兜底
export async function route(request, env, { methods = ['GET'], admin = false, handler }) {
  if (request.method === 'OPTIONS') return json({});
  if (!methods.includes(request.method)) {
    return fail(`仅支持 ${methods.join('/')}`, 405);
  }
  if (admin && !checkAuth(request, env)) {
    return fail('未授权：请先在页面设置管理密码', 401);
  }
  try {
    return await handler(request, env);
  } catch (e) {
    console.error('route error', e);
    return fail(e.message || '服务内部错误', 500);
  }
}
