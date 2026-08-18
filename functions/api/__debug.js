// 调试端点：直接返回 request.method 原文
export async function onRequest(request, env) {
  return new Response(JSON.stringify({
    method: request.method,
    methodToUpper: request.method?.toUpperCase(),
    methodLen: request.method?.length,
    methodCharCodes: [...(request.method || '')].map(c => c.charCodeAt(0)),
    headers: [...request.headers.entries()].slice(0, 5),
    url: request.url
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
