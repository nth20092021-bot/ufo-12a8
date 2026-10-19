import {createResultSpeech} from './result-speech.js';
import {locale as pageLocale,normalizeLanguage,translator} from './i18n.js';
import {IDLE_DIALOGUE_LINES} from './idle-dialogue-lines.js';

export const IDLE_DIALOGUE_HISTORY_KEY='kroma.ufo.idle-dialogue.spoken.v1';
const known=new Map(IDLE_DIALOGUE_LINES.map(line=>[line.id,line])),memoryByStorage=new WeakMap(),fallbackMemory=new Map();
const reservationsByMemory=new WeakMap();
const normalized=text=>text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu,'');
const browserStorage=()=>{try{return globalThis.localStorage||globalThis.window?.localStorage||null;}catch{return null;}};
const hash=value=>{let h=2166136261;for(const letter of String(value))h=Math.imul(h^letter.charCodeAt(0),16777619);return h>>>0;};

/** Voice only a currently painted idle bubble; never queue stale classroom chatter. */
export function createIdleDialogue({locale=pageLocale,isAllowed=()=>false,canContinue=()=>true,onSpeaking=()=>{},onBlocked=()=>{},
  speech=createResultSpeech,storage=browserStorage(),now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  let disposed=false,active=false,nextAt=0,timer=null,epoch=0,voice,attempt=null,lastAttempt=null;
  const language=normalizeLanguage(locale)||'vi',translate=translator(language),storageKey=`${IDLE_DIALOGUE_HISTORY_KEY}.${language}`;
  let memory=fallbackMemory;
  if(storage&&(typeof storage==='object'||typeof storage==='function')){if(!memoryByStorage.has(storage))memoryByStorage.set(storage,new Map());memory=memoryByStorage.get(storage);}
  if(!memory.has(language))memory.set(language,new Set());
  if(!reservationsByMemory.has(memory))reservationsByMemory.set(memory,new Map());
  const reservations=reservationsByMemory.get(memory);
  if(!reservations.has(language))reservations.set(language,new Map());
  const pending=reservations.get(language);
  const used=memory.get(language),usedTexts=new Set(),seen=new Set(),offered=new Map(),drains=new Set();let offerIndex=0;
  const lines=IDLE_DIALOGUE_LINES.map(line=>{const text=translate(line.source);return {phraseId:line.id,text,normalized:normalized(text)};});
  const byId=new Map(lines.map(line=>[line.phraseId,line])),publicLine=line=>({phraseId:line.phraseId,text:line.text});
  function refresh(){
    try{const raw=storage?.getItem(storageKey);if(!raw||raw.length>20000)return;const saved=JSON.parse(raw);
      if(Array.isArray(saved))for(const id of saved.slice(0,IDLE_DIALOGUE_LINES.length*2))if(known.has(id))used.add(id);
    }catch{/* Restricted storage still shares a bounded history within this page. */}
    finally{for(const id of used)if(byId.has(id))usedTexts.add(byId.get(id).normalized);}
  }
  function consumed(line,includePending=true){
    return used.has(line.phraseId)||usedTexts.has(line.normalized)||(includePending&&pending.has(line.phraseId));
  }
  function remember(line){
    refresh();if(consumed(line,false))return false;used.add(line.phraseId);usedTexts.add(line.normalized);
    try{storage?.setItem(storageKey,JSON.stringify([...used].filter(id=>known.has(id)).sort()));}catch{/* An actually started line stays remembered in this page. */}
    return true;
  }
  function pick(key){
    const cacheKey=String(key);if(offered.has(cacheKey))return publicLine(offered.get(cacheKey));
    refresh();const unused=lines.filter(line=>!consumed(line)),recent=new Set([...offered.values()].slice(-8).map(line=>line.phraseId));
    const fresh=unused.filter(line=>!recent.has(line.phraseId)),pool=fresh.length?fresh:unused.length?unused:lines;
    const line=pool[hash(`${cacheKey}:${offerIndex++}`)%pool.length];offered.set(cacheKey,line);
    if(offered.size>128)offered.delete(offered.keys().next().value);return publicLine(line);
  }
  refresh();
  const continuing=()=>{try{return !disposed&&canContinue()===true;}catch{return false;}};
  const allowed=()=>{try{return continuing()&&isAllowed()===true;}catch{return false;}};
  const current=()=>{try{return allowed()&&(!attempt?.isCurrent||attempt.isCurrent()===true);}catch{return false;}};
  const clearMonitor=()=>{if(timer!==null)clearTimer(timer);timer=null;};
  function speaking(value){
    value=!!value;if(value===active)return;
    active=value;
    if(!active){clearMonitor();nextAt=Math.max(nextAt,now()+12000);for(const resolve of drains)resolve();drains.clear();}
    try{onSpeaking(active);}catch{/* Music ducking cannot interrupt speech cleanup. */}
  }
  function release(){
    if(!attempt)return;
    if(pending.get(attempt.line.phraseId)===attempt)pending.delete(attempt.line.phraseId);
    lastAttempt=attempt;attempt=null;
  }
  function blocked(error){
    const failed=attempt||lastAttempt;
    if(!failed||failed.started||failed.notified)return;
    failed.notified=true;try{onBlocked(error||'unavailable');}catch{}
  }
  function stop(){
    epoch++;clearMonitor();release();try{voice?.stop();}catch{}speaking(false);
  }
  function drain(){
    if(!active||!attempt?.started||!continuing()){stop();return Promise.resolve();}
    return new Promise(resolve=>drains.add(resolve));
  }
  function monitor(){
    if(!active||disposed)return;
    const token=epoch;
    timer=setTimer(()=>{if(token!==epoch)return;timer=null;if(!continuing()||!attempt?.started&&!current()){stop();return;}monitor();},100);
  }
  try{voice=speech({locale,onStateChange:state=>{
    if(state.speaking&&!continuing()){stop();return;}
    if(state.started&&attempt&&!attempt.started){
      if(!current()){stop();return;}
      attempt.started=true;remember(attempt.line);
    }
    if(!state.speaking)release();
    speaking(!disposed&&state.speaking);
    if(state.error)blocked(state.error);
    if(active&&!attempt?.started&&!current())stop();
  }});}catch{/* Unsupported speech leaves the visible chat bubbles intact. */}
  return {
    get speaking(){return active;},
    pick,
    prepareRetry(){
      if(active||lastAttempt?.started)return false;
      nextAt=0;if(lastAttempt)seen.delete(lastAttempt.key);return true;
    },
    receive(cue){
      if(!allowed()){if(!attempt?.started)stop();return false;}
      if(active||now()<nextAt||!voice||voice.supported===false||!cue||typeof cue.id!=='string'||
          typeof cue.key!=='string'||!cue.key||typeof cue.text!=='string'||!cue.text.trim()||seen.has(cue.key))return false;
      refresh();const line=lines.find(line=>cue.phraseId?line.phraseId===cue.phraseId&&line.text===cue.text.trim():line.text===cue.text.trim());
      if(!line||consumed(line))return false;
      // Deduplicate this painted bubble while readiness is pending. A blocked
      // attempt can be retried from a later user gesture without losing a line.
      attempt={line,key:cue.key,started:false,notified:false,isCurrent:typeof cue.isCurrent==='function'?cue.isCurrent:null};
      if(!current()){attempt=null;return false;}
      seen.add(cue.key);if(seen.size>256)seen.delete(seen.values().next().value);
      pending.set(line.phraseId,attempt);lastAttempt=null;
      const token=++epoch;nextAt=now()+12000;speaking(true);
      if(token!==epoch||!attempt||!current()){stop();return false;}
      let accepted=false;
      try{accepted=voice.read([line.text],{introduction:false,gender:cue.gender==='female'?'female':'male'})===true;}catch{}
      if(!accepted){stop();blocked('unavailable');return false;}
      if(active)monitor();return true;
    },
    stop,drain,
    destroy(){if(disposed)return;disposed=true;stop();seen.clear();offered.clear();try{voice?.dispose();}catch{}},
  };
}
