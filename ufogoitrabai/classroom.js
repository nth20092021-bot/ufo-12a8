import {normalizeEnvironmentTheme,sanitizeEnvironmentNames} from './classroom-environment.js';
import {t} from './i18n.js';
import { MAX_STUDENTS, cleanName, makeStudents, restoreState } from './core.js';
import { sanitizeAppearance } from './appearance.js';

export const CLASSROOMS_STORAGE_KEY='kroma.ufo.classrooms.v1';
export const MAX_CLASSROOMS=30;
export const normalizeExpectedSize=value=>Number.isInteger(value)&&value>=1&&value<=120?value:null;
const className=value=>cleanName(value).slice(0,40);
const emptyState=()=>({students:[],history:[],called:[],absent:[],count:1,noRepeat:true,sound:true,isDemo:false});
const defaultState=()=>({
  ...emptyState(),
  students:makeStudents(Array.from({length:28},(_,index)=>({
    name:`Học sinh ${String(index+1).padStart(2,'0')}`,
    gender:[18,24].includes(index)?'male':'female'
  })))
});
// Only an untouched workspace created by account removal is disposable. Any
// user edit makes it a normal guest class that must survive the next sign-in.
export const isAccountPlaceholder=room=>typeof room.accountPlaceholder==='string'&&room.accountPlaceholder===JSON.stringify({...room,accountPlaceholder:undefined});
export {normalizeEnvironmentTheme,sanitizeEnvironmentNames} from './classroom-environment.js';
/** Materialize the previous global setting once, then each room keeps its own. */
export function initializeClassroomEnvironments(collection,fallback='street',legacyNames={}){
  for(const room of collection.classes){
    room.environmentTheme=normalizeEnvironmentTheme(room.environmentTheme)||normalizeEnvironmentTheme(fallback)||'street';
    room.environmentNames=sanitizeEnvironmentNames(room.environmentNames===undefined?legacyNames:room.environmentNames);
    const streetNames=room.environmentNames.street;
    if(streetNames?.title==='PHỐ ẨM THỰC')streetNames.title='CHỦ TỊCH HỒ CHÍ MINH';
    if(streetNames?.subtitle==='BA ĐÌNH · HÀ NỘI · 2026')streetNames.subtitle='';
    const schoolNames=room.environmentNames.school;
    if(schoolNames?.title==='TRƯỜNG LƯƠNG VĂN CAN')schoolNames.title='TRƯỜNG THPT LƯƠNG VĂN CAN';
    if(schoolNames?.subtitle==='TRƯỜNG HỌC XANH · HÀ NỘI')schoolNames.subtitle='';
  }
}

function restoreClassState(data){
  if(!data||!Array.isArray(data.students))return null;
  // New classes may be saved before their first roster is entered.
  const restored=data.students.length?restoreState(JSON.stringify(data)):emptyState();
  if(!restored)return null;
  const savedStudents=new Map(data.students.map(student=>[student?.id,student]));
  for(const student of restored.students){const saved=savedStudents.get(student.id);if(typeof saved?.claimed==='boolean')student.claimed=saved.claimed;}
  if(!data.students.length){restored.count=Math.min(10,Math.max(1,Math.floor(Number(data.count)||1)));restored.noRepeat=data.noRepeat!==false;}
  const ids=new Set(restored.students.map(s=>s.id));
  restored.absent=Array.isArray(data.absent)?[...new Set(data.absent.filter(id=>ids.has(id)))]:[];
  restored.sound=true;
  return restored;
}

export function restoreClassrooms(raw,legacyState){
  try{
    const data=JSON.parse(raw),classes=[],ids=new Set();
    if(data&&Array.isArray(data.classes))for(const item of data.classes){
      if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id)||!className(item.name))continue;
      const state=restoreClassState(item.state);if(!state)continue;
      const classroom={id:item.id,name:className(item.name),expectedSize:normalizeExpectedSize(item.expectedSize),state};
      if(normalizeEnvironmentTheme(item.environmentTheme))classroom.environmentTheme=item.environmentTheme;
      if(item.environmentNames!==undefined)classroom.environmentNames=sanitizeEnvironmentNames(item.environmentNames);
      if(item.cloud&&typeof item.cloud.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(item.cloud.id)){
        const revision=Math.max(0,Math.floor(Number(item.cloud.revision)||0));
        if(typeof item.cloud.accountId==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(item.cloud.accountId)){
          classroom.cloud={id:item.cloud.id,accountId:item.cloud.accountId,revision,gameRevision:Math.max(0,Math.floor(Number(item.cloud.gameRevision)||0))};
          const baseline=item.cloud.gameBaseline;
          if(baseline&&Array.isArray(baseline.history)&&Array.isArray(baseline.called)&&Array.isArray(baseline.absent))classroom.cloud.gameBaseline=structuredClone(baseline);
        }else if(typeof item.cloud.ownerToken==='string'&&item.cloud.ownerToken.length>=32&&item.cloud.ownerToken.length<=256)classroom.cloud={id:item.cloud.id,ownerToken:item.cloud.ownerToken,revision};
      }
      // Rebase the marker after sanitization changes field order/defaults.
      if(!item.cloud&&isAccountPlaceholder(item))classroom.accountPlaceholder=JSON.stringify(classroom);
      classes.push(classroom);ids.add(item.id);
    }
    if(classes.length)return {version:1,activeId:ids.has(data.activeId)?data.activeId:classes[0].id,classes};
  }catch{/* A damaged or unavailable collection must not erase the previous roster. */}
  const restoredLegacy=restoreClassState(legacyState);
  const state=restoredLegacy?.students.length?restoredLegacy:defaultState();
  const id=crypto.randomUUID();
  return {version:1,activeId:id,classes:[{id,name:state.isDemo?t("Lớp mẫu"):t("Lớp của mình"),expectedSize:null,state}]};
}

