// Public error codes must not expose journal text, provider responses or keys.
export function aiErrorCode(error) {
  const message = String(error?.message || '');
  if (/^db\s/.test(message)) return 'server_error';
  if (/key_missing|no_provider_key|\b(401|403)\b/.test(message)) return 'ai_unconfigured';
  if (/\b429\b|rate.?limit|quota|insufficient_quota/i.test(message)) return 'provider_busy';
  if (/AbortError|timeout|timed.out/i.test(message)) return 'timeout';
  return 'model_failed';
}
