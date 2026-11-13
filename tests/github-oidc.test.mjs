import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyGithubOidc, clearOidcCache } from '../lib/github-oidc.mjs';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-kid', alg: 'RS256', use: 'sig' };
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

const NOW = Math.floor(Date.now() / 1000);
const basePayload = () => ({
  iss: 'https://token.actions.githubusercontent.com',
  aud: 'alfa-trader-news',
  repository: 'numan103/konfirmasyon-defteri',
  workflow_ref: 'numan103/konfirmasyon-defteri/.github/workflows/news-poll.yml@refs/heads/main',
  exp: NOW + 300,
  nbf: NOW - 10,
  iat: NOW - 10,
  sub: 'repo:numan103/konfirmasyon-defteri:ref:refs/heads/main',
});

function sign(payload, header = { alg: 'RS256', typ: 'JWT', kid: 'test-kid' }) {
  const input = b64(header) + '.' + b64(payload);
  const sig = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
  return input + '.' + sig;
}

function stubJwks() {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), 'https://oidc.test/jwks');
    return { ok: true, json: async () => ({ keys: [jwk] }) };
  };
  return () => { globalThis.fetch = real; };
}

const saved = { ...process.env };
function setup() {
  process.env.GITHUB_OIDC_JWKS_URL = 'https://oidc.test/jwks';
  process.env.GITHUB_OIDC_AUDIENCE = 'alfa-trader-news';
  process.env.GITHUB_OIDC_REPO = 'numan103/konfirmasyon-defteri';
  process.env.GITHUB_OIDC_WORKFLOW = '.github/workflows/news-poll.yml';
  process.env.GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
  clearOidcCache();
}

test('valid GitHub Actions OIDC token is accepted', async () => {
  setup();
  const restore = stubJwks();
  try {
    const payload = await verifyGithubOidc(sign(basePayload()));
    assert.ok(payload);
    assert.equal(payload.repository, 'numan103/konfirmasyon-defteri');
  } finally { restore(); }
});

test('signature tampering is rejected', async () => {
  setup();
  const restore = stubJwks();
  try {
    const token = sign(basePayload());
    const [h, p, s] = token.split('.');
    const flipped = (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    const bad = h + '.' + p + '.' + flipped;
    const reasons = [];
    const payload = await verifyGithubOidc(bad, { onError: (r) => reasons.push(r) });
    assert.equal(payload, null);
    assert.ok(reasons.includes('bad_signature'), reasons.join(','));
  } finally { restore(); }
});

test('wrong audience, repository, workflow or issuer are rejected', async () => {
  setup();
  const restore = stubJwks();
  try {
    const cases = [
      ['bad_audience', { ...basePayload(), aud: 'someone-else' }],
      ['bad_repository', { ...basePayload(), repository: 'evil/repo' }],
      ['bad_workflow_ref', { ...basePayload(), workflow_ref: 'numan103/konfirmasyon-defteri/.github/workflows/other.yml@refs/heads/main' }],
      ['bad_issuer', { ...basePayload(), iss: 'https://evil.example' }],
    ];
    for (const [expected, payload] of cases) {
      const reasons = [];
      const out = await verifyGithubOidc(sign(payload), { onError: (r) => reasons.push(r) });
      assert.equal(out, null, expected);
      assert.ok(reasons.includes(expected), expected + ' -> ' + reasons.join(','));
    }
  } finally { restore(); }
});

test('expired or missing token is rejected', async () => {
  setup();
  const restore = stubJwks();
  try {
    const reasons = [];
    const expired = await verifyGithubOidc(sign({ ...basePayload(), exp: NOW - 5 }), { onError: (r) => reasons.push(r) });
    assert.equal(expired, null);
    assert.ok(reasons.includes('expired'));

    assert.equal(await verifyGithubOidc(''), null);
    assert.equal(await verifyGithubOidc('not-a-jwt'), null);
  } finally { restore(); }
});

test('unknown kid is rejected', async () => {
  setup();
  const restore = stubJwks();
  try {
    const reasons = [];
    const token = sign(basePayload(), { alg: 'RS256', typ: 'JWT', kid: 'other-kid' });
    const out = await verifyGithubOidc(token, { onError: (r) => reasons.push(r) });
    assert.equal(out, null);
    assert.ok(reasons.includes('unknown_kid'), reasons.join(','));
  } finally { restore(); }
});

test.after(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('GITHUB_OIDC_') && !(key in saved)) delete process.env[key];
  }
  for (const key of Object.keys(saved)) {
    if (key.startsWith('GITHUB_OIDC_')) process.env[key] = saved[key];
  }
  clearOidcCache();
});