export function getActiveClassroom(collection){return collection.classes.find(item=>item.id===collection.activeId)||collection.classes[0];}
/** Cloud membership is split by ownership; unknown cached ownership waits for sync. */
export function manualClassroomStudents(classroom,students=classroom.state.students){
  return classroom.cloud?students.filter(student=>student.claimed===false&&student.status!=='pending'):students;
}
function checkedName(collection,value,exceptId){
  const name=className(value);if(!name)throw new Error(t("Nhập tên lớp để dễ tìm lại nhé."));
  const key=name.normalize('NFC').toLocaleLowerCase('vi');
  if(collection.classes.some(item=>item.id!==exceptId&&item.name.normalize('NFC').toLocaleLowerCase('vi')===key))throw new Error(t("Tên lớp này đã có. Chọn một tên khác nhé."));
  return name;
}
export function addClassroom(collection,name){
  if(collection.classes.length>=MAX_CLASSROOMS)throw new Error(t("Tối đa {v0} lớp trên trình duyệt này.",{v0:MAX_CLASSROOMS}));
  const item={id:crypto.randomUUID(),name:checkedName(collection,name),expectedSize:null,environmentNames:{},state:emptyState()};
  collection.classes.push(item);collection.activeId=item.id;return item;
}
export function renameClassroom(collection,id,name){
  const item=collection.classes.find(item=>item.id===id);if(!item)throw new Error(t("Không tìm thấy lớp này."));
  item.name=checkedName(collection,name,id);return item;
}
export function selectClassroom(collection,id){
  const item=collection.classes.find(item=>item.id===id);if(!item)throw new Error(t("Không tìm thấy lớp này."));
  collection.activeId=item.id;return item;
}
/** Remove only the confirmed class; keep a blank local workspace when it was last. */
export function removeClassroom(collection,id){
  const index=collection.classes.findIndex(room=>room.id===id);
  if(index<0)throw new Error(t("Không tìm thấy lớp này."));
  const [removed]=collection.classes.splice(index,1),activeChanged=collection.activeId===id;
  if(!collection.classes.length){
    const blank=addClassroom(collection,t('Lớp của mình'));
    blank.environmentTheme=removed.environmentTheme||'street';
  }else if(activeChanged)collection.activeId=collection.classes[Math.min(index,collection.classes.length-1)].id;
  return {removed,activeChanged};
}
export function presentStudents(state){const absent=new Set(state.absent||[]);return state.students.filter(student=>!absent.has(student.id));}
export function availableStudents(state){const called=new Set(state.called);return presentStudents(state).filter(student=>!state.noRepeat||!called.has(student.id));}
export function pendingAbsentStudents(state){const absent=new Set(state.absent||[]),called=new Set(state.called);return state.students.filter(student=>absent.has(student.id)&&(!state.noRepeat||!called.has(student.id)));}
export function setStudentAbsent(state,id,absent){
  if(!state.students.some(student=>student.id===id))return false;
  const ids=new Set(state.absent||[]);if(absent)ids.add(id);else ids.delete(id);state.absent=[...ids];return true;
}
export function replaceClassRoster(state,rows){
  if(!Array.isArray(rows)||!rows.length||rows.length>MAX_STUDENTS)throw new Error(t("Danh sách cần từ 1 đến 120 bạn."));
  const clean=rows.map(row=>({name:cleanName(row.name),gender:row.gender||'male'}));
  if(clean.some(row=>!row.name))throw new Error(t("Mỗi bạn cần có tên."));
  const unchanged=clean.length===state.students.length&&clean.every((row,index)=>row.name===state.students[index].name&&row.gender===state.students[index].gender);
  if(unchanged)return false;
  // Reuse IDs for unchanged names, including separately indexed duplicates. This
  // retains attendance while an intentional roster edit starts a fresh round.
  const queues=new Map();
  for(const student of state.students){const key=JSON.stringify([student.name,student.gender]);if(!queues.has(key))queues.set(key,[]);queues.get(key).push(student);}
  // Reserve all exact matches first. A corrected gender must not take an ID
  // from a later same-named row whose name and gender are still unchanged.
  const matches=clean.map(row=>queues.get(JSON.stringify([row.name,row.gender]))?.shift());
  const matchedIds=new Set(matches.filter(Boolean).map(student=>student.id)),remainingByName=new Map();
  for(const student of state.students)if(!matchedIds.has(student.id)){
    if(!remainingByName.has(student.name))remainingByName.set(student.name,[]);
    remainingByName.get(student.name).push(student);
  }
  state.students=clean.map((row,index)=>{
    const previous=matches[index]||remainingByName.get(row.name)?.shift();
    return previous?{...previous,...row}:makeStudents([row])[0];
  });
  const ids=new Set(state.students.map(student=>student.id));
  state.absent=(state.absent||[]).filter(id=>ids.has(id));state.called=[];state.history=[];state.isDemo=false;return true;
}

