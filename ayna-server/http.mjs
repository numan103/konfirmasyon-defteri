export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function fail(res, status, code, detail) {
  if (status === 429) console.error('[AYNA] 429', code);
  send(res, status, detail ? { error: code, debug_detail: String(detail).slice(0, 300) } : { error: code });
}
