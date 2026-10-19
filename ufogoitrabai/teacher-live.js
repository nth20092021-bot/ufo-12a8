import {createClassLive} from './live-class.js';

export function createTeacherLive({getConnection,getFrame,onRemoteFinish=()=>{},onStatus=()=>{},onAttendance=()=>{},onAttendancePresent=()=>{},
  createTransport=createClassLive,timers=globalThis,makeId=()=>crypto.randomUUID()}={}) {
  let active=null, latest=null, terminal=null, closed=false, suspended=false, identity='', roll=null, latestAttendance=null;
  const connectionKey=()=>{const c=getConnection();return c?JSON.stringify([c.classId,c.role,c.token||'',c.identity||'']):'';};
  const transport=createTransport({getConnection,onStatus,onAttendance:(state,meta)=>{
    latestAttendance=state;onAttendance(state,meta);deliverAttendance();
  },onSnapshot:state=>{
    latest=state;
    if(active&&state.status==='idle')active.missing=true;
    if(active?.drawId===state.drawId&&state.status==='running')active.missing=false;
    if(active?.drawId===state.drawId&&state.status==='finished')onRemoteFinish();
  }});
  function refresh(){
    const next=connectionKey();
    if(next!==identity){identity=next;active=null;latest=null;terminal=null;roll=null;latestAttendance=null;}
    transport.refresh();
  }
  function deliverAttendance(){
    const state=latestAttendance, desired=roll?.desired;
    if(!desired||desired.status!=='active'||!state?.confirmed||state.sessionId!==desired.sessionId
      ||state.turnId!==desired.turnId||state.student?.id!==desired.studentId||roll.delivered.has(state.turnId))return;
    roll.delivered.add(state.turnId);
    onAttendancePresent({sessionId:state.sessionId,turnId:state.turnId,promptId:state.turnId,studentId:state.student.id});
  }
  function flushAttendance(current=roll){
    if(!current||closed||suspended)return Promise.resolve();
    if(current.pending)return current.pending;
    const operation=(async()=>{
      while(roll===current&&current.dirty&&!suspended&&!closed){
        const revision=current.revision, payload={...current.desired,type:'attendance-set',seq:++current.seq};
        await transport.request(payload);
        if(roll!==current||current.identity!==connectionKey())return;
        if(revision===current.revision)current.dirty=false;
      }
    })().catch(error=>{
      if(roll===current&&['ATTENDANCE_STALE','ATTENDANCE_LOCKED','class_unavailable'].includes(error.code))roll=null;
      throw error;
    }).finally(()=>{if(current.pending===operation)current.pending=null;});
    current.pending=operation;return operation;
  }
  function attendance(value){
    refresh();if(!getConnection()||closed)return Promise.resolve();
    const status=value.phase==='waiting'?'active':value.phase==='idle'?'ended':'paused';
    if(!roll||roll.desired.sessionId!==value.sessionId){
      if(status==='ended')return Promise.resolve();
      roll={identity,seq:-1,revision:0,dirty:false,pending:null,delivered:new Set()};
    }
    const desired={sessionId:value.sessionId,status,turnId:status==='ended'?null:value.promptId,
      studentId:status==='ended'?null:value.current?.id,index:value.index,total:value.total};
    if(JSON.stringify(desired)!==JSON.stringify(roll.desired)){roll.desired=desired;roll.revision++;roll.dirty=true;}
    deliverAttendance();return flushAttendance();
  }
  function endAttendance(sessionId=roll?.desired.sessionId){
    if(!roll||roll.desired.sessionId!==sessionId)return Promise.resolve();
    return attendance({sessionId,phase:'idle',index:roll.desired.index,total:roll.desired.total});
  }
  function pauseAttendance(){
    if(!roll)return;
    // The controller may end synchronously in an earlier pagehide listener.
    // Send that final choice before request()'s connection microtask is canceled.
    transport.publish(roll.desired.status==='ended'?{...roll.desired,type:'attendance-set',seq:++roll.seq}
      :{type:'attendance-pause',sessionId:roll.desired.sessionId,seq:++roll.seq});
  }
  const retiredError=error=>['draw_changed','draw_finished','draw_locked','draw_conflict','class_unavailable','roster_changed'].includes(error?.code);
  function retire(draw,error){if(active===draw&&retiredError(error)){active=null;onRemoteFinish();}}
  async function recover(draw){
    if(!draw.missing)return;
    if(draw.recovering)return draw.recovering;
    const operation=(async()=>{
      if(active!==draw||draw.identity!==connectionKey())throw Object.assign(new Error('Classroom connection changed.'),{code:'LIVE_CHANGED'});
      // A preparation can expire while offline. Reuse its already-selected
      // people, with a fresh event ID; never rerun the random selection.
      draw.drawId=makeId();draw.seq=0;draw.missing=false;
      try{await transport.request({...draw.start,type:'start',drawId:draw.drawId,seq:draw.seq});}
      catch(error){if(active===draw)draw.missing=true;retire(draw,error);throw error;}
    })().finally(()=>{if(draw.recovering===operation)draw.recovering=null;});
    draw.recovering=operation;return operation;
  }
  function frame() {
    refresh();
    if(!active||terminal)return;
    const draw=active;
    if(draw.missing||draw.recovering){void recover(draw).then(()=>{if(active===draw)frame();}).catch(()=>{});return;}
    const value=getFrame();
    if(!value){if(!draw.started)transport.publish({type:'prepare',drawId:draw.drawId,seq:++draw.seq});return;}
    const first=!draw.started;draw.started=true;
    const payload={type:'frame',drawId:draw.drawId,seq:++draw.seq,frame:value};
    if(first)void transport.request(payload).catch(error=>{
      if(active!==draw)return;
      if(error.code==='draw_changed'&&latest?.status==='idle'){draw.missing=true;frame();}
      else retire(draw,error);
    });
    else transport.publish(payload);
  }
  async function complete(type) {
    if(!active)return;
    if(terminal)return terminal;
    const draw=active;
    const operation=(async()=>{
      if(draw.recovering)await draw.recovering;
      if(draw.missing){
        if(!draw.started||type==='abort'){if(active===draw)active=null;return;}
        await recover(draw);
      }
      if(active!==draw)return;
      try{await transport.request({type:type==='finish'&&!draw.started?'abort':type,drawId:draw.drawId,seq:++draw.seq});}
      catch(error){
        if(error.code==='draw_changed'&&latest?.status==='idle'&&draw.started&&type==='finish'){
          draw.missing=true;await recover(draw);
          if(active===draw)await transport.request({type:'finish',drawId:draw.drawId,seq:++draw.seq});
        }else{retire(draw,error);throw error;}
      }
      if(active===draw)active=null;
    })().catch(error=>{retire(draw,error);throw error;}).finally(()=>{if(terminal===operation)terminal=null;});
    terminal=operation;return operation;
  }
  const tick=timers.setInterval(()=>{
    if(closed||suspended)return;
    refresh();
    if(roll){
      if(roll.dirty)void flushAttendance().catch(()=>{});
      else if(!roll.pending&&roll.desired.status!=='ended')transport.publish({type:'attendance-heartbeat',sessionId:roll.desired.sessionId,seq:++roll.seq});
    }
    // The same reserved result is retried after a temporary disconnect.
    if(active?.ending&&!terminal)void complete(active.ending).catch(()=>{});
    else frame();
  },1000);
  return {
    refresh,
    attendance,endAttendance,
    async prepare(){refresh();if(getConnection())await transport.connect();},
    async begin({students,selected,options}) {
      refresh();
      if(!getConnection())return;
      if(active)throw new Error('A live draw is still being synchronized.');
      const draw={drawId:makeId(),seq:0,identity,start:{
        students:students.map(({id,name,gender,appearance})=>({id,name,gender,appearance})),
        selectedIds:selected.map(student=>student.id),options,
        frame:{elapsed:0,warningElapsed:0,alarmElapsed:0,warningActive:options.warningDuration>0,speed:1,paused:true}}};
      try {
        await transport.request({...draw.start,type:'start',drawId:draw.drawId,seq:draw.seq});
      } catch(error) {
        // A lost acknowledgement must not leave an uncommitted preview running.
        transport.publish({type:'abort',drawId:draw.drawId,seq:draw.seq+1});throw error;
      }
      if(draw.identity!==connectionKey())throw Object.assign(new Error('Classroom connection changed.'),{code:'LIVE_CHANGED'});
      active=draw;
    },
    frame,
    async finish(){refresh();if(active)active.ending='finish';return complete('finish');},
    async abort(){refresh();if(active)active.ending='abort';return complete('abort');},
    async reset(){
      refresh();
      if(!getConnection())return;
      if(active){await complete('finish');}
      await transport.request({type:'reset',drawId:latest?.drawId||null,seq:(latest?.seq||0)+1});
    },
    suspend(){pauseAttendance();suspended=true;if(active)transport.publish({type:active.started?'finish':'abort',drawId:active.drawId,seq:++active.seq});active=null;transport.suspend();},
    resume(){if(closed)return;suspended=false;transport.resume();refresh();if(roll){roll.dirty=true;void flushAttendance().catch(()=>{});}},
    destroy(){
      if(closed)return;closed=true;timers.clearInterval(tick);
      pauseAttendance();roll=null;latestAttendance=null;
      if(active)transport.publish({type:active.started?'finish':'abort',drawId:active.drawId,seq:++active.seq});
      active=null;transport.destroy();
    },
    get active(){return active!==null;}
  };
}
