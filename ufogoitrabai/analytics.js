import {t, locale} from './i18n.js';
import {MEASUREMENT_ID, CONSENT_KEY, CHANNEL, FRAME_PATH, analyticsPage, cleanEvent} from './analytics-policy.js';

let tracker = null;
export function trackEvent(name, params) { tracker?.track(name, params); }

const downloadBindings = new WeakMap();
/** Observe download intent and native store navigation without reading link/user text. */
export function bindKromaDownloadTracking(doc, {track = trackEvent, now = () => Date.now()} = {}) {
  if(downloadBindings.has(doc))return downloadBindings.get(doc);
  const lastClicks = new WeakMap();
  const onClick = event => {
    if(event.defaultPrevented || (event.type === 'click' ? event.button !== 0 : event.button !== 1))return;
    const store = event.target?.closest?.('a.kroma-download-store') || event.target?.closest?.('a.result-store-badge');
    const button = event.type === 'click' ? event.target?.closest?.('button.result-qr-button') : null;
    const control = store || button;
    const placement = store?.closest('#kromaDownloadDialog[open]') ? 'download_modal' : store?.closest('.result-layer') ? 'result_modal' : null;
    const name = placement ? 'ufo_kroma_download_click' : button?.closest('.result-layer') ? 'ufo_kroma_download_open' : null;
    if(!name || control.disabled || control.closest('[hidden], [inert]') || control.getAttribute('aria-disabled') === 'true')return;
    const at = now(), previous = lastClicks.get(control);
    if(previous !== undefined && at - previous >= 0 && at - previous < 500)return;
    lastClicks.set(control,at);
    if(placement==='result_modal')track(name,{placement});else track(name);
  };
  doc.addEventListener('click',onClick);doc.addEventListener('auxclick',onClick);
  const destroy = () => {
    doc.removeEventListener('click',onClick);doc.removeEventListener('auxclick',onClick);
    downloadBindings.delete(doc);
  };
  downloadBindings.set(doc,destroy);
  return destroy;
}

/** A separate empty document keeps automatic GA form/link measurement away from classroom inputs. */
export function createAnalyticsController(win, doc) {
  let frame = null, ready = false, pending = [], choice = null;
  const enabledHost = win.location.protocol === 'https:' && ["jcalit.com","www.jcalit.com"].includes(win.location.hostname);
  const readChoice = () => { try { const saved = win.localStorage.getItem(CONSENT_KEY); return ['granted','denied'].includes(saved) ? saved : null; } catch { return null; } };
  const post = data => frame?.contentWindow?.postMessage({channel:CHANNEL,...data}, win.location.origin);
  function stop() {
    pending=[];ready=false;
    if(frame){
      // Stop queued and unload events before the document is removed.
      try { frame.contentWindow['ga-disable-'+MEASUREMENT_ID]=true; } catch { /* Frame may still be loading. */ }
      frame.remove();frame=null;
    }
  }
  function apply(next) {
    choice=next;
    if(!enabledHost||choice!=='granted'){stop();return;}
    if(frame)return;
    frame=doc.createElement('iframe');frame.src=FRAME_PATH;frame.hidden=true;frame.tabIndex=-1;
    frame.title=t('Thống kê truy cập');frame.referrerPolicy='no-referrer';frame.setAttribute('aria-hidden','true');
    doc.body.append(frame);
  }
  function onMessage(event) {
    if(!frame||choice!=='granted'||event.origin!==win.location.origin||event.source!==frame.contentWindow||event.data?.channel!==CHANNEL||event.data.type!=='ready')return;
    if(ready)return;ready=true;
    post({type:'init',page:analyticsPage(win.location.pathname)});
    for(const item of pending)post({type:'event',...item});pending=[];
  }
  const onStorage = event => { if(event.key===CONSENT_KEY||event.key===null){apply(readChoice());win.dispatchEvent(new win.Event('ufo:analytics-consent'));} };
  win.addEventListener('message',onMessage);win.addEventListener('storage',onStorage);
  apply(readChoice());
  return {
    enabled:enabledHost,
    getChoice:()=>choice,
    setChoice(next) {
      if(!['granted','denied'].includes(next))return;
      try{win.localStorage.setItem(CONSENT_KEY,next);}catch{/* Choice still applies for this page. */}
      apply(next);
    },
    track(name,params) {
      if(!enabledHost||choice!=='granted')return;
      const item=cleanEvent(name,params);if(!item)return;
      if(ready)post({type:'event',...item});else if(pending.length<20)pending.push(item);
    },
    destroy(){stop();win.removeEventListener('message',onMessage);win.removeEventListener('storage',onStorage);},
  };
}

export function setupAnalytics() {
  if(tracker)return tracker;
  tracker=createAnalyticsController(window,document);
  if(!tracker.enabled)return tracker;
  bindKromaDownloadTracking(document);
  const panel=document.createElement('aside');panel.className='analytics-choice';panel.hidden=true;
  panel.setAttribute('role','region');panel.setAttribute('aria-labelledby','analyticsChoiceTitle');
  const title=document.createElement('strong');title.id='analyticsChoiceTitle';title.textContent=t('Cho phép thống kê truy cập?');
  const copy=document.createElement('p');copy.textContent=t('Google Analytics giúp cải thiện App qua lượt truy cập và thao tác sử dụng. Không gửi tên, danh sách lớp hoặc link riêng. Không dùng cho quảng cáo.');
  const buttons=document.createElement('div');buttons.className='analytics-choice-actions';
  for(const [value,label] of [['denied',t('Không cho phép')],['granted',t('Cho phép')]]){
    const button=document.createElement('button');button.type='button';button.className='secondary-btn';button.textContent=label;
    button.addEventListener('click',()=>{tracker.setChoice(value);panel.hidden=true;});buttons.append(button);
  }
  panel.append(title,copy,buttons);document.body.append(panel);
  const show=()=>{panel.hidden=false;};
  for(const button of document.querySelectorAll('[data-analytics-settings]'))button.addEventListener('click',()=>{
    const parent=[...document.querySelectorAll('dialog[open]')].at(-1)||document.body;
    parent.append(panel);show();buttons.querySelector('button').focus();
  });
  for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{
    if(dialog.contains(panel)){panel.hidden=true;document.body.append(panel);}
  });
  window.addEventListener('ufo:analytics-consent',()=>{panel.hidden=tracker.getChoice()!==null;});
  if(tracker.getChoice()===null)show();
  return tracker;
}
