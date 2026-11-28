// Worker uyumlu Coinalyze PNG grafik uretimi.
// Native bagimlilik veya dynamic import yok; Cloudflare Pages Function paketine
// statik olarak girer ve ayni veri icin deterministik RGB PNG uretir.

const W = 900;
const H = 1125;

const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00100', '00100'],
  ',': ['00000', '00000', '00000', '00000', '00100', '00100', '01000'],
  ':': ['00000', '00100', '00000', '00000', '00100', '00000', '00000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '/': ['00001', '00001', '00010', '00100', '01000', '10000', '10000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
};

const COLORS = {
  bg: '#0b1016',
  panel: '#101925',
  panelAlt: '#0e1620',
  grid: '#1d2a38',
  border: '#29384a',
  text: '#e8eef7',
  muted: '#8b9aad',
  blue: '#2962ff',
  green: '#26a69a',
  red: '#ef5350',
  cvdDown: '#17313a',
  cvdUp: '#173a35',
  oiFill: '#182a52',
};

function rgb(hex) {
  const s = String(hex).replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function normalize(text) {
  return String(text ?? '')
    .toUpperCase()
    .replaceAll('İ', 'I').replaceAll('Ş', 'S').replaceAll('Ğ', 'G')
    .replaceAll('Ü', 'U').replaceAll('Ö', 'O').replaceAll('Ç', 'C')
    .replaceAll('−', '-').replaceAll('–', '-').replaceAll('—', '-');
}

function fillRect(px, x, y, w, h, color) {
  const c = rgb(color);
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++, i += 3) {
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
    }
  }
}

function drawLine(px, x0, y0, x1, y1, color, width = 1) {
  let x = Math.round(x0), y = Math.round(y0);
  const ex = Math.round(x1), ey = Math.round(y1);
  const dx = Math.abs(ex - x), sx = x < ex ? 1 : -1;
  const dy = -Math.abs(ey - y), sy = y < ey ? 1 : -1;
  let err = dx + dy;
  const off = Math.floor(width / 2);
  for (;;) {
    fillRect(px, x - off, y - off, width, width, color);
    if (x === ex && y === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

function textWidth(text, scale = 2) {
  return normalize(text).length * 6 * scale;
}

function drawText(px, text, x, y, scale = 2, color = COLORS.text) {
  const s = normalize(text);
  let cursor = Math.floor(x);
  for (const ch of s) {
    const glyph = FONT[ch];
    if (!glyph) { cursor += 3 * scale; continue; }
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === '1') fillRect(px, cursor + col * scale, y + row * scale, scale, scale, color);
      }
    }
    cursor += 6 * scale;
  }
  return cursor - x;
}

function drawCenterText(px, text, cx, y, scale = 2, color = COLORS.text) {
  drawText(px, text, cx - textWidth(text, scale) / 2, y, scale, color);
}

function fmtNum(n, digits = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v).toFixed(digits);
  const parts = abs.split('.');
  const grouped = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '-' : '') + grouped + (digits > 0 ? ',' + parts[1] : '');
}

function fmtUsd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return fmtNum(v / 1e9, 2) + ' MLR$';
  if (abs >= 1e6) return fmtNum(v / 1e6, 1) + ' MN$';
  if (abs >= 1e3) return fmtNum(v / 1e3, 1) + ' B$';
  return fmtNum(v, 0) + '$';
}

