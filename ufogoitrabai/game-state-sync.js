import {apiRequest} from './api-client.js';
import {t} from './i18n.js';

/** Only the shared classroom ledger travels; sound and fullscreen stay on device. */
export function gameStateOf(room) {
  const s=room.state;
  return {history:structuredClone(s.history||[]),called:[...(s.called||[])],absent:[...(s.absent||[])],count:s.count,noRepeat:s.noRepeat!==false};
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function applyGameState(room,value) {
  if(!value)return;
  const ids=new Set(room.state.students.map(s=>s.id));
  Object.assign(room.state,{history:structuredClone(value.history||[]),called:[...(value.called||[])],absent:(value.absent||[]).filter(id=>ids.has(id)),count:value.count||2,noRepeat:value.noRepeat!==false});
}
export function reconcileGameState(room,remote) {
  const local=gameStateOf(room),base=room.cloud.gameBaseline;
  if(remote.state===null)return 'upload';
  if(same(local,remote.state))return 'equal';
  if(base&&same(local,base))return 'download';
  if(base&&same(remote.state,base))return 'upload';
  return 'conflict';
}

/** CAS keeps an unsaved local ledger intact when another controller has edited it. */
export function createGameStateSync({getAccount,getRooms,persist,onChange=()=>{},notify=()=>{},send=apiRequest,setTimer=setTimeout,clearTimer=clearTimeout}) {
  const entries=new Map();let destroyed=false;
  const valid=room=>!destroyed&&room?.cloud?.accountId&&room.cloud.accountId===getAccount()?.id&&getRooms().includes(room);
  const path=room=>`/classes/${encodeURIComponent(room.cloud.id)}`;
  const entry=room=>{if(!entries.has(room.id))entries.set(room.id,{status:'pending',error:'',remote:null,busy:null,timer:null,lease:null,renew:null});return entries.get(room.id);};
  const change=(room,status,error='')=>{const e=entry(room);e.status=status;e.error=error;onChange(room);};
  function adopt(room,remote,{apply=false}={}) {
    if(apply)applyGameState(room,remote.state);
    room.cloud.gameRevision=remote.revision;room.cloud.gameBaseline=structuredClone(remote.state??gameStateOf(room));persist();
    change(room,same(gameStateOf(room),room.cloud.gameBaseline)?'saved':'pending');
  }
  async function write(room,e) {
    const state=gameStateOf(room),cloud=room.cloud;
    const result=await send(path(room)+'/game-state',{method:'PUT',body:{expectedRevision:cloud.gameRevision||0,state,...(e.lease?{lockToken:e.lease.lockToken}:{})}});
    if(!valid(room))return;
    adopt(room,{revision:result.revision,state:result.state??state});
  }
  async function refresh(room,{seed}={}) {
    if(!valid(room))return;
    const e=entry(room);
    if(e.busy)await e.busy;
    const operation=(async()=>{
      change(room,'saving');
      try {
        const remote=seed||await send(path(room)+'/game-state');if(!valid(room))return;
        const mode=reconcileGameState(room,remote);e.remote=remote;
        if(mode==='conflict'){change(room,'conflict',t('Lịch sử trên thiết bị này khác bản đã lưu. Chọn bản muốn giữ.'));return;}
        room.cloud.gameRevision=remote.revision;
        if(mode==='upload')await write(room,e);else adopt(room,remote,{apply:mode==='download'});
      }catch(error){if(valid(room))change(room,error.status===409?'conflict':'error',error.message);throw error;}
    })();
    e.busy=operation;try{return await operation;}finally{if(e.busy===operation)e.busy=null;}
  }
  async function flush(room) {
    if(!valid(room))return;
    const e=entry(room);if(e.timer){clearTimer(e.timer);e.timer=null;}
    if(e.busy)await e.busy;
    if(!valid(room))return;
    if(e.status==='conflict')throw new Error(e.error||t('Chọn bản lịch sử muốn giữ trước khi gọi UFO.'));
    if(!room.cloud.gameBaseline)return refresh(room);
    if(same(gameStateOf(room),room.cloud.gameBaseline)){change(room,'saved');return;}
    const operation=(async()=>{
      change(room,'saving');
      try{await write(room,e);}
      catch(error){if(valid(room)){change(room,error.status===409?'conflict':'error',error.message);if(error.status===409){try{e.remote=await send(path(room)+'/game-state');}catch{}}}throw error;}
    })();e.busy=operation;
    try{await operation;}finally{if(e.busy===operation)e.busy=null;}
    if(valid(room)&&e.status==='pending'&&!e.lease)return flush(room);
  }
  function schedule(room) {
    if(!valid(room))return;
    const e=entry(room);if(e.status==='conflict'||e.lease||same(gameStateOf(room),room.cloud.gameBaseline))return;
    if(e.timer)clearTimer(e.timer);change(room,'pending');
    e.timer=setTimer(()=>{e.timer=null;void flush(room).catch(()=>{});},550);
  }
  async function resolve(room,useLocal) {
    if(!valid(room))return;
    const e=entry(room),remote=await send(path(room)+'/game-state');if(!valid(room))return;
    if(useLocal){room.cloud.gameRevision=remote.revision;room.cloud.gameBaseline=structuredClone(remote.state);change(room,'pending');await flush(room);}
    else{adopt(room,remote,{apply:true});e.remote=null;}
  }
  async function beginDraw(room) {
    if(!valid(room))return null;
    await flush(room);const e=entry(room);
    const lease=await send(path(room)+'/draw-lock',{method:'POST',body:{action:'acquire'}});
    if(!valid(room)){await send(path(room)+'/draw-lock',{method:'POST',body:{action:'release',lockToken:lease.lockToken}}).catch(()=>{});throw new Error(t('Phiên đăng nhập đã thay đổi.'));}
    e.lease=lease;
    try{await refresh(room);if(e.status==='conflict')throw new Error(e.error);}
    catch(error){await endDraw(room);throw error;}
    const renew=async()=>{
      if(!valid(room)||!e.lease)return;
      try{e.lease=await send(path(room)+'/draw-lock',{method:'POST',body:{action:'renew',lockToken:e.lease.lockToken}});}
      catch(error){change(room,'error',error.message);notify(t('Mất kết nối điều khiển. Kết quả đã chọn vẫn được lưu.'));return;}
      e.renew=setTimer(renew,20000);
    };e.renew=setTimer(renew,20000);return lease;
  }
  async function endDraw(room) {
    const e=entries.get(room?.id);if(!e)return;
    if(e.renew){clearTimer(e.renew);e.renew=null;}
    const lease=e.lease;e.lease=null;
    if(lease)await send(path(room)+'/draw-lock',{method:'POST',body:{action:'release',lockToken:lease.lockToken},keepalive:true}).catch(()=>{});
  }
  function discard(room) {
    const e=entries.get(room.id);if(!e)return;
    if(e.timer)clearTimer(e.timer);void endDraw(room);entries.delete(room.id);
  }
  return {refresh,flush,schedule,resolve,beginDraw,endDraw,discard,
    getStatus:room=>valid(room)?{...entry(room),label:t(({saved:'Đã lưu vào tài khoản',saving:'Đang lưu…',pending:'Chưa đồng bộ',error:'Chưa đồng bộ',conflict:'Chọn bản lịch sử muốn giữ'})[entry(room).status])}:{status:'guest',label:t('Chưa gắn tài khoản')},
    destroy(){for(const room of getRooms())discard(room);destroyed=true;}
  };
}
