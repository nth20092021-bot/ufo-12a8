import {PAGE_ADS_CONFIG} from './page-ads-config.js';
import {language} from './i18n.js';
import {localizePageAdvertising} from './page-ads-copy.js';

const controllers=new WeakMap();
const PUBLIC_QUERY_KEYS=new Set(['lang','code','invite','reload']);

/** Private capabilities and unrecognised URL fields never reach the ad loader. */
export function isPublicAdvertisingLocation(location) {
  try {
    const url=new URL(location.href);
    if(url.protocol!=='https:'||!['jcalit.com','www.jcalit.com'].includes(url.hostname))return false;
    if(!['/ufogoitrabai/','/ufogoitrabai/index.html','/ufogoitrabai/join','/ufogoitrabai/join/','/ufogoitrabai/join.html'].includes(url.pathname))return false;
    if(url.hash)return false;
    for(const [key,value] of url.searchParams){
      if(!PUBLIC_QUERY_KEYS.has(key))return false;
      if(key==='lang'&&!/^(?:vi|en|zh|ja|ko|es|fr|de|pt)(?:[-_][A-Za-z]{2,4})?$/.test(value))return false;
      if(['code','invite','reload'].includes(key)&&!/^[A-Za-z0-9_-]{1,160}$/.test(value))return false;
    }
    return true;
  }catch{return false;}
}

/** Google manages automatic ads/CMP; the manual normal-flow slot is queued once. */
export function setupPageAds({win=globalThis.window,doc=globalThis.document,config=PAGE_ADS_CONFIG}={}) {
  if(!win||!doc)return null;
  if(controllers.has(doc))return controllers.get(doc);
  const section=doc.querySelector('[data-ufo-page-ad]'),unit=section?.querySelector('ins.adsbygoogle');
  const page=section?.getAttribute('data-ufo-page-ad'),slot=config.slots?.[page];
  if(!section||!unit||!config.enabled||!/^ca-pub-\d{16}$/.test(config.publisherId)||!/^\d{10}$/.test(slot||''))return null;
  let started=false,loaded=false,requested=false,failed=false,disposed=false,near=false;
  let tcfAttached=false,tcfListenerId=null,gdprApplies=null;
  let intersection=null,mutations=null,script=null;
  const privacy=doc.querySelector('[data-ad-privacy]');
  unit.setAttribute('data-ad-client',config.publisherId);unit.setAttribute('data-ad-slot',slot);

  function modalOpen(){return !!doc.querySelector('dialog[open], .result-layer:not([hidden])');}
  function hide(){if(!section.hidden)section.hidden=true;}
  function onConsent(data,success){
    if(disposed)return;
    if(Number.isInteger(data?.listenerId))tcfListenerId=data.listenerId;
    if(success&&typeof data?.gdprApplies==='boolean')gdprApplies=data.gdprApplies;
  }
  function attachTcf(){
    if(disposed||tcfAttached||typeof win.__tcfapi!=='function')return;
    tcfAttached=true;
    try{win.__tcfapi('addEventListener',0,onConsent);}catch{tcfAttached=false;}
  }
  function initializeConsent(){
    win.googlefc=win.googlefc||{};
    win.googlefc.callbackQueue=win.googlefc.callbackQueue||[];
    win.googlefc.callbackQueue.push({CONSENT_API_READY:attachTcf});
    win.googlefc.callbackQueue.push({CONSENT_DATA_READY:attachTcf});
  }
  function start(){
    if(started||disposed||!isPublicAdvertisingLocation(win.location))return;
    // Worker supplies a fresh nonce to this root module. No weaker fallback is used.
    const nonce=doc.querySelector('script[nonce]')?.nonce;
    if(!nonce){failed=true;hide();return;}
    started=true;
    win.adsbygoogle=win.adsbygoogle||[];
    // Standard AdSense integration: Google publishes the CMP and consumes its
    // consent signals. Regional CMP availability never gates SDK bootstrap.
    initializeConsent();
    script=doc.createElement('script');script.async=true;script.crossOrigin='anonymous';script.nonce=nonce;
    script.src=`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.publisherId}`;
    script.addEventListener('load',()=>{if(disposed)return;loaded=true;sync();},{once:true});
    script.addEventListener('error',()=>{if(disposed)return;failed=true;hide();},{once:true});
    doc.head.append(script);
  }
  function sync(){
    if(disposed||failed||doc.hidden||!isPublicAdvertisingLocation(win.location))return;
    // Auto ads and Google messaging can initialize during ordinary game use.
    if(!started)start();
    if(!loaded||requested||!near||doc.fullscreenElement||modalOpen())return;
    if(!section.getClientRects().length||unit.getBoundingClientRect().width<=0)return;
    // Mark before the SDK call so viewport/modal changes cannot refresh this unit.
    requested=true;
    try{win.adsbygoogle.push({});}
    catch{failed=true;hide();}
  }
  function updateNear(){
    const box=section.getBoundingClientRect(),height=win.innerHeight||0;
    near=box.bottom>=-100&&box.top<=height+100;sync();
  }
  function reopenPrivacy(event){
    if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    if(gdprApplies!==true||typeof win.googlefc?.showRevocationMessage!=='function')return;
    event.preventDefault();
    win.googlefc.callbackQueue.push({CONSENT_API_READY:()=>{
      try{win.googlefc.showRevocationMessage();}
      catch{win.location.assign(privacy.href);}
    }});
  }
  privacy?.addEventListener('click',reopenPrivacy);
  if(typeof win.IntersectionObserver==='function'){
    intersection=new win.IntersectionObserver(entries=>{near=entries.some(entry=>entry.target===section&&entry.isIntersecting);sync();},{rootMargin:'100px 0px'});
    intersection.observe(section);
  }else{win.addEventListener('scroll',updateNear,{passive:true});updateNear();}
  if(typeof win.MutationObserver==='function'){
    mutations=new win.MutationObserver(()=>{
      if(unit.getAttribute('data-ad-status')==='unfilled')hide();
      sync();
    });
    mutations.observe(doc.body,{subtree:true,attributes:true,attributeFilter:['hidden','open','data-ad-status']});
  }
  doc.addEventListener('visibilitychange',sync);doc.addEventListener('fullscreenchange',sync);doc.addEventListener('close',sync,true);
  win.addEventListener('resize',updateNear);win.addEventListener('hashchange',sync);
  const controller={
    state:()=>({started,loaded,requested,failed,gdprApplies}),
    destroy(){
      if(disposed)return;disposed=true;intersection?.disconnect();mutations?.disconnect();
      privacy?.removeEventListener('click',reopenPrivacy);doc.removeEventListener('visibilitychange',sync);doc.removeEventListener('fullscreenchange',sync);doc.removeEventListener('close',sync,true);
      win.removeEventListener('resize',updateNear);win.removeEventListener('scroll',updateNear);win.removeEventListener('hashchange',sync);
      if(tcfListenerId!==null&&typeof win.__tcfapi==='function')try{win.__tcfapi('removeEventListener',0,()=>{},tcfListenerId);}catch{}
    },
  };
  controllers.set(doc,controller);sync();return controller;
}

if(typeof window!=='undefined'&&typeof document!=='undefined'){
  localizePageAdvertising(document,language);setupPageAds();
}
