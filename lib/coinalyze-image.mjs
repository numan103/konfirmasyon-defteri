// Coinalyze gunluk ozetini profesyonel PNG grafik olarak uretir.
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const FONT = fs.readFileSync(new URL('../assets/fonts/Inter-Regular.ttf', import.meta.url));

const W = 1080;
const H = 1350;

function esc(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

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

function timeLabel(ts) { return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts * 1000)); }

function commentary(v) {
  if (!v) return '';
  if (v.bias === 'BULLISH') return 'Alış baskısı ağır basıyor; fiyat 24s yükselişte.';
  if (v.bias === 'BEARISH') return 'Satış baskısı ağır basıyor; fiyat 24s düşüşte.';
  return 'Yön belirsiz; piyasa dengede, beklemede.';
}

function linePath(points, x0, y0, w, h, key) {
  if (!points || points.length < 2) return '';
  const vals = points.map(p => Number(p[key]));
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = (max - min) || 1;
  return points.map((p, i) => {
    const x = x0 + (i / (points.length - 1)) * w;
    const y = y0 + h - ((Number(p[key]) - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function areaPath(points, x0, y0, w, h, key) {
  if (!points || points.length < 2) return '';
  const lp = linePath(points, x0, y0, w, h, key);
  const lastX = x0 + w, firstX = x0, baseY = y0 + h;
  return `M ${firstX},${baseY} L ${lp.replace(/ /g, ' L ')} L ${lastX},${baseY} Z`;
}

export function renderCoinalyzeChart(data, now = Date.now()) {
  const date = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(now)).replace(',', ' ');
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
  const v = data?.verdict || {};
  const bias = v.bias || 'NÖTR';
  const verdictColor = bias === 'BULLISH' ? '#3dd68c' : bias === 'BEARISH' ? '#ff5d6c' : '#9aa4bf';
  const verdictTag = bias === 'BULLISH' ? 'BULLISH' : bias === 'BEARISH' ? 'BEARISH' : 'NÖTR';
  const verdictComment = commentary(v);

  const panelX = 80, panelW = W - 160, chartX = 110, chartW = panelW - 60, chartH = 160;
  const p1Top = 250, p1ChartY = p1Top + 86;
  const p2Top = 560, p2ChartY = p2Top + 86;
  const p3Top = 870, barY = p3Top + 96, barH = 56;
  const longW = chartW * (Number(longPct) || 0) / 100;
  const shortW = chartW * (Number(shortPct) || 0) / 100;
  const cvdColor = Number(cvdCoin) < 0 ? '#ff5d6c' : '#3dd68c';

  const cvdPath = linePath(cvdSeries, chartX, p1ChartY, chartW, chartH, 'coin');
  const cvdArea = areaPath(cvdSeries, chartX, p1ChartY, chartW, chartH, 'coin');
  const cvdFirst = cvdSeries.length ? timeLabel(cvdSeries[0].t) : '';
  const cvdLast = cvdSeries.length ? timeLabel(cvdSeries[cvdSeries.length - 1].t) : '';
  const oiPath = linePath(oiSeries, chartX, p2ChartY, chartW, chartH, 'total');
  const oiArea = areaPath(oiSeries, chartX, p2ChartY, chartW, chartH, 'total');
  const oiFirst = oiSeries.length ? timeLabel(oiSeries[0].t) : '';
  const oiLast = oiSeries.length ? timeLabel(oiSeries[oiSeries.length - 1].t) : '';

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stop-color="#0a0f1f"/>
      <stop offset="100%" stop-color="#150d2e"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="0%" r="60%">
      <stop offset="0%" stop-color="${verdictColor}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${verdictColor}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cvdFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${cvdColor}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${cvdColor}" stop-opacity="0.02"/>
    </linearGradient>
    <linearGradient id="oiFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5b8def" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#5b8def" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="48" y="48" width="${W - 96}" height="${H - 96}" rx="36" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.09)"/>

  <text x="96" y="128" font-family="Inter" font-size="46" font-weight="700" fill="#ffffff">BTC Türev Görünümü</text>
  <text x="96" y="168" font-family="Inter" font-size="24" font-weight="500" fill="#8b93a7">${esc(date)} TSİ · 24s görünüm</text>

  <rect x="96" y="192" width="${W - 192}" height="78" rx="16" fill="${verdictColor}" fill-opacity="0.14" stroke="${verdictColor}" stroke-opacity="0.5" stroke-width="1.5"/>
  <text x="128" y="242" font-family="Inter" font-size="38" font-weight="800" fill="${verdictColor}">YÖN: ${verdictTag}</text>
  <text x="${W - 128}" y="242" text-anchor="end" font-family="Inter" font-size="20" font-weight="500" fill="#c9d1e0">${esc(verdictComment)}</text>

  <!-- Panel 1 -->
  <text x="${panelX}" y="${p1Top}" font-family="Inter" font-size="30" font-weight="700" fill="#ffffff">SPOT CVD (24s)</text>
  <text x="${panelX + panelW}" y="${p1Top}" text-anchor="end" font-family="Inter" font-size="26" font-weight="700" fill="${cvdColor}">${fmtNum(cvdCoin, 0)} BTC  ·  ${signedUsd(cvdUsd)}</text>
  <rect x="${chartX}" y="${p1ChartY}" width="${chartW}" height="${chartH}" rx="14" fill="rgba(255,255,255,0.025)"/>
  ${cvdArea ? `<path d="${cvdArea}" fill="url(#cvdFill)"/>` : ''}
  ${cvdPath ? `<polyline points="${cvdPath}" fill="none" stroke="${cvdColor}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
  <text x="${chartX}" y="${p1ChartY + chartH + 26}" font-family="Inter" font-size="16" fill="#6b7280">${esc(cvdFirst)}</text>
  <text x="${chartX + chartW}" y="${p1ChartY + chartH + 26}" text-anchor="end" font-family="Inter" font-size="16" fill="#6b7280">${esc(cvdLast)}</text>

  <!-- Panel 2 -->
  <text x="${panelX}" y="${p2Top}" font-family="Inter" font-size="30" font-weight="700" fill="#ffffff">AÇIK POZİSYON (OI)</text>
  <text x="${panelX + panelW}" y="${p2Top}" text-anchor="end" font-family="Inter" font-size="26" font-weight="700" fill="#5b8def">${signedUsd(oi)}${oiPct != null ? '  ' + (oiPct >= 0 ? '+' : '') + fmtNum(oiPct, 1) + '%' : ''}</text>
  <rect x="${chartX}" y="${p2ChartY}" width="${chartW}" height="${chartH}" rx="14" fill="rgba(255,255,255,0.025)"/>
  ${oiArea ? `<path d="${oiArea}" fill="url(#oiFill)"/>` : ''}
  ${oiPath ? `<polyline points="${oiPath}" fill="none" stroke="#5b8def" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
  <text x="${chartX}" y="${p2ChartY + chartH + 26}" font-family="Inter" font-size="16" fill="#6b7280">${esc(oiFirst)}</text>
  <text x="${chartX + chartW}" y="${p2ChartY + chartH + 26}" text-anchor="end" font-family="Inter" font-size="16" fill="#6b7280">${esc(oiLast)}</text>

  <!-- Panel 3 -->
  <text x="${panelX}" y="${p3Top}" font-family="Inter" font-size="30" font-weight="700" fill="#ffffff">LONG / SHORT</text>
  <text x="${panelX + panelW}" y="${p3Top}" text-anchor="end" font-family="Inter" font-size="28" font-weight="700" fill="#ffffff">${fmtNum(ratio, 2)}  ·  Long %${fmtNum(longPct, 1)} / Short %${fmtNum(shortPct, 1)}</text>
  <rect x="${chartX}" y="${barY}" width="${chartW}" height="${barH}" rx="12" fill="rgba(255,255,255,0.05)"/>
  <rect x="${chartX}" y="${barY}" width="${longW}" height="${barH}" rx="12" fill="#3dd68c"/>
  <rect x="${chartX + longW}" y="${barY}" width="${shortW}" height="${barH}" rx="12" fill="#ff5d6c"/>
  <text x="${chartX + 18}" y="${barY + barH / 2 + 8}" font-family="Inter" font-size="22" font-weight="700" fill="#0a0f1f">Long ${fmtNum(longPct, 1)}%</text>
  <text x="${chartX + chartW - 18}" y="${barY + barH / 2 + 8}" text-anchor="end" font-family="Inter" font-size="22" font-weight="700" fill="#ffffff">Short ${fmtNum(shortPct, 1)}%</text>

  <text x="96" y="${H - 70}" font-family="Inter" font-size="18" font-weight="500" fill="#5a6175">Alfa Traders · Coinalyze agregasyonu · 24s görünüm</text>
</svg>`;

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { fontBuffers: [FONT], defaultFontFamily: 'Inter' } });
  return resvg.render().asPng();
}
