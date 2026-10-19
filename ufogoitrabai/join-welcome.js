import {createResultSpeech} from './result-speech.js';
import {t, locale as pageLocale} from './i18n.js';

/** Observe live joins only. Classroom snapshots and names are never persisted here. */
export function createJoinWelcome({getClassroomId=()=>null,isBlocked=()=>false,isVisible=()=>true,
  canContinue=()=>true,
  hasStudent=()=>false,welcomeStudent=()=>false,cancelWelcome=()=>{},onWelcome=()=>{},onSpeaking=()=>{},
  translate=t,locale=pageLocale,speech=createResultSpeech,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  let roomId=null,revision=-1,initialized=false,disposed=false,timer=null,active=null;
  let seen=new Set(),latest=new Map(),pending=[];
  const currentRoom=()=>{const id=getClassroomId();return typeof id==='string'&&id?id:null;};
  const eligible=student=>student?.claimed===true&&student.status==='active'&&typeof student.name==='string'&&student.name.trim();
  const clearRetry=()=>{if(timer!==null)clearTimer(timer);timer=null;};
  function schedule(){
    if(disposed||(!active&&!pending.length)){clearRetry();return;}
    if(timer===null){
      const scheduled=setTimer(()=>{if(timer!==scheduled)return;timer=null;flush();},250);
      timer=scheduled;
    }
  }
  function finish(candidate){
    if(active!==candidate)return;
    active=null;settleDrain(candidate);try{onSpeaking(false);}catch{}schedule();
  }
  function settleDrain(candidate){for(const resolve of candidate?.drainers||[])resolve();candidate?.drainers?.clear();}
  let voice;
  try{voice=speech({locale,onStateChange:state=>{
    if(disposed)return;
    if(state.started&&active?.stage==='speech'&&!active.started){
      // Admission can change while the browser is still finding a voice.
      if(!canRun()){cancelActive(true,true);schedule();return;}
      active.started=true;
    }
    try{onSpeaking(!!state.speaking);}catch{}
    if(active?.stage==='speech'&&!state.speaking)finish(active);
  }});}catch{/* An unavailable voice must not prevent a visual welcome. */}
  function cancelActive(requeue=true,requeueUnstarted=false){
    const candidate=active;if(!candidate)return;
    active=null;
    if(requeue&&(candidate.stage==='dropping'||requeueUnstarted&&!candidate.started)&&eligible(latest.get(candidate.id))&&!pending.includes(candidate.id))pending.unshift(candidate.id);
    try{cancelWelcome(candidate.id);}catch{}
    try{voice?.stop();}catch{}
    settleDrain(candidate);
    try{onSpeaking(false);}catch{}
  }
  function reset(){
    clearRetry();cancelActive(false);pending=[];seen=new Set();latest=new Map();revision=-1;initialized=false;roomId=currentRoom();
  }
  function syncRoom(){if(currentRoom()!==roomId)reset();}
  function mayContinue(){try{return !disposed&&isVisible()&&canContinue()===true;}catch{return false;}}
  function canRun(){try{return mayContinue()&&!isBlocked();}catch{return false;}}
  function observe(snapshot){
    if(disposed)return false;
    syncRoom();
    if(!roomId||snapshot?.id!==roomId||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<0||!Array.isArray(snapshot.students)||
        initialized&&snapshot.revision<=revision)return false;
    const next=new Map();
    for(const student of snapshot.students){
      if(!student||typeof student.id!=='string'||!student.id||next.has(student.id))continue;
      const person={id:student.id,name:student.name,claimed:student.claimed,status:student.status};
      next.set(person.id,person);
      if(initialized&&!seen.has(person.id)&&eligible(person))pending.push(person.id);
      seen.add(person.id);
    }
    latest=next;revision=snapshot.revision;initialized=true;
    pending=pending.filter(id=>eligible(latest.get(id)));
    if(active&&!eligible(latest.get(active.id)))cancelActive(false);
    // onLiveSnapshot runs before the scene merges the roster; never animate here.
    schedule();return true;
  }
  function landed(candidate){
    if(disposed||active!==candidate||candidate.stage!=='dropping')return;
    syncRoom();if(active!==candidate)return;
    if(!canRun()){cancelActive(true);schedule();return;}
    const person=latest.get(candidate.id);
    if(!eligible(person)||!hasStudent(candidate.id)){cancelActive(false);schedule();return;}
    candidate.stage='speech';
    const name=person.name.trim(),message=translate('Chào mừng {name} đến với lớp!',{name});
    try{onWelcome({id:candidate.id,name,message});}catch{}
    if(disposed||active!==candidate)return;
    syncRoom();if(active!==candidate)return;
    if(!canRun()){cancelActive(false);schedule();return;}
    // Setting the phase first also handles synchronous unsupported/not-allowed errors.
    try{
      if(!voice||voice.supported===false||!voice.read([message],{introduction:false}))finish(candidate);
    }catch{finish(candidate);}
  }
  function flush(){
    if(disposed)return false;
    syncRoom();
    if(active?.stage==='speech'&&active.started){
      if(!mayContinue()||!hasStudent(active.id))cancelActive(false);
      schedule();return false;
    }
    if(!canRun()){cancelActive(true);schedule();return false;}
    if(active){if(!hasStudent(active.id))cancelActive(false);schedule();return false;}
    pending=pending.filter(id=>eligible(latest.get(id)));
    const index=pending.findIndex(id=>hasStudent(id));
    if(index<0){schedule();return false;}
    const [id]=pending.splice(index,1),candidate={id,stage:'dropping',started:false};active=candidate;
    let started=false;
    try{started=welcomeStudent(id,{onLand:()=>landed(candidate)})===true;}catch{}
    if(!started&&active===candidate){active=null;pending.splice(index,0,id);}
    schedule();return started;
  }
  return {
    observe,flush,reset,
    drain(){
      if(disposed)return Promise.resolve();
      syncRoom();
      const candidate=active;
      if(candidate?.stage==='speech'&&candidate.started&&mayContinue()){
        // Only this sentence is drained. The host reserves its next speaker
        // before awaiting, so queued joins remain subject to normal admission.
        return new Promise(resolve=>(candidate.drainers??=new Set()).add(resolve));
      }
      cancelActive(true,true);schedule();return Promise.resolve();
    },
    cancel(){if(disposed)return;cancelActive(true);schedule();},
    isBusy:()=>!!active,
    destroy(){if(disposed)return;reset();disposed=true;clearRetry();try{voice?.dispose();}catch{}},
  };
}
