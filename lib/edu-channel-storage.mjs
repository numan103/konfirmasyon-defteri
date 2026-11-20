import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Separate key/AAD from CRM. Never persist paid lessons in the public document
// as plaintext. Legacy documents are read until the next authorized save.
const aad = scope => Buffer.from('alfa-edu-' + scope + ':v1');
function key(scope) {
  if (scope !== 'channels' && !/^telegram-inbox:[a-f0-9]{64}$/.test(scope)) throw new Error('channel_scope_invalid');
  const secret = process.env.EDU_CHANNEL_SECRET || process.env.EDU_CRM_SECRET || process.env.ANALYTICS_SECRET || process.env.SUPABASE_SERVICE_ROLE;
  if (!secret) throw new Error('channel_storage_unavailable');
  return createHash('sha256').update('alfa-edu-' + scope + '-v1:' + secret).digest();
}
export function sealChannels(data, scope = 'channels') {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(scope), iv);
  cipher.setAAD(aad(scope));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return { channelEnvelope: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: encrypted.toString('base64') };
}
export function openChannels(data, scope = 'channels') {
  if (!data || !Object.hasOwn(data, 'channelEnvelope')) return data;
  if (data.channelEnvelope !== 1) throw new Error('channel_storage_invalid');
  const decipher = createDecipheriv('aes-256-gcm', key(scope), Buffer.from(data.iv, 'base64'));
  decipher.setAAD(aad(scope));
  decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
}
