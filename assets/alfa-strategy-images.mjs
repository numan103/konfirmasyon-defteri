import { screenshotBytes } from './alfa-strategy-model.mjs?v=1';
import { imageDimensions } from './alfa-strategy-image-header.mjs?v=1';
export { imageDimensions };
export async function sanitizeScreenshot(file){
  if(!file||!['image/png','image/jpeg'].includes(file.type)||file.size>2*1024*1024)throw new Error('PNG/JPEG, en fazla 2 MB seçin');
  const bytes=new Uint8Array(await file.arrayBuffer()),dimensions=imageDimensions(bytes,file.type);
  if(!dimensions.width||!dimensions.height||dimensions.width>8192||dimensions.height>8192||
    dimensions.width*dimensions.height>16000000)throw new Error('Screenshot dimensions exceed safety limit');
  const bitmap=await createImageBitmap(new Blob([bytes],{type:file.type}));
  try{
    if(bitmap.width!==dimensions.width||bitmap.height!==dimensions.height)throw new Error('Screenshot dimensions mismatch');
    const factor=Math.min(1,1280/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*factor));canvas.height=Math.max(1,Math.round(bitmap.height*factor));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#10141c';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    for(const quality of [.85,.65,.45]){
      const result=canvas.toDataURL('image/jpeg',quality);
      try{screenshotBytes(result);return result;}catch{/* Try a lower local encoding quality. */}
    }
    throw new Error('Screenshot 256 KB sınırına indirilemedi');
  }finally{bitmap.close();}
}
