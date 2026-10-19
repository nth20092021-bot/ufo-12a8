import {createResultSpeech} from './result-speech.js';
import {locale as pageLocale} from './i18n.js';

/** Read current painted scene bubbles, without a backlog or persistent history. */
export function createSceneDialogue({locale=pageLocale,isAllowed=()=>false,canContinue=()=>true,onSpeaking=()=>{},onBlocked=()=>{},
  speech=createResultSpeech,now=()=>performance.now(),setTimer=(fn,delay)=>globalThis.setTimeout(fn,delay),
  clearTimer=id=>globalThis.clearTimeout(id),minGapMs=900,volume=1}={}){
  let voice=null,active=false,disposed=false,timer=null,epoch=0,nextAt=0,attempt=null;
  const seen=new Set(),drains=new Set(),gap=Math.min(10000,Math.max(0,Number(minGapMs)||0));
  const continuing=()=>{try{return !disposed&&canContinue()===true;}catch{return false;}};
  const allowed=()=>{try{return continuing()&&isAllowed()===true;}catch{return false;}};
  const current=()=>{try{return allowed()&&(!attempt?.isCurrent||attempt.isCurrent()===true);}catch{return false;}};
  const clearMonitor=()=>{if(timer!==null)clearTimer(timer);timer=null;};
  function speaking(value){
    value=!!value;if(value===active)return;
    active=value;
    if(!active){clearMonitor();nextAt=Math.max(nextAt,now()+gap);for(const resolve of drains)resolve();drains.clear();}
    try{onSpeaking(active);}catch{/* Host coordination must not interrupt cleanup. */}
  }
  function stop(){
    epoch++;clearMonitor();attempt=null;
    try{voice?.stop();}catch{}
    speaking(false);
  }
  function drain(){
    // Readiness is not audible speech. Do not let an expired bubble start its
    // sentence later, but let an already audible sentence reach its own end.
    if(!active||!attempt?.started||!continuing()){stop();return Promise.resolve();}
    return new Promise(resolve=>drains.add(resolve));
  }
  function monitor(){
    if(!active||disposed)return;
    const token=epoch;
    timer=setTimer(()=>{if(token!==epoch)return;timer=null;if(!continuing()||!attempt?.started&&!current()){stop();return;}monitor();},100);
  }
  function blocked(error){
    if(!attempt||attempt.started||attempt.notified)return;
    attempt.notified=true;try{onBlocked(error||'unavailable');}catch{}
  }
  try{voice=speech({locale,volume,onStateChange:state=>{
    if(disposed||!attempt)return;
    if(state.speaking&&!continuing()){stop();return;}
    if(state.started&&!attempt.started){if(!current()){stop();return;}attempt.started=true;}
    speaking(!!state.speaking);
    if(state.error)blocked(state.error);
    if(active&&!attempt.started&&!current())stop();
  }});}catch{/* A visible bubble remains useful without a speech engine. */}
  return {
    get speaking(){return active;},
    receive(cue){
      if(disposed||!cue||typeof cue.id!=='string'||!cue.id||typeof cue.key!=='string'||!cue.key||
          typeof cue.text!=='string'||!cue.text.trim()||cue.text.length>1000||seen.has(cue.key))return false;
      if(!allowed()){if(active&&!attempt?.started)stop();return false;}
      if(active||now()<nextAt||!voice||voice.supported===false)return false;
      const token=++epoch;attempt={started:false,notified:false,isCurrent:typeof cue.isCurrent==='function'?cue.isCurrent:null};
      if(!current()){attempt=null;return false;}
      // The scene may offer a still-painted bubble again after another voice.
      // Only actual attempts are deduplicated; no cue is stored for later play.
      seen.add(cue.key);if(seen.size>256)seen.delete(seen.values().next().value);
      speaking(true);
      if(token!==epoch||!current()){stop();return false;}
      let accepted=false;
      try{accepted=voice.read([cue.text.trim()],{introduction:false,gender:cue.gender==='female'?'female':'male'})===true;}catch{}
      if(!accepted){blocked('unavailable');stop();return false;}
      if(active)monitor();return true;
    },
    stop,drain,
    destroy(){if(disposed)return;disposed=true;stop();seen.clear();try{voice?.dispose();}catch{}},
  };
}
