const WIDTH=1200, PAD=72, FONT='system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const PUBLIC_GAMES=Object.freeze({'kromaphone.com':'gameufotrabai','jcalit.com':'ufogoitrabai'});
const clean=value=>typeof value==='string'?value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').replace(/\s+/gu,' ').trim():'';

function publicUrl(value) {
  let host='kromaphone.com';
  try { const candidate=new URL(value).hostname.toLowerCase().replace(/^www\./,'');if(Object.hasOwn(PUBLIC_GAMES,candidate))host=candidate; } catch {}
  // Keep each public hostname paired with its own route in both site builds.
  return `https://${host}/${PUBLIC_GAMES[host]}/`;
}

function resultData(data={}) {
  return {title:clean(data?.title)||'Kết quả gọi UFO',className:clean(data?.className),
    names:(Array.isArray(data?.names)?data.names:[]).map(clean).filter(Boolean).slice(0,10),url:publicUrl(data?.url)};
}

/** Only explicitly supplied display text and a public game URL leave this module. */
export function buildResultText(data) {
  const result=resultData(data);
  return [result.title,result.className,...result.names.map((name,index)=>`${index+1}. ${name}`),result.url].filter(Boolean).join('\n');
}

function graphemes(text) {
  return typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(part=>part.segment):Array.from(text);
}

function wrap(c,text,width) {
  const lines=[];let line='';
  for(const word of text.split(' ')) {
    if(c.measureText(line?`${line} ${word}`:word).width<=width){line=line?`${line} ${word}`:word;continue;}
    if(line){lines.push(line);line='';}
    for(const letter of graphemes(word)) {
      if(line&&c.measureText(line+letter).width>width){lines.push(line);line='';}
      line+=letter;
    }
  }
  if(line)lines.push(line);
  return lines;
}

function font(c,size,weight=700) {c.font=`${weight} ${size}px ${FONT}`;}
function rounded(c,x,y,w,h,r) {
  c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);
  c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);
  c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();
}

/** Build the PNG before a share-button click, so native sharing keeps user activation. */
export async function renderResultImage(data) {
  const result=resultData(data),canvas=document.createElement('canvas'),c=canvas.getContext('2d');
  if(!c)throw new Error('Canvas is unavailable');
  const contentWidth=WIDTH-PAD*2,nameWidth=contentWidth-124,nameSize=result.names.length===1?76:result.names.length<=3?62:48;
  font(c,54);const titleLines=wrap(c,result.title,contentWidth-150);
  font(c,30,500);const classLines=result.className?wrap(c,result.className,contentWidth):[];
  font(c,nameSize);const rows=result.names.map(name=>wrap(c,name,nameWidth));
  const titleTop=188,classTop=titleTop+titleLines.length*68+24;
  let y=classTop+classLines.length*42+42;
  const firstRow=y,rowHeights=rows.map(lines=>Math.max(96,lines.length*(nameSize*1.3)+36));
  const listHeight=rowHeights.reduce((sum,height)=>sum+height,0)+Math.max(0,rows.length-1)*14;
  canvas.width=WIDTH;canvas.height=Math.max(780,Math.ceil(firstRow+listHeight+150));
  c.fillStyle='#eff5e3';c.fillRect(0,0,WIDTH,canvas.height);
  c.fillStyle='#fffef7';rounded(c,26,26,WIDTH-52,canvas.height-52,32);c.fill();
  c.strokeStyle='#b9cf9b';c.lineWidth=3;rounded(c,27.5,27.5,WIDTH-55,canvas.height-55,31);c.stroke();
  c.textBaseline='top';c.textAlign='left';c.fillStyle='#31654c';font(c,32,800);c.fillText('KROMA  /  UFO',PAD,82);
  // A local vector UFO keeps the exported card independent of external images.
  c.fillStyle='#c4dfa2';c.beginPath();c.ellipse(WIDTH-PAD-56,133,43,38,0,Math.PI,0);c.fill();
  c.fillStyle='#31654c';c.beginPath();c.ellipse(WIDTH-PAD-56,136,67,20,0,0,Math.PI*2);c.fill();
  c.fillStyle='#edf5db';for(const offset of [-33,0,33]){c.beginPath();c.arc(WIDTH-PAD-56+offset,136,4,0,Math.PI*2);c.fill();}
  c.fillStyle='#25392f';font(c,54);titleLines.forEach((line,index)=>c.fillText(line,PAD,titleTop+index*68));
  c.fillStyle='#6a7c61';font(c,30,500);classLines.forEach((line,index)=>c.fillText(line,PAD,classTop+index*42));
  for(let index=0;index<rows.length;index++) {
    const height=rowHeights[index];c.fillStyle=index%2?'#f5f7ed':'#eaf2dc';rounded(c,PAD,y,contentWidth,height,20);c.fill();
    c.fillStyle='#31654c';font(c,27,800);c.fillText(String(index+1).padStart(2,'0'),PAD+25,y+31);
    c.fillStyle='#25392f';font(c,nameSize);rows[index].forEach((line,lineIndex)=>c.fillText(line,PAD+96,y+18+lineIndex*nameSize*1.3));
    y+=height+14;
  }
  c.fillStyle='#6a7c61';font(c,27,500);c.fillText(result.url,PAD,canvas.height-87);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG export failed')),'image/png'));
}

/** navigator.share is invoked before any await, directly in the click's activation. */
export async function sharePreparedResult({data,blob}={}) {
  const nav=globalThis.navigator;if(typeof nav?.share!=='function')return {status:'fallback'};
  const result=resultData(data),shareData={title:result.title,text:buildResultText(result),url:result.url};
  if(blob?.type==='image/png'&&typeof globalThis.File==='function'&&typeof nav.canShare==='function') {
    try {const files=[new File([blob],'kroma-ufo-result.png',{type:'image/png'})];if(nav.canShare({files}))shareData.files=files;} catch {}
  }
  try {const sharing=nav.share(shareData);await sharing;return {status:'shared'};}
  catch(error){return {status:error?.name==='AbortError'?'cancelled':'fallback'};}
}

export function downloadResultImage(blob) {
  if(blob?.type!=='image/png'||!globalThis.URL?.createObjectURL)return false;
  let url,link;
  try {
    url=URL.createObjectURL(blob);link=document.createElement('a');link.href=url;link.download='kroma-ufo-result.png';link.hidden=true;
    document.body.append(link);link.click();return true;
  } catch {return false;}
  finally {link?.remove();if(url)setTimeout(()=>URL.revokeObjectURL(url),30000);}
}

export async function copyResultText(data) {
  const text=buildResultText(data);
  try {if(globalThis.navigator?.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}} catch {}
  let field;const focused=document.activeElement;
  try {
    if(typeof document.execCommand!=='function')return false;
    field=document.createElement('textarea');field.value=text;field.readOnly=true;field.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';
    // Native modal dialogs make the rest of the document inert, including a
    // temporary textarea in body. Keep legacy selection in the active dialog.
    const host=focused?.closest?.('dialog[open]')||document.querySelector?.('dialog[open]')||document.body;
    host.append(field);field.focus({preventScroll:true});field.select();return document.execCommand('copy')===true;
  } catch {return false;}
  finally {field?.remove();focused?.focus?.({preventScroll:true});}
}
