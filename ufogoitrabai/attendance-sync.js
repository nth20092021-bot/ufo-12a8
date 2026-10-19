import {t} from './i18n.js';
import {apiRequest} from './api-client.js';

export const ATTENDANCE_PENDING_PREFIX='kroma.ufo.attendance.pending.v1.';
export function attendanceDate(timestamp=Date.now(),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'){
  // Persist canonical date keys, independent of the interface language.
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(timestamp);
  const value=type=>parts.find(part=>part.type===type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
const payload=entry=>({expectedRevision:entry.revision,date:entry.date,timeZone:entry.timeZone,startedAt:entry.startedAt,status:entry.status,records:entry.records});
const sameRoster=(a,b)=>a.date===b.date&&a.timeZone===b.timeZone&&a.startedAt===b.startedAt&&a.records.length===b.records.length&&a.records.every((row,i)=>['id','name','gender'].every(key=>row[key]===b.records[i][key]));

/** Per-run durable outbox: a late response cannot erase newer attendance marks. */
export function createAttendanceSync({getConnection,storage,request=apiRequest,requestTimeoutMs=15000,onChange,onSaved,now=Date.now,uuid=()=>crypto.randomUUID(),timeZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',schedule=setTimeout,cancel=clearTimeout}={}){
  if(storage===undefined){try{storage=globalThis.localStorage;}catch{storage=null;}}
  async function send(path,options){
    const controller=new AbortController();let deadline;
    try{return await Promise.race([request(path,{...options,signal:controller.signal}),new Promise((_,reject)=>{deadline=setTimeout(()=>{controller.abort();reject(new Error(t('Kết nối quá lâu. Kết quả vẫn được giữ và sẽ tự gửi lại.')));},requestTimeoutMs);})]);}
    finally{clearTimeout(deadline);}
  }
  let sending=false,timer=null,stopped=false,activeId=null,activeRun=null,lastError=null;
  const memory=new Map(),errors=new Map();
  function entries(){
    const all=new Map();
    try{for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(ATTENDANCE_PENDING_PREFIX))continue;try{const entry=JSON.parse(storage.getItem(key));if(entry&&entry.id&&entry.classId&&Array.isArray(entry.records)&&entry.records.length<=120)all.set(entry.id,entry);}catch{/* Ignore unrelated damaged entries. */}}}catch{/* Memory remains available if private storage is disabled. */}
    for(const [id,entry] of memory){const saved=all.get(id);if(!saved||entry.version>=saved.version)all.set(id,entry);}
    return [...all.values()].sort((a,b)=>a.startedAt-b.startedAt);
  }
  const read=id=>entries().find(entry=>entry.id===id);
  function state(classId){const pending=entries().filter(entry=>!classId||entry.classId===classId);return {pending:pending.length,sending,error:pending.map(entry=>errors.get(entry.id)).find(Boolean)||lastError,activeId};}
  const emit=()=>onChange?.(state());
  function write(entry){
    memory.set(entry.id,entry);if(entry.id===activeId)activeRun=entry;
    try{storage.setItem(ATTENDANCE_PENDING_PREFIX+entry.id,JSON.stringify(entry));lastError=null;}
    catch{lastError=t('Trình duyệt không cho lưu bản dự phòng. Giữ trang mở cho đến khi đồng bộ xong.');}
    emit();return entry;
  }
  function remove(id){memory.delete(id);errors.delete(id);try{storage.removeItem(ATTENDANCE_PENDING_PREFIX+id);}catch{/* A later idempotent retry is safe. */}emit();}
  function wake(delay=0){if(stopped||timer!==null)return;timer=schedule(()=>{timer=null;void flush();},delay);}
  async function flush(){
    if(stopped||sending)return;
    if(timer!==null){cancel(timer);timer=null;}
    sending=true;emit();
    const attempted=new Set(),conflicts=new Map();
    try{
      while(!stopped){
        const entry=entries().find(item=>!attempted.has(item.id));if(!entry)break;attempted.add(entry.id);
        const connection=getConnection(entry.classId);
        if(!connection?.ownerToken&&!connection?.accountId){errors.set(entry.id,t('Mở lại link quản lý của lớp để đồng bộ lượt điểm danh đang chờ.'));continue;}
        const path=`/classes/${encodeURIComponent(entry.classId)}/attendance/${encodeURIComponent(entry.id)}`;
        try{
          let result;
          try{result=await send(path,{method:'PUT',token:connection.ownerToken,body:payload(entry),keepalive:true});}
          catch(error){
            if(error.status!==409)throw error;
            conflicts.set(entry.id,(conflicts.get(entry.id)||0)+1);if(conflicts.get(entry.id)>3)throw new Error(t('Dữ liệu đang được cập nhật. Sẽ tự thử đồng bộ lại.'));
            const remote=await send(path,{token:connection.ownerToken});
            const latest=read(entry.id);if(!latest)continue;
            if(!sameRoster(latest,remote))throw new Error(t('Lượt điểm danh có dữ liệu khác trên thiết bị khác. Bản trên máy vẫn được giữ.'));
            if(latest.records.some((row,i)=>row.status!=='unmarked'&&remote.records[i].status!=='unmarked'&&row.status!==remote.records[i].status))throw new Error(t('Kết quả điểm danh khác với bản đã lưu. Bản trên máy vẫn được giữ để kiểm tra.'));
            const merged=latest.records.map((row,i)=>({...row,status:row.status==='unmarked'?remote.records[i].status:row.status}));
            if(remote.status!=='running'){
              if(merged.some((row,i)=>row.status!==remote.records[i].status))throw new Error(t('Lượt trên Cloudflare đã kết thúc. Kết quả chưa gửi vẫn được giữ trên máy.'));
              remove(entry.id);onSaved?.(remote);continue;
            }
            write({...latest,records:merged,revision:remote.revision,version:latest.version+1});attempted.delete(entry.id);continue;
          }
          const latest=read(entry.id);
          if(!latest)continue;
          errors.delete(entry.id);
          if(latest){
            if(latest.version===entry.version){if(activeId===entry.id)activeRun={...latest,revision:result.revision};remove(entry.id);}
            else{write({...latest,revision:result.revision});attempted.delete(entry.id);}
          }
          onSaved?.(result);
        }catch(error){if(read(entry.id))errors.set(entry.id,error.message||t('Chưa đồng bộ được. Kết quả đang được giữ trên máy.'));}
      }
    }finally{sending=false;emit();if(entries().length)wake(10000);}
  }
  return {
    begin(classId,students){
      if(!classId||!students.length)throw new Error(t('Cần một lớp có học sinh trước khi điểm danh.'));
      const startedAt=now(),zone=timeZone(),entry={id:uuid(),classId,revision:0,version:1,date:attendanceDate(startedAt,zone),timeZone:zone,startedAt,status:'running',records:students.map(({id,name,gender})=>({id,name,gender:gender||'male',status:'unmarked'}))};
      activeId=entry.id;write(entry);wake();return entry.id;
    },
    mark(id,studentId,present){
      const entry=read(id)||(activeRun?.id===id?activeRun:null);if(!entry)return false;
      if(entry.status!=='running')return false;
      const index=entry.records.findIndex(row=>row.id===studentId);if(index<0)return false;
      const records=entry.records.map((row,i)=>i===index?{...row,status:present?'present':'absent'}:row);
      write({...entry,records,version:entry.version+1});wake();return true;
    },
    finish(id,reason){const entry=read(id)||(activeRun?.id===id?activeRun:null);if(!entry)return false;write({...entry,status:reason==='complete'?'completed':'stopped',version:entry.version+1});if(activeId===id){activeId=null;activeRun=null;}wake();return true;},
    getState:state,flush,
    discardClass(classId){
      for(const entry of entries())if(entry.classId===classId)remove(entry.id);
      if(activeRun?.classId===classId){activeRun=null;activeId=null;}
      emit();
    },
    start(){stopped=false;wake();},
    stop(){stopped=true;if(timer!==null)cancel(timer);timer=null;},
    pending:entries,
  };
}
