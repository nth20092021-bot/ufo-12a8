import './modal-behavior.js';
import {setupKromaDownload} from './kroma-download.js';
import {createHeadlineCycle} from './result-headlines.js';
const nextResultHeadline=createHeadlineCycle();
import {t, locale, initializeLanguageUI, translateStatic} from './i18n.js';
import { setupAnalytics, trackEvent } from './analytics.js';
import { UFOScene } from './scene.js';
import { avatar } from './avatar.js';
import { Soundtrack, AIR_RAID_WARNING } from './sound.js';
import { ResultCelebration } from './result-celebration.js';
import { ResultPhones } from './result-phones.js';
import { createSponsorTyping } from './sponsor-typing.js';
import {createSuspensePreference} from './suspense.js';
import {setupResultActions} from './result-actions.js';
import {createJoinWelcome} from './join-welcome.js';
import {createIdleDialogue} from './idle-dialogue.js';
import {createAmbientBirds} from './ambient-birds.js';
import {createSceneDialogue} from './flight-dialogue.js';
import { createAttendanceSync, ATTENDANCE_PENDING_PREFIX } from './attendance-sync.js';
import { createAttendanceHistory } from './attendance-history.js';
import { createAttendanceController } from './attendance.js';
import { createStudentDetails } from './student-details.js';
import { setupActionMenus } from './action-menus.js';
import {createClassroomWizard} from './classroom-wizard.js';
import {createClassroomSwitcher} from './classroom-switcher.js';
import {createClassroomSettings} from './classroom-settings.js';
import { setupClassSharing } from './sharing.js';
import { apiRequest, copyText } from './api-client.js';
import { createShareUrl, readSharedSettings } from './share-link.js';
import {createAccountController} from './account.js';
import {setupTeacherAccount,quarantineAccountClassrooms,accountSafeCollection,flushBeforeAccountLogout,deduplicateConnectedClassroom,hasUnsavedTeacherDrafts} from './teacher-account.js';
import {createGameStateSync} from './game-state-sync.js';
import {createTeacherLive} from './teacher-live.js';
import { STORAGE_KEY, parseRoster, restoreState, pickStudents, genderLabel } from './core.js';
import { CLASSROOMS_STORAGE_KEY, MAX_CLASSROOMS, restoreClassrooms, getActiveClassroom, manualClassroomStudents, addClassroom, renameClassroom, selectClassroom, removeClassroom, presentStudents, availableStudents, pendingAbsentStudents, setStudentAbsent, replaceClassRoster, mergeCloudClassroom, cloudRosterRows, rebaseDraftAfterMetadataSave, initializeClassroomEnvironments, rebaseDraftForJoinedProfiles } from './classroom.js';

const $ = id => document.getElementById(id);
const sceneCaptionActions=$('sceneCaptionActions'),sceneAttendanceBtn=$('sceneAttendanceBtn'),sceneEditBtn=$('sceneEditBtn'),sceneQrBtn=$('sceneQrBtn');
const languageSelect=initializeLanguageUI($('languageHost'),{beforeChange:preserveLanguageDrafts});
setupKromaDownload();
const sponsorTyping=createSponsorTyping(document.querySelector('.result-sponsor-question'));
const suspensePreference=createSuspensePreference({isBusy:()=>isBusy()||localWriteBusy||codeOpening});
$('suspenseLevel').value=suspensePreference.getLevel();
$('suspenseLevel').addEventListener('change',()=>{
  const choice=suspensePreference.setLevel($('suspenseLevel').value);
  $('suspenseLevel').value=choice.level;
  if(!choice.blocked&&!choice.saved)toast(t('Chưa lưu được lựa chọn. Mức này vẫn dùng trong phiên hiện tại.'));
});
let legacyState;
try { legacyState = restoreState(localStorage.getItem(STORAGE_KEY)); } catch { /* Private storage may be disabled. */ }
legacyState ||= {students:[],history:[],called:[],count:1,noRepeat:true,sound:true,isDemo:false};
let classrooms;
try{classrooms=restoreClassrooms(localStorage.getItem(CLASSROOMS_STORAGE_KEY),legacyState);}catch{classrooms=restoreClassrooms(null,legacyState);}
// Verify the session before showing any account-owned cached roster on a shared device.
const cachedAccountRooms=quarantineAccountClassrooms(classrooms);
let account=null,teacherAccount=null,gameSync=null,teacherLive=null,accountReady=false;
let state=getActiveClassroom(classrooms).state;
// Older saved mute preferences no longer apply: each new flight has sound.
state.sound=true;
const classroomDrafts=new Map(),draftBases=new Map();let classroomNameMode='new', sharing=null;
let activeTab='roster', running=false, resultOpen=false, toastTimer, draft=[], parseErrors=[], lastResult=[], storageWarning=false;
let localWriteBusy=false,codeOpening=false,attendanceController=null,attendanceHistory=null,activeAttendanceRecord=null,studentDetails=null,actionMenus=null,classroomWizard=null,classroomSwitcher=null,classroomSettings=null,joinWelcome=null;
const classroomNameDrafts=new Map();
const LANGUAGE_DRAFTS_KEY='kroma.ufo.language-drafts.v1';
try{
  const saved=JSON.parse(sessionStorage.getItem(LANGUAGE_DRAFTS_KEY)||'null');
  sessionStorage.removeItem(LANGUAGE_DRAFTS_KEY);
  if(saved&&Array.isArray(saved.drafts))for(const [id,value] of saved.drafts){
    if(classrooms.classes.some(room=>room.id===id)&&typeof value==='string')classroomDrafts.set(id,value);
  }
  if(saved&&Array.isArray(saved.bases))for(const [id,value] of saved.bases){
    if(classroomDrafts.has(id)&&value&&Array.isArray(value.students)&&Array.isArray(value.allStudents))draftBases.set(id,value);
  }
}catch{/* Ignore damaged drafts; saved classroom data remains independent. */}
function preserveLanguageDrafts(){
  if(isBusy()||resultOpen||localWriteBusy||codeOpening||sharing?.isMutating())return false;
  rememberClassroomDraft();
  try{
    localStorage.setItem(CLASSROOMS_STORAGE_KEY,JSON.stringify(accountSafeCollection(classrooms,cachedAccountRooms)));
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    for(const entry of attendanceSync.pending())localStorage.setItem(ATTENDANCE_PENDING_PREFIX+entry.id,JSON.stringify(entry));
  }catch{toast(t('Không lưu được dữ liệu. Giữ trang mở và thử đổi ngôn ngữ sau.'));return false;}
  if(classroomDrafts.size){
    try{sessionStorage.setItem(LANGUAGE_DRAFTS_KEY,JSON.stringify({drafts:[...classroomDrafts],bases:[...draftBases]}));}
    catch{toast(t('Không lưu được bản nháp. Hãy lưu danh sách trước khi đổi ngôn ngữ.'));return false;}
  }
  return true;
}

function isBusy(){return running||!!attendanceController?.isRunning()||!!teacherAccount?.isSaving();}
let openingOwnerLink=new URLSearchParams(location.hash.slice(1)).has('owner');
const scene = new UFOScene($('scene'));
const ENVIRONMENT_STORAGE_KEY='ufo-tra-bai:environment:v1';
const ENVIRONMENTS={
  street:{label:t("Phố nhỏ"),title:t("CHỦ TỊCH HỒ CHÍ MINH"),subtitle:''},
  school:{label:t("Sân trường"),title:t("TRƯỜNG THPT LƯƠNG VĂN CAN"),subtitle:''},
  park:{label:t("Công viên"),title:t("HỒ GƯƠM"),subtitle:t("THĂNG LONG · HÀ NỘI")},
  seaside:{label:t("Phố biển"),title:t("VỊNH HẠ LONG"),subtitle:t("DI SẢN VIỆT NAM")}
};
let settingsTab='name',environment=restoreEnvironment(),environmentDraft=null;
initializeClassroomEnvironments(classrooms,environment.theme,environment.names);
environment.theme=getActiveClassroom(classrooms).environmentTheme;
environment.names=structuredClone(getActiveClassroom(classrooms).environmentNames);
const sharedSettings=readSharedSettings(location.hash);
if(sharedSettings){
  const room=getActiveClassroom(classrooms);
  environment={theme:sharedSettings.theme,names:{...environment.names,...structuredClone(sharedSettings.names)}};
  room.environmentTheme=sharedSettings.theme;
  room.environmentNames=structuredClone(environment.names);
  state.count=sharedSettings.count;
  state.noRepeat=sharedSettings.noRepeat;
  suspensePreference.setLevel(sharedSettings.suspense);
}
function restoreEnvironment(){
  const restored={theme:'street',names:{}};
  try{
    const saved=JSON.parse(localStorage.getItem(ENVIRONMENT_STORAGE_KEY));
    if(!saved||typeof saved!=='object')return restored;
    if(Object.hasOwn(ENVIRONMENTS,saved.theme))restored.theme=saved.theme;
    for(const theme of Object.keys(ENVIRONMENTS)){
      const names=saved.names?.[theme];
      if(!names||typeof names!=='object')continue;
      restored.names[theme]={};
      for(const [key,max] of [['title',32],['subtitle',48]])if(typeof names[key]==='string')restored.names[theme][key]=names[key].replace(/[\r\n]/g,' ').slice(0,max);
    }
  }catch{/* Keep the default scenery if storage is unavailable or invalid. */}
  return restored;
}
function currentEnvironment(){
  const defaults={...ENVIRONMENTS[environment.theme],...(environment.theme==='school'?{subtitle:getActiveClassroom(classrooms).name}:{})},names=environment.names[environment.theme]||{};
  return {theme:environment.theme,title:names.title?.trim()||defaults.title,subtitle:names.subtitle?.trim()||defaults.subtitle};
}
function saveEnvironment(){
  try{localStorage.setItem(ENVIRONMENT_STORAGE_KEY,JSON.stringify(environment));}
  catch{if(!storageWarning){toast(t("Trình duyệt không cho lưu. Cài đặt vẫn dùng được trong phiên này."));storageWarning=true;}}
}
function applyEnvironment(){
  const config=currentEnvironment();scene.setEnvironment(config);
  $('scene').setAttribute('aria-label',t("{v0} hoạt hình với học sinh có tên và UFO bay đến chọn ngẫu nhiên",{v0:ENVIRONMENTS[config.theme].label}));
  $('environmentTitlePreview').textContent=config.title;$('environmentSubtitlePreview').textContent=config.subtitle;
  $('environmentPreviewBoard').dataset.theme=config.theme;
}
function renderEnvironmentSettings(){
  const selected=environmentDraft||environment;
  const defaults={...ENVIRONMENTS[selected.theme],...(selected.theme==='school'?{subtitle:getActiveClassroom(classrooms).name}:{})},names=selected.names[selected.theme]||{};
  for(const input of document.querySelectorAll('[name="environmentTheme"]'))input.checked=input.value===selected.theme;
  $('environmentTitle').value=names.title??defaults.title;$('environmentTitle').placeholder=defaults.title;
  $('environmentSubtitle').value=names.subtitle??defaults.subtitle;$('environmentSubtitle').placeholder=defaults.subtitle;
  $('environmentTitlePreview').textContent=names.title?.trim()||defaults.title;
  $('environmentSubtitlePreview').textContent=names.subtitle?.trim()||defaults.subtitle;
  $('environmentPreviewBoard').dataset.theme=selected.theme;
}
function setSettingsTab(tab){classroomSettings?.showTab(tab==='class'?'roster':tab);}
function beginEnvironmentDraft(){environmentDraft=structuredClone(environment);renderEnvironmentSettings();}
for(const input of document.querySelectorAll('[name="environmentTheme"]'))input.addEventListener('change',()=>{
  if(isBusy()||!input.checked)return;environmentDraft||=structuredClone(environment);environmentDraft.theme=input.value;renderEnvironmentSettings();
});
for(const [id,key] of [['environmentTitle','title'],['environmentSubtitle','subtitle']])$(id).addEventListener('input',()=>{
  if(isBusy())return;environmentDraft||=structuredClone(environment);environmentDraft.names[environmentDraft.theme]||={};environmentDraft.names[environmentDraft.theme][key]=$(id).value;
  const config=environmentDraft.names[environmentDraft.theme],defaults={...ENVIRONMENTS[environmentDraft.theme],...(environmentDraft.theme==='school'?{subtitle:getActiveClassroom(classrooms).name}:{})};
  $('environmentTitlePreview').textContent=config.title?.trim()||defaults.title;$('environmentSubtitlePreview').textContent=config.subtitle?.trim()||defaults.subtitle;
});
$('resetEnvironmentSign').addEventListener('click',()=>{
  if(isBusy())return;environmentDraft||=structuredClone(environment);delete environmentDraft.names[environmentDraft.theme];renderEnvironmentSettings();
});
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
scene.setReducedMotion(motionQuery.matches);
const resultCelebration = new ResultCelebration($('resultFireworks'),{foregroundCanvas:$('resultConfettiFront'),reducedMotion:motionQuery.matches});
const resultPhones=new ResultPhones(document.querySelector('.result-sponsor-phone-stage'),{reducedMotion:motionQuery.matches});
motionQuery.addEventListener('change',e=>{scene.setReducedMotion(e.matches);resultCelebration.setReducedMotion(e.matches);resultPhones.setReducedMotion(e.matches);});
window.addEventListener('resize',()=>{resultCelebration.resize();resultPhones.resize();});

