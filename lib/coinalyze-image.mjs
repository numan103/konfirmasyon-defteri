// Coinalyze gunluk ozetini PNG kart olarak uretir.
// Sadece sunucu tarafinda (Vercel) calisir; @resvg/resvg-js yoksa
// cagiran taraf metin fallback'a duser.
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const FONT = fs.readFileSync(new URL('../assets/fonts/Inter-Regular.ttf', import.meta.url));

const W = 1080;
const H = 1350;

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtNum(n, digits = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v).toFixed(digits);
  const parts = abs.split('.');
  const grouped = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '−' : '') + grouped + (digits > 0 ? ',' + parts[1] : '');
}

function signedUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return fmtNum(n / 1e9, 2) + ' mlr$';
  if (abs >= 1e6) return fmtNum(n / 1e6, 1) + ' mn$';
  if (abs >= 1e3) return fmtNum(n / 1e3, 1) + ' bin$';
  return fmtNum(n, 0) + '$';
}

export function renderCoinalyzeImage(data, now = Date.now()) {
  const date = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(now)).replace(',', ' ');
  const cvdCoin = data?.cvd?.coin;
  const cvdUsd = data?.cvd?.usd;
  const ratio = data?.lsr?.ratio;
  const longPct = data?.lsr?.longPct;
  const shortPct = data?.lsr?.shortPct;
  const oi = data?.oi?.total;
  const oiPrev = data?.oiPrev?.total;
  const oiPct = (oiPrev && oiPrev > 0) ? (oi / oiPrev - 1) * 100 : null;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1020"/>
      <stop offset="100%" stop-color="#1a1033"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#6ea8fe"/>
      <stop offset="100%" stop-color="#b197fc"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="64" y="64" width="${W - 128}" height="${H - 128}" rx="40" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)"/>

  <text x="112" y="170" font-family="Inter" font-size="46" font-weight="700" fill="#ffffff">BTC türev görünümü</text>
  <text x="112" y="220" font-family="Inter" font-size="28" font-weight="500" fill="#a9b1c6">${esc(date)} TSİ</text>
  <rect x="112" y="260" width="${W - 224}" height="4" rx="2" fill="url(#accent)"/>

  <!-- CVD -->
  <g transform="translate(112,320)">
    <text font-family="Inter" font-size="26" font-weight="600" fill="#a9b1c6">Spot CVD (24s)</text>
    <text y="86" font-family="Inter" font-size="74" font-weight="800" fill="${Number(cvdCoin) < 0 ? '#ff6b6b' : '#51cf66'}">${fmtNum(cvdCoin, 0)} BTC</text>
    <text y="146" font-family="Inter" font-size="34" font-weight="500" fill="#d0d7e2">${signedUsd(cvdUsd)}</text>
  </g>

  <!-- LSR -->
  <g transform="translate(112,560)">
    <text font-family="Inter" font-size="26" font-weight="600" fill="#a9b1c6">Long / Short</text>
    <text y="86" font-family="Inter" font-size="74" font-weight="800" fill="#ffffff">${fmtNum(ratio, 2)}</text>
    <text y="146" font-family="Inter" font-size="34" font-weight="500" fill="#d0d7e2">Long %${fmtNum(longPct, 1)} / Short %${fmtNum(shortPct, 1)}</text>
  </g>

  <!-- OI -->
  <g transform="translate(112,800)">
    <text font-family="Inter" font-size="26" font-weight="600" fill="#a9b1c6">Açık pozisyon</text>
    <text y="86" font-family="Inter" font-size="74" font-weight="800" fill="#ffffff">${signedUsd(oi)}</text>
    <text y="146" font-family="Inter" font-size="34" font-weight="500" fill="${oiPct != null && oiPct < 0 ? '#ff6b6b' : '#51cf66'}">${oiPct != null ? (oiPct >= 0 ? '+' : '') + fmtNum(oiPct, 1) + '% (24s)' : '—'}</text>
  </g>

  <text x="112" y="${H - 110}" font-family="Inter" font-size="24" font-weight="500" fill="#6b7280">Alfa Traders · Coinalyze agregasyonu</text>
</svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { fontBuffers: [FONT], defaultFontFamily: 'Inter' },
  });
  return resvg.render().asPng();
}
