import {t} from './i18n.js';
import {apiRequest} from './api-client.js';
import {mergeCloudClassroom,removeClassroom,manualClassroomStudents,isAccountPlaceholder as isPlaceholder} from './classroom.js';
import {parseRoster} from './core.js';
import {sanitizeAppearance} from './appearance.js';

/** Account-only credentials are never converted back into guest bearer tokens. */
export function bindClassroomAccount(room,snapshot,accountId) {
  room.cloud={id:snapshot.id,revision:room.cloud?.revision||0,accountId,
    ...(room.cloud?.gameBaseline?{gameBaseline:room.cloud.gameBaseline,gameRevision:room.cloud.gameRevision||0}:{})};
  mergeCloudClassroom(room,snapshot);return room;
}
/** A lost create response can be recovered by the account list before its retry.
 * Keep the original local editor and state when both now identify the same class. */
export function deduplicateConnectedClassroom(collection,original) {
  if(!original?.cloud?.id||!collection.classes.includes(original))return [];
  const duplicates=collection.classes.filter(room=>room!==original&&room.cloud?.id===original.cloud.id);
  if(!duplicates.length)return [];
  const ids=new Set(duplicates.map(room=>room.id));collection.classes=collection.classes.filter(room=>!ids.has(room.id));
  if(ids.has(collection.activeId))collection.activeId=original.id;
  return duplicates;
}
export function removeOtherAccountClassrooms(collection,accountId) {
  const originalIds=new Set(collection.classes.map(room=>room.id));
  const removed=collection.classes.filter(room=>room.cloud?.accountId&&room.cloud.accountId!==accountId);
  for(const room of removed)removeClassroom(collection,room.id);
  for(const room of collection.classes)if(!originalIds.has(room.id))room.accountPlaceholder=JSON.stringify(room);
  return removed;
}
export function quarantineAccountClassrooms(collection) {
  return removeOtherAccountClassrooms(collection,null);
}
export function accountSafeCollection(collection,cached=[]) {
  const live=collection.classes.filter(room=>!isPlaceholder(room)||!cached.length),ids=new Set(live.map(room=>room.cloud?.id||room.id));
  const classes=[...live,...cached.filter(room=>!ids.has(room.cloud?.id||room.id))];
  return {...collection,classes,activeId:classes.some(room=>room.id===collection.activeId)?collection.activeId:classes[0]?.id};
}
export async function flushBeforeAccountLogout({account,rooms,gameSync,attendanceSync}) {
  if(!account)return;
  const owned=rooms.filter(room=>room.cloud?.accountId===account.id);
  try{for(const room of owned)await gameSync.flush(room);}
  catch(error){throw new Error(t('Chưa thể đăng xuất. Hãy đồng bộ hoặc chọn bản lịch sử muốn giữ trước.')+' '+error.message);}
  await attendanceSync.flush();
  const ids=new Set(owned.map(room=>room.cloud.id));
  if(attendanceSync.pending().some(entry=>ids.has(entry.classId)))throw new Error(t('Chưa thể đăng xuất vì còn điểm danh chưa đồng bộ. Giữ trang mở và thử lại khi có mạng.'));
}
export function restoreAccountClassroom(collection,snapshot,accountId,cached=[]) {
  let room=collection.classes.find(item=>item.cloud?.id===snapshot.id);
  if(!room){
    const cachedRoom=cached.find(item=>item.cloud?.id===snapshot.id&&item.cloud.accountId===accountId);
    room=cached.find(item=>item.cloud?.id===snapshot.id&&item.cloud.accountId===accountId)||{
      id:crypto.randomUUID(),name:snapshot.name,expectedSize:null,environmentTheme:'street',environmentNames:{},state:{students:[],history:[],called:[],absent:[],count:1,noRepeat:true,sound:true,isDemo:false}};
    const hadPlaceholder=collection.classes.some(item=>isPlaceholder(item));
    collection.classes=collection.classes.filter(item=>!isPlaceholder(item));
    collection.classes.push(room);if(hadPlaceholder&&!collection.classes.some(item=>item.id===collection.activeId))collection.activeId=room.id;
    // A clean restore takes the saved ledger. A legacy guest keeps its ledger for explicit reconciliation.
    if(!cachedRoom&&snapshot.gameState){Object.assign(room.state,structuredClone(snapshot.gameState));room.cloud={id:snapshot.id,revision:0,accountId,gameRevision:snapshot.gameRevision||0,gameBaseline:structuredClone(snapshot.gameState)};}
  }
  return bindClassroomAccount(room,snapshot,accountId);
}