const audio=new Soundtrack();audio.enabled=true;
let pageActive=true,pendingWarningPreparation=null,warningAudioReady=false,pausedWarningTail=null;
let peaceAudioUnlocked=false,idleDialogue=null,welcomeSpeaking=false,idleSpeaking=false;
let peaceAudioStarted=false,startupDialoguePending=true,speechNeedsGesture=false;
let resultSpeaking=false,resultSoundArmed=false;
let ambientBirds=null,flightDialogue=null,vendorDialogue=null,flightSpeaking=false,vendorSpeaking=false;
const enableAudioButton=$('enableAudioBtn'),enableAudioLabel=$('enableAudioLabel');
const characterSpeaking=()=>welcomeSpeaking||idleSpeaking||vendorSpeaking||flightSpeaking;
const canContinueDialogue=()=>pageActive&&!document.hidden&&audio.enabled;
function drainCharacters(){return Promise.all([idleDialogue?.drain(),vendorDialogue?.drain(),flightDialogue?.drain(),joinWelcome?.drain()]);}
// Dialogs and editor saves do not change the scene's audio. Only playback,
// speech and actual page lifecycle transitions decide which soundtrack runs.
const peaceful=()=>pageActive&&!document.hidden&&!pausedWarningTail&&!running&&!resultSpeaking&&(!resultOpen||(resultSoundArmed&&!audio.foregroundBusy))&&!scene.run;
function updateAmbientDucking(){const speaking=characterSpeaking();if(speaking)audio.stopPets();audio.setAmbientDucking(speaking);audio.setSceneSpeechDucking(speaking);audio.setSpeechDucking(speaking||resultSpeaking);ambientBirds?.sync();}
function syncPeaceAudio(){
  const quiet=peaceful();
  peaceAudioUnlocked=audio.ready;
  audio.setAmbient(peaceAudioUnlocked&&quiet);
  enableAudioButton.hidden=!quiet||(peaceAudioUnlocked&&!speechNeedsGesture)||['unavailable','closed','muted'].includes(audio.playbackState);
  enableAudioLabel.textContent=t(peaceAudioUnlocked?'Bật lời thoại':'Bật âm thanh');
  if(!canContinueDialogue()){idleDialogue?.stop();vendorDialogue?.stop();flightDialogue?.stop();joinWelcome?.cancel();}
  else if(!quiet){idleDialogue?.drain();vendorDialogue?.drain();}
  updateAmbientDucking();
  if(peaceAudioStarted&&peaceAudioUnlocked&&quiet&&startupDialoguePending&&!speechNeedsGesture&&!characterSpeaking()&&!scene.vendorConversationActive&&!joinWelcome?.isBusy())scene.requestIdleDialogue();
}
function onSceneSpeechBlocked(error){
  if(error==='not-allowed'){speechNeedsGesture=true;startupDialoguePending=true;syncPeaceAudio();}
}
idleDialogue=createIdleDialogue({locale,canContinue:canContinueDialogue,isAllowed:()=>peaceAudioUnlocked&&!speechNeedsGesture&&audio.enabled&&peaceful()&&!vendorSpeaking&&!flightSpeaking&&!welcomeSpeaking&&!scene.vendorConversationActive&&!joinWelcome?.isBusy(),onSpeaking:value=>{idleSpeaking=value;updateAmbientDucking();},onBlocked:onSceneSpeechBlocked});
vendorDialogue=createSceneDialogue({locale,canContinue:canContinueDialogue,minGapMs:1500,volume:.55,isAllowed:()=>peaceAudioUnlocked&&!speechNeedsGesture&&audio.enabled&&peaceful()&&!idleSpeaking&&!flightSpeaking&&!welcomeSpeaking&&!joinWelcome?.isBusy(),onSpeaking:value=>{vendorSpeaking=value;updateAmbientDucking();},onBlocked:onSceneSpeechBlocked});
flightDialogue=createSceneDialogue({locale,canContinue:canContinueDialogue,minGapMs:1000,isAllowed:()=>pageActive&&!document.hidden&&audio.ready&&running&&!!scene.run&&!resultOpen&&!resultSpeaking&&!idleSpeaking&&!vendorSpeaking&&!welcomeSpeaking&&!joinWelcome?.isBusy(),onSpeaking:value=>{
  flightSpeaking=value;updateAmbientDucking();
  if(value){audio.stopPets();audio.stopBirds();}
},onBlocked:onSceneSpeechBlocked});
scene.onIdleDialogue=cue=>{const accepted=idleDialogue.receive(cue);if(accepted)startupDialoguePending=false;return accepted;};
scene.onVendorDialogue=cue=>{
  if(!peaceAudioUnlocked||speechNeedsGesture||!peaceful()||idleSpeaking||flightSpeaking||welcomeSpeaking||joinWelcome?.isBusy())return false;
  return vendorDialogue.receive(cue);
};
scene.onFlightDialogue=cue=>flightDialogue.receive(cue);
scene.pickIdleDialogue=key=>idleDialogue.pick(key);
scene.onPetSound=cue=>{if(peaceAudioUnlocked&&peaceful()&&!characterSpeaking()&&!joinWelcome?.isBusy())audio.pet(cue.species,cue.variant);};
joinWelcome=createJoinWelcome({
  getClassroomId:()=>getActiveClassroom(classrooms).cloud?.id||null,
  isBlocked:()=>!accountReady||running||resultOpen||resultSpeaking||idleSpeaking||vendorSpeaking||flightSpeaking||!!scene.run,
  canContinue:canContinueDialogue,
  isVisible:()=>pageActive&&!document.hidden,
  hasStudent:id=>scene.students.some(person=>person.id===id&&!person.removed),
  welcomeStudent:(id,options)=>scene.welcomeStudent(id,options),
  cancelWelcome:id=>scene.cancelWelcome(id),
  onWelcome:({message})=>{caption(message);announce(message);},
  onSpeaking:value=>{welcomeSpeaking=value;updateAmbientDucking();},
  translate:t,locale,
});
const resultActions=setupResultActions({audio,toast,waitForSpeech:()=>characterSpeaking()?drainCharacters():null,onSpeaking:value=>{resultSpeaking=value;syncPeaceAudio();}});
ambientBirds=createAmbientBirds({audio,isAllowed:()=>peaceAudioUnlocked&&peaceful()&&!characterSpeaking()&&!joinWelcome?.isBusy()});
function startPeaceAudio(){
  if(!peaceAudioStarted||!pageActive||document.hidden)return;
  // Creating a context allows autoplay where permitted, without leaving a
  // blocked resume promise ahead of the visitor's first genuine gesture.
  if(!audio.context)audio.init({resume:false});
  syncPeaceAudio();
}
window.addEventListener('pageshow',()=>{pageActive=true;teacherLive?.resume();if(resultOpen&&!document.hidden){scene.beginDaylightReturn();if(!resultPhones.active)resultPhones.start();}startPeaceAudio();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)startPeaceAudio();});
let lastAudioTouch=-Infinity;
function unlockPeaceAudio(event){
  if(!event.isTrusted||event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.type==='keydown'&&['Shift','Control','Alt','Meta','Escape'].includes(event.key))return;
  const audioButton=enableAudioButton.contains(event.target);
  // The explicit button owns its native gesture; the document listener is
  // only a fallback for other controls, not a second resume for this tap.
  if(audioButton&&event.currentTarget===document&&event.type==='click')return;
  if(event.type==='touchend'){
    if(event.touches?.length)return;
    lastAudioTouch=performance.now();
  }else if(audioButton&&event.type==='click'&&performance.now()-lastAudioTouch<800)return;
  speechNeedsGesture=false;idleDialogue.prepareRetry();
  audio.init({userGesture:true});syncPeaceAudio();
}
enableAudioButton.addEventListener('touchend',unlockPeaceAudio,{passive:true});
enableAudioButton.addEventListener('click',unlockPeaceAudio);
document.addEventListener('click',unlockPeaceAudio);
document.addEventListener('keydown',unlockPeaceAudio);
document.addEventListener('close',()=>{joinWelcome?.flush();syncPeaceAudio();},true);
const peaceDialogObserver=new MutationObserver(syncPeaceAudio);
peaceDialogObserver.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
function announce(text){$('announcer').textContent=text;}
function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
function save(sync=true){try{localStorage.setItem(CLASSROOMS_STORAGE_KEY,JSON.stringify(accountSafeCollection(classrooms,cachedAccountRooms)));localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{if(!storageWarning){toast(t("Trình duyệt không cho lưu. Danh sách vẫn dùng được trong phiên này."));storageWarning=true;}}if(sync){gameSync?.schedule(getActiveClassroom(classrooms));teacherAccount?.schedule();}}
async function shareSettingsLink(){
  if(isBusy()||localWriteBusy||codeOpening||resultOpen)return;
  const settings={
    version:1,theme:environment.theme,names:environment.names,
    count:state.count,noRepeat:state.noRepeat,suspense:suspensePreference.getLevel(),
  };
  const url=createShareUrl(location,settings);
  history.replaceState(null,'',url);
  try{await copyText(url);toast(t('Đã sao chép link chia sẻ cấu hình. Link không chứa danh sách học sinh.'));}
  catch(error){toast(error.message||t('Không sao chép được link chia sẻ.'));}
}
function available(){return availableStudents(state);}
function visibleStudents(){return attendanceController?.isRunning()?state.students:available();}
function openStudentDetails(studentId,returnFocus){
  if(isBusy()||openingOwnerLink||localWriteBusy||codeOpening||sharing?.isMutating())return;
  studentDetails?.open(studentId,{returnFocus});
}
async function openStudentCard(studentId){
  if(isBusy()||openingOwnerLink||localWriteBusy||codeOpening||!sharing||sharing.isMutating())return;
  $('rosterDialog').close();studentDetails?.close();codeOpening=true;render();
  try{await sharing.showStudentCard(studentId);}
  catch(error){toast(error.message||t("Chưa mở được thẻ nhân vật."));}
  finally{codeOpening=false;render();}
}
function classroomCaption(){
  if(!state.students.length)return t('{name} chưa có học sinh.',{name:getActiveClassroom(classrooms).name});
  if(!available().length)return needsAttendance()?t('Kiểm tra điểm danh để bắt đầu chuyến bay nhé.'):t('Cả lớp đã được gọi. Bắt đầu vòng mới nhé!');
  return t('{v0} đã sẵn sàng. Chờ UFO thôi!',{v0:getActiveClassroom(classrooms).name});
}
function needsAttendance(){return !!state.students.length&&(!presentStudents(state).length||pendingAbsentStudents(state).length>0);}
function row(student,index,called=false,attendance=false){
  const el=document.createElement('div');el.className='student-row'+(called?' called':'');
  const cardButton=document.createElement('button');cardButton.type='button';cardButton.className='student-card-trigger';cardButton.title=t('Xem thông tin của {name}',{name:student.name});cardButton.setAttribute('aria-label',t('Xem thông tin của {name}',{name:student.name}));cardButton.disabled=isBusy()||localWriteBusy||codeOpening;
  const name=document.createElement('span');name.className='student-name';name.textContent=student.name;cardButton.append(avatar(student,index),name);el.append(cardButton);
  cardButton.addEventListener('click',()=>openStudentDetails(student.id,cardButton));
  const end=document.createElement('span');end.className=called?'called-badge':'student-number';end.textContent=called?t("Đã gọi"):String(index+1).padStart(2,'0');el.append(end);
  if(attendance){
    const absent=(state.absent||[]).includes(student.id);el.classList.toggle('absent',absent);
    const label=document.createElement('label');label.className='attendance-control';label.title=t("Bạn vắng sẽ không được UFO gọi");
    const input=document.createElement('input');input.type='checkbox';input.className='attendance-input';input.checked=absent;input.disabled=isBusy();input.dataset.studentId=student.id;input.setAttribute('aria-label',t('{name} vắng',{name:student.name}));
    input.addEventListener('change',()=>{
      if(isBusy())return;setStudentAbsent(state,student.id,input.checked);save();scene.setStudents(visibleStudents(),{preserveMotion:true});render();
      announce(input.checked?t('{name} đã được đánh dấu vắng.',{name:student.name}):t('{name} đã trở lại danh sách có mặt.',{name:student.name}));
      [...document.querySelectorAll('.attendance-input')].find(el=>el.dataset.studentId===student.id)?.focus({preventScroll:true});
    });
    const text=document.createElement('span');text.textContent=t("Vắng");label.append(input,text);el.append(label);
  }
  return el;
}
function renderRoster(){
  $('attendanceHint').hidden=activeTab!=='roster';
  const box=$('rosterContent');box.replaceChildren();box.classList.toggle('history-view',activeTab==='history');box.setAttribute('aria-labelledby',activeTab==='history'?'historyTab':'rosterTab');
  $('rosterTab').classList.toggle('active',activeTab==='roster');$('historyTab').classList.toggle('active',activeTab==='history');
  $('rosterTab').setAttribute('aria-selected',activeTab==='roster');$('historyTab').setAttribute('aria-selected',activeTab==='history');
  if(activeTab==='roster'){const called=new Set(state.called);state.students.forEach((s,i)=>box.append(row(s,i,state.noRepeat&&called.has(s.id),true)));if(!state.students.length){const empty=document.createElement('p');empty.className='roster-empty';empty.textContent=t("Lớp này chưa có danh sách. Thêm học sinh trong Cài đặt nhé.");box.append(empty);}}
  else if(!state.history.length){box.innerHTML='<div class="empty-history"><span>☄</span>Chưa có ai lên tàu.<br>Chuyến bay đầu tiên đang chờ!</div>';translateStatic(box);}
  else{state.history.forEach((h,index)=>{const group=document.createElement('div');group.className='history-group';const header=document.createElement('div');header.className='history-title';const label=document.createElement('span');label.textContent=t("Lượt {v0}",{v0:state.history.length-index});const time=document.createElement('span');time.textContent=new Date(h.time).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'});header.append(label,time);group.append(header);h.ids.forEach(id=>{const s=state.students.find(s=>s.id===id);if(s)group.append(row(s,state.students.indexOf(s)));});box.append(group);});}
}
function updateParticipantCount(snapshot=sharing?.getSnapshot()){
  const room=getActiveClassroom(classrooms),live=snapshot?.id===room.cloud?.id?snapshot:null;
  const count=live?live.students.filter(student=>student.status==='active').length:state.students.length;
  $('participantCount').textContent=t('{count} học sinh',{count});
  $('participantCount').title=t("Số học sinh trong danh sách lớp, gồm nhập tay và tự tham gia");
}
function render(){
  teacherLive?.refresh();
  const left=available().length,present=presentStudents(state).length,absent=state.students.length-present;
  const room=getActiveClassroom(classrooms),busy=isBusy(),takingAttendance=!!attendanceController?.isRunning();
  updateParticipantCount();
  if(languageSelect)languageSelect.disabled=busy||localWriteBusy||codeOpening||openingOwnerLink;
  $('suspenseLevel').disabled=busy||localWriteBusy||codeOpening;
  $('suspenseLevel').value=suspensePreference.getLevel();
  $('classroomHeading').textContent=room.name;
  $('classMeta').textContent=t('{present} có mặt · {absent} vắng',{present,absent})+(state.isDemo?' · '+t('Danh sách mẫu'):'');
  $('attendanceHint').hidden=activeTab!=='roster';
  renderClassroomSettings();
  $('rosterBadge').textContent=state.students.length;$('historyBadge').textContent=state.called.length;
  // Polling may repaint while a teacher is typing the next draw size.
  if(document.activeElement!==$('drawCount'))$('drawCount').value=state.count;
  $('noRepeat').checked=state.noRepeat;
  $('teacherAccountBtn').disabled=!!teacherAccount?.isBusy()||busy||localWriteBusy||codeOpening||!accountReady;
  $('drawBtn').disabled=!accountReady||busy||openingOwnerLink||codeOpening||localWriteBusy||!left;
  $('drawLabel').textContent=takingAttendance?t("Đang điểm danh…"):running?t("UFO đang gọi tên…"):!state.students.length?t("Chưa có danh sách"):!present?t("Chưa có bạn có mặt"):!left?(needsAttendance()?t("Kiểm tra điểm danh"):t("Đã gọi hết lượt")):t("Bắt đầu");
  ['editBtn','editClassroomBtn','drawCount','noRepeat','resetBtn','environmentTitle','environmentSubtitle','resetEnvironmentSign','classroomSelect','renameClassroomBtn','classroomName','saveClassroomName','cancelClassroomName','rosterAttendanceHistoryBtn'].forEach(id=>$(id).disabled=busy||localWriteBusy||codeOpening);
  for(const control of $('editorForm').querySelectorAll('input,textarea,select,button'))control.disabled=busy||localWriteBusy||codeOpening||(control.tagName==='SELECT'&&parseErrors.length>0);
  for(const input of document.querySelectorAll('[name="environmentTheme"]'))input.disabled=isBusy()||localWriteBusy;
  $('newClassroomBtn').disabled=busy||localWriteBusy||codeOpening||classrooms.classes.length>=MAX_CLASSROOMS;
  $('createClassroomMenuBtn').disabled=$('newClassroomBtn').disabled||openingOwnerLink;
  $('quickAddBtn').disabled=$('classMenuBtn').disabled=busy||localWriteBusy||codeOpening||openingOwnerLink;
  $('quickAddBtn').classList.toggle('needs-classroom',accountReady&&!busy&&!localWriteBusy&&!codeOpening&&!openingOwnerLink&&!classrooms.classes.some(item=>!item.state.isDemo));
  $('rosterAttendanceBtn').disabled=busy||openingOwnerLink||localWriteBusy||codeOpening||!state.students.length;
  sceneAttendanceBtn.disabled=classroomInteractionBlocked()||!state.students.length||!sharing;
  const empty=!state.students.length;
  $('studentDetailsHint').hidden=busy||!visibleStudents().length;$('scene').style.cursor='';
  $('emptyRosterNotice').hidden=!empty||busy||resultOpen||openingOwnerLink||!accountReady;
  const emptyTitle=t('{name} chưa có học sinh.',{name:room.name});
  if($('emptyRosterTitle').textContent!==emptyTitle)$('emptyRosterTitle').textContent=emptyTitle;
  $('emptyRosterEditBtn').disabled=$('emptyRosterInviteBtn').disabled=sceneEditBtn.disabled=sceneQrBtn.disabled=classroomInteractionBlocked();
  if(!$('emptyRosterNotice').hidden)$('scene').setAttribute('aria-describedby','emptyRosterTitle');
  else if(!$('studentDetailsHint').hidden)$('scene').setAttribute('aria-describedby','studentDetailsHint');
  else $('scene').removeAttribute('aria-describedby');
  if(empty){
    const count=$('participantCount'),copy=document.querySelector('.empty-roster-copy');if(count.parentElement!==copy)copy.append(count);
    $('sceneCaption').replaceChildren();
  }else if(!$('sceneCaption').querySelector('.scene-caption-message'))caption(classroomCaption());
  $('resetBtn').hidden=busy;$('resetBtn').disabled ||= empty;$('sceneCaption').hidden=empty||takingAttendance||!$('sceneCaption').textContent.trim();
  $('gamePanel').classList.toggle('busy',running);document.body.classList.toggle('is-running',running);
  renderRoster();studentDetails?.refresh();classroomSwitcher?.refresh();classroomSettings?.refresh();classroomWizard?.refresh();actionMenus?.refresh();joinWelcome?.flush();syncPeaceAudio();
}
function caption(text){
  const count=$('participantCount');
  if(!state.students.length){const copy=document.querySelector('.empty-roster-copy');if(count.parentElement!==copy)copy.append(count);$('sceneCaption').hidden=true;$('sceneCaption').replaceChildren();return;}
  $('sceneCaption').hidden=!!attendanceController?.isRunning();
  const message=document.createElement('span');message.className='scene-caption-message';
  const star=document.createElement('span');star.className='caption-spark';star.textContent='✦';message.append(star,document.createTextNode(' '+text));
  $('sceneCaption').replaceChildren(message,count,sceneCaptionActions);
}
function setCount(value){if(isBusy())return;state.count=Math.min(10,Math.max(1,Math.floor(Number(value)||1)));$('drawCount').value=state.count;save();render();}
$('drawCount').addEventListener('input',e=>{const value=Number(e.target.value);if(!isBusy()&&Number.isInteger(value)&&value>=1&&value<=10){state.count=value;save();}});
$('drawCount').addEventListener('change',e=>setCount(e.target.value));
$('noRepeat').addEventListener('change',e=>{if(isBusy())return;joinWelcome?.drain();state.noRepeat=e.target.checked;save();scene.setStudents(visibleStudents());render();});
$('rosterTab').addEventListener('click',()=>{activeTab='roster';renderRoster();});$('historyTab').addEventListener('click',()=>{activeTab='history';renderRoster();});
for(const [current,other] of [['rosterTab','historyTab'],['historyTab','rosterTab']])$(current).addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();$(other).click();$(other).focus();}});
async function draw(){
  if(!accountReady||isBusy()||openingOwnerLink||codeOpening)return;if(localWriteBusy||sharing?.isMutating()){toast(t("Đang lưu lớp. Chờ một chút trước khi gọi UFO."));return;}if(resultOpen)closeResult(false);
  pausedWarningTail=null;void drainCharacters();actionMenus?.closeAll();
  const drawRoom=getActiveClassroom(classrooms);localWriteBusy=true;render();
  const preparation=new AbortController();pendingWarningPreparation=preparation;
  const warningReady=audio.prepareWarning({timeoutMs:5000,signal:preparation.signal});
  let warning={ready:false,duration:AIR_RAID_WARNING.duration};
  try{await teacherLive?.prepare();await gameSync?.beginDraw(drawRoom);warning=await warningReady;scene.setStudents(visibleStudents(),{preserveMotion:true});}
  catch(error){preparation.abort();toast(error.message);localWriteBusy=false;render();return;}
  finally{if(pendingWarningPreparation===preparation)pendingWarningPreparation=null;}
  localWriteBusy=false;
  if(!pageActive||preparation.signal.aborted||!classrooms.classes.includes(drawRoom)||getActiveClassroom(classrooms)!==drawRoom){await gameSync?.endDraw(drawRoom);render();return;}
  const selected=pickStudents(presentStudents(state),state.count,state.called,state.noRepeat);
  if(!selected.length){void gameSync?.endDraw(drawRoom);render();toast(!state.students.length?t("Thêm danh sách lớp trong Cài đặt trước nhé."):!presentStudents(state).length?t("Chưa có bạn có mặt. Kiểm tra mục Vắng trong Danh sách nhé."):needsAttendance()?t("Các bạn chưa gọi đang vắng. Kiểm tra điểm danh trong Danh sách nhé."):t("Cả lớp đã được gọi. Hãy bắt đầu vòng mới."));return;}
  localWriteBusy=true;render();
  const flightOptions={choreographyVersion:2,nearMisses:true,duration:24000,warningDuration:warning.duration*1000,warningReducedDuration:warning.duration*1000,suspenseLevel:suspensePreference.getLevel(),reducedMotion:motionQuery.matches};
  try{await teacherLive?.begin({students:scene.roster,selected,options:flightOptions});}
  catch(error){localWriteBusy=false;await gameSync?.endDraw(drawRoom);toast(t('Chưa kết nối được. Kiểm tra mạng rồi thử lại.'));render();return;}
  if(!pageActive||getActiveClassroom(classrooms)!==drawRoom||!classrooms.classes.includes(drawRoom)){void teacherLive?.abort().catch(()=>{});await gameSync?.endDraw(drawRoom);localWriteBusy=false;render();return;}
  // Reserve the draw before animation so a closed tab cannot cause a duplicate on another device.
  state.history.unshift({ids:selected.map(s=>s.id),time:Date.now()});state.history=state.history.slice(0,100);state.called=[...new Set([...state.called,...selected.map(s=>s.id)])];
  save(false);localWriteBusy=true;render();
  try{await gameSync?.flush(drawRoom);}catch(error){void teacherLive?.abort().catch(()=>{});toast(error.message);await gameSync?.endDraw(drawRoom);localWriteBusy=false;render();return;}
  if(!pageActive||getActiveClassroom(classrooms)!==drawRoom||!classrooms.classes.includes(drawRoom)){void teacherLive?.abort().catch(()=>{});await gameSync?.endDraw(drawRoom);localWriteBusy=false;render();return;}
  localWriteBusy=false;
  warningAudioReady=warning.ready;
  attendanceController?.stopAudio?.();trackEvent('ufo_draw_start',{selected_count:selected.length});running=true;lastResult=selected;render();caption(t("Đã gửi tín hiệu. UFO đang đến!"));announce(t('UFO đang chọn {count} bạn.',{count:selected.length}));
  try{
    const flight=scene.abduct(selected,{...flightOptions,sharedClock:!!drawRoom.cloud,warningComplete:()=>audio.warningComplete(),onPhase:caption,onEffects:effects=>audio.sync(effects)});
    teacherLive?.frame();
    if(pageActive&&!document.hidden)audio.start(scene.warningEffects(),{warningReady:warningAudioReady});else audio.stop();
    resultPhones.prepare();
    await flight;
  }catch(error){console.error('Scene animation error',error);toast(t("Hoạt cảnh bị gián đoạn; kết quả đã chọn vẫn được giữ."));}
  void flightDialogue.drain();audio.finishFlight();
  try{await teacherLive?.finish();}catch{toast(t('Mất kết nối · Sẽ tự thử lại'));}
  await gameSync?.endDraw(drawRoom);
  if(!classrooms.classes.includes(drawRoom)||getActiveClassroom(classrooms)!==drawRoom){audio.stop();running=false;render();return;}
  trackEvent('ufo_draw_complete',{selected_count:selected.length});resultOpen=true;running=false;save();sharing?.flush();scene.setStudents(visibleStudents(),{preserveMotion:true});render();caption(available().length?t("Phù… chuyến này thoát rồi! Ai sẽ là người tiếp theo?"):needsAttendance()?t("Các bạn chưa được gọi đang vắng. Kiểm tra điểm danh nhé."):t("Cả lớp đã hoàn thành chuyến bay!"));showResult(selected);
}
$('drawBtn').addEventListener('click',draw);
$('shareSettingsBtn').addEventListener('click',shareSettingsLink);
function showResult(selected){
  resultSoundArmed=false;startupDialoguePending=true;
  void drainCharacters();
  actionMenus?.closeAll();
  $('resultLayer').dataset.count=String(selected.length);
  $('resultNames').replaceChildren();selected.forEach((s,index)=>{const r=document.createElement('button');r.type='button';r.className='result-person student-result-trigger';r.setAttribute('aria-label',t('Xem thông tin của {name}',{name:s.name}));r.append(avatar(s,index));const n=document.createElement('span');n.textContent=s.name;r.append(n);r.addEventListener('click',()=>openStudentDetails(s.id,r));$('resultNames').append(r);});
  $('resultLayer').hidden=false;resultOpen=true;$('gamePanel').classList.add('result-active');
  sponsorTyping.start();
  for(const el of $('gamePanel').children)if(el.id!=='resultLayer')el.inert=true;
  $('resultTitle').textContent=t(nextResultHeadline());
  announce(t('Mời lên bảng: {names}',{names:selected.map(s=>s.name).join(', ')}));$('resultLayer').querySelector('.result-card').focus({preventScroll:true});
  if(pageActive&&!document.hidden){scene.beginDaylightReturn();audio.win();resultCelebration.start();resultPhones.start();}else audio.stop();
  resultActions.show({names:selected.map(student=>student.name),className:getActiveClassroom(classrooms).name});
  resultSoundArmed=true;syncPeaceAudio();
}
function closeResult(focus=true){scene.beginDaylightReturn();resultSoundArmed=false;pausedWarningTail=null;resultActions.hide();sponsorTyping.stop();resultCelebration.stop();resultPhones.stop();audio.stop();$('resultLayer').hidden=true;resultOpen=false;$('gamePanel').classList.remove('result-active');for(const el of $('gamePanel').children)el.inert=false;if(focus)$('drawBtn').disabled?$('resetBtn').focus():$('drawBtn').focus();joinWelcome?.flush();syncPeaceAudio();}
document.addEventListener('visibilitychange',()=>{
  scene.setVisibility(!document.hidden);
  teacherLive?.frame();
  if(document.hidden){flightDialogue.stop();vendorDialogue.stop();pausedWarningTail=audio.pauseWarning()||pausedWarningTail;resultCelebration.stop();resultPhones.stop();audio.stop();}
  else if(pageActive){
    if(resultOpen){scene.beginDaylightReturn();if(!resultPhones.active)resultPhones.start();}
    if(running&&scene.run)audio.start(scene.warningEffects(),{warningReady:warningAudioReady});
    const tail=pausedWarningTail;pausedWarningTail=null;
    if(tail)audio.resumeWarning(tail);
  }
  joinWelcome?.flush();
  syncPeaceAudio();
});
$('resultClose').addEventListener('click',()=>closeResult());
function resetRound(){if(isBusy())return;void teacherLive?.reset().catch(()=>toast(t('Mất kết nối · Sẽ tự thử lại')));joinWelcome?.drain();state.history=[];state.called=[];save();scene.setStudents(visibleStudents());render();caption(classroomCaption());announce(t("Đã bắt đầu vòng mới. Điểm danh được giữ nguyên."));}
$('resetBtn').addEventListener('click',()=>{if(state.history.length)$('resetDialog').showModal();else{resetRound();toast(t("Cả lớp đã sẵn sàng cho vòng mới."));}});
$('confirmReset').addEventListener('click',()=>{$('resetDialog').close();closeResult(false);resetRound();toast(t("Vòng mới đã sẵn sàng!"));$('drawBtn').focus();});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
function renderClassroomSettings(){
  const select=$('classroomSelect');select.replaceChildren();
  for(const item of classrooms.classes){const option=new Option(item.name,item.id);select.add(option);}select.value=classrooms.activeId;
}
function captureDraftBase(room,snapshot=sharing?.getSnapshot()){
  const complete=!!snapshot&&snapshot.id===room.cloud?.id&&snapshot.revision===room.cloud.revision;
  const allStudents=complete?snapshot.students:room.state.students;
  draftBases.set(room.id,{revision:room.cloud?.revision,students:structuredClone(manualClassroomStudents(room,allStudents)),allStudents:structuredClone(allStudents),complete});
}
function renderDraftNotice(){
  const room=getActiveClassroom(classrooms),base=draftBases.get(room.id),snapshot=sharing?.getSnapshot();
  const compatible=snapshot?.id===room.cloud?.id&&rebaseDraftForJoinedProfiles(base,snapshot);
  $('cloudDraftNotice').hidden=!room.cloud||!base||base.revision===room.cloud.revision||!!compatible;
  $('editorRosterInfo').textContent=room.cloud?t("Phần này chỉ gồm tên nhập bằng tay. Các bạn tự tham gia được quản lý ở phần bên dưới và vẫn được giữ khi lưu danh sách này. Toàn lớp tối đa 120 bạn; tên khớp sẽ giữ nguyên nhân vật và lịch sử."):t("Tối đa 120 bạn. Bạn có thể chỉnh giới tính ở phần xem trước. Thay đổi danh sách sẽ bắt đầu vòng mới cho lớp này. Các bạn đang vắng vẫn được giữ điểm danh nếu tên không đổi.");
}
$('reloadCloudDraft').addEventListener('click',async()=>{
  const roomId=classrooms.activeId;await sharing?.refresh();classroomDrafts.delete(roomId);draftBases.delete(roomId);
  if(classrooms.activeId===roomId){prepareClassroomEditor();$('rosterText').focus();toast(t("Đã tải danh sách đang có của lớp."));}
});
function receiveCloudSnapshot(snapshot){
  const room=classrooms.classes.find(c=>c.cloud?.id===snapshot.id);if(!room||snapshot.revision<room.cloud.revision)return;
  if(room.id===classrooms.activeId)joinWelcome?.observe(snapshot);
  const priorText=toText(manualClassroomStudents(room)),text=classroomDrafts.get(room.id),cleanDraft=text===undefined||text===priorText;
  const wasEmpty=!room.state.students.length;
  const changed=mergeCloudClassroom(room,snapshot);
  if(cleanDraft){classroomDrafts.delete(room.id);draftBases.delete(room.id);}
  else if(draftBases.get(room.id)?.revision===undefined){captureDraftBase(room,snapshot);}
  else if(draftBases.get(room.id)?.revision===snapshot.revision){const base=draftBases.get(room.id);base.students=structuredClone(manualClassroomStudents(room,snapshot.students));base.allStudents=structuredClone(snapshot.students);base.complete=true;}
  save();
  if(room.id===classrooms.activeId){
    environment.theme=room.environmentTheme;environment.names=structuredClone(room.environmentNames||{});
    if(changed)scene.setStudents(visibleStudents(),{preserveMotion:true});applyEnvironment();renderEnvironmentSettings();render();
    if(wasEmpty!==!room.state.students.length)caption(classroomCaption());
    if($('editorDialog').open){if(cleanDraft)prepareClassroomEditor();else renderDraftNotice();}
  }
}
async function initializeSharing(){
  const fragment=new URLSearchParams(location.hash.slice(1)),cloudId=fragment.get('class'),ownerToken=fragment.get('owner');
  if(cloudId&&ownerToken){
    history.replaceState(null,'',location.pathname+location.search);
    try{
      const snapshot=await apiRequest('/classes/'+encodeURIComponent(cloudId),{token:ownerToken});
      let room=classrooms.classes.find(c=>c.cloud?.id===cloudId);
      if(!room){
        if(classrooms.classes.length>=MAX_CLASSROOMS)throw new Error(t("Đã đủ 30 lớp trên trình duyệt này. Mở link quản lý trong trình duyệt khác."));
        room={id:crypto.randomUUID(),name:snapshot.name,environmentTheme:environment.theme,environmentNames:{},state:{students:[],history:[],called:[],absent:[],count:1,noRepeat:true,sound:true,isDemo:false}};classrooms.classes.push(room);
      }
      room.cloud={id:cloudId,ownerToken,revision:0};mergeCloudClassroom(room,snapshot);classrooms.activeId=room.id;completeClassroomSwitch();toast(t("Đã mở lớp bằng link quản lý riêng."));
    }catch(error){toast(t("Không mở được link quản lý: ")+error.message);}
  }
  openingOwnerLink=false;render();
  sharing=setupClassSharing($('shareSettingsHost'),{
    getClassroom:()=>getActiveClassroom(classrooms),getAccount:()=>account?.getAccount(),getIdentityVersion:()=>account?.getIdentityVersion(),isRunning:isBusy,
    onConnected:(connection,snapshot,localClassId=classrooms.activeId)=>{const room=classrooms.classes.find(c=>c.id===localClassId);if(room){room.cloud=connection.accountId?{id:connection.id,revision:connection.revision,accountId:connection.accountId}:snapshot.accountLinked&&account?.getAccount()?{id:connection.id,revision:connection.revision,accountId:account.getAccount().id}:connection;
      const previousActive=classrooms.activeId;
      for(const duplicate of deduplicateConnectedClassroom(classrooms,room)){
        gameSync?.discard(duplicate);
        for(const drafts of [classroomDrafts,draftBases,wizardDraftBases,classroomNameDrafts]){if(!drafts.has(room.id)&&drafts.has(duplicate.id))drafts.set(room.id,drafts.get(duplicate.id));drafts.delete(duplicate.id);}
      }
      if(previousActive!==classrooms.activeId)completeClassroomSwitch();
      save();trackEvent('ufo_class_shared');}},
    onSnapshot:receiveCloudSnapshot,onLiveSnapshot:snapshot=>{updateParticipantCount(snapshot);joinWelcome?.observe(snapshot);},notify:toast,
  });
  sharing.refresh();render();
  if($('editorDialog').open&&classroomSettings?.view==='details'&&settingsTab==='roster')ensureClassCode();
}
async function ensureClassCode(){
  if(!sharing||isBusy()||sharing.isMutating()||getActiveClassroom(classrooms).cloud)return;
  const localClassId=classrooms.activeId;
  try{await sharing.ensureShared();}
  catch(error){toast(t("Chưa tạo được mã lớp. Danh sách vẫn được giữ; bấm Tạo mã lớp để thử lại. ")+error.message);}
  finally{if(classrooms.activeId!==localClassId&&$('editorDialog').open&&settingsTab==='roster')ensureClassCode();}
}
async function showClassCodeForRoom(id,returnFocus=$('classMenuBtn')){
  if(classroomInteractionBlocked()||!sharing||!classrooms.classes.some(room=>room.id===id))return;
  actionMenus?.closeAll();
  if(classrooms.activeId!==id)switchFromHeader(id);
  if(classrooms.activeId!==id)return;
  codeOpening=true;render();
  try{
    await sharing.showCode();
    document.querySelector('.share-code-dialog[open]')?.addEventListener('close',()=>{
      const target=returnFocus?.isConnected&&!returnFocus.disabled&&returnFocus.getClientRects().length?returnFocus:$('classMenuBtn');
      if(!document.querySelector('dialog[open]')&&!target.disabled)target.focus({preventScroll:true});
    },{once:true});
  }catch(error){toast(error.message||t('Chưa mở được mã lớp. Hãy thử lại.'));}
  finally{codeOpening=false;render();}
}
function prepareClassroomEditor(){
  const room=getActiveClassroom(classrooms);
  if(!classroomDrafts.has(room.id)){classroomDrafts.set(room.id,toText(manualClassroomStudents(room)));captureDraftBase(room);}
  $('rosterText').value=classroomDrafts.get(room.id);updateDraft();renderClassroomSettings();renderDraftNotice();
}
function rememberClassroomDraft(){if($('editorDialog').open)classroomDrafts.set(classrooms.activeId,$('rosterText').value);}
function completeClassroomSwitch(){
  joinWelcome?.reset();idleDialogue?.stop();vendorDialogue?.stop();flightDialogue?.stop();
  environmentDraft=null;environment.theme=getActiveClassroom(classrooms).environmentTheme||environment.theme;environment.names=structuredClone(getActiveClassroom(classrooms).environmentNames||{});
  state=getActiveClassroom(classrooms).state;state.sound=true;saveEnvironment();activeTab='roster';$('classroomNameForm').hidden=true;save();scene.setStudents(visibleStudents());applyEnvironment();renderEnvironmentSettings();render();prepareClassroomEditor();
  const name=getActiveClassroom(classrooms).name;caption(classroomCaption());announce(t('Đang dùng {name}.',{name}));
  attendanceHistory?.close();sharing?.refresh();renderAttendanceSyncStatus();
  if($('editorDialog').open&&classroomSettings?.view==='details'&&settingsTab==='roster')ensureClassCode();
}
$('classroomSelect').addEventListener('change',e=>{
  if(isBusy()){e.target.value=classrooms.activeId;return;}rememberClassroomDraft();selectClassroom(classrooms,e.target.value);completeClassroomSwitch();
});
function editClassroomName(mode){
  if(isBusy())return;classroomNameMode=mode;$('classroomNameForm').hidden=false;$('classroomNameError').hidden=true;
  $('classroomNameLabel').textContent=mode==='new'?t("Tên lớp mới"):t("Đổi tên lớp");$('saveClassroomName').textContent=mode==='new'?t("Tạo lớp"):t("Lưu tên");
  $('classroomName').value=mode==='new'?'':getActiveClassroom(classrooms).name;$('classroomName').focus();$('classroomName').select();
}
$('newClassroomBtn').addEventListener('click',openClassroomWizard);
$('createClassroomMenuBtn').addEventListener('click',openClassroomWizard);
$('renameClassroomBtn').addEventListener('click',()=>editClassroomName('rename'));
$('classroomName').addEventListener('input',()=>classroomNameDrafts.set(classrooms.activeId,$('classroomName').value));
$('cancelClassroomName').addEventListener('click',()=>{if(isBusy()||localWriteBusy||codeOpening)return;classroomNameDrafts.delete(classrooms.activeId);$('classroomName').value=getActiveClassroom(classrooms).name;$('classroomNameError').hidden=true;});
$('classroomNameForm').addEventListener('submit',async e=>{
  e.preventDefault();if(isBusy()||localWriteBusy)return;
  if(sharing?.isMutating()){$('classroomNameError').textContent=t("Đang tạo mã hoặc lưu lớp. Chờ một chút rồi thử lại.");$('classroomNameError').hidden=false;return;}
  if(classroomNameMode==='new'){await openClassroomWizard();return;}
  localWriteBusy=true;
  try{
    {const room=getActiveClassroom(classrooms),name=$('classroomName').value;if(room.cloud)await sharing.rename(name);else renameClassroom(classrooms,classrooms.activeId,name);classroomNameDrafts.delete(room.id);save();applyEnvironment();renderEnvironmentSettings();render();$('classroomName').focus();}
  }catch(error){$('classroomNameError').textContent=error.message;$('classroomNameError').hidden=false;$('classroomName').focus();}finally{localWriteBusy=false;render();}
});
function toText(students){return students.map(s=>s.name+(s.gender==='male'?'':', '+genderLabel(s.gender).toLowerCase())).join('\n');}
const wizardDraftBases=new Map();
let classroomEntryPending=false;
function classroomInteractionBlocked(){return !accountReady||!!teacherAccount?.isBusy()||isBusy()||resultOpen||openingOwnerLink||localWriteBusy||codeOpening||!!sharing?.isMutating();}
function switchFromHeader(id){
  if(classroomInteractionBlocked())return;rememberClassroomDraft();selectClassroom(classrooms,id);completeClassroomSwitch();
}
function editClassroomFromHeader(id){
  if(classroomInteractionBlocked()||!classrooms.classes.some(room=>room.id===id))return;
  actionMenus?.closeAll();
  if(classrooms.activeId!==id)switchFromHeader(id);
  if(classrooms.activeId===id)openSettings('name');
}
async function openClassroomWizard(){
  if(classroomEntryPending||classroomInteractionBlocked())return;
  if(classrooms.classes.length>=MAX_CLASSROOMS&&!classroomWizard?.isOpen()){toast(t('Đã đủ 30 lớp trên trình duyệt này.'));return;}
  rememberClassroomDraft();$('editorDialog').close();actionMenus?.closeAll();
  classroomEntryPending=true;
  try{
    const choice=await account.chooseEntry({intent:'create'});
    if(!choice||classroomInteractionBlocked())return;
    // Signing in may restore more classes while the entry dialog is open.
    if(classrooms.classes.length>=MAX_CLASSROOMS&&!classroomWizard?.isOpen()){toast(t('Đã đủ 30 lớp trên trình duyệt này.'));return;}
    classroomWizard?.open();
  }catch(error){toast(error.message||t('Có lỗi xảy ra. Hãy thử lại.'));}
  finally{classroomEntryPending=false;}
}
function wizardRoom(id){
  const room=classrooms.classes.find(item=>item.id===id);
  if(!room||classrooms.activeId!==id)throw new Error(t('Không tìm thấy lớp này.'));
  return room;
}
async function saveClassroomEnvironment(room,theme,names){
  if(room.cloud){
    await sharing.ensureShared();
    const expectedRevision=sharing.getSnapshot()?.revision;
    const snapshot=await sharing.setEnvironment(theme,names);
    for(const drafts of [draftBases,wizardDraftBases]){
      const rebased=rebaseDraftAfterMetadataSave(drafts.get(room.id),{classId:room.cloud.id,expectedRevision},snapshot);
      if(rebased)drafts.set(room.id,rebased);
    }
  }else{room.environmentTheme=theme;room.environmentNames=structuredClone(names);}
  if(classrooms.activeId===room.id){environment={theme:room.environmentTheme,names:structuredClone(room.environmentNames||{})};saveEnvironment();applyEnvironment();renderEnvironmentSettings();}
  save();
}
async function deleteClassroom(id){
  if(classroomInteractionBlocked())throw new Error(t('Đang lưu thay đổi. Vui lòng chờ một chút.'));
  const room=classrooms.classes.find(item=>item.id===id);if(!room)throw new Error(t('Không tìm thấy lớp này.'));
  localWriteBusy=true;render();
  try{
    if(room.cloud){
      const path='/classes/'+encodeURIComponent(room.cloud.id);
      try{
        const latest=await apiRequest(path,{token:room.cloud.ownerToken});
        await apiRequest(path,{method:'DELETE',token:room.cloud.ownerToken,body:{expectedRevision:latest.revision}});
      }catch(error){if(error.status!==404)throw error;}
      attendanceSync.discardClass(room.cloud.id);
    }
    gameSync?.discard(room);
    const {activeChanged}=removeClassroom(classrooms,id);
    for(const drafts of [classroomDrafts,draftBases,wizardDraftBases,classroomNameDrafts])drafts.delete(id);
    if(activeChanged){studentDetails?.close();completeClassroomSwitch();}else save();
    render();
  }finally{localWriteBusy=false;render();}
}
async function ensureWizardShared(id){
  wizardRoom(id);if(!sharing)throw new Error(t('Đang kết nối lớp. Chờ một chút rồi điểm danh.'));
  const snapshot=await sharing.ensureShared();const room=wizardRoom(id);
  if(!wizardDraftBases.has(id))wizardDraftBases.set(id,{complete:true,revision:snapshot.revision,students:structuredClone(manualClassroomStudents(room,snapshot.students)),allStudents:structuredClone(snapshot.students)});
  return snapshot;
}
async function saveWizardRoster(id,text,rows){
  const room=wizardRoom(id);localWriteBusy=true;render();
  try{
    await ensureWizardShared(id);await sharing.refresh();wizardRoom(id);
    const snapshot=sharing.getSnapshot(),base=wizardDraftBases.get(id),rebased=snapshot?.id===room.cloud?.id?rebaseDraftForJoinedProfiles(base,snapshot):null;
    if(!rebased){const error=new Error(t('Lớp đã có cập nhật mới. Tải danh sách mới rồi chỉnh sửa lại trước khi lưu.'));error.code='STALE_DRAFT';throw error;}
    const students=cloudRosterRows(rows,rebased.students,rebased.allStudents);
    if(students.length>120)throw new Error(t('Toàn lớp tối đa 120 bạn, gồm cả tên nhập tay và các bạn tự tham gia.'));
    if(toText(rows)!==toText(rebased.students))await sharing.saveRoster(students,rebased.revision);
    wizardRoom(id);room.state.isDemo=false;classroomDrafts.delete(id);draftBases.delete(id);wizardDraftBases.delete(id);save();
    scene.setStudents(visibleStudents(),{preserveMotion:true});caption(classroomCaption());
  }finally{localWriteBusy=false;render();}
}
function updateDraft(){if($('editorDialog').open)classroomDrafts.set(classrooms.activeId,$('rosterText').value);const parsed=parseRoster($('rosterText').value);draft=parsed.students;parseErrors=parsed.errors;renderPreview();}
function renderPreview(){
  $('previewRows').replaceChildren();$('previewCount').textContent=t('{count} bạn',{count:draft.length});
  if(!draft.length){const empty=document.createElement('div');empty.className='roster-empty';empty.textContent=getActiveClassroom(classrooms).cloud?t("Chưa có tên nhập tay. Các bạn tự tham gia xuất hiện ở phần bên dưới."):t("Các bạn sẽ xuất hiện ở đây.");$('previewRows').append(empty);}
  draft.slice(0,120).forEach((s,i)=>{const line=document.createElement('div');line.className='preview-row';const name=document.createElement('span');name.textContent=s.name;const select=document.createElement('select');select.setAttribute('aria-label',t('Giới tính của {name}',{name:s.name}));for(const g of ['male','female','other']){const opt=new Option(genderLabel(g),g);select.add(opt);}select.value=s.gender;select.disabled=parseErrors.length>0||localWriteBusy||isBusy()||codeOpening;select.addEventListener('change',()=>{draft[i].gender=select.value;$('rosterText').value=toText(draft);classroomDrafts.set(classrooms.activeId,$('rosterText').value);});line.append(name,select);$('previewRows').append(line);});
  $('editorError').hidden=!parseErrors.length;$('editorError').textContent=parseErrors.slice(0,5).join('\n');
}
function openSettings(tab='name',focusSign=false){
  if(isBusy()||resultOpen||localWriteBusy||codeOpening)return;
  prepareClassroomEditor();if(!environmentDraft)beginEnvironmentDraft();
  classroomSettings.openDetails(tab==='class'?'roster':tab);
  if(focusSign){$('environmentTitle').focus();$('environmentTitle').select();}
}
$('editBtn').addEventListener('click',()=>{if(!classroomInteractionBlocked()){prepareClassroomEditor();classroomSettings.openList();}});
$('editClassroomBtn').addEventListener('click',()=>openSettings('name'));
$('emptyRosterInviteBtn').addEventListener('click',()=>showClassCodeForRoom(classrooms.activeId,$('emptyRosterInviteBtn')));
function editCurrentRoster(){if(classroomInteractionBlocked())return;openSettings('roster');$('rosterText').focus();}
$('emptyRosterEditBtn').addEventListener('click',editCurrentRoster);
sceneEditBtn.addEventListener('click',editCurrentRoster);
sceneQrBtn.addEventListener('click',()=>showClassCodeForRoom(classrooms.activeId,sceneQrBtn));
let lastSignTap=null;
let studentPointer=null;
function canInspectScene(){return !isBusy()&&!resultOpen&&!openingOwnerLink&&!localWriteBusy&&!codeOpening&&!sharing?.isMutating()&&!document.querySelector('dialog[open]');}
$('scene').addEventListener('pointerdown',event=>{
  studentPointer=event.isPrimary!==false&&event.button===0&&canInspectScene()?{x:event.clientX,y:event.clientY,id:scene.studentNameAt(event.clientX,event.clientY)}:null;
});
$('scene').addEventListener('pointerup',event=>{
  const press=studentPointer;studentPointer=null;
  if(!press?.id||!canInspectScene()||Math.hypot(event.clientX-press.x,event.clientY-press.y)>12)return;
  if(scene.studentNameAt(event.clientX,event.clientY)!==press.id)return;
  lastSignTap=null;openStudentDetails(press.id,$('scene'));
});
$('scene').addEventListener('pointermove',event=>{
  $('scene').style.cursor=canInspectScene()&&scene.studentNameAt(event.clientX,event.clientY)?'pointer':'';
});
$('scene').addEventListener('pointerleave',()=>{$('scene').style.cursor='';studentPointer=null;});
$('scene').addEventListener('pointercancel',()=>{studentPointer=null;});
$('scene').addEventListener('keydown',event=>{
  if(event.key!=='Enter'||!canInspectScene())return;
  event.preventDefault();activeTab='roster';renderRoster();$('rosterDialog').showModal();document.querySelector('#rosterContent .student-card-trigger')?.focus();
});
function canEditSceneSign(x,y){return canInspectScene()&&scene.isSignAt(x,y);}
$('scene').addEventListener('dblclick',e=>{
  if(!canEditSceneSign(e.clientX,e.clientY))return;e.preventDefault();lastSignTap=null;openSettings('environment',true);
});
$('scene').addEventListener('pointerup',e=>{
  if(e.pointerType!=='touch')return;
  if(!canEditSceneSign(e.clientX,e.clientY)){lastSignTap=null;return;}
  const tap={time:e.timeStamp,x:e.clientX,y:e.clientY};
  if(lastSignTap&&tap.time-lastSignTap.time<=350&&Math.hypot(tap.x-lastSignTap.x,tap.y-lastSignTap.y)<=20){
    e.preventDefault();lastSignTap=null;openSettings('environment',true);
  }else lastSignTap=tap;
});
$('scene').addEventListener('pointercancel',()=>{lastSignTap=null;});
$('rosterText').addEventListener('input',updateDraft);
async function persistManualRoster(room,rows){
  if(!room.cloud)return replaceClassRoster(room.state,rows);
  let base=draftBases.get(room.id);
  if(!base?.complete)throw new Error(t('Đang tải danh sách đầy đủ từ lớp. Chờ kết nối rồi thử lại.'));
  const snapshot=sharing.getSnapshot();
  if(snapshot?.id===room.cloud.id){const rebased=rebaseDraftForJoinedProfiles(base,snapshot);if(rebased)base=rebased;}
  if(base.revision!==room.cloud.revision)throw new Error(t('Lớp đã có cập nhật mới. Tải danh sách mới rồi chỉnh sửa lại trước khi lưu.'));
  const students=cloudRosterRows(rows,base.students,base.allStudents);
  if(students.length>120)throw new Error(t('Toàn lớp tối đa 120 bạn, gồm cả tên nhập tay và các bạn tự tham gia.'));
  if(toText(rows)!==toText(base.students))await sharing.saveRoster(students,base.revision);
  return false;
}
async function applyClassroomEdits(){
  if(classroomInteractionBlocked())return false;
  const room=getActiveClassroom(classrooms),text=classroomDrafts.get(room.id);
  const name=classroomNameDrafts.get(room.id)??room.name;
  // Validate all visible editor drafts before starting any save.
  const checkedName=name===room.name?room.name:renameClassroom({classes:classrooms.classes.map(item=>({...item}))},room.id,name).name;
  const rosterChanged=text!==undefined&&text!==toText(manualClassroomStudents(room));
  const parsed=rosterChanged?parseRoster(text):null;
  if(parsed&&(parsed.errors.length||!parsed.students.length&&!room.cloud))throw new Error(parsed.errors.join('\n')||t('Nhập ít nhất một tên để UFO biết đón ai nhé.'));
  const scenery=environmentDraft?structuredClone(environmentDraft):null;
  localWriteBusy=true;render();
  try{
    let changed=false;
    if(parsed){changed=await persistManualRoster(room,parsed.students);if(classroomDrafts.get(room.id)===text){classroomDrafts.delete(room.id);draftBases.delete(room.id);}room.state.isDemo=false;save();}
    if(checkedName!==room.name){if(room.cloud)await sharing.rename(checkedName);else renameClassroom(classrooms,room.id,checkedName);save();}
    classroomNameDrafts.delete(room.id);
    if(scenery&&(scenery.theme!==environment.theme||JSON.stringify(scenery.names)!==JSON.stringify(environment.names)))await saveClassroomEnvironment(room,scenery.theme,scenery.names);
    if(changed)joinWelcome?.drain();
    scene.setStudents(visibleStudents(),{preserveMotion:!changed});applyEnvironment();save();render();caption(classroomCaption());
    return true;
  }finally{localWriteBusy=false;render();}
}
$('editorForm').addEventListener('submit',async e=>{
  e.preventDefault();if(isBusy()||localWriteBusy)return;updateDraft();
  if(sharing?.isMutating()){$('editorError').textContent=t("Đang tạo mã hoặc lưu lớp. Bản nháp vẫn được giữ; chờ một chút rồi lưu lại.");$('editorError').hidden=false;return;}
  const room=getActiveClassroom(classrooms);
  if((!draft.length&&!room.cloud)||parseErrors.length){$('editorError').textContent=parseErrors.join('\n')||t("Nhập ít nhất một tên để UFO biết đón ai nhé.");$('editorError').hidden=false;$('rosterText').focus();return;}
  const rows=draft.map(s=>({...s})),count=Math.min(10,Math.max(1,Math.floor(Number($('drawCount').value)||1))),noRepeat=$('noRepeat').checked;
  const submit=e.submitter;localWriteBusy=true;render();if(submit)submit.disabled=true;
  let savedActiveRoster=false;
  try{
    const changed=await persistManualRoster(room,rows);
    room.state.count=count;room.state.noRepeat=noRepeat;room.state.isDemo=false;classroomDrafts.delete(room.id);draftBases.delete(room.id);save();
    if(classrooms.activeId===room.id){if(changed)joinWelcome?.drain();scene.setStudents(visibleStudents(),{preserveMotion:!changed});render();$('editorDialog').close();caption(classroomCaption());savedActiveRoster=true;}
    toast(t("Đã lưu {v0} bạn cho {v1}.",{v0:room.state.students.length,v1:room.name}));
  }catch(error){$('editorError').textContent=error.message;$('editorError').hidden=false;if(error.status===409)await sharing.refresh();renderDraftNotice();}
  finally{localWriteBusy=false;render();if(submit)submit.disabled=false;if(savedActiveRoster)(state.students.length?$('drawBtn'):$('emptyRosterEditBtn')).focus();}
});
$('importBtn').addEventListener('click',()=>$('importFile').click());
$('importFile').addEventListener('change',async e=>{const file=e.target.files[0],importClassId=classrooms.activeId;if(!file)return;try{if(file.size>1024*1024)throw new Error(t("Tệp quá lớn. Chọn tệp TXT / CSV dưới 1 MB."));const text=await file.text();classroomDrafts.set(importClassId,text);if(classrooms.activeId===importClassId){$('rosterText').value=text;updateDraft();}else toast(t("Đã nhập tệp vào bản nháp của lớp bạn vừa chọn."));}catch(error){toast(error.message||t("Không đọc được tệp."));}e.target.value='';});
$('exportBtn').addEventListener('click',()=>{updateDraft();if(!draft.length||parseErrors.length){toast(t("Kiểm tra lại danh sách trước khi xuất tệp."));return;}const content='\uFEFF'+t('Họ và tên')+','+t('Giới tính')+'\r\n'+draft.map(s=>s.name+','+genderLabel(s.gender)).join('\r\n');const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=t('Danh sách')+'-UFO.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
document.addEventListener('keydown',e=>{
  const target=document.activeElement;
  const editing=/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName)||target?.isContentEditable;
  if(e.code==='Space'&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!editing&&target?.tagName!=='A'){
    if(document.querySelector('dialog[open]'))return;
    // Space is the playground shortcut, never a click on the focused button.
    e.preventDefault();
    if(e.repeat||e.isComposing||document.querySelector('dialog[open]')||resultOpen||isBusy())return;
    draw();return;
  }
  if(document.querySelector('dialog[open]'))return;
  if(resultOpen&&e.key==='Escape'){e.preventDefault();closeResult();return;}
  if(resultOpen&&e.key==='Tab'){
    const controls=[...$('resultLayer').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=controls[0],last=controls.at(-1),onControl=controls.includes(document.activeElement);if(e.shiftKey&&(!onControl||document.activeElement===first)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(!onControl||document.activeElement===last)){e.preventDefault();first?.focus();}return;
  }
});

const attendanceSavedClasses=new Set();
function renderAttendanceSyncStatus(){
  const room=getActiveClassroom(classrooms),status=attendanceSync.getState(room.cloud?.id||'local-only');
  const message=status.pending?(status.error?t("Chờ đồng bộ điểm danh · ")+status.error:status.sending?t("Đang lưu điểm danh lên Cloudflare…"):t("{v0} lượt điểm danh chờ đồng bộ",{v0:status.pending})):attendanceSavedClasses.has(room.cloud?.id)?t("Điểm danh đã lưu trên Cloudflare"):'';
  for(const element of document.querySelectorAll('[data-attendance-sync]')){element.textContent=message;element.hidden=!message;element.dataset.pending=String(status.pending>0);}
}
const attendanceSync=createAttendanceSync({
  getConnection:classId=>classrooms.classes.find(room=>room.cloud?.id===classId)?.cloud,
  onChange:()=>renderAttendanceSyncStatus(),
  onSaved:session=>{attendanceSavedClasses.add(session.classId);attendanceHistory?.refresh();},
});
attendanceHistory=createAttendanceHistory({
  getClassroom:()=>getActiveClassroom(classrooms),
  ensureShared:()=>sharing?.ensureShared(),notify:toast,
  getSyncState:()=>attendanceSync.getState(getActiveClassroom(classrooms).cloud?.id||'local-only'),
  onSyncRetry:()=>attendanceSync.flush(),
});
async function openAttendanceHistory(){
  if(isBusy()||localWriteBusy||codeOpening)return;
  codeOpening=true;render();
  try{void attendanceSync.flush();await attendanceHistory.open();}catch(error){toast(error.message||t("Chưa tải được lịch sử điểm danh."));}finally{codeOpening=false;render();}
}
$('rosterAttendanceHistoryBtn').addEventListener('click',openAttendanceHistory);
window.addEventListener('online',()=>{attendanceSync.start();attendanceHistory.refresh();});
window.addEventListener('pageshow',()=>attendanceSync.start());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)attendanceSync.start();});
async function startAttendance(){
  if(isBusy()||openingOwnerLink||localWriteBusy||codeOpening||sharing?.isMutating()){toast(t("Chờ lưu lớp hoặc chuyến bay hoàn tất rồi điểm danh nhé."));return;}
  if(!state.students.length){toast(t("Thêm học sinh vào lớp trước khi điểm danh."));return;}
  if(!sharing){toast(t("Đang kết nối lớp. Chờ một chút rồi điểm danh."));return;}
  attendanceController.prepareAudio?.();
  const classId=classrooms.activeId;localWriteBusy=true;render();
  try{
    await sharing.ensureShared();if(classrooms.activeId!==classId)return;
    const room=getActiveClassroom(classrooms);
    if(!room.cloud)throw new Error(t("Cần tạo mã lớp để lưu lịch sử điểm danh."));
    await teacherLive.prepare();
    if(classrooms.activeId!==classId)return;
    if(resultOpen)closeResult(false);for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
    activeAttendanceRecord=attendanceSync.begin(room.cloud.id,state.students);
    if(!attendanceController.start(state.students)){attendanceSync.finish(activeAttendanceRecord,'stopped');activeAttendanceRecord=null;}
  }catch(error){toast(t("Chưa bắt đầu điểm danh: ")+error.message);}
  finally{localWriteBusy=false;render();}
}
$('rosterAttendanceBtn').addEventListener('click',startAttendance);
sceneAttendanceBtn.addEventListener('click',startAttendance);
attendanceController=createAttendanceController({scene,container:$('sceneWrap'),
  onStart:()=>{scene.setStudents(visibleStudents(),{preserveMotion:true});render();announce(t("Bắt đầu điểm danh. Chọn Có mặt hoặc Vắng cho từng bạn, không giới hạn thời gian."));},
  onMark:(id,present)=>{setStudentAbsent(state,id,!present);save();if(activeAttendanceRecord)attendanceSync.mark(activeAttendanceRecord,id,present);},
  onStateChange:attendance=>{
    render();
    if(activeAttendanceRecord)void teacherLive.attendance({...attendance,sessionId:activeAttendanceRecord}).catch(()=>toast(t('Mất kết nối · Sẽ tự thử lại')));
  },
  onFinish:summary=>{if(activeAttendanceRecord){attendanceSync.finish(activeAttendanceRecord,summary.reason);activeAttendanceRecord=null;}save();sharing?.flush();scene.setStudents(visibleStudents(),{preserveMotion:true});render();const message=t('{status}: {present} có mặt, {absent} vắng.',{status:summary.reason==='complete'?t('Đã điểm danh'):t('Đã dừng'),present:summary.present,absent:summary.absent})+(summary.unprocessed?' '+t('{count} bạn chưa điểm danh',{count:summary.unprocessed}):'');caption(message);toast(message);announce(message);$('classMenuBtn').focus({preventScroll:true});}
});

