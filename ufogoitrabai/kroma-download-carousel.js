import {t} from './i18n.js';

const MODELS = ['Mint','Bear','Duck','Unicorn','Neonette','Ironage','Kidster','Sunflower','Pumpkin'];
const controllers = new WeakMap();

export function createDownloadCarousel(root) {
  if(!root)return {start(){},stop(){}};
  if(controllers.has(root))return controllers.get(root);
  const doc=root.ownerDocument,win=doc.defaultView;
  const slides=root.querySelector('.kroma-download-slides'),previous=root.querySelector('.kroma-carousel-prev');
  const next=root.querySelector('.kroma-carousel-next'),pause=root.querySelector('.kroma-carousel-pause'),caption=root.querySelector('.kroma-carousel-caption');
  if(!slides||!previous||!next||!pause||!caption)return {start(){},stop(){}};
  const media=win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let index=0,running=false,manualPaused=null,timer=null,generation=0,waitingForNext=false;
  const paused=()=>manualPaused??media?.matches??false;
  const images=MODELS.map(name=>{
    const image=doc.createElement('img');
    image.className='kroma-download-slide';
    image.setAttribute('data-src',new URL(`./kroma-iphone-${name.toLowerCase()}.png`,import.meta.url).href);
    image.alt=`KROMA ${name}`;image.decoding='async';image.draggable=false;
    const ready=()=>{
      if(!running||doc.hidden)return;
      if(waitingForNext&&image===images[(index+1)%images.length]&&!paused()){waitingForNext=false;index=(index+1)%images.length;}
      if(image===images[index]){render();schedule();}
    };
    image.addEventListener('load',ready);image.addEventListener('error',ready);
    return image;
  });
  slides.replaceChildren(...images);

  function render(announce=false) {
    // Hidden dialogs must not compete with the game/audio download. Once open,
    // fetch only the selected slide and the next one for its four-second turn.
    const load=(i,priority)=>{const image=images[i];if(!image.src){image.fetchPriority=priority;image.src=image.getAttribute('data-src');}};
    if(running&&!doc.hidden){load(index,'auto');if(!paused()&&images[index].complete!==false)load((index+1)%images.length,'low');}
    images.forEach((image,i)=>{
      image.classList.toggle('is-active',i===index);
      image.setAttribute('aria-hidden',String(i!==index));
    });
    // Automatic transitions must not repeatedly interrupt a screen reader.
    caption.setAttribute('aria-live',announce?'polite':'off');
    caption.textContent=`${MODELS[index]} · ${index+1}/${MODELS.length}`;
    const label=t(paused()?'Tiếp tục chuyển mẫu':'Tạm dừng chuyển mẫu');
    pause.setAttribute('aria-pressed',String(paused()));
    pause.setAttribute('aria-label',label);pause.title=label;
  }
  function cancelTimer() {
    generation++;
    waitingForNext=false;
    if(timer!==null)win.clearTimeout(timer);
    timer=null;
  }
  function schedule() {
    cancelTimer();
    if(!running||doc.hidden||paused()||images[index].complete===false)return;
    const current=generation;
    timer=win.setTimeout(()=>{
      if(current!==generation||!running||doc.hidden||paused())return;
      timer=null;
      if(images[(index+1)%images.length].complete===false){waitingForNext=true;return;}
      index=(index+1)%images.length;render();schedule();
    },4000);
  }
  function move(direction) {
    if(!running)return;
    index=(index+direction+images.length)%images.length;render(true);schedule();
  }
  function refresh() {render();schedule();}
  previous.addEventListener('click',()=>move(-1));
  next.addEventListener('click',()=>move(1));
  pause.addEventListener('click',()=>{
    if(!running)return;
    manualPaused=!paused();refresh();
  });
  const controller={
    start(){
      if(running)return;
      running=true;doc.addEventListener('visibilitychange',refresh);media?.addEventListener('change',refresh);refresh();
    },
    stop(){
      running=false;cancelTimer();doc.removeEventListener('visibilitychange',refresh);media?.removeEventListener('change',refresh);
    },
  };
  render();controllers.set(root,controller);
  return controller;
}