const rosterPayload=students=>students.map(({id,name,gender,appearance})=>({id,name,gender,...(appearance?{appearance}: {})}));
const createPayload=room=>({name:room.name,students:rosterPayload(room.state.students),expectedSize:room.expectedSize??null,environmentTheme:room.environmentTheme||'street',environmentNames:room.environmentNames||{},creationKey:room.id});
const sortedValue=value=>Array.isArray(value)?value.map(sortedValue):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sortedValue(value[key])])):value;
const sameValue=(a,b)=>JSON.stringify(sortedValue(a))===JSON.stringify(sortedValue(b));
const comparableRoster=students=>students.filter(student=>student.status===undefined||student.status==='active').map(({id,name,gender,appearance})=>({id,name,gender,appearance:sanitizeAppearance(appearance)}));
/** A recovered idempotent create must never replace a newer local roster/name.
 * Existing account data remains untouched until the teacher chooses a version. */
export function sameCreatedClassroom(room,snapshot){
  return room.name===snapshot.name&&sameValue(comparableRoster(room.state.students),comparableRoster(snapshot.students))&&
    (room.expectedSize??null)===(snapshot.expectedSize??null)&&
    (snapshot.environmentConfigured!==true||((room.environmentTheme||'street')===snapshot.environmentTheme&&sameValue(room.environmentNames||{},snapshot.environmentNames||{})));
}

/** Explicit logout must not discard an account editor's unsubmitted work. */
export function hasUnsavedTeacherDrafts({rooms,accountId,activeId,rosterDrafts=new Map(),draftBases=new Map(),nameDrafts=new Map(),environmentDraft,wizardDraft}) {
  if(!accountId)return false;
  const owned=new Map(rooms.filter(room=>room.cloud?.accountId===accountId).map(room=>[room.id,room]));
  const differentRoster=(text,room)=>{
    const parsed=parseRoster(text),base=draftBases.get(room.id)?.students||manualClassroomStudents(room);
    return !!parsed.errors.length||!sameValue(parsed.students.map(({name,gender})=>({name,gender})),base.map(({name,gender})=>({name,gender})));
  };
  for(const [id,text] of rosterDrafts)if(owned.has(id)&&differentRoster(text,owned.get(id)))return true;
  for(const [id,name] of nameDrafts)if(owned.has(id)&&name.trim()!==owned.get(id).name)return true;
  const active=owned.get(activeId);
  if(active&&environmentDraft&&!sameValue(environmentDraft,{theme:active.environmentTheme||'street',names:active.environmentNames||{}}))return true;
  const wizard=wizardDraft&&!wizardDraft.finished&&owned.get(wizardDraft.roomId);
  return !!wizard&&(wizardDraft.name.trim()!==wizard.name||wizardDraft.theme!==(wizard.environmentTheme||'street')||differentRoster(wizardDraft.roster,wizard));
}

