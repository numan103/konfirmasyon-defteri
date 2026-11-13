// GitHub Actions OIDC dogrulayici.
//
// GitHub Actions, `id-token: write` izniyle kisa omurlu (dakikalar) bir RS256 JWT
// uretir. Bu modul token'i GitHub'in JWKS'i ile dogrular; boylece sunucuda
// saklanan bir cron sirri olmadan 15 dakikalik zamanlayici calisabilir.
//
// Dogrulama kurallari:
// - Imza: GitHub JWKS (RS256), `kid` eslesmeli.
// - `iss` = https://token.actions.githubusercontent.com
// - `aud` = alfa-trader-news
// - `repository` = numan103/konfirmasyon-defteri
// - `workflow_ref` = .../.github/workflows/news-poll.yml@<ref>
// - `exp` / `nbf` su ana gore gecerli.
import crypto from 'node:crypto';

const DEFAULT_ISSUER = 'https://token.actions.githubusercontent.com';
const DEFAULT_AUDIENCE = 'alfa-trader-news';
const DEFAULT_REPO = 'numan103/konfirmasyon-defteri';
const DEFAULT_WORKFLOW = '.github/workflows/news-poll.yml';
const JWKS_URL = 'https://token.actions.githubusercontent.com/.well-known/jwks';

const CACHE_MS = 60 * 60 * 1000;
let jwksCache = { at: 0, keys: [], url: '' };

function decodeJson(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function jwksUrl() {
  return String(process.env.GITHUB_OIDC_JWKS_URL || JWKS_URL).trim();
}

async function loadJwks(force = false) {
  const url = jwksUrl();
  if (!force && jwksCache.keys.length && jwksCache.url === url && Date.now() - jwksCache.at < CACHE_MS) {
    return jwksCache.keys;
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('jwks_http_' + r.status);
  const body = await r.json();
  const keys = Array.isArray(body && body.keys) ? body.keys : [];
  if (!keys.length) throw new Error('jwks_empty');
  jwksCache = { at: Date.now(), keys, url };
  return keys;
}

function publicKeyFor(keys, kid) {
  const jwk = keys.find((k) => k && k.kid === kid && (!k.kty || k.kty === 'RSA'));
  if (!jwk) return null;
  return crypto.createPublicKey({ key: jwk, format: 'jwk' });
}

function claimValues(value) {
  if (Array.isArray(value)) return value.map(String);
  return value == null ? [] : [String(value)];
}

/**
 * Token'i dogrular. Basarili olursa payload, aksi halde null doner.
 * Hata nedeni `onError(reason)` ile bildirilir (loglama icin).
 */
export async function verifyGithubOidc(token, { onError } = {}) {
  const fail = (reason) => {
    try { if (typeof onError === 'function') onError(reason); } catch { /* yoksay */ }
    return null;
  };
  const raw = String(token || '').replace(/^Bearer\s+/i, '').trim();
  if (!raw) return fail('missing_token');

  const parts = raw.split('.');
  if (parts.length !== 3) return fail('malformed_token');

  let header;
  let payload;
  try {
    header = decodeJson(parts[0]);
    payload = decodeJson(parts[1]);
  } catch { return fail('bad_json'); }

  if (!header || header.alg !== 'RS256') return fail('bad_alg');
  if (!header.kid) return fail('missing_kid');

  const expectedAud = String(process.env.GITHUB_OIDC_AUDIENCE || DEFAULT_AUDIENCE).trim();
  const expectedRepo = String(process.env.GITHUB_OIDC_REPO || DEFAULT_REPO).trim();
  const expectedWorkflow = String(process.env.GITHUB_OIDC_WORKFLOW || DEFAULT_WORKFLOW).trim();
  const expectedIss = String(process.env.GITHUB_OIDC_ISSUER || DEFAULT_ISSUER).trim();

  if (payload.iss !== expectedIss) return fail('bad_issuer');
  const auds = claimValues(payload.aud);
  if (!auds.includes(expectedAud)) return fail('bad_audience');
  if (String(payload.repository || '') !== expectedRepo) return fail('bad_repository');

  const workflowRef = String(payload.workflow_ref || '');
  const at = workflowRef.lastIndexOf('@');
  if (at <= 0) return fail('bad_workflow_ref');
  const workflowPath = workflowRef.slice(0, at);
  if (!(workflowPath === expectedWorkflow || workflowPath.endsWith('/' + expectedWorkflow))) {
    return fail('bad_workflow_ref');
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp <= now) return fail('expired');
  if (Number.isFinite(Number(payload.nbf)) && Number(payload.nbf) > now + 60) return fail('not_yet_valid');

  // Imza dogrulamasi.
  let keys;
  try {
    keys = await loadJwks();
  } catch (e) {
    return fail('jwks_unavailable:' + String(e?.message || e));
  }
  let key = publicKeyFor(keys, header.kid);
  if (!key) {
    // Anahtar rotasyonu olabilir: onbellegi bir kez zorla yenile.
    try {
      keys = await loadJwks(true);
      key = publicKeyFor(keys, header.kid);
    } catch { /* asagida bad_key */ }
  }
  if (!key) return fail('unknown_kid');

  const signingInput = Buffer.from(parts[0] + '.' + parts[1]);
  const signature = Buffer.from(parts[2], 'base64url');
  let ok = false;
  try {
    ok = crypto.verify('RSA-SHA256', signingInput, key, signature);
  } catch { ok = false; }
  if (!ok) return fail('bad_signature');

  return payload;
}

// Testler ve teshis icin: JWKS onbellegini temizle.
export function clearOidcCache() {
  jwksCache = { at: 0, keys: [], url: '' };
}
