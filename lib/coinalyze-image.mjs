// Coinalyze gunluk ozetini PNG grafik olarak uretir.
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

function timeLabel(ts) {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts * 1000));
}

function linePath(points, x0, y0, w, h, key) {
  if (!points || points.length < 2) return '';
  const vals = points.map(p => Number(p[key]));
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = (max - min) || 1;
  const coords = points.map((p, i) => {
    const x = x0 + (i / (points.length - 1)) * w;
    const y = y0 + h - ((Number(p[key]) - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return coords.join(' ');
}

function areaPath(points, x0, y0, w, h, key) {
  if (!points || points.length < 2) return '';
  const lp = linePath(points, x0, y0, w, h, key);
  const lastX = x0 + w;
  const firstX = x0;
  const baseY = y0 + h;
  return `M ${firstX},${baseY} L ${lp.replace(/ /g, ' L ')} L ${lastX},${baseY} Z`;
}

export function renderCoinalyzeChart(data, now = Date.now()) {
  const date = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(now)).replace(',', ' ');

  const cvdSeries = Array.isArray(data?.cvdSeries) ? data.cvdSeries : [];
  const oiSeries = Array.isArray(data?.oiSeries) ? data.oiSeries : [];
  const cvdCoin = data?.cvd?.coin;
  const cvdUsd = data?.cvd?.usd;
  const ratio = data?.lsr?.ratio;
  const longPct = data?.lsr?.longPct;
  const shortPct = data?.lsr?.shortPct;
  const oi = data?.oi?.total;
  const oiPrev = data?.oiPrev?.total;
  const oiPct = (oiPrev && oiPrev > 0) ? (oi / oiPrev - 1) * 100 : null;

  const panelX = 90;
  const panelW = W - 180;
  const chartX = panelX + 20;
  const chartW = panelW - 40;
  const chartH = 180;

  // Panel 1: CVD
  const p1Top = 150;
  const p1ChartY = p1Top + 70;
  const cvdPath = linePath(cvdSeries, chartX, p1ChartY, chartW, chartH, 'coin');
  const cvdArea = areaPath(cvdSeries, chartX, p1ChartY, chartW, chartH, 'coin');
  const cvdColor = Number(cvdCoin) < 0 ? '#ff6b6b' : '#51cf66';
  const cvdFirst = cvdSeries.length ? timeLabel(cvdSeries[0].t) : '';
  const cvdLast = cvdSeries.length ? timeLabel(cvdSeries[cvdSeries.length - 1].t) : '';

  // Panel 2: OI
  const p2Top = 470;
  const p2ChartY = p2Top + 70;
  const oiPath = linePath(oiSeries, chartX, p2ChartY, chartW, chartH, 'total');
  const oiArea = areaPath(oiSeries, chartX, p2ChartY, chartW, chartH, 'total');
  const oiFirst = oiSeries.length ? timeLabel(oiSeries[0].t) : '';
  const oiLast = oiSeries.length ? timeLabel(oiSeries[oiSeries.length - 1].t) : '';

  // Panel 3: L/S bar
  const p3Top = 790;
  const barY = p3Top + 90;
  const barH = 60;
  const longW = chartW * (Number(longPct) || 0) / 100;
  const shortW = chartW * (Number(shortPct) || 0) / 100;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1020"/>
      <stop offset="100%" stop-color="#1a1033"/>
    </linearGradient>
    <linearGradient id="cvdFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${cvdColor}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${cvdColor}" stop-opacity="0.02"/>
    </linearGradient>
    <linearGradient id="oiFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6ea8fe" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#6ea8fe" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="64" y="64" width="${W - 128}" height="${H - 128}" rx="40" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)"/>

  <text x="112" y="130" font-family="Inter" font-size="44" font-weight="700" fill="#ffffff">BTC türev görünümü</text>
  <text x="112" y="172" font-family="Inter" font-size="26" font-weight="500" fill="#a9b1c6">${esc(date)} TSİ</text>
  <rect x="112" y="190" width="${W - 224}" height="3" rx="2" fill="#6ea8fe"/>

  <!-- Panel 1: CVD -->
  <text x="${panelX}" y="${p1Top}" font-family="Inter" font-size="26" font-weight="600" fill="#a9b1c6">Spot CVD (24s)</text>
  <text x="${panelX + panelW - 20}" y="${p1Top}" text-anchor="end" font-family="Inter" font-size="30" font-weight="700" fill="${cvdColor}">${fmtNum(cvdCoin, 0)} BTC · ${signedUsd(cvdUsd)}</text>
  <rect x="${chartX}" y="${p1ChartY}" width="${chartW}" height="${chartH}" rx="12" fill="rgba(255,255,255,0.03)"/>
  ${cvdArea ? `<path d="${cvdArea}" fill="url(#cvdFill)"/>` : ''}
  ${cvdPath ? `<polyline points="${cvdPath}" fill="none" stroke="${cvdColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
  <text x="${chartX}" y="${p1ChartY + chartH + 28}" font-family="Inter" font-size="18" fill="#6b7280">${esc(cvdFirst)}</text>
  <text x="${chartX + chartW}" y="${p1ChartY + chartH + 28}" text-anchor="end" font-family="Inter" font-size="18" fill="#6b7280">${esc(cvdLast)}</text>

  <!-- Panel 2: OI -->
  <text x="${panelX}" y="${p2Top}" font-family="Inter" font-size="26" font-weight="600" fill="#a9b1c6">Açık pozisyon (OI)</text>
  <text x="${panelX + panelW - 20}" y="${p2Top}" text-anchor="end" font-family="Inter" font-size="30" font-weight="700" fill="#6ea8fe">${signedUsd(oi)}${oiPct != null ? '  ' + (oiPct >= 0 ? '+' : '') + fmtNum(oiPct, 1) + '%' : ''}</text>
  <rect x="${chartX}" y="${p2ChartY}" width="${chartW}" height="${chartH}" rx="12" fill="rgba(255,255,255,0.03)"/>
  ${oiArea ? `<path d="${oiArea}" fill="url(#oiFill)"/>` : ''}
  ${oiPath ? `<polyline points="${oiPath}" fill="none" stroke="#6ea8fe" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
  <text x="${chartX}" y="${p2ChartY + chartH + 28}" font-family="Inter" font-size="18" fill="#6b7280">${esc(oiFirst)}</text>
  <text x="${chartX + chartW}" y="${p2ChartY + chartH + 28}" text-anchor="end" font-family="Inter" font-size="18" fill="#6b7280">${esc(oiLast)}</text>

  <!-- Panel 3: Long/Short -->
  <text x="${panelX}" y="${p3Top}" font-family="Inter" font-size="26" font-weight="600" fill="#a9b1c6">Long / Short</text>
  <text x="${panelX + panelW - 20}" y="${p3Top}" text-anchor="end" font-family="Inter" font-size="30" font-weight="700" fill="#ffffff">${fmtNum(ratio, 2)}  ·  Long %${fmtNum(longPct, 1)} / Short %${fmtNum(shortPct, 1)}</text>
  <rect x="${chartX}" y="${barY}" width="${chartW}" height="${barH}" rx="12" fill="rgba(255,255,255,0.05)"/>
  <rect x="${chartX}" y="${barY}" width="${longW}" height="${barH}" rx="12" fill="#51cf66"/>
  <rect x="${chartX + longW}" y="${barY}" width="${shortW}" height="${barH}" rx="12" fill="#ff6b6b"/>
  <text x="${chartX + 16}" y="${barY + barH / 2 + 8}" font-family="Inter" font-size="24" font-weight="700" fill="#0b1020">Long ${fmtNum(longPct, 1)}%</text>
  <text x="${chartX + chartW - 16}" y="${barY + barH / 2 + 8}" text-anchor="end" font-family="Inter" font-size="24" font-weight="700" fill="#ffffff">Short ${fmtNum(shortPct, 1)}%</text>

  <text x="112" y="${H - 90}" font-family="Inter" font-size="22" font-weight="500" fill="#6b7280">Alfa Traders · Coinalyze agregasyonu · 24s görünüm</text>
</svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { fontBuffers: [FONT], defaultFontFamily: 'Inter' },
  });
  return resvg.render().asPng();
}
