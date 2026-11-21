import { handleUpload } from '@vercel/blob/client';
import { put } from '@vercel/blob';
import { Readable } from 'node:stream';
import { requestUser, throttle } from './auth.mjs';
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export function cleanPDF(pdf) {
  if (!pdf || typeof pdf !== 'object') return null;
  try {
    const url = new URL(pdf.url);
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(url.hostname) ||
        url.port || url.username || url.password || url.search || url.hash ||
        !/^\/alfa-edu-pdf\/[a-zA-Z0-9_-]{1,150}\.pdf$/.test(url.pathname)) return null;
    const size = Number(pdf.size);
    if (!Number.isInteger(size) || size < 5 || size > MAX_PDF_BYTES) return null;
    return { url: url.href, name: String(pdf.name || 'Eğitim dokümanı.pdf').slice(0, 160), size };
  } catch { return null; }
}
export async function verifyPDF(pdf) {
  const value = cleanPDF(pdf);
  if (!value) return false;
  const r = await fetch(value.url, { redirect: 'error', headers: { Range: 'bytes=0-7' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok || !r.body) return false;
  const total = Number(r.headers.get('content-range')?.split('/').at(-1) || r.headers.get('content-length') || 0);
  if (total && (total > MAX_PDF_BYTES || total !== value.size)) { await r.body.cancel(); return false; }
  const reader = r.body.getReader(); let bytes = Buffer.alloc(0);
  try {
    while (bytes.length < 5) { const part = await reader.read(); if (part.done) break; bytes = Buffer.concat([bytes, Buffer.from(part.value).subarray(0, 8)]); }
  } finally { await reader.cancel(); }
  return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
}
export async function eduPDFUpload(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ ok: false, error: 'pdf_upload_unavailable' });
  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: 'invalid_body' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 12000) return res.status(400).json({ ok: false, error: 'invalid_body' });
  // Multipart completion callbacks carry a Blob SDK signature instead of a JWT.
  const callback = body.type === 'blob.upload-completed';
  if (!callback) {
    const user = await requestUser(req);
    if (!user?.admin) return res.status(user ? 403 : 401).json({ ok: false, error: 'admin_required' });
    if (!throttle('edu-pdf:' + user.id, 1500)) return res.status(429).json({ ok: false, error: 'too_many_requests' });
  }
  if (!callback && body.type !== 'blob.generate-client-token') return res.status(400).json({ ok: false, error: 'invalid_upload' });
  try {
    const out = await handleUpload({ request: req, body, token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async pathname => {
        if (!/^alfa-edu-pdf\/[a-zA-Z0-9_-]{1,100}\.pdf$/.test(pathname)) throw new Error('invalid_path');
        return { allowedContentTypes: ['application/pdf'], maximumSizeInBytes: MAX_PDF_BYTES,
          addRandomSuffix: true, allowOverwrite: false, validUntil: Date.now() + 15 * 60000 };
      }
    });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(out);
  } catch { return res.status(400).json({ ok: false, error: 'pdf_upload_rejected' }); }
}
export async function telegramPDFToBlob(document) {
  const size = Number(document?.file_size);
  if (!/^[A-Za-z0-9_-]{10,250}$/.test(document?.file_id || '') || !Number.isInteger(size) || size < 5 || size > MAX_PDF_BYTES ||
      document.mime_type !== 'application/pdf' || !process.env.TG_BOT_TOKEN || !process.env.BLOB_READ_WRITE_TOKEN) throw new Error('telegram_pdf_unavailable');
  const token = process.env.TG_BOT_TOKEN;
  const meta = await fetch('https://api.telegram.org/bot' + token + '/getFile', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: document.file_id }), signal: AbortSignal.timeout(8000)
  });
  const data = await meta.json(), filePath = data.result?.file_path;
  if (!meta.ok || !data.ok || !/^[\w./-]+$/.test(filePath || '') || filePath.split('/').includes('..')) throw new Error('telegram_pdf_unavailable');
  const file = await fetch('https://api.telegram.org/file/bot' + token + '/' + filePath, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!file.ok || !file.body) throw new Error('telegram_pdf_unavailable');
  async function* verified() {
    let total = 0, prefix = Buffer.alloc(0), checked = false;
    for await (const chunk of file.body) {
      total += chunk.length;
      if (total > MAX_PDF_BYTES || total > size) throw new Error('telegram_pdf_large');
      if (!checked) {
        prefix = Buffer.concat([prefix, chunk]);
        if (prefix.length < 5) continue;
        if (prefix.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('invalid_pdf');
        checked = true; yield prefix; prefix = null;
      } else yield chunk;
    }
    if (!checked || total !== size) throw new Error('invalid_pdf');
  }
  const result = await put('alfa-edu-pdf/telegram-' + document.file_unique_id?.replace(/[^\w-]/g, '').slice(0, 80) + '.pdf',
    Readable.from(verified()), { access: 'public', contentType: 'application/pdf', addRandomSuffix: true, token: process.env.BLOB_READ_WRITE_TOKEN });
  return { url: result.url, name: String(document.file_name || 'Eğitim dokümanı.pdf').slice(0, 160), size };
}
