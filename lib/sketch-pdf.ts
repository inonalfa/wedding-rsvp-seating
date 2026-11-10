import { chairPositions, sketchItemLabel, isSketchTable, type SeatingSketch } from './seating-sketch';
export type SketchPdfOptions = { includeTableNames?: boolean };
export const PDF_PADDING = 40;
export const PDF_HEADER = 70;
export function sketchImageSize(sketch: SeatingSketch) { return { width: sketch.width + PDF_PADDING * 2, height: sketch.height + PDF_PADDING * 2 + PDF_HEADER }; }
function textLines(ctx: CanvasRenderingContext2D, value: string, width: number) {
  const words=value.split(/\s+/), lines:string[]=[];let line='';
  for(const word of words){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>width){lines.push(line);line=word;}else line=next;}
  if(line)lines.push(line);return lines;
}
export function drawSketchForPdf(ctx:CanvasRenderingContext2D,sketch:SeatingSketch,options:SketchPdfOptions = {}) {
 const size=sketchImageSize(sketch);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size.width,size.height);
 ctx.direction='rtl';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#233e35';ctx.font='bold 26px Arial';ctx.fillText('סקיצת האולם | דנה ויואב',size.width/2,30);
 ctx.font='16px Arial';ctx.fillStyle='#617268';ctx.fillText('10.06.2027',size.width/2,57);
 ctx.save();ctx.translate(PDF_PADDING,PDF_PADDING+PDF_HEADER);ctx.strokeStyle='#718271';ctx.lineWidth=2;ctx.strokeRect(0,0,sketch.width,sketch.height);
 // Dance floors sit under tables, matching the editor's stacking order.
 const items=[...sketch.items].sort((a,b)=>Number(a.kind!=='dance')-Number(b.kind!=='dance'));
 for(const item of items){ctx.save();ctx.translate(item.x+item.width/2,item.y+item.height/2);ctx.rotate(item.rotation*Math.PI/180);ctx.translate(-item.width/2,-item.height/2);
  const gold=item.kind==='banquet'||item.kind==='bar';const border=gold?'#a47c3a':item.kind==='dj'?'#18362a':'#537957';
  ctx.lineWidth=2;ctx.strokeStyle=border;ctx.fillStyle='#fffefb';
  for(const chair of chairPositions(item)){ctx.save();ctx.translate(chair.x,chair.y);ctx.rotate(chair.rotation*Math.PI/180);ctx.fillRect(-9,-8,18,16);ctx.strokeRect(-9,-8,18,16);ctx.beginPath();ctx.moveTo(-5,-4);ctx.lineTo(5,-4);ctx.stroke();ctx.restore();}
  ctx.fillStyle=item.kind==='dj'?'#294c3e':item.kind==='bar'?'#e5d4b2':item.kind==='banquet'?'#f8efdb':item.kind==='dance'?'#f4f7f3':'#f1f6ec';
  ctx.setLineDash(item.kind==='dance'?[10,7]:[]);ctx.fillRect(0,0,item.width,item.height);ctx.strokeRect(0,0,item.width,item.height);ctx.setLineDash([]);
  ctx.save();ctx.beginPath();ctx.rect(4,4,item.width-8,item.height-8);ctx.clip();ctx.fillStyle=item.kind==='dj'?'#fff9ed':'#23482d';ctx.textAlign='center';ctx.direction='rtl';ctx.textBaseline='middle';
  let font=Math.min(18,Math.max(10,Math.min(item.width,item.height)/5));
  const name=options.includeTableNames && isSketchTable(item) ? item.name?.trim() : '';
  const makeLines=()=>{ctx.font=`bold ${font}px Arial`;return [...textLines(ctx,sketchItemLabel(item),item.width-12),...(name?textLines(ctx,name,item.width-12):[])];};
  let lines=makeLines();
  while(font>8 && lines.length*font*1.2>item.height-12){font--;lines=makeLines();}
  const lineHeight=font*1.2,maxLines=Math.max(1,Math.floor((item.height-12)/lineHeight));
  if(lines.length>maxLines){lines=lines.slice(0,maxLines);lines[maxLines-1]+='…';}
  const top=item.height/2-(lines.length-1)*lineHeight/2;
  lines.forEach((line,i)=>ctx.fillText(line,item.width/2,top+i*lineHeight,item.width-12));
  ctx.restore();ctx.restore();
 }
 ctx.restore();
}
// One landscape A4 page with a high-resolution image; no print dialog or external service.
export function jpegToLandscapePdf(jpeg:Uint8Array,width:number,height:number):Uint8Array {
 const encode=(value:string)=>new TextEncoder().encode(value);const parts:Uint8Array[]=[];let length=0;const offsets=[0];const append=(bytes:Uint8Array)=>{parts.push(bytes);length+=bytes.length;};
 append(encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
 const object=(id:number,body:string|Uint8Array[])=>{offsets[id]=length;append(encode(`${id} 0 obj\n`));for(const b of typeof body==='string'?[encode(body)]:body)append(b);append(encode('\nendobj\n'));};
 const pageWidth=841.89,pageHeight=595.28,margin=24;const scale=Math.min((pageWidth-margin*2)/width,(pageHeight-margin*2)/height);const w=width*scale,h=height*scale,x=(pageWidth-w)/2,y=(pageHeight-h)/2;
 const stream=`q\n${w.toFixed(4)} 0 0 ${h.toFixed(4)} ${x.toFixed(4)} ${y.toFixed(4)} cm\n/Sketch Do\nQ\n`;
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
 object(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Sketch 4 0 R >> >> /Contents 5 0 R >>`);
 object(4,[encode(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,encode('\nendstream')]);
 object(5,`<< /Length ${encode(stream).length} >>\nstream\n${stream}endstream`);
 const xref=length;append(encode(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
 const result=new Uint8Array(length);let position=0;for(const part of parts){result.set(part,position);position+=part.length;}return result;
}
export async function downloadSketchPdf(sketch:SeatingSketch,options:SketchPdfOptions = {}) {
 const size=sketchImageSize(sketch),scale=Math.min(2,3200/Math.max(size.width,size.height));const canvas=document.createElement('canvas');canvas.width=Math.ceil(size.width*scale);canvas.height=Math.ceil(size.height*scale);
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('הדפדפן לא תומך בייצוא הסקיצה');ctx.scale(scale,scale);drawSketchForPdf(ctx,sketch,options);
 const jpeg=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('יצירת התמונה נכשלה')),'image/jpeg',.97));
 const bytes=jpegToLandscapePdf(new Uint8Array(await jpeg.arrayBuffer()),canvas.width,canvas.height);const url=URL.createObjectURL(new Blob([bytes as BlobPart],{type:'application/pdf'}));
 const link=document.createElement('a');link.href=url;link.download='dana-yoav-hall-sketch.pdf';document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
