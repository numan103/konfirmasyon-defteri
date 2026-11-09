// Coinalyze gunluk ozetini PNG grafik olarak uretir.
import { FONT_B64 } from './font-data.mjs';
import { Resvg } from '@resvg/resvg-js';

const FONT = Buffer.from(FONT_B64, 'base64');

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

function timeLabel(ts) { return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts * 1000)); }

function commentary(v) {
  if (!v) return '';
  if (v.bias === 'BULLISH') return 'Alis baskisi agir basiyor';
  if (v.bias === 'BEARISH') return 'Satis baskisi agir basiyor';
  return 'Yon belirsiz, piyasa dengede';
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
  const oi = data?.oi?.total;
  const oiPrev = data?.oiPrev?.total;
  const oiPct = (oiPrev && oiPrev > 0) ? (oi / oiPrev - 1) * 100 : null;
  const ratio = data?.lsr?.ratio;
  const longPct = data?.lsr?.longPct;
  const shortPct = data?.lsr?.shortPct;
  const v = data?.verdict || {};
  const bias = v.bias || 'NOTR';
  const verdictColor = bias === 'BULLISH' ? '#22c55e' : bias === 'BEARISH' ? '#ef4444' : '#94a3b8';
  const verdictTag = bias === 'BULLISH' ? 'BULLISH' : bias === 'BEARISH' ? 'BEARISH' : 'NOTR';
  const arrow = bias === 'BULLISH' ? '^' : bias === 'BEARISH' ? 'v' : '-';
  const verdictComment = commentary(v);

  const panelX = 60, panelW = W - 120, chartX = 90, chartW = panelW - 60, chartH = 200;
  const p1Top = 260, p1ChartY = p1Top + 90;
  const p2Top = 600, p2ChartY = p2Top + 90;
  const p3Top = 940, barY = p3Top + 80, barH = 60;
  const longW = chartW * (Number(longPct) || 0) / 100;
  const shortW = chartW * (Number(shortPct) || 0) / 100;
  const cvdColor = Number(cvdCoin) < 0 ? '#ef4444' : '#22c55e';

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
    <linearGradient id="bg" x1="0" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e1035"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="0%" r="70%">
      <stop offset="0%" stop-color="${verdictColor}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${verdictColor}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cvdFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${cvdColor}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="${cvdColor}" stop-opacity="0.02"/>
    </linearGradient>
    <linearGradient id="oiFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="32" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)"/>

  <text x="80" y="110" font-family="Inter" font-size="52" font-weight="800" fill="#ffffff">BTC Turev Gorunumu</text>
  <text x="80" y="150" font-family="Inter" font-size="26" font-weight="500" fill="#94a3b8">${esc(date)} TSI - Son 24 Saat</text>

  <rect x="80" y="175" width="${W - 160}" height="64" rx="16" fill="${verdictColor}" fill-opacity="0.2" stroke="${verdictColor}" stroke-width="2"/>
  <text x="112" y="218" font-family="Inter" font-size="40" font-weight="800" fill="${verdictColor}">${arrow}  ${verdictTag}</text>
  <text x="${W - 112}" y="218" text-anchor="end" font-family="Inter" font-size="22" font-weight="600" fill="#e2e8f0">${esc(verdictComment)}</text>

  <text x="${panelX}" y="${p1Top}" font-family="Inter" font-size="32" font-weight="800" fill="#ffffff">SPOT CVD</text>
  <text x="${panelX + 260}" y="${p1Top}" font-family="Inter" font-size="22" font-weight="500" fill="#94a3b8">Son 24 saat birikimli</text>
  <rect x="${chartX}" y="${p1ChartY}" width="${chartW}" height="${chartH}" rx="14" fill="rgba(255,255,255,0.03)"/>
  ${cvdArea ? `<path d="${cvdArea}" fill="url(#cvdFill)"/>` : ''}
  ${cvdPath ? `<polyline points="${cvdPath}" fill="none" stroke="${cvdColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
  <text x="${chartX}" y="${p1ChartY + chartH + 30}" font-family="Inter" font-size="18" fill="#64748b">${esc(cvdFirst)}</text>
  <text x="${chartX + chartW}" y="${p1ChartY + chartH + 30}" text-anchor="end" font-family="Inter" font-size="18" fill="#64748b">${esc(cvdLast)}</text>

  <text x="${panelX}" y="${p2Top}" font-family="Inter" font-size="32" font-weight="800" fill="#ffffff">ACIK POZISYON (OI)</text>
  <text x="${panelX + 360}" y="${p2Top}" font-family="Inter" font-size="22" font-weight="500" fill="#94a3b8">Son 24 saat</text>
  <rect x="${chartX}" y="${p2ChartY}" width="${chartW}" height="${chartH}" rx="14" fill="rgba(255,255,255,0.03)"/>
  ${oiArea ? `<path d="${oiArea}" fill="url(#oiFill)"/>` : ''}
  ${oiPath ? `<polyline points="${oiPath}" fill="none" stroke="#3b82f6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
  <text x="${chartX}" y="${p2ChartY + chartH + 30}" font-family="Inter" font-size="18" fill="#64748b">${esc(oiFirst)}</text>
  <text x="${chartX + chartW}" y="${p2ChartY + chartH + 30}" text-anchor="end" font-family="Inter" font-size="18" fill="#64748b">${esc(oiLast)}</text>

  <text x="${panelX}" y="${p3Top}" font-family="Inter" font-size="32" font-weight="800" fill="#ffffff">LONG / SHORT</text>
  <rect x="${chartX}" y="${barY}" width="${chartW}" height="${barH}" rx="12" fill="rgba(255,255,255,0.05)"/>
  <rect x="${chartX}" y="${barY}" width="${longW}" height="${barH}" rx="12" fill="#22c55e"/>
  <rect x="${chartX + longW}" y="${barY}" width="${shortW}" height="${barH}" rx="12" fill="#ef4444"/>
  <text x="${chartX + 18}" y="${barY + barH / 2 + 9}" font-family="Inter" font-size="24" font-weight="700" fill="#0f172a">Long ${fmtNum(longPct, 1)}%</text>
  <text x="${chartX + chartW - 18}" y="${barY + barH / 2 + 9}" text-anchor="end" font-family="Inter" font-size="24" font-weight="700" fill="#ffffff">Short ${fmtNum(shortPct, 1)}%</text>

  <text x="80" y="${H - 60}" font-family="Inter" font-size="20" font-weight="500" fill="#475569">Alfa Traders  -  Coinalyze  -  Son 24 saat</text>
</svg>`;

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: W }, font: { fontBuffers: [FONT], defaultFontFamily: 'Inter' } });
  return resvg.render().asPng();
}