export function setupTeacherAccount({account,collection,cached=[],gameSync,activate,persist,onChange,onDiscard,onStateChange=()=>{},isBusy=()=>false,notify=()=>{},send=apiRequest,setTimer=setTimeout,clearTimer=clearTimeout,eventTarget=globalThis.window,visibilityTarget=globalThis.document}) {
  let loading=false,error='',epoch=0,linking=null,loadedAccount=null,timer=null,work=null,stopped=false,retryDelay=1000;
  const failures=new Map(),recovered=new Map();
  const identity=()=>account.getIdentityVersion?.()??account.getAccount()?.id;
  const signedIn=()=>!stopped&&account.getAccount()&&account.isSessionVerified?.()!==false;
  const eligible=room=>!room.state.isDemo&&!isPlaceholder(room)&&!room.cloud?.accountId;
  const current=(person,version,room)=>signedIn()&&person.id===account.getAccount()?.id&&version===identity()&&(!room||collection.classes.includes(room));
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const button=(text,fn,cls='secondary-btn')=>{const node=make('button',cls,text);node.type='button';node.addEventListener('click',()=>{Promise.resolve(fn()).catch(problem=>{error=problem.message;account.refresh();});});return node;};
  function changed(){onStateChange();account.refresh();}
  function cleanup(id) {
    let cachedRemoved=0;for(let i=cached.length-1;i>=0;i--)if(cached[i].cloud?.accountId!==id){onDiscard?.(cached[i]);cached.splice(i,1);cachedRemoved++;}
    const activeId=collection.activeId,removed=removeOtherAccountClassrooms(collection,id);
    for(const room of removed){gameSync.discard(room);onDiscard?.(room);}
    if(removed.length||cachedRemoved){persist();if(removed.length)onChange?.({removed,activeChanged:activeId!==collection.activeId});}
  }
  async function load(person,{refresh=false}={}) {
    const version=++epoch,identityVersion=identity();cleanup(person?.id);error='';
    if(!person){loadedAccount=null;loading=false;changed();return;}
    if(!refresh&&loadedAccount===person.id)return;
    loading=true;changed();
    try {
      const response=await send('/account/classes');if(version!==epoch||!current(person,identityVersion))return;
      const activeId=collection.activeId,owned=new Set(response.classes.map(item=>item.id));
      const revoked=collection.classes.filter(room=>room.cloud?.accountId===person.id&&!owned.has(room.cloud.id));
      for(const room of revoked){removeClassroom(collection,room.id);gameSync.discard(room);onDiscard?.(room);}
      for(const snapshot of response.classes){
        const room=restoreAccountClassroom(collection,snapshot,person.id,cached);
        try{await gameSync.refresh(room,{seed:{revision:snapshot.gameRevision||0,state:snapshot.gameState??null}});}catch(problem){error=problem.message;}
        if(version!==epoch||!current(person,identityVersion))return;
      }
      for(let i=cached.length-1;i>=0;i--)if(cached[i].cloud?.accountId===person.id){if(!owned.has(cached[i].cloud.id))onDiscard?.(cached[i]);cached.splice(i,1);}
      loadedAccount=person.id;persist();onChange?.({restored:true,activeChanged:activeId!==collection.activeId});
    }catch(problem){if(version===epoch)error=problem.message;}
    finally{if(version===epoch){loading=false;changed();}}
  }
  async function connectRoom(room,person,version) {
    if(!current(person,version,room)||!eligible(room))return;
    linking=room.id;failures.delete(room.id);changed();
    try {
      let snapshot;
      if(room.cloud){
        snapshot=await send(`/account/classes/${encodeURIComponent(room.cloud.id)}/link`,{method:'POST',body:{ownerToken:room.cloud.ownerToken}});
      }else{
        const result=await send('/classes',{method:'POST',body:createPayload(room)});
        if(!current(person,version,room))return;
        if(result.accountId!==person.id)throw new Error(t('Phiên đăng nhập đã thay đổi.'));
        snapshot=result.class;
        if(!sameCreatedClassroom(room,snapshot)){
          recovered.set(room.id,{snapshot,accountId:person.id});
          throw Object.assign(new Error(t('Lớp đã có cập nhật mới. Dữ liệu trên thiết bị này vẫn được giữ.')),{status:409});
        }
      }
      if(!current(person,version,room))return;
      if(snapshot.environmentConfigured===false){
        const environment=await send(`/classes/${encodeURIComponent(snapshot.id)}`,{method:'PATCH',body:{expectedRevision:snapshot.revision,environmentTheme:room.environmentTheme||'street',environmentNames:room.environmentNames||{}}});
        if(!current(person,version,room))return;snapshot={...snapshot,...environment};
      }
      bindClassroomAccount(room,snapshot,person.id);
      const duplicates=deduplicateConnectedClassroom(collection,room);
      for(const duplicate of duplicates)gameSync.discard(duplicate);
      persist();onChange?.({linked:room.id,snapshot,duplicates});
      await gameSync.refresh(room,snapshot.gameState!==undefined?{seed:{revision:snapshot.gameRevision||0,state:snapshot.gameState}}:{});
      if(current(person,version,room))persist();
    }catch(problem){if(current(person,version,room)){if(room.cloud?.accountId===person.id)failures.delete(room.id);else failures.set(room.id,{error:problem.message,blocked:problem.status===409});}throw problem;}
    finally{linking=null;changed();}
  }
  function schedule(delay=550,{retry=false}={}) {
    if(!signedIn())return;
    if(retry){for(const [id,failure] of failures)if(!failure.blocked)failures.delete(id);retryDelay=1000;}
    if(timer!==null)clearTimer(timer);
    timer=setTimer(()=>{timer=null;void flush().catch(()=>{});},delay);
  }
  async function flush() {
    if(work)return work;
    if(!signedIn())return;
    if(loading||isBusy()){schedule(800);return;}
    const person=account.getAccount(),version=identity();
    const run=(async()=>{
      if(loadedAccount!==person.id){await load(person);if(loadedAccount!==person.id||!current(person,version)){schedule(retryDelay);retryDelay=Math.min(30000,retryDelay*2);return;}}
      let retry=false;
      for(const room of [...collection.classes]){
        if(!current(person,version))return;
        const needsLink=eligible(room),needsLedger=room.cloud?.accountId===person.id&&['pending','error'].includes(gameSync.getStatus(room).status);
        if((!needsLink&&!needsLedger)||failures.get(room.id)?.blocked)continue;
        if(isBusy()){schedule(800);return;}
        try{if(needsLink)await connectRoom(room,person,version);else await gameSync.flush(room);}catch(problem){if(problem.status!==409)retry=true;}
      }
      if(retry&&current(person,version)){schedule(retryDelay);retryDelay=Math.min(30000,retryDelay*2);}else retryDelay=1000;
    })();
    work=run;try{return await run;}finally{if(work===run)work=null;if(signedIn()&&timer===null&&collection.classes.some(room=>eligible(room)&&!failures.get(room.id)?.blocked))schedule(1000);}
  }
  function getStatus(room){
    if(!signedIn()||room.state.isDemo||isPlaceholder(room))return gameSync.getStatus(room);
    if(linking===room.id)return {status:'saving',label:t('Đang lưu…')};
    const failure=failures.get(room.id);
    if(failure)return {status:failure.blocked?'conflict':'error',label:t('Chưa đồng bộ'),error:failure.error};
    if(eligible(room))return {status:'pending',label:t('Sẽ tự động lưu vào tài khoản')};
    return gameSync.getStatus(room);
  }
  async function useRecovered(room){
    if(isBusy()||linking||loading)return;
    const recovery=recovered.get(room.id),person=account.getAccount();if(!recovery||person?.id!==recovery.accountId)return;
    // The explicitly selected saved class replaces only this local version.
    bindClassroomAccount(room,recovery.snapshot,person.id);deduplicateConnectedClassroom(collection,room);failures.delete(room.id);recovered.delete(room.id);
    persist();onChange?.({linked:room.id,snapshot:recovery.snapshot});await gameSync.refresh(room);changed();
  }
  account.setContentRenderer((host,{account:person})=>{
    host.replaceChildren();
    if(!person){host.append(make('p','account-hint',t('Đăng nhập để tự động lưu lớp. Bạn vẫn có thể chơi không cần tài khoản.')));return;}
    const title=make('div','account-section-heading');title.append(make('h3','',t('Các lớp đã lưu')),button(t('Tải lại'),async()=>{if(isBusy()||linking||loading)return;await load(person,{refresh:true});schedule(0,{retry:true});},'text-btn'));host.append(title);
    host.append(make('p','account-hint',t('Lớp và thay đổi của bạn được tự động lưu khi đăng nhập.')));
    if(loading)host.append(make('p','account-hint',t('Đang tải lớp đã lưu…')));
    if(error){const note=make('p','form-error',error);note.setAttribute('role','alert');host.append(note);}
    const rooms=collection.classes.filter(room=>!room.state.isDemo&&!isPlaceholder(room));
    if(!rooms.length)host.append(make('p','account-hint',t('Chưa có lớp nào.')));
    for(const room of rooms){
      const row=make('div','account-class-row'),content=make('div','account-class-content'),status=getStatus(room);
      content.append(make('strong','',room.name),make('p','account-hint',status.label));row.append(content);
      const linked=room.cloud?.accountId===person.id;
      const action=button(t('Mở lớp'),()=>{if(isBusy()||loading||linking)return;activate(room.id);account.close();});
      action.dataset.accountClass=room.id;action.disabled=loading||!!linking;row.append(action);
      if(status.error)content.append(make('p','form-error',status.error));
      if(linked&&status.status==='conflict'){
        const actions=make('div','account-conflict-actions');
        actions.append(button(t('Dùng bản đã lưu'),async()=>{await gameSync.resolve(room,false);persist();onChange?.({resolved:room.id});account.refresh();}),button(t('Giữ bản trên thiết bị này'),async()=>{await gameSync.resolve(room,true);persist();onChange?.({resolved:room.id});account.refresh();}));content.append(actions);
      }else if(recovered.has(room.id))content.append(button(t('Dùng bản đã lưu'),()=>useRecovered(room),'text-btn'));
      else if(status.status==='error')content.append(button(t('Thử đồng bộ lại'),async()=>{failures.delete(room.id);if(linked)await gameSync.flush(room);else await flush();account.refresh();},'text-btn'));
      host.append(row);
    }
  });
  account.subscribe(async person=>{
    if(timer!==null){clearTimer(timer);timer=null;}failures.clear();recovered.clear();
    await load(person);if(person)schedule(0);
  });
  const wake=()=>{if(!visibilityTarget?.hidden)schedule(0,{retry:true});};
  eventTarget?.addEventListener('online',wake);eventTarget?.addEventListener('pageshow',wake);visibilityTarget?.addEventListener('visibilitychange',wake);
  return {schedule,flush,getStatus,refresh:async()=>{await load(account.getAccount(),{refresh:true});schedule(0,{retry:true});},
    isBusy:()=>loading||!!linking,isSaving:()=>!!linking,
    open(){if(isBusy()){notify(t('Chờ hoàn tất lượt UFO hoặc điểm danh trước khi sửa lớp.'));return;}account.open();},
    async beforeLogout(){await flush();if(loading||linking||collection.classes.some(room=>eligible(room)&&!failures.get(room.id)?.blocked))throw new Error(t('Chưa thể đăng xuất. Một số lớp chưa được lưu. Hãy thử lại khi có mạng.'));},
    destroy(){stopped=true;epoch++;if(timer!==null)clearTimer(timer);timer=null;eventTarget?.removeEventListener('online',wake);eventTarget?.removeEventListener('pageshow',wake);visibilityTarget?.removeEventListener('visibilitychange',wake);}
  };
}
