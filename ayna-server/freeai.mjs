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

const MODELS = {
  groq: [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'gemma2-9b-it'
  ],
  gemini: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash'
  ]
};

let cache = { at: 0, ids: null };

async function availableModels(name) {
  if (Date.now() - cache.at < 600000 && cache.ids) return cache.ids;
  const host = HOSTS[name];
  if (!host || !process.env[host.key]) return null;
  try {
    const r = await fetch(host.base.replace('/chat/completions', '/models'), {
      headers: { Authorization: `Bearer ${process.env[host.key]}` }
    });
    const j = await r.json().catch(() => null);
    if (!j || !Array.isArray(j.data)) return null;
    cache = { at: Date.now(), ids: j.data.map((m) => m.id) };
    return cache.ids;
  } catch (e) {
    return null;
  }
}

async function pickModels(name, kind) {
  const preferred = MODELS[name].slice();
  if (kind === 'scribe') preferred.push('openai/gpt-oss-20b', 'llama-3.1-8b-instant');
  const ids = await availableModels(name);
  const usable = ids ? preferred.filter((m) => ids.includes(m)) : preferred;
  return usable.length ? usable : preferred;
}

export function defaultModel(kind) {
  return MODELS.groq[0];
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

export async function callTool({ kind, ...opts }) {
  const hosts = available();
  const names = Object.keys(hosts);
  if (!names.length) throw new Error('no_provider_key');
  let last = null;
  for (const name of names) {
    const candidates = (await pickModels(name, kind)).slice();
    for (const model of candidates) {
      try {
        const result = await callToolFor(hosts[name], name, { ...opts, model });
        return { ...result, provider: name };
      } catch (e) {
        last = e;
        // Model erişilemiyorsa sıradaki modeli dene; değilse o sağlayıcıyı bırak.
        if (/does not exist|not found|404/.test(e.message)) continue;
        break;
      }
    }
  }
  throw last;
}