/** Profile edits never restart the local round. Only active IDs enter the game. */
export function mergeCloudClassroom(classroom,snapshot){
  if(!classroom.cloud||snapshot.id!==classroom.cloud.id||!Array.isArray(snapshot.students)||snapshot.students.length>MAX_STUDENTS)return false;
  if(snapshot.revision<classroom.cloud.revision)return false;
  const students=snapshot.students.filter(s=>s.status==='active').map(s=>({id:s.id,name:cleanName(s.name),gender:['male','female','other'].includes(s.gender)?s.gender:'male',appearance:sanitizeAppearance(s.appearance),claimed:s.claimed===true}));
  const changed=JSON.stringify(classroom.state.students)!==JSON.stringify(students);
  classroom.name=className(snapshot.name)||classroom.name;classroom.cloud.revision=snapshot.revision;classroom.expectedSize=normalizeExpectedSize(snapshot.expectedSize);
  if(snapshot.environmentConfigured===true){
    classroom.environmentTheme=normalizeEnvironmentTheme(snapshot.environmentTheme)||'street';
    classroom.environmentNames=sanitizeEnvironmentNames(snapshot.environmentNames);
  }
  classroom.state.students=students;classroom.state.isDemo=false;
  const ids=new Set(students.map(s=>s.id));
  classroom.state.absent=(classroom.state.absent||[]).filter(id=>ids.has(id));
  // Keep the draw ledger exactly as recorded; remote profile changes are not a new round.
  return changed;
}

/** Match text rows against their original draft, reserving exact duplicate matches first. */
export function cloudRosterRows(rows,baseStudents,allStudents=baseStudents){
  // The textarea owns only teacher-entered profiles. The server preserves
  // appearance and private editing capability for retained existing IDs.
  const retained=allStudents.filter(student=>student.claimed===true||student.status==='pending');
  const retainedIds=new Set(retained.map(student=>student.id));
  baseStudents=baseStudents.filter(student=>!retainedIds.has(student.id)&&student.claimed!==true&&student.status!=='pending');
  const exact=new Map();
  for(const s of baseStudents){const key=JSON.stringify([s.name,s.gender]);if(!exact.has(key))exact.set(key,[]);exact.get(key).push(s);}
  const matches=rows.map(s=>exact.get(JSON.stringify([s.name,s.gender]))?.shift());
  const used=new Set(matches.filter(Boolean).map(s=>s.id)),byName=new Map();
  for(const s of baseStudents)if(!used.has(s.id)){if(!byName.has(s.name))byName.set(s.name,[]);byName.get(s.name).push(s);}
  const active=rows.map((s,i)=>{const old=matches[i]||byName.get(s.name)?.shift();return {...(old?{id:old.id}:{}),name:cleanName(s.name),gender:s.gender||'male'};});
  return [...active,...retained.map(({id,name,gender})=>({id,name,gender}))];
}

/** Rebase only our own metadata-only CAS update; a newer roster stays a conflict. */
export function rebaseDraftAfterMetadataSave(base, {classId, expectedRevision}, snapshot) {
  if (!base?.complete || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
      base.revision !== expectedRevision || snapshot?.id !== classId ||
      snapshot.revision !== expectedRevision + 1 || !Array.isArray(base.allStudents) ||
      !Array.isArray(snapshot.students) || JSON.stringify(base.allStudents) !== JSON.stringify(snapshot.students)) return null;
  return {...base, revision: snapshot.revision};
}

/** A wizard may receive new self-joined profiles while the teacher types. Only
 * adopt a newer snapshot when the manual profiles are byte-for-byte unchanged. */
export function rebaseDraftForJoinedProfiles(base,snapshot){
  if(!base?.complete||!Array.isArray(snapshot?.students)||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<base.revision)return null;
  const manual=snapshot.students.filter(student=>student.claimed===false&&student.status!=='pending');
  if(JSON.stringify(base.students)!==JSON.stringify(manual))return null;
  return {...base,revision:snapshot.revision,allStudents:structuredClone(snapshot.students)};
}