studentDetails=createStudentDetails({getClassroom:()=>getActiveClassroom(classrooms),onShowCard:openStudentCard,notify:toast});
classroomWizard=createClassroomWizard({
  getRoom:id=>classrooms.classes.find(room=>room.id===id),getEnvironment:()=>environment.theme,
  getSnapshot:id=>{const room=classrooms.classes.find(item=>item.id===id),snapshot=sharing?.getSnapshot();return snapshot?.id===room?.cloud?.id?snapshot:null;},
  activate:id=>{if(classrooms.activeId!==id){selectClassroom(classrooms,id);completeClassroomSwitch();}},
  create:name=>{rememberClassroomDraft();const room=addClassroom(classrooms,name);room.environmentTheme=environment.theme;completeClassroomSwitch();return room.id;},
  rename:async(id,name)=>{
    const room=wizardRoom(id);if(room.name===name)return;
    const checked=renameClassroom({classes:classrooms.classes.map(item=>({...item}))},id,name).name;
    if(room.cloud){const base=wizardDraftBases.get(id),expectedRevision=sharing.getSnapshot()?.revision,snapshot=await sharing.rename(checked);const rebased=rebaseDraftAfterMetadataSave(base,{classId:room.cloud.id,expectedRevision},snapshot);if(rebased)wizardDraftBases.set(id,rebased);}
    else renameClassroom(classrooms,id,checked);save();render();
  },
  setEnvironment:async(id,theme)=>{const room=wizardRoom(id);await saveClassroomEnvironment(room,theme,room.environmentNames||{});},
  onDraft:(id,text)=>{classroomDrafts.set(id,text);if(!draftBases.has(id)&&wizardDraftBases.has(id))draftBases.set(id,structuredClone(wizardDraftBases.get(id)));},ensureShared:ensureWizardShared,save:saveWizardRoster,
  reloadDraft:async id=>{await sharing.refresh();const room=wizardRoom(id),snapshot=sharing.getSnapshot();if(!snapshot||snapshot.id!==room.cloud?.id)throw new Error(t('Đang tải danh sách đầy đủ từ lớp. Chờ kết nối rồi thử lại.'));wizardDraftBases.set(id,{complete:true,revision:snapshot.revision,students:structuredClone(manualClassroomStudents(room,snapshot.students)),allStudents:structuredClone(snapshot.students)});const text=toText(manualClassroomStudents(room,snapshot.students));classroomDrafts.set(id,text);return text;},
  onComplete:()=>{render();$('drawBtn').disabled?$('classMenuBtn').focus():$('drawBtn').focus();},notify:toast,
});
classroomSettings=createClassroomSettings({
  dialog:$('editorDialog'),getClassrooms:()=>classrooms.classes,getActiveId:()=>classrooms.activeId,
  onSelect:switchFromHeader,onCreate:openClassroomWizard,onDelete:deleteClassroom,isDisabled:classroomInteractionBlocked,onConfirm:applyClassroomEdits,
  onAccount:()=>teacherAccount?.open(),getAccountStatus:room=>teacherAccount?.getStatus(room)||gameSync?.getStatus(room)||{status:'guest',label:t('Chưa gắn tài khoản')},
  onTab:tab=>{
    settingsTab=tab;prepareClassroomEditor();
    if(tab==='name'){const room=getActiveClassroom(classrooms);classroomNameMode='rename';$('classroomNameForm').hidden=false;$('classroomNameLabel').textContent=t('Đổi tên lớp');$('saveClassroomName').textContent=t('Lưu tên');$('classroomName').value=classroomNameDrafts.get(room.id)??room.name;}
    if(tab==='environment'){if(!environmentDraft)beginEnvironmentDraft();else renderEnvironmentSettings();}
    if(tab==='roster'){sharing?.refresh();ensureClassCode();}
  },
});
$('applyEnvironmentBtn').addEventListener('click',async()=>{
  if(classroomInteractionBlocked()||!environmentDraft)return;
  const room=getActiveClassroom(classrooms),draft=structuredClone(environmentDraft);localWriteBusy=true;render();
  try{await saveClassroomEnvironment(room,draft.theme,draft.names);environmentDraft=structuredClone(environment);renderEnvironmentSettings();}
  catch(error){toast(error.message||t('Có lỗi xảy ra. Hãy thử lại.'));}
  finally{localWriteBusy=false;render();}
});
$('editorDialog').addEventListener('close',()=>{environmentDraft=null;});
classroomSwitcher=createClassroomSwitcher({button:$('classMenuBtn'),panel:$('classMenu'),list:$('classroomChoices'),createButton:$('addClassroomMenuBtn'),getClassrooms:()=>classrooms.classes,getActiveId:()=>classrooms.activeId,onSelect:switchFromHeader,onEdit:editClassroomFromHeader,onCode:showClassCodeForRoom,onCreate:openClassroomWizard,isDisabled:classroomInteractionBlocked,canCreate:()=>classrooms.classes.length<MAX_CLASSROOMS});
actionMenus=setupActionMenus([{trigger:$('quickAddBtn'),panel:$('quickAddMenu')},{trigger:$('classMenuBtn'),panel:$('classMenu')}]);
window.addEventListener('pagehide',event=>{teacherLive?.suspend();pageActive=false;ambientBirds.sync();flightDialogue.stop();vendorDialogue.stop();pausedWarningTail=null;joinWelcome?.reset();idleDialogue?.stop();pendingWarningPreparation?.abort();studentDetails.close();void attendanceSync.flush();resultCelebration.stop();resultPhones.stop();audio.stop();sharing?.stop();if(running)scene.finish?.({waitForResult:true});if(event.persisted){for(const room of classrooms.classes)gameSync?.discard(room);}else gameSync?.destroy();});
teacherLive=createTeacherLive({
  getConnection:()=>{
    const cloud=getActiveClassroom(classrooms)?.cloud;
    if(!pageActive||!accountReady||!cloud||cloud.accountId&&cloud.accountId!==account?.getAccount()?.id)return null;
    return {classId:cloud.id,role:'owner',token:cloud.ownerToken,identity:cloud.accountId};
  },getFrame:()=>scene.liveFrame(),onRemoteFinish:()=>{if(running&&scene.run)scene.finish({waitForResult:true});},
  onAttendancePresent:({sessionId,promptId,studentId})=>{
    const current=attendanceController?.getState();
    if(sessionId!==activeAttendanceRecord||current?.phase!=='waiting'||current.current?.id!==studentId||current.promptId!==promptId)return;
    attendanceController.markPresent(studentId,promptId);
  },
});
gameSync=createGameStateSync({getAccount:()=>account?.getAccount(),getRooms:()=>classrooms.classes,persist:()=>save(false),onChange:()=>{classroomSettings?.refresh();renderGameSyncStatus();},notify:toast});
account=createAccountController({
  onBeforeLogin:()=>{if(isBusy()||localWriteBusy||sharing?.isMutating()){toast(t('Chờ hoàn tất lượt UFO hoặc điểm danh trước khi sửa lớp.'));return false;}return true;},
  onBeforeLogout:async()=>{if(teacherAccount?.isBusy()||isBusy()||localWriteBusy||sharing?.isMutating()){toast(t('Chờ hoàn tất lượt UFO hoặc điểm danh trước khi sửa lớp.'));return false;}await teacherAccount?.beforeLogout();if(hasUnsavedTeacherDrafts({rooms:classrooms.classes,accountId:account.getAccount()?.id,activeId:classrooms.activeId,rosterDrafts:classroomDrafts,draftBases,nameDrafts:classroomNameDrafts,environmentDraft,wizardDraft:classroomWizard?.getDraft()}))throw new Error(t('Lưu thay đổi đang nhập trước khi đăng xuất nhé.'));await flushBeforeAccountLogout({account:account.getAccount(),rooms:classrooms.classes,gameSync,attendanceSync});return true;},
});
teacherAccount=setupTeacherAccount({account,collection:classrooms,cached:cachedAccountRooms,gameSync,
  activate:id=>{rememberClassroomDraft();selectClassroom(classrooms,id);completeClassroomSwitch();},
  persist:()=>save(false),notify:toast,
  isBusy:()=>running||!!attendanceController?.isRunning()||localWriteBusy||codeOpening||openingOwnerLink||!!sharing?.isMutating(),
  onStateChange:()=>{render();if(!teacherAccount?.isSaving())sharing?.flush();},
  onDiscard:room=>{joinWelcome?.reset();idleDialogue?.stop();vendorDialogue?.stop();flightDialogue?.stop();pendingWarningPreparation?.abort();for(const dialog of document.querySelectorAll('dialog[open]'))if(dialog.id!=='accountDialog')dialog.close();if(running)scene.finish?.();attendanceController?.stop?.();if(room.cloud)attendanceSync.discardClass(room.cloud.id);for(const drafts of [classroomDrafts,draftBases,wizardDraftBases,classroomNameDrafts])drafts.delete(room.id);studentDetails?.close();attendanceHistory?.close();try{sessionStorage.removeItem(LANGUAGE_DRAFTS_KEY);}catch{}},
  onChange:change=>{
    for(const duplicate of change.duplicates||[]){for(const drafts of [classroomDrafts,draftBases,wizardDraftBases,classroomNameDrafts]){if(!drafts.has(change.linked)&&drafts.has(duplicate.id))drafts.set(change.linked,drafts.get(duplicate.id));drafts.delete(duplicate.id);}}
    if(change.activeChanged){if(resultOpen)closeResult(false);completeClassroomSwitch();return;}
    // Background account saves preserve the active editor, scenery draft and result.
    if(change.snapshot)receiveCloudSnapshot(change.snapshot);
    state=getActiveClassroom(classrooms).state;scene.setStudents(visibleStudents(),{preserveMotion:true});render();sharing?.refresh();
  },
});
$('teacherAccountBtn').addEventListener('click',()=>teacherAccount.open());
account.ready.finally(()=>{accountReady=true;save(false);render();});
window.addEventListener('online',()=>{for(const room of classrooms.classes)void gameSync.flush(room).catch(()=>{});});
scene.setStudents(visibleStudents());renderEnvironmentSettings();applyEnvironment();render();save(false);
peaceAudioStarted=true;audio.onPlaybackStateChange(syncPeaceAudio);audio.onForegroundChange(syncPeaceAudio);startPeaceAudio();
initializeSharing();attendanceSync.start();
setupAnalytics();
