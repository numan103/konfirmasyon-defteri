import * as anthropic from './anthropic.mjs';
import * as openai from './openai.mjs';

const PROVIDERS = { anthropic, openai };
const KEYS = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' };

function pick(value) {
  const v = String(value || '').trim().toLowerCase();
  return PROVIDERS[v] ? v : null;
}

export function providerFor(kind) {
  const specific = kind === 'scribe' ? process.env.AYNA_PROVIDER_SCRIBE : process.env.AYNA_PROVIDER_COACH;
  return pick(specific) || pick(process.env.AYNA_PROVIDER) || 'openai';
}

function modelMatches(provider, model) {
  const isClaude = model.toLowerCase().startsWith('claude');
  return provider === 'anthropic' ? isClaude : !isClaude;
}

export function modelFor(kind) {
  const provider = providerFor(kind);
  const specific = String((kind === 'scribe' ? process.env.AYNA_MODEL_SCRIBE : process.env.AYNA_MODEL_COACH) || '').trim();
  if (specific && modelMatches(provider, specific)) return specific;
  return PROVIDERS[provider].defaultModel(kind);
}

export async function callTool({ kind, systemStatic, systemDynamic, messages, tool, maxTokens }) {
  const provider = providerFor(kind);
  if (!process.env[KEYS[provider]]) throw new Error(`${provider} key_missing`);
  const result = await PROVIDERS[provider].callTool({ model: modelFor(kind), systemStatic, systemDynamic, messages, tool, maxTokens });
  return { ...result, provider };
}
