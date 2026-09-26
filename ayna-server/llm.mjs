import * as anthropic from './anthropic.mjs';
import * as openai from './openai.mjs';
import * as freeai from './freeai.mjs';

const PROVIDERS = { anthropic, openai, groq: freeai, gemini: freeai };
const KEYS = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY', gemini: 'GEMINI_API_KEY' };
const FALLBACK = { groq: 'GROQ_API_KEY', gemini: 'GEMINI_API_KEY' };

function pick(value) {
  const v = String(value || '').trim().toLowerCase();
  return PROVIDERS[v] ? v : null;
}

function hasKey(provider) {
  if (provider === 'groq' || provider === 'gemini') return !!(process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY);
  return !!process.env[KEYS[provider]];
}

// OpenAI kredisi bittiyse veya hiç tanımlı değilse ücretsiz sağlayıcılara düş.
function resolve(kind) {
  const specific = kind === 'scribe' ? process.env.AYNA_PROVIDER_SCRIBE : process.env.AYNA_PROVIDER_COACH;
  const wanted = pick(specific) || pick(process.env.AYNA_PROVIDER);
  if (wanted) return wanted;
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'openai';
}

export function providerFor(kind) {
  const provider = resolve(kind);
  if (hasKey(provider)) return provider;
  if (provider === 'openai' || provider === 'anthropic') {
    for (const fb of Object.keys(FALLBACK)) {
      if (process.env[FALLBACK[fb]]) return fb;
    }
  }
  return provider;
}

function modelMatches(provider, model) {
  const isClaude = model.toLowerCase().startsWith('claude');
  if (provider === 'anthropic') return isClaude;
  if (provider === 'openai') return model.toLowerCase().startsWith('gpt');
  if (provider === 'gemini') return model.toLowerCase().startsWith('gemini');
  return !isClaude && !model.toLowerCase().startsWith('gpt') && !model.toLowerCase().startsWith('gemini');
}

export function modelFor(kind) {
  const provider = providerFor(kind);
  const specific = String((kind === 'scribe' ? process.env.AYNA_MODEL_SCRIBE : process.env.AYNA_MODEL_COACH) || '').trim();
  if (specific && modelMatches(provider, specific)) return specific;
  return PROVIDERS[provider].defaultModel(kind);
}

export async function callTool({ kind, systemStatic, systemDynamic, messages, tool, maxTokens }) {
  const provider = providerFor(kind);
  if (!hasKey(provider)) throw new Error(`${provider} key_missing`);
  const result = await PROVIDERS[provider].callTool({ model: modelFor(kind), systemStatic, systemDynamic, messages, tool, maxTokens });
  return { ...result, provider };
}