function stamp(now) {
  const d = new Date(Number(now) + 3 * 3600 * 1000); // Turkiye sabit UTC+3.
  const pad = n => String(n).padStart(2, '0');
  return pad(d.getUTCDate()) + '.' + pad(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear()
    + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' TSI';
}

function statCard(px, x, y, w, h, label, value, sub, accent) {
  fillRect(px, x, y, w, h, COLORS.panel);
  fillRect(px, x, y, w, 3, accent);
  for (const [sx, sy, sw, sh] of [[x, y, w, 1], [x, y + h - 1, w, 1], [x, y, 1, h], [x + w - 1, y, 1, h]]) {
    fillRect(px, sx, sy, sw, sh, COLORS.border);
  }
  drawText(px, label, x + 14, y + 16, 1, COLORS.muted);
  drawText(px, value, x + 14, y + 38, 2, COLORS.text);
  drawText(px, sub, x + 14, y + 70, 1, accent);
}

function drawSeries(px, box, series, key, color, fill, zeroLine) {
  fillRect(px, box.x, box.y, box.w, box.h, COLORS.panelAlt);
  for (const [sx, sy, sw, sh] of [[box.x, box.y, box.w, 1], [box.x, box.y + box.h - 1, box.w, 1], [box.x, box.y, 1, box.h], [box.x + box.w - 1, box.y, 1, box.h]]) {
    fillRect(px, sx, sy, sw, sh, COLORS.border);
  }
  for (let i = 1; i < 4; i++) {
    const y = box.y + Math.round(box.h * i / 4);
    for (let x = box.x + 1; x < box.x + box.w - 1; x += 8) fillRect(px, x, y, 4, 1, COLORS.grid);
  }
  const values = (Array.isArray(series) ? series : [])
    .map(row => Number(row && row[key]))
    .filter(Number.isFinite);
  if (values.length < 2) {
    drawCenterText(px, 'VERI YOK', box.x + box.w / 2, box.y + box.h / 2 - 7, 2, COLORS.muted);
    return;
  }
  let min = Math.min(...values), max = Math.max(...values);
  if (zeroLine) { min = Math.min(min, 0); max = Math.max(max, 0); }
  const span = max - min || 1;
  const left = box.x + 10, right = box.x + box.w - 10;
  const top = box.y + 12, bottom = box.y + box.h - 12;
  const pts = values.map((v, i) => ({
    x: Math.round(left + (right - left) * i / (values.length - 1)),
    y: Math.round(bottom - ((v - min) / span) * (bottom - top)),
  }));
  const base = zeroLine ? Math.round(bottom - ((0 - min) / span) * (bottom - top)) : bottom;
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i].x;
    const a = Math.min(pts[i].y, base), b = Math.max(pts[i].y, base);
    if (b > a) fillRect(px, x, a, 2, b - a, fill);
  }
  for (let i = 1; i < pts.length; i++) {
    drawLine(px, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, color, 2);
  }
  for (let i = 0; i < pts.length; i += 6) fillRect(px, pts[i].x - 2, pts[i].y - 2, 5, 5, color);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.length);
  dv.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

function deflateStored(raw) {
  const parts = [];
  let total = 0;
  for (let pos = 0; pos < raw.length; pos += 65535) {
    const slice = raw.subarray(pos, Math.min(pos + 65535, raw.length));
    const last = pos + 65535 >= raw.length;
    const head = new Uint8Array(5);
    head[0] = last ? 1 : 0; // BFINAL=1/0, BTYPE=00 (stored).
    head[1] = slice.length & 0xff;
    head[2] = (slice.length >>> 8) & 0xff;
    head[3] = (~slice.length) & 0xff;
    head[4] = ((~slice.length) >>> 8) & 0xff;
    parts.push(head, slice);
    total += head.length + slice.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const part of parts) { out.set(part, off); off += part.length; }
  return out;
}

function encodePng(px) {
  const raw = new Uint8Array(H * (1 + W * 3));
  let ro = 0;
  for (let y = 0; y < H; y++) {
    raw[ro++] = 0; // PNG filter: none.
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), ro);
    ro += W * 3;
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W); dv.setUint32(4, H);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateStored(raw);
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const part of parts) { out.set(part, off); off += part.length; }
  return out;
}

