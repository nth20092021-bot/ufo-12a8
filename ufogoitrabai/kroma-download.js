import {qrMatrix} from './qr.js';
import {createDownloadCarousel} from './kroma-download-carousel.js';

export const KROMA_APP_STORE_URL='https://apps.apple.com/app/id6804494959';

export function setupKromaDownload(){
  const trigger=document.querySelector('button.result-qr-button');
  const dialog=document.getElementById('kromaDownloadDialog');
  if(!trigger||!dialog)return;
  const close=dialog.querySelector('.kroma-download-close');
  const store=dialog.querySelector('.kroma-download-store');
  const qr=dialog.querySelector('.kroma-download-qr');
  const carousel=createDownloadCarousel(dialog.querySelector('.kroma-download-carousel'));
  store.href=KROMA_APP_STORE_URL;

  // Integer modules and a four-module quiet zone keep the projected code crisp.
  const matrix=qrMatrix(KROMA_APP_STORE_URL),quiet=4,size=matrix.size+quiet*2;
  qr.setAttribute('viewBox',`0 0 ${size} ${size}`);
  const modules=[];
  for(let y=0;y<matrix.size;y++)for(let x=0;x<matrix.size;x++){
    if(matrix.data[y*matrix.size+x])modules.push(`M${x+quiet} ${y+quiet}h1v1h-1z`);
  }
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',modules.join(''));path.setAttribute('fill','#000');qr.append(path);

  trigger.addEventListener('click',()=>{
    if(dialog.open)return;
    dialog.showModal();carousel.start();
  });
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{carousel.stop();if(trigger.isConnected&&!trigger.closest('[hidden]'))trigger.focus({preventScroll:true});});
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const controls=[...dialog.querySelectorAll('button:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
}
