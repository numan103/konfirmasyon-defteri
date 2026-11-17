// Read dimensions before decoding compressed image pixels.
export function imageDimensions(bytes,type){
  if(type==='image/png'){
    if(bytes.length<24||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)||
      ![73,72,68,82].every((v,i)=>bytes[i+12]===v))throw new Error('Invalid PNG');
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    return {width:v.getUint32(16),height:v.getUint32(20)};
  }
  if(type==='image/jpeg'&&bytes[0]===255&&bytes[1]===216){
    for(let offset=2;offset+8<bytes.length;){
      if(bytes[offset]!==255)break;
      const marker=bytes[offset+1];offset+=2;
      if(marker===216||marker===1)continue;
      const size=(bytes[offset]<<8)|bytes[offset+1];
      if(size<2||offset+size>bytes.length)break;
      if([192,193,194].includes(marker))
        return {height:(bytes[offset+3]<<8)|bytes[offset+4],width:(bytes[offset+5]<<8)|bytes[offset+6]};
      offset+=size;
    }
  }
  throw new Error('Only valid PNG/JPEG screenshots are supported');
}
