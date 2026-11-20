import { Resvg } from '@resvg/resvg-js';
import { inflateSync } from 'node:zlib';
import { FONT_B64 } from './font-data.mjs';
import { biasChartSvg } from './telegram-bias-chart.mjs';

// The existing embedded font is WOFF. resvg loads SFNT font buffers reliably;
// unpack without a new dependency, external font download or public asset.
function sfntFont() {
  const w=Buffer.from(FONT_B64,'base64');
  if(w.toString('ascii',0,4)!=='wOFF') return w;
  const count=w.readUInt16BE(12),font=Buffer.alloc(w.readUInt32BE(16));
  w.copy(font,0,4,8);font.writeUInt16BE(count,4);
  const power=2**Math.floor(Math.log2(count));
  font.writeUInt16BE(power*16,6);font.writeUInt16BE(Math.log2(power),8);font.writeUInt16BE(count*16-power*16,10);
  let offset=12+16*count;
  for(let i=0;i<count;i++){
    const src=44+20*i,dst=12+16*i,len=w.readUInt32BE(src+12);
    const raw=w.subarray(w.readUInt32BE(src+4),w.readUInt32BE(src+4)+w.readUInt32BE(src+8));
    const bytes=raw.length<len?inflateSync(raw):raw;
    if(bytes.length!==len) throw new Error('chart_font_invalid');
    w.copy(font,dst,src,src+4);w.copy(font,dst+4,src+16,src+20);
    font.writeUInt32BE(offset,dst+8);font.writeUInt32BE(len,dst+12);bytes.copy(font,offset);
    offset+=(len+3)&~3;
  }
  return font;
}
let font;
export function renderBiasChart(model) {
  font ||= sfntFont();
  return new Resvg(biasChartSvg(model), { font: { fontBuffers:[font], defaultFontFamily:'Inter',loadSystemFonts:false } }).render().asPng();
}
