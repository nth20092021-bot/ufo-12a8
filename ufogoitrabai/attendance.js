import {t} from './i18n.js';
import { AttendanceAudio } from './attendance-audio.js';

const ADVANCE_DELAY = 350;

/** Manual attendance: only an explicit choice records or advances a student. */
export function createAttendanceSession({now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,onStart,onMark,onFinish,onStateChange}={}) {
  let active=false,phase='idle',roster=[],index=0,records=[],deadline=0,remaining=0,resumePhase='waiting',timer=null,generation=0;
  const clear=()=>{if(timer!==null)cancel(timer);timer=null;};
  const promptId=()=>active?`${generation}:${index}`:null;
  const getState=()=>({active,phase,index,total:roster.length,current:active?{...roster[index]}:null,processed:records.length,
    promptId:promptId(),records:records.map(record=>({...record}))});
  const emit=()=>onStateChange?.(getState());
  function finish(reason){
    if(!active)return false;
    clear();generation++;active=false;phase='idle';
    const summary={reason,total:roster.length,processed:records.length,present:records.filter(record=>record.present).length,
      absent:records.filter(record=>!record.present).length,unprocessed:roster.length-records.length,records:records.map(record=>({...record}))};
    emit();onFinish?.(summary);return true;
  }
  function arm(){
    clear();if(!active||phase!=='transition')return;
    const ticket=generation,personIndex=index;
    timer=schedule(()=>{
      timer=null;if(!active||ticket!==generation||personIndex!==index||phase!=='transition')return;
      if(now()<deadline){arm();return;}
      if(index+1>=roster.length){finish('complete');return;}
      index++;phase='waiting';emit();
    },Math.max(0,deadline-now()));
  }
  function mark(present,expectedId=roster[index]?.id,expectedPromptId=promptId()){
    if(!active||phase!=='waiting'||expectedId!==roster[index]?.id||expectedPromptId!==promptId())return false;
    const ticket=generation;clear();records.push({...roster[index],present});phase='transition';deadline=now()+ADVANCE_DELAY;
    onMark?.(roster[index].id,present);
    if(active&&ticket===generation){emit();arm();}return true;
  }
  return {
    start(students){
      if(active||!Array.isArray(students)||!students.length||students.length>120)return false;
      const ids=new Set(),next=[];
      for(const student of students){if(!student||typeof student.id!=='string'||!student.id||ids.has(student.id))return false;ids.add(student.id);next.push({id:student.id,name:String(student.name||t('Bạn học')).slice(0,80)});}
      clear();generation++;roster=next;index=0;records=[];active=true;phase='waiting';
      const ticket=generation;onStart?.(roster.map(student=>({...student})));if(active&&ticket===generation)emit();return true;
    },
    markPresent:(expectedId,expectedPromptId)=>mark(true,expectedId,expectedPromptId),
    markAbsent:(expectedId,expectedPromptId)=>mark(false,expectedId,expectedPromptId),
    pause(){
      if(!active||phase==='paused')return false;
      remaining=phase==='transition'?Math.max(0,deadline-now()):0;resumePhase=phase;phase='paused';clear();emit();return true;
    },
    resume(){if(!active||phase!=='paused')return false;phase=resumePhase;deadline=now()+remaining;emit();arm();return true;},
    stop:()=>finish('stopped'),getState,isRunning:()=>active,
  };
}

