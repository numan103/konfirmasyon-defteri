const RETRY_STATUS = [429, 500, 502, 503];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Groq ve Gemini OpenAI uyumlu /chat/completions formatını konuşur; sadece base URL ve model adı farklıdır.
const HOSTS = {
  groq: { base: 'https://api.groq.com/openai/v1/chat/completions', key: 'GROQ_API_KEY' },
  gemini: { base: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', key: 'GEMINI_API_KEY' }
};

function available() {
  const out = {};
  for (const name of Object.keys(HOSTS)) {
    if (process.env[HOSTS[name].key]) out[name] = HOSTS[name];
  }
  return out;
}

export function hasAnyKey() {
  return Object.keys(available()).length > 0;
}

export function defaultModel(kind) {
  if (kind === 'scribe') return 'llama-3.1-8b-instant';
  return 'llama-3.3-70b-versatile';
}

function toOpenAITool(tool) {
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.input_schema }
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

async function callToolFor(host, hostName, { model, systemStatic, systemDynamic, messages, tool, maxTokens }) {
  const system = systemDynamic ? systemStatic + '\n\n' + systemDynamic : systemStatic;
  const body = {
    model,
    messages: [{ role: 'system', content: system }, ...messages],
    tools: [toOpenAITool(tool)],
    tool_choice: { type: 'function', function: { name: tool.name } },
    parallel_tool_calls: false,
    temperature: 0.3,
    max_tokens: maxTokens
  };
  const started = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    let r;
    try {
      r = await fetch(host.base, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env[host.key]}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) {
      if (attempt === 0 && e.name !== 'AbortError' && Date.now() - started < 15000) { await sleep(2000); continue; }
      throw new Error(`${hostName} network ${e.name}`);
    }
    if (!r.ok) {
      if (attempt === 0 && RETRY_STATUS.includes(r.status) && Date.now() - started < 15000) { await sleep(2000); continue; }
      const errBody = await r.text().catch(() => '');
      let msg = '';
      try { const j = JSON.parse(errBody); msg = (j.error && (j.error.message || j.error.code)) || ''; } catch (e) { msg = errBody.slice(0, 120); }
      throw new Error(`${hostName} ${r.status} ${String(msg).slice(0, 160)}`);
    }
    const data = await r.json().catch(() => null);
    if (!data) throw new Error(`${hostName} empty`);
    const choice = data.choices && data.choices[0];
    if (!choice) throw new Error(`${hostName} no_choices`);
    if (choice.finish_reason === 'length') throw new Error(`${hostName} truncated`);
    const msg = choice.message;
    if (!msg || !msg.tool_calls || !msg.tool_calls.length) throw new Error(`${hostName} no_tool_use`);
    const tc = msg.tool_calls[0];
    if (!tc || !tc.function || tc.function.name !== tool.name) throw new Error(`${hostName} no_tool_use`);
    let input;
    try { input = JSON.parse(tc.function.arguments); } catch (e) { throw new Error(`${hostName} invalid_tool_args`); }
    return { input, usage: normalizeUsage(data.usage), model };
  }
  throw new Error(`${hostName} retry_exhausted`);
}

export async function callTool(opts) {
  const hosts = available();
  const names = Object.keys(hosts);
  if (!names.length) throw new Error('no_provider_key');
  let last = null;
  for (const name of names) {
    try {
      const result = await callToolFor(hosts[name], name, opts);
      return { ...result, provider: name };
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
