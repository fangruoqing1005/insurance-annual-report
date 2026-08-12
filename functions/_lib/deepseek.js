// DeepSeek API 调用（OpenAI 兼容格式）
// 环境变量：AI_API_KEY（用户配置）、AI_MODEL（默认 deepseek-chat）、AI_BASE_URL（默认官方）
const DEFAULT_BASE = 'https://api.deepseek.com';
const DEFAULT_MODEL = 'deepseek-chat';

export function getConfig(env) {
  return {
    apiKey: env?.AI_API_KEY || '',
    baseUrl: (env?.AI_BASE_URL || DEFAULT_BASE).replace(/\/$/, ''),
    model: env?.AI_MODEL || DEFAULT_MODEL
  };
}

// 单次 chat 补全
export async function chat(env, { system, messages, temperature = 0.1, maxTokens = 4096, jsonMode = false }) {
  const cfg = getConfig(env);
  if (!cfg.apiKey) throw new Error('AI_API_KEY 未配置');
  const body = {
    model: cfg.model,
    messages: [{ role: 'system', content: system }, ...messages],
    temperature,
    max_tokens: maxTokens,
    stream: false
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`DeepSeek API ${resp.status}: ${errText.slice(0, 300)}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek 返回空内容');
  return content;
}

// 安全解析 JSON（模型偶尔输出代码块包裹或前后多余字符）
export function parseJSON(text) {
  let s = String(text).trim();
  // 去掉 ```json ... ``` 包裹
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  // 截取第一个 { 到最后一个 }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}
