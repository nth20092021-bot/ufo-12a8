import {APP_BASE} from './api-client.js';

// Credentials stay in the WebSocket handshake header, never in a URL or storage.
export function createClassLive({getConnection, onSnapshot=()=>{}, onAttendance=()=>{}, onStatus=()=>{},
  WebSocketImpl=globalThis.WebSocket, origin=globalThis.location?.origin,
  now=()=>Date.now(), timers=globalThis, makeId=()=>crypto.randomUUID()}={}) {
  const clientId=makeId(), pending=new Map(), waiters=new Set();
  let socket=null, key='', connection=null, generation=0, destroyed=false, status='idle';
  let retry=null, retries=0, connectedAt=0, suspended=false;
  const fail=(message,code='LIVE_OFFLINE')=>Object.assign(new Error(message),{code});
  const setStatus=value=>{if(status!==value){status=value;onStatus(value);}};
  function descriptor() {
    const value=getConnection?.();
    if(!value?.classId||!['owner','participant'].includes(value.role)||value.role==='participant'&&!value.studentId)return null;
    return {...value,key:JSON.stringify([value.classId,value.role,value.studentId||'',value.token||'',value.identity||''])};
  }
  function rejectPending(error) {
    for(const item of pending.values()){timers.clearTimeout(item.timer);item.reject(error);}pending.clear();
    for(const item of waiters){timers.clearTimeout(item.timer);item.reject(error);}waiters.clear();
  }
  function disconnect() {
    generation++;timers.clearTimeout(retry);retry=null;
    const previous=socket;socket=null;
    if(previous)try{previous.close(1000,'Connection changed');}catch{}
  }
  function sendPending() {
    if(socket?.readyState!==1)return;
    for(const item of pending.values())socket.send(JSON.stringify(item.payload));
  }
  function reconnect() {
    if(destroyed||suspended||retry||!connection)return;
    setStatus('reconnecting');
    retry=timers.setTimeout(()=>{retry=null;refresh();},Math.min(4000,350*2**Math.min(retries++,4)));
  }
  function open() {
    if(destroyed||suspended||!connection||socket||!WebSocketImpl)return;
    const currentGeneration=generation, currentKey=key;
    const url=new URL(`${APP_BASE}/api/classes/${encodeURIComponent(connection.classId)}/live`,origin);
    url.protocol=url.protocol==='https:'?'wss:':'ws:';
    url.searchParams.set('role',connection.role);url.searchParams.set('clientId',clientId);
    if(connection.studentId)url.searchParams.set('studentId',connection.studentId);
    const protocols=['ufo-live-v1'];
    if(connection.token)protocols.push(`ufo-token.${connection.token}`);
    let ws;
    try{ws=new WebSocketImpl(url.href,protocols);}catch{reconnect();return;}
    socket=ws;setStatus(retries?'reconnecting':'connecting');
    const current=()=>!destroyed&&socket===ws&&generation===currentGeneration&&key===currentKey&&descriptor()?.key===currentKey;
    ws.addEventListener('open',()=>{
      if(!current()){ws.close();return;}
      connectedAt=now();retries=0;setStatus('connected');sendPending();
      for(const item of waiters){timers.clearTimeout(item.timer);item.resolve();}waiters.clear();
    });
    ws.addEventListener('message',event=>{
      if(!current())return;
      let message;try{message=JSON.parse(event.data);}catch{return;}
      if(['snapshot','attendance'].includes(message.type)&&message.state&&Number.isFinite(message.serverTime)) {
        (message.type==='attendance'?onAttendance:onSnapshot)(message.state,{ageMs:Math.max(0,message.serverTime-(message.state.updatedAt||message.serverTime)),receivedAt:now()});
      } else if(message.requestId&&pending.has(message.requestId)&&['ack','error'].includes(message.type)) {
        const item=pending.get(message.requestId);pending.delete(message.requestId);timers.clearTimeout(item.timer);
        if(message.type==='error')item.reject(fail(message.error||message.message||'Live classroom rejected the update.',message.code));
        else item.resolve(message);
      }
    });
    ws.addEventListener('close',()=>{if(!current())return;socket=null;reconnect();});
    ws.addEventListener('error',()=>{if(current())setStatus('reconnecting');});
  }
  function refresh() {
    if(destroyed||suspended)return;
    const next=descriptor();
    if((next?.key||'')!==key){
      disconnect();rejectPending(fail('Classroom connection changed.','LIVE_CHANGED'));
      connection=next;key=next?.key||'';retries=0;
    }
    if(!connection){setStatus('idle');return;}
    if(!socket&&!retry)open();
  }
  function connect({timeoutMs=8000}={}) {
    refresh();
    if(destroyed||suspended||!connection)return Promise.reject(fail('No authorized classroom connection.','LIVE_CHANGED'));
    if(socket?.readyState===1)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const item={resolve,reject};item.timer=timers.setTimeout(()=>{waiters.delete(item);reject(fail('Live classroom connection timed out.'));},timeoutMs);waiters.add(item);
    });
  }
  async function request(payload,{timeoutMs=10000}={}) {
    refresh();const requestKey=key,requestGeneration=generation;
    await connect({timeoutMs});
    if(destroyed||requestKey!==key||requestGeneration!==generation||descriptor()?.key!==requestKey)throw fail('Classroom connection changed.','LIVE_CHANGED');
    const requestId=makeId();
    return new Promise((resolve,reject)=>{
      const item={payload:{...payload,requestId},resolve,reject};
      item.timer=timers.setTimeout(()=>{pending.delete(requestId);reject(fail('Live classroom update timed out.'));},timeoutMs);
      pending.set(requestId,item);
      if(socket?.readyState===1)socket.send(JSON.stringify(item.payload));
    });
  }
  function publish(payload) {
    refresh();if(socket?.readyState!==1)return false;
    socket.send(JSON.stringify(payload));return true;
  }
  const watch=timers.setInterval(refresh,1000);
  return {refresh,connect,request,publish,get status(){return status;},get connectedAt(){return connectedAt;},
    suspend(){suspended=true;disconnect();rejectPending(fail('Classroom page suspended.','LIVE_CHANGED'));setStatus('idle');},
    resume(){if(destroyed)return;suspended=false;refresh();},
    destroy(){if(destroyed)return;destroyed=true;disconnect();timers.clearInterval(watch);rejectPending(fail('Classroom connection closed.','LIVE_CHANGED'));setStatus('idle');}};
}
