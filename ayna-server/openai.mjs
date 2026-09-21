const API_URL = 'https://api.openai.com/v1/chat/completions';
const RETRY_STATUS = [429, 500, 502, 503];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function defaultModel(kind) {
  return kind === 'scribe' ? 'gpt-4o-mini' : 'gpt-4o';
}

function toOpenAITool(tool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema
    }
  };
}

function normalizeUsage(u) {
  u = u || {};
  const cached = u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens ? u.prompt_tokens_details.cached_tokens : 0;
  return {
    input_tokens: u.prompt_tokens || 0,
    output_tokens: u.completion_tokens || 0,
    cache_read_input_tokens: cached,
    cache_creation_input_tokens: 0
  };
}

async function post(body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
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
  const system = systemDynamic ? systemStatic + '\n\n' + systemDynamic : systemStatic;
  const body = {
    model,
    max_completion_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, ...messages],
    tools: [toOpenAITool(tool)],
    tool_choice: { type: 'function', function: { name: tool.name } }
  };
  const started = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await post(body, 50000);
    } catch (e) {
      if (attempt === 0 && e.name !== 'AbortError' && Date.now() - started < 15000) { await sleep(2000); continue; }
      throw new Error(`openai network ${e.name}`);
    }
    if (!res.ok) {
      if (attempt === 0 && RETRY_STATUS.includes(res.status) && Date.now() - started < 15000) { await sleep(2000); continue; }
      const code = res.data && res.data.error ? (res.data.error.code || res.data.error.type || '') : '';
      console.error('[AYNA] 502', code);
      throw new Error(`openai ${res.status} ${code}`);
    }
    const data = res.data;
    if (!data) throw new Error('openai empty');
    const choice = data.choices && data.choices[0];
    if (!choice) throw new Error('openai no_choices');
    if (choice.finish_reason === 'length') throw new Error('openai truncated');
    const msg = choice.message;
    if (!msg || !msg.tool_calls || !msg.tool_calls.length) throw new Error('openai no_tool_use');
    const tc = msg.tool_calls[0];
    if (!tc || !tc.function || tc.function.name !== tool.name) throw new Error('openai no_tool_use');
    let input;
    try { input = JSON.parse(tc.function.arguments); } catch (e) { throw new Error('openai invalid_tool_args'); }
    return { input, usage: normalizeUsage(data.usage), model };
  }
  throw new Error('openai retry_exhausted');
}
