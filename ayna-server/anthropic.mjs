const API_URL = 'https://api.anthropic.com/v1/messages';
const RETRY_STATUS = [429, 500, 503, 529];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function modelFor(kind) {
  if (kind === 'scribe') return process.env.AYNA_MODEL_SCRIBE || 'claude-haiku-4-5-20251001';
  return process.env.AYNA_MODEL_COACH || 'claude-sonnet-5';
}

async function post(body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
  } finally {
    clearTimeout(timer);
  }
}

export async function callTool({ model, systemStatic, systemDynamic, messages, tool, maxTokens }) {
  const system = [{ type: 'text', text: systemStatic, cache_control: { type: 'ephemeral' } }];
  if (systemDynamic) system.push({ type: 'text', text: systemDynamic });
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name }
  };
  const started = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await post(body, 50000);
    } catch (e) {
      if (attempt === 0 && e.name !== 'AbortError' && Date.now() - started < 15000) { await sleep(2000); continue; }
      throw new Error(`anthropic network ${e.name}`);
    }
    if (!res.ok) {
      if (attempt === 0 && RETRY_STATUS.includes(res.status) && Date.now() - started < 15000) { await sleep(2000); continue; }
      throw new Error(`anthropic ${res.status} ${res.data && res.data.error ? res.data.error.type : ''}`);
    }
    const data = res.data;
    if (!data) throw new Error('anthropic empty');
    if (data.stop_reason === 'max_tokens') throw new Error('anthropic truncated');
    const block = (data.content || []).find((b) => b.type === 'tool_use' && b.name === tool.name);
    if (!block) throw new Error('anthropic no_tool_use');
    return { input: block.input, usage: data.usage || {}, model };
  }
  throw new Error('anthropic retry_exhausted');
}
