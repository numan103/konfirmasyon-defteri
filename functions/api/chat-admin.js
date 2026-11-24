export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  for (const [k, v] of Object.entries(env || {})) {
    process.env[k] = v;
  }

  const { default: handler } = await import('../../api/chat-admin.mjs');

  let body = null;
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      body = await request.json().catch(() => ({}));
    } else {
      body = await request.text().catch(() => '');
    }
  }

  const req = {
    method: request.method,
    headers: Object.fromEntries(request.headers),
    query: Object.fromEntries(url.searchParams),
    body: body || {},
    url: url.pathname + url.search,
    socket: { remoteAddress: request.headers.get('cf-connecting-ip') || 'unknown' },
  };

  let statusCode = 200;
  const responseHeaders = {};
  let responseBody = '';
  let responseBytes = null;

  const res = {
    statusCode: 200,
    status(code) { statusCode = code; this.statusCode = code; return this; },
    setHeader(k, v) { responseHeaders[k] = v; },
    getHeader(k) { return responseHeaders[k]; },
    writeHead(code, headers) {
      statusCode = code; this.statusCode = code;
      if (headers) Object.assign(responseHeaders, headers);
      return this;
    },
    redirect(code, location) {
      statusCode = code; this.statusCode = code;
      responseHeaders['Location'] = location;
      responseBody = ''; responseBytes = null;
      return this;
    },
    write(data) { responseBody += (typeof data === 'string' ? data : String(data)); },
    end(data) { if (data) responseBody += (typeof data === 'string' ? data : String(data)); },
    json(data) { responseBody = JSON.stringify(data); responseHeaders['Content-Type'] = 'application/json'; },
    send(data) {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data)
        : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : null;
      if (bytes) {
        responseBytes = bytes;
        responseHeaders['Content-Type'] = responseHeaders['Content-Type'] || 'application/octet-stream';
        return;
      }
      if (typeof data === 'object' && data !== null) {
        responseBody = JSON.stringify(data);
        responseHeaders['Content-Type'] = 'application/json';
      } else { responseBody = String(data); }
    },
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
  }

  try { await handler(req, res); } catch (e) {
    console.error('Handler error:', e);
    return new Response(JSON.stringify({ error: 'internal_error', detail: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  responseHeaders['Access-Control-Allow-Origin'] = responseHeaders['Access-Control-Allow-Origin'] || '*';
  return new Response(responseBytes ?? responseBody, { status: res.statusCode || statusCode, headers: responseHeaders });
}