export function createAttendanceController({scene,container,onStart,onMark,onFinish,onStateChange,audio=null}={}) {
  if(!scene||!container)throw new Error(t('Điểm danh cần có sân lớp và vùng hiển thị.'));
  const document=container.ownerDocument,window=document.defaultView;
  let storage=null;try{storage=window.localStorage;}catch{}
  const soundtrack=audio||new AttendanceAudio({storage,audioContextFactory:()=>{const Context=window.AudioContext||window.webkitAudioContext;return Context?new Context():null;}});
  const sound=(method,...args)=>{try{const result=soundtrack[method]?.(...args);result?.catch?.(()=>{});return result;}catch{return false;}};
  const el=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const overlay=el('dialog','attendance-overlay');overlay.hidden=true;overlay.setAttribute('closedby','none');overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-labelledby','attendanceCurrentName');overlay.setAttribute('aria-describedby','attendanceCurrentHint');
  const card=el('div','attendance-card'),eyebrow=el('span','attendance-eyebrow',t('ĐIỂM DANH'));
  const progress=el('p','attendance-progress'),name=el('h2','attendance-name'),hint=el('p','attendance-hint');
  name.id='attendanceCurrentName';name.tabIndex=-1;hint.id='attendanceCurrentHint';
  const choices=el('div','attendance-choices'),present=el('button','attendance-present',t('Có mặt')),absent=el('button','attendance-absent',t('Vắng'));
  const controls=el('div','attendance-controls'),pauseButton=el('button','attendance-pause',t('Tạm dừng')),stopButton=el('button','attendance-stop',t('Dừng')),soundButton=el('button','attendance-sound','♫');
  for(const button of [present,absent,pauseButton,stopButton,soundButton])button.type='button';
  choices.append(present,absent);controls.append(soundButton,pauseButton,stopButton);
  soundButton.setAttribute('aria-label',t('Âm thanh điểm danh'));
  const renderSound=()=>{soundButton.setAttribute('aria-pressed',String(soundtrack.enabled));soundButton.title=soundtrack.enabled?t('Tắt âm thanh điểm danh'):t('Bật âm thanh điểm danh');};renderSound();
  const announcer=el('span','attendance-announcer');announcer.setAttribute('role','status');announcer.setAttribute('aria-live','polite');announcer.setAttribute('aria-atomic','true');
  card.append(eyebrow,progress,name,hint,choices,controls,announcer);overlay.append(card);container.append(overlay);
  let focusedId=null,destroyed=false,focusName=false;
  const prepareAudio=()=>destroyed||document.hidden?Promise.resolve(false):sound('prepare');
  const session=createAttendanceSession({
    now:()=>window.performance.now(),schedule:window.setTimeout.bind(window),cancel:window.clearTimeout.bind(window),
    onStart:students=>{sound('stop');focusName=true;onStart?.(students);},
    onMark:(id,present)=>{if(!document.hidden)sound(present?'present':'absent');onMark?.(id,present);},
    onFinish:summary=>{scene.clearAttendance();if(summary.reason==='complete'&&!document.hidden)sound('finish');onFinish?.(summary);},
    onStateChange:state=>{
      if(!state.active){
        sound('stop');focusedId=null;focusName=false;scene.clearAttendance();
        if(overlay.open)overlay.close();overlay.hidden=true;
      }else{
        const changed=focusedId!==state.current.id;
        if(changed){
          if(!document.hidden)sound('call',state.index);
          focusName=focusName||[present,absent,name,document.body].includes(document.activeElement);
          focusedId=state.current.id;
          announcer.textContent=t('Điểm danh {index} trên {total}: {name}.',{index:state.index+1,total:state.total,name:state.current.name});
        }
        if(state.phase==='paused')sound('stop');
        name.textContent=state.current.name;progress.textContent=t('Điểm danh {index} / {total}',{index:state.index+1,total:state.total});
        pauseButton.textContent=state.phase==='paused'?t('Tiếp tục'):t('Tạm dừng');pauseButton.setAttribute('aria-pressed',String(state.phase==='paused'));
        present.disabled=absent.disabled=state.phase!=='waiting';
        present.setAttribute('aria-label',t('Có mặt: {name}',{name:state.current.name}));absent.setAttribute('aria-label',t('Vắng: {name}',{name:state.current.name}));
        const record=state.records.find(record=>record.id===state.current.id);card.dataset.state=state.phase;
        present.textContent=record?.present?t('Đã có mặt'):t('Có mặt');absent.textContent=record&&!record.present?t('Đã đánh dấu vắng'):t('Vắng');
        hint.textContent=state.phase==='paused'?t('Đang tạm dừng. Bấm Tiếp tục khi sẵn sàng.'):record?t('Đang chuyển sang bạn tiếp theo…'):t('Chọn Có mặt hoặc Vắng để chuyển sang bạn tiếp theo.');
        overlay.hidden=false;if(!overlay.open)overlay.showModal();
        if(focusName&&state.phase==='waiting'){focusName=false;name.focus({preventScroll:true});}
      }
      onStateChange?.(state);
    },
  });
  // Bind the choice to the prompt seen at pointer/key down. A remote mark can
  // advance the dialog before the matching click arrives; that click is stale.
  const intents=new Map();
  for(const [button,mark] of [[present,'markPresent'],[absent,'markAbsent']]){
    const remember=()=>{const state=session.getState();intents.set(button,{id:state.current?.id,promptId:state.promptId});};
    button.addEventListener('pointerdown',remember);
    button.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;if(event.repeat){event.preventDefault();return;}remember();});
    button.addEventListener('click',event=>{
      const intent=intents.get(button);intents.delete(button);if(event.detail>1)return;
      const state=session.getState();prepareAudio();session[mark](intent?intent.id:state.current?.id,intent?intent.promptId:state.promptId);
    });
  }
  const clickPause=()=>{focusName=false;if(session.getState().phase==='paused'){prepareAudio();return session.resume();}return session.pause();};
  const clickSound=()=>{sound('setEnabled',!soundtrack.enabled);renderSound();if(soundtrack.enabled){prepareAudio();const state=session.getState();if(state.phase==='waiting'&&!document.hidden)sound('call',state.index);}};
  const stop=()=>{const stopped=session.stop();sound('stop');return stopped;};
  const visibility=()=>{if(document.hidden){session.pause();sound('stop');}};
  const cancel=event=>{event.preventDefault();};
  const closed=()=>{if(!overlay.open&&session.isRunning())stop();};
  pauseButton.addEventListener('click',clickPause);stopButton.addEventListener('click',stop);soundButton.addEventListener('click',clickSound);
  overlay.addEventListener('cancel',cancel);overlay.addEventListener('close',closed);
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',stop);
  return {
    prepareAudio,stopAudio:()=>sound('stop'),
    start:students=>{if(destroyed||scene.run)return false;prepareAudio();const started=session.start(students);if(started&&document.hidden)session.pause();return started;},
    markPresent:(expectedId,expectedPromptId)=>session.markPresent(expectedId,expectedPromptId),
    markAbsent:(expectedId,expectedPromptId)=>session.markAbsent(expectedId,expectedPromptId),
    pause:()=>session.pause(),resume:()=>session.resume(),stop,isRunning:()=>session.isRunning(),getState:()=>session.getState(),
    destroy(){if(destroyed)return;session.stop();destroyed=true;sound('destroy');scene.clearAttendance();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',stop);overlay.remove();},
  };
}