export function renderCoinalyzePng(data = {}, now = Date.now()) {
  const px = new Uint8Array(W * H * 3);
  fillRect(px, 0, 0, W, H, COLORS.bg);
  fillRect(px, 0, 0, W, 5, COLORS.blue);

  const bias = String(data.verdict?.bias || '').toUpperCase();
  const biasColor = bias === 'BULLISH' ? COLORS.green : bias === 'BEARISH' ? COLORS.red : COLORS.muted;
  const cvdCoin = Number(data.cvd?.coin);
  const cvdColor = Number.isFinite(cvdCoin) && cvdCoin >= 0 ? COLORS.green : COLORS.red;
  const oiChange = Number.isFinite(Number(data.oi?.total)) && Number.isFinite(Number(data.oiPrev?.total)) && Number(data.oiPrev.total)
    ? ((Number(data.oi.total) / Number(data.oiPrev.total)) - 1) * 100 : null;

  drawText(px, 'BTC TUREV GORUNUMU', 36, 34, 3, COLORS.text);
  drawText(px, stamp(now), 36, 70, 2, COLORS.muted);
  drawText(px, 'COINALYZE / 24S', W - 36 - textWidth('COINALYZE / 24S', 2), 70, 2, COLORS.blue);

  statCard(px, 36, 112, 198, 108, 'SPOT CVD 24S', fmtNum(cvdCoin) + ' BTC', fmtUsd(data.cvd?.usd), cvdColor);
  statCard(px, 246, 112, 198, 108, 'LONG / SHORT', fmtNum(data.lsr?.ratio, 2), fmtNum(data.lsr?.longPct, 1) + '% / ' + fmtNum(data.lsr?.shortPct, 1) + '%', COLORS.blue);
  statCard(px, 456, 112, 198, 108, 'ACIK POZISYON', fmtUsd(data.oi?.total), oiChange == null ? '24S —' : '24S ' + fmtNum(oiChange, 1) + '%', COLORS.blue);
  statCard(px, 666, 112, 198, 108, 'FIYAT 24S', fmtNum(data.priceChangePct, 1) + '%', data.oi?.count ? data.oi.count + ' KONTRAT' : 'BTC / USD', data.priceChangePct >= 0 ? COLORS.green : COLORS.red);

  drawText(px, 'SPOT CVD AKISI', 36, 244, 2, COLORS.text);
  drawSeries(px, { x: 36, y: 272, w: 828, h: 222 }, data.cvdSeries, 'coin', cvdColor, cvdCoin >= 0 ? COLORS.cvdUp : COLORS.cvdDown, true);

  drawText(px, 'ACIK POZISYON EGILIMI', 36, 520, 2, COLORS.text);
  drawSeries(px, { x: 36, y: 548, w: 828, h: 202 }, data.oiSeries, 'total', COLORS.blue, COLORS.oiFill, false);

  fillRect(px, 36, 782, 828, 154, COLORS.panel);
  fillRect(px, 36, 782, 828, 3, COLORS.border);
  drawText(px, 'PZ BIAS', 60, 806, 2, COLORS.muted);
  const longPct = Math.max(0, Math.min(100, Number(data.lsr?.longPct) || 0));
  const shortPct = Math.max(0, Math.min(100, Number(data.lsr?.shortPct) || 0));
  const totalPct = longPct + shortPct || 1;
  const barX = 60, barY = 840, barW = 780, barH = 30;
  const longW = Math.round(barW * longPct / totalPct);
  fillRect(px, barX, barY, barW, barH, COLORS.red);
  fillRect(px, barX, barY, longW, barH, COLORS.green);
  drawText(px, 'LONG ' + fmtNum(data.lsr?.longPct, 1) + '%', barX, barY + 44, 2, COLORS.green);
  drawText(px, 'SHORT ' + fmtNum(data.lsr?.shortPct, 1) + '%', barX + 390, barY + 44, 2, COLORS.red);
  drawText(px, 'ORAN ' + fmtNum(data.lsr?.ratio, 2), 60, 900, 1, COLORS.muted);

  fillRect(px, 36, 968, 828, 96, bias === 'BEARISH' ? '#3a1c22' : bias === 'BULLISH' ? '#17332e' : '#222b38');
  fillRect(px, 36, 968, 6, 96, biasColor);
  drawText(px, bias || 'NEUTRAL', 64, 986, 3, biasColor);
  drawText(px, bias === 'BEARISH' ? 'SATIS BASKISI AGIR BASIYOR' : bias === 'BULLISH' ? 'ALIS BASKISI AGIR BASIYOR' : 'YON BELIRSIZ', 64, 1024, 2, COLORS.text);

  drawCenterText(px, 'ALFA TRADERS  -  COINALYZE VERISI', W / 2, 1092, 1, COLORS.muted);
  return encodePng(px);
}
