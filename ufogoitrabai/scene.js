/* Original canvas illustration. No images, fonts, or network dependencies. */
import { characterSeed, characterStyle, drawHead } from './character-art.js';
import { sanitizeAppearance } from './appearance.js';
import { solveTwoBone, resetFootPlants, updateFootPlants, kickLeg, groundedBodyOffset, walkingArm, runningArm } from './motion.js';
import { drawSky } from './sky.js';
import { t as translate } from './i18n.js';
import { drawEnvironment, drawEnvironmentMotion } from './environments.js';
import { SUSPENSE_LEVELS, normalizeSuspenseLevel } from './suspense.js';
import {createPetPassers,drawPet} from './pet-passers.js';
import {IDLE_DIALOGUE_LINES} from './idle-dialogue-lines.js';
import {createStreetVendors,drawStreetVendor} from './street-vendors.js';
import {createSceneDialoguePicker} from './scene-dialogue-lines.js';
const W = 1280, H = 720, TAU = Math.PI * 2;
const CAPTURE_START = .57, CAPTURE_END = .91;
const WARNING_SHIP_START = 2000, WARNING_SHIP_ENTRY = 2000;
const WARNING_LIGHT_START = 4000, WARNING_LIGHT_ENTRY = 2000;
const ARRIVAL_START=2/24,ARRIVAL_END=4/24,INTRO_END=6/24,INTRO_MS=6000;
const SCAN_ROUND_MS=8000,SCAN_SETTLE_MS=3200,SCAN_ROUNDS={light:1,normal:2,intense:3};
export const UFO_TIMING = Object.freeze({
  beamStart:.17,beamSweepDuration:.08,beamFadeOut:.014,
  approachStart:.255,approachDuration:.085,reachStart:.300,reachDuration:.065,riseStart:.375,riseDuration:.16,
  suspenseStart:.56,suspenseDuration:4000,
});
const SHOULDER_H = 54, HIP_H = 35, CHARACTER_TOP = 81;
// Different catches produce different silhouettes, not mirrored copies on a
// common wrist line. Low grips need an inverted tuck to keep the feet clear;
// the high grips can support an extended sideways body.
const CLING_STYLES = [
  {name:'tuck',height:33,gap:2.6,angle:2.74,reach:14.7,lift:12.5,minHeight:28},
  {name:'flag',height:61,gap:3.2,angle:1.64,reach:16.7,lift:12.1,minHeight:55},
  {name:'brace',height:69,gap:4,angle:1.18,reach:15.8,lift:12.5,minHeight:59},
  {name:'scramble',height:46,gap:3.5,angle:2.43,reach:16.7,lift:12.1,minHeight:38},
];
const HATCH = { y:34, rx:25, ry:4, rimRx:28, rimRy:5.5, hullBottom:41 };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const hash = value => { let h = 2166136261; for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };

function rr(c, x, y, w, h, r = 8, color, stroke) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
  if (color) { c.fillStyle = color; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.stroke(); }
}
function ellipse(c, x, y, rx, ry, color) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = color; c.fill();
}
function line(c, x1, y1, x2, y2, color, width = 2) {
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.stroke();
}
function text(c, value, x, y, size, color, weight = 700, align = 'center', maxWidth) {
  c.font = `${weight} ${size}px "Be Vietnam Pro", "Arial", sans-serif`; c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = color;
  if(maxWidth)c.fillText(value,x,y,maxWidth);else c.fillText(value,x,y);
}
function poly(c, points, color) {
  c.beginPath(); points.forEach(([x,y], i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.closePath(); c.fillStyle = color; c.fill();
}
function star(c, x, y, size, color, rot = 0) {
  const points = Array.from({length: 8}, (_, i) => { const a = rot + i * Math.PI / 4; const r = i % 2 ? size * .28 : size; return [x + Math.cos(a) * r, y + Math.sin(a) * r]; }); poly(c, points, color);
}
function pointInTag(x,y,box) {
  const radius=Math.min(box.r,box.w/2,box.h/2),dx=Math.abs(x-box.x),dy=Math.abs(y-box.y);
  if(dx<=box.w/2&&dy<=box.h/2){
    const cx=Math.max(0,dx-(box.w/2-radius)),cy=Math.max(0,dy-(box.h/2-radius));
    if(cx*cx+cy*cy<=radius*radius)return true;
  }
  if(!box.tail)return false;
  const [a,b,c]=box.tail,cross=(u,v)=>(x-v[0])*(u[1]-v[1])-(u[0]-v[0])*(y-v[1]);
  const edges=[cross(a,b),cross(b,c),cross(c,a)];
  return edges.every(edge=>edge>=0)||edges.every(edge=>edge<=0);
}

export class UFOScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.students = []; this.roster = []; this.run = null; this.reduced = false; this.dead = false; this.speed = 1; this.warningPaused = !!document.hidden;
    this.environment={theme:'school',title:'TRƯỜNG THPT LƯƠNG VĂN CAN',subtitle:'12A8'};
    this.started = performance.now(); this.last = this.started; this.time = 0;
    this.background = document.createElement('canvas'); this.background.width = W; this.background.height = H;
    this._buildStreet(this.background.getContext('2d'));
    this.resize = () => {
      this.nameHitFrame=null;
      const bounds = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.width = Math.max(1, bounds.width); this.height = Math.max(1, bounds.height);
      canvas.width = Math.round(this.width * dpr); canvas.height = Math.round(this.height * dpr); this.dpr = dpr;
      const portrait = this.width / this.height < 1.45;
      const scale = portrait ? Math.max(this.width / 900, this.height / 1050) : Math.max(this.width / W, this.height / H);
      const vw = this.width / scale, vh = this.height / scale;
      const top = portrait ? -Math.max(0, vh - H) * .22 : (vh < H ? H - vh : 0);
      this.view = { scale, width: vw, height: vh, left: (W - vw) / 2, right: (W + vw) / 2, top, bottom: top + vh, portrait };
      this.petPassers?.reset();this.petVisitor=null;this.streetVendors?.reset();
      this._layoutStudents();
      if(this.run?.warningActors)this._rebaseWarningActors();
      if(this.run) this.run.grips = this._makeGrips(this.run.selected);
    };
    this.observer = new ResizeObserver(this.resize); this.observer.observe(canvas); this.resize();
    this._frame = this._frame.bind(this); this.raf = requestAnimationFrame(this._frame);
  }

  setReducedMotion(value) {
    const reduced=!!value,run=this.run;
    if(reduced&&!this.reduced&&run?.nearMissesEnabled&&run.nearMissReducedAt===null)run.nearMissReducedAt=run.progress;
    if(reduced&&!this.reduced)for(const [id,entry] of this.welcomes||[]){
      if(entry.reduced||entry.landed)continue;
      const person=this.students.find(person=>person.id===id);if(!person)continue;
      entry.startY=this._welcomePose(person,entry).y;entry.startElapsed=entry.elapsed;
      entry.flight=entry.elapsed+180;entry.duration=entry.flight+160;entry.soft=true;
    }
    if(reduced&&!this.reduced&&run&&!run.follow&&(run.suspenseDuration||run.scanHoldDuration)){
      // Cancelling the decoration must also cancel its waits. Continue from the
      // same body/ship phase, without replaying those waits if motion returns.
      run.elapsed=(run.progress||0)*run.duration;run.suspenseDuration=0;run.suspenseElapsed=0;
      run.scanHoldDuration=0;run.scanHoldElapsed=0;run.scanSchedule=Object.freeze([]);run.scan=null;
      run.totalDuration=run.duration;
    }
    // The warning is an audio clip: reduced motion changes its poses, never its
    // duration or playback position.
    if(reduced&&!this.reduced&&run&&!run.follow)run.totalDuration=this._totalDuration();
    this.reduced=reduced;
  }
  setVisibility(visible, now = performance.now()) {
    this.warningPaused=!visible;
    if(!visible)this._clearIdleDialogueRequest();
    if(visible&&this.run)this.run.warningAt=Math.max(this.run.warningAt??now,now);
    if(visible)for(const entry of this.welcomes?.values()||[])entry.at=now;
  }
  setSpeed(value = 1) { this.speed = clamp(Number(value) || 1, .25, 8); }
  setCurrentStudent(id, label = 'Bạn') {
    this.currentStudentId=typeof id==='string'&&id?id:null;
    this.currentStudentLabel=String(label||'Bạn').slice(0,32);
  }
  /** An explicit clock snapshot; a participant never becomes the draw authority. */
  liveFrame() {
    const run=this.run;if(!run)return null;
    return {elapsed:run.elapsed,warningElapsed:run.warningElapsed,alarmElapsed:run.alarmElapsed,
      warningActive:!!run.warningActive,speed:this.speed,paused:!!this.warningPaused,
      timing:{duration:run.duration,warningDuration:run.warningDuration,suspenseDuration:run.suspenseDuration,
        scanHoldDuration:run.scanHoldDuration,suspenseLevel:run.suspenseLevel,
        scanSchedule:run.scanSchedule.map(cue=>({...cue})),...(run.choreographyVersion===2?{choreographyVersion:2}:{})}};
  }
  /** Follow server-relayed teacher time, including its audio gate and visibility. */
  followFlightFrame(frame,{ageMs=0}={}) {
    const run=this.run;if(!run?.follow||!frame)return false;
    const finite=(value,max=1200000)=>Number.isFinite(value)&&value>=0&&value<=max;
    if(!['elapsed','warningElapsed','alarmElapsed'].every(key=>finite(frame[key]))||
      !Number.isFinite(frame.speed)||frame.speed<.25||frame.speed>8||
      typeof frame.warningActive!=='boolean'||typeof frame.paused!=='boolean')return false;
    const timing=frame.timing;
    let signature=run.followTiming;
    if(timing){
      if(![undefined,1,2].includes(timing.choreographyVersion)||(timing.choreographyVersion||1)!==(run.choreographyVersion||1))return false;
      if(!finite(timing.duration,60000)||timing.duration<1||!finite(timing.warningDuration,30000)||
        !finite(timing.suspenseDuration,600000)||!finite(timing.scanHoldDuration,600000)||
        !['light','normal','intense'].includes(timing.suspenseLevel)||!Array.isArray(timing.scanSchedule)||timing.scanSchedule.length>10)return false;
      for(const [index,cue] of timing.scanSchedule.entries())if(!cue||cue.targetIndex!==index||
        !['start','release','lockAt','searchEnd','fade','fadeIn','hold'].every(key=>finite(cue[key]))||
        !Number.isInteger(cue.rounds)||cue.rounds<1||cue.rounds>3||!finite(cue.scale,2.5)||cue.scale<=0||
        cue.searchEnd<cue.start||cue.lockAt<cue.searchEnd||cue.release<cue.lockAt)return false;
      signature=JSON.stringify(timing);
    }
    const changed=signature!==run.followTiming,previous=run.followFrame;
    // Duplicate or reordered snapshots cannot move the warning or flight back.
    if(!changed&&previous&&(frame.elapsed<previous.elapsed||frame.warningElapsed<previous.warningElapsed||
      frame.alarmElapsed<previous.alarmElapsed||!previous.warningActive&&frame.warningActive))return false;
    if(timing&&changed){
      const progress=run.progress;
      if(run.nearMissesEnabled&&!timing.scanSchedule.length&&run.nearMissReducedAt===null)run.nearMissReducedAt=progress;
      Object.assign(run,{duration:timing.duration,warningDuration:timing.warningDuration,suspenseDuration:timing.suspenseDuration,
        scanHoldDuration:timing.scanHoldDuration,suspenseLevel:timing.suspenseLevel,
        scanSchedule:Object.freeze(timing.scanSchedule.map(cue=>Object.freeze({...cue}))),followTiming:signature});
      run.totalDuration=this._totalDuration();
      // A teacher can enable reduced motion during flight and shorten its clock.
      // Keep the already visible body phase while mapping onto the new schedule.
      let low=0,high=run.duration+run.suspenseDuration+run.scanHoldDuration;
      for(let i=0;i<40;i++){const mid=(low+high)/2;if(this._timelineAt(mid).progress<progress)low=mid;else high=mid;}
      run.elapsed=progress?high:0;
    }
    run.followFrame={elapsed:frame.elapsed,warningElapsed:frame.warningElapsed,alarmElapsed:frame.alarmElapsed,
      warningActive:frame.warningActive,speed:frame.speed,paused:frame.paused};
    run.followAt=performance.now();run.followAge=clamp(Number(ageMs)||0,0,1500);this.speed=frame.speed;
    this._advanceFollowFlight(run.followAt);
    return true;
  }
  _advanceFollowFlight(now) {
    const run=this.run,frame=run?.followFrame;if(!run?.follow||!frame)return;
    const age=frame.paused?0:clamp(Math.max(0,now-run.followAt)+run.followAge,0,1500);
    const warningElapsed=Math.min(run.warningDuration,frame.warningElapsed+(frame.warningActive?age:0));
    run.warningElapsed=Math.max(run.warningElapsed,warningElapsed);
    run.warningActive=frame.warningActive;
    run.alarmElapsed=Math.max(run.alarmElapsed,frame.alarmElapsed+(frame.warningActive||run.progress<(run.choreographyVersion===2?INTRO_END:.10)?age:0));
    const end=run.duration+run.suspenseDuration+run.scanHoldDuration;
    const elapsed=run.choreographyVersion===2?this._advanceChoreography(frame.elapsed,age,frame.speed):frame.elapsed+(frame.warningActive?0:age*frame.speed);
    Object.assign(run,this._timelineAt(Math.min(end,Math.max(run.elapsed,elapsed))));
    if(run.warningActors&&(run.choreographyVersion===2||run.warningActive||run.elapsed<1200))this._updateWarningReactions();
  }
  setEnvironment(value={}) {
    this.environment={theme:['street','school','park','seaside'].includes(value.theme)?value.theme:'street',title:String(value.title??'CHỦ TỊCH HỒ CHÍ MINH').slice(0,32),subtitle:String(value.subtitle??'').slice(0,48)};
    const context=this.background.getContext('2d');context.clearRect(0,0,W,H);this._buildStreet(context);
  }
  isSignAt(clientX,clientY) {
    if(this.run||!this.view)return false;
    const bounds=this.canvas.getBoundingClientRect(),v=this.view;
    const x=(clientX-bounds.left)/v.scale+v.left,y=(clientY-bounds.top)/v.scale+v.top;
    const signs={street:[535,264,222,48],school:[440,375,400,36],park:[440,251,400,70],seaside:[445,298,390,70]};
    const [sx,sy,width,height]=signs[this.environment.theme]||signs.street;
    return x>=sx&&x<=sx+width&&y>=sy&&y<=sy+height;
  }
  /** Hit the last painted name tag using viewport pointer coordinates. */
  studentNameAt(clientX,clientY) {
    const frame=this.nameHitFrame;
    if(this.dead||this.run||this.attendanceStudentId||!frame||!Number.isFinite(clientX)||!Number.isFinite(clientY))return null;
    const bounds=this.canvas.getBoundingClientRect();
    if(!(bounds.width>0&&bounds.height>0)||clientX<bounds.left||clientX>=bounds.left+bounds.width||clientY<bounds.top||clientY>=bounds.top+bounds.height)return null;
    // Use the painted viewport, including any CSS scaling before ResizeObserver runs.
    // Canvas device pixels never enter this conversion, so DPR cannot change the hit.
    const x=(clientX-bounds.left)*frame.width/bounds.width/frame.scale+frame.left;
    const y=(clientY-bounds.top)*frame.height/bounds.height/frame.scale+frame.top;
    if(this.nameOccluders?.some(box=>pointInTag(x,y,box)))return null;
    for(let index=(this.labelBoxes?.length||0)-1;index>=0;index--){
      const box=this.labelBoxes[index];if(pointInTag(x,y,box))return box.id??null;
    }
    return null;
  }
  finish({waitForResult=false}={}) { if (this.run) { this._phase(translate('Đã đón đủ hành khách!')); this._finish({waitForResult}); } else if(!waitForResult)this.beginDaylightReturn(); }
  skip() { this.finish({waitForResult:true}); }
  // Completion can wait for server persistence or a blocked result dialog.
  // The UI releases the night only after the results are actually visible.
  beginDaylightReturn(now=performance.now()) {
    if(this.run||this.resultNight==null)return false;
    this.daylightReturn={started:now,duration:this.reduced?0:450/this.speed,from:this.resultNight};
    this.resultNight=null;return true;
  }

  focusAttendance(studentId) {
    if(this.run||!this.students.some(person=>person.id===studentId&&!person.removed))return false;
    this._clearIdleDialogueRequest();
    this.streetVendors?.cancelInteraction();
    this.attendanceStudentId=studentId;this.attendanceAnchor=null;return true;
  }
  get vendorConversationActive(){return !!this.streetVendors?.conversationActive;}
  clearAttendance(){this.attendanceStudentId=null;this.attendanceAnchor=null;}
  /** Paint an actual idle bubble inside the current activation event. */
  requestIdleDialogue() {
    const v=this.view;
    if(this.dead||this.run||this.warningPaused||this.attendanceStudentId||this.welcomes?.size||this.vendorConversationActive||!v)return false;
    const candidates=this.students.filter(person=>!person.removed&&!person.recovery&&!person.waitingSeat&&
      person.x>v.left+24*person.scale&&person.x<v.right-24*person.scale&&
      person.y-104*person.scale>v.top+16&&person.y<v.bottom-8);
    if(!candidates.length)return false;
    this._clearIdleDialogueRequest();
    const person=candidates.sort((a,b)=>Math.abs(a.x-(v.left+v.right)/2)-Math.abs(b.x-(v.left+v.right)/2))[0];
    const request={id:person.id,key:`${person.id}:prompt:${this.idleDialogueSerial=(this.idleDialogueSerial||0)+1}`,remaining:4,painted:false};
    this.idleDialogueRequest=request;person.chatting=true;person.walking=false;
    this._draw();return request.painted;
  }
  _clearIdleDialogueRequest() {
    const request=this.idleDialogueRequest;if(!request)return;
    const person=this.students.find(person=>person.id===request.id);
    if(person){person.chatting=false;person.chatUntil=0;}
    this.idleDialogueRequest=null;
  }
  _updateIdleDialogueRequest(delta) {
    const request=this.idleDialogueRequest;if(!request)return;
    const person=this.students.find(person=>person.id===request.id&&!person.removed);
    if(this.run||this.warningPaused||this.attendanceStudentId||this.welcomes?.size||!person||person.recovery||person.waitingSeat){this._clearIdleDialogueRequest();return;}
    request.remaining-=Math.max(0,delta);
    if(request.remaining<=0)this._clearIdleDialogueRequest();
  }
  welcomeStudent(id,{onLand=()=>{}}={}) {
    const person=this.students.find(person=>person.id===id&&!person.removed);
    if(this.dead||this.run||this.warningPaused||!person||this.welcomes?.has(id))return false;
    this._clearIdleDialogueRequest();
    this.streetVendors?.cancelInteraction();
    this.welcomes??=new Map();person.waitingSeat=null;person.recovery=null;
    person.walking=person.chatting=false;person.chatUntil=0;person.stepPose=resetFootPlants(person);
    this.welcomes.set(id,{at:performance.now(),elapsed:0,reduced:this.reduced,
      flight:this.reduced?150:1050,duration:this.reduced?310:1450,
      startY:this.view.top-24*person.scale,onLand:typeof onLand==='function'?onLand:()=>{},landed:false,delivered:false});
    return true;
  }
  cancelWelcome(id) {
    if(!this.welcomes?.delete(id))return false;
    const person=this.students.find(person=>person.id===id);
    if(person){person.walking=person.chatting=false;person.stepPose=resetFootPlants(person);}
    return true;
  }
  _updateWelcomes(now) {
    for(const [id,entry] of this.welcomes||[]){
      const person=this.students.find(person=>person.id===id&&!person.removed);
      if(!person||this.run){this.cancelWelcome(id);continue;}
      const elapsed=Math.max(0,now-entry.at);entry.at=now;
      if(this.warningPaused)continue;
      entry.elapsed=Math.min(entry.duration,entry.elapsed+Math.min(80,elapsed));
      if(entry.elapsed>=entry.flight)entry.landed=true;
      if(entry.elapsed>=entry.duration&&entry.delivered)this.welcomes.delete(id);
    }
  }
  _welcomePose(person,entry) {
    const s=person.scale,facing=person.facing??person.direction,step=person.stepPose||resetFootPlants(person);
    const groundY=person.y+groundedBodyOffset(person,step.feet,{facing,turn:Math.abs(facing)*.5});
    const q=clamp((entry.elapsed-(entry.startElapsed||0))/(entry.flight-(entry.startElapsed||0))),landing=clamp((entry.elapsed-entry.flight)/(entry.duration-entry.flight));
    const reduced=entry.reduced,gentle=reduced||entry.soft||this.reduced,compression=gentle?0:Math.sin(Math.PI*landing)*6*s;
    const y=(reduced?groundY:mix(entry.startY,groundY,q*q))+compression;
    return {x:person.x,y,angle:0,scale:s,facing,walk:0,kick:0,grip:null,reach:0,
      feet:step.feet.map(foot=>({...foot,y:foot.y+(entry.landed?0:y-groundY)})),
      shadow:reduced?1:smooth((q-.60)/.40),labelOpacity:reduced?smooth(q):1,captureOpacity:reduced?smooth(q):1,
      startle:gentle?0:Math.sin(Math.PI*q)*.65,groundY:person.y,welcomeStage:entry.landed?'landing':'falling',welcomeProgress:q};
  }
  getAttendanceAnchor(){
    const anchor=this.attendanceAnchor,v=this.view;
    if(!anchor||anchor.id!==this.attendanceStudentId||!v)return null;
    return {id:anchor.id,x:(anchor.x-v.left)*v.scale,y:(anchor.y-v.top)*v.scale,width:this.width,height:this.height};
  }

  setStudents(students,{preserveMotion=false}={}) {
    this.nameHitFrame=null;
    if(!preserveMotion)this._clearIdleDialogueRequest();
    if(!preserveMotion)this.idleDialogueHandled?.clear();
    if(!preserveMotion)this.petPassers?.reset();
    if(!preserveMotion)this.streetVendors?.reset();
    if(!preserveMotion)this.welcomes?.clear();
    const previous=preserveMotion?new Map((this.students||[]).map(person=>[person.id,person])):null;
    this.roster = Array.isArray(students) ? students.map((s, i) => ({ ...s, id: s.id ?? `student-${i}`, name: String(s.name || translate('Bạn học')), appearance: sanitizeAppearance(s.appearance) })) : [];
    this.students = this.roster.slice(0, 120).map((student, i) => {
      if(previous?.has(student.id)){
        const actor=previous.get(student.id),changed=actor.gender!==student.gender||JSON.stringify(sanitizeAppearance(actor.appearance))!==JSON.stringify(student.appearance);
        Object.assign(actor,student,{removed:false});
        if(changed)delete actor.art;
        return actor;
      }
      const seed = hash(student.id);
      return { ...student, seed, x: 640, y: 590, scale: 1, direction: seed > .5 ? 1 : -1, removed: false };
    });
    for(const id of this.welcomes?.keys()||[])if(!this.students.some(person=>person.id===id))this.cancelWelcome(id);
    if(!previous||this.roster.some(student=>!previous.has(student.id)))this._layoutStudents({preserve:previous?.size?previous:null});
  }

  _layoutStudents({preserve=null}={}) {
    if(!this.view)return;
    const n=this.students.length,v=this.view;
    const columns=Math.max(4,Math.min(n>60?16:12,Math.floor((v.width-45)/(n>60?69:95))));
    const rows=Math.max(1,Math.ceil(n/columns)),spacing=Math.min(116,(v.width-48)/columns);
    const end=Math.max(655,v.bottom-35),step=rows>2?Math.min(80,(end-645)/Math.max(1,rows-2)):80;
    this.students.forEach((person,i)=>{if(preserve?.has(person.id))return;const row=Math.floor(i/columns),col=i%columns,count=Math.min(columns,n-row*columns);
      person.x=640+(col-(count-1)/2)*spacing+(person.seed-.5)*Math.min(17,spacing*.16);
      person.y=rows===1?Math.min(end,660)+(person.seed-.5)*24:row===0?529+(person.seed-.5)*9:645+(row-1)*step+(person.seed-.5)*9;
      const depth=mix(.70,1.18,clamp((person.y-529)/Math.max(130,end-529)));
      person.depth=depth;person.scale=Math.min(n>70?.64:n>42?.75:n>24?.90:1,(rows>7?Math.max(.33,step/60):1))*depth;
      person.labelWidth=Math.max(58,spacing-15);
      person.layoutRow=row;
      person.stepPose=resetFootPlants(person);
    });
    if(preserve){const placed=this.students.filter(person=>preserve.has(person.id));
      for(const person of this.students.filter(person=>!preserve.has(person.id))){
        const origin={x:person.x,y:person.y},gap=42*person.scale+15,candidates=[];
        for(let row=0;row<7;row++)for(let slot=0;slot<25;slot++){
          const offset=slot?Math.ceil(slot/2)*(slot%2?1:-1):0,rowOffset=row?Math.ceil(row/2)*(row%2?1:-1):0;
          const x=clamp(origin.x+offset*gap,v.left+42,v.right-42),y=clamp(origin.y+rowOffset*55,529,v.bottom-20);
          const collisions=placed.filter(other=>Math.abs(other.x-x)<18*(other.scale+person.scale)+8&&Math.abs(other.y-y)<22*(other.scale+person.scale)).length;
          candidates.push({x,y,score:collisions*10000+Math.abs(x-origin.x)+Math.abs(y-origin.y)*1.4});
        }
        candidates.sort((a,b)=>a.score-b.score);person.x=candidates[0].x;person.y=candidates[0].y;person.stepPose=resetFootPlants(person);placed.push(person);
      }
    }
    this.supports=[];
    for(let row=0;row<Math.max(rows,...this.students.map(person=>person.layoutRow+1));row++){
      const people=this.students.filter(person=>person.layoutRow===row);
      for(let i=0;i<people.length;i+=2){const group=people.slice(i,i+2),x=group.reduce((sum,s)=>sum+s.x,0)/group.length,y=Math.max(...group.map(s=>s.y))+5;
        if(people.length>2&&(row+Math.floor(i/2))%4===2){
          this.supports.push({x,y,people:group,type:'scooter',index:this.supports.length});
        }
      }
    }
    if(!preserve)this._assignWaitingSeats();
  }

  _waitingBench() {
    const x=this.view.left+25,groundY=Math.min(this.view.bottom-14,706);
    return {x:x+7,width:110,groundY,seatY:groundY-22,depth:groundY-1};
  }

  _assignWaitingSeats() {
    for(const person of this.students)person.waitingSeat=null;
    if(this.run||this.students.length<6)return;
    const bench=this._waitingBench(),count=this.students.length>=12?2:1,chosen=new Set();
    for(let index=0;index<count;index++){
      const hipX=bench.x+(count===1?bench.width*.5:index===0?28:82),facing=index===0?1:-1;
      const person=this.students.filter(p=>!p.removed&&!p.recovery&&!chosen.has(p.id))
        .sort((a,b)=>(Math.abs(a.x-hipX)+Math.abs(a.y-bench.groundY)*.5)-(Math.abs(b.x-hipX)+Math.abs(b.y-bench.groundY)*.5))[0];
      if(!person)continue;chosen.add(person.id);
      person.scale=clamp(person.scale,.9,1.08);person.y=bench.groundY;person.x=hipX+facing*14*person.scale;
      person.direction=person.facing=facing;person.walking=person.chatting=false;person.chatUntil=0;
      person.labelWidth=Math.max(78,person.labelWidth||0);person.stepPose=resetFootPlants(person);
      person.waitingSeat={index,hipX,seatY:bench.seatY,groundY:bench.groundY,facing,
        standAt:.021+index*.008,standDuration:.015,
        feet:person.stepPose.feet.map(foot=>({...foot})),
        hands:[{x:hipX+facing*6*person.scale,y:bench.seatY-1.5*person.scale},{x:hipX+facing*14*person.scale,y:bench.seatY-1.5*person.scale}]};
    }
  }

  _waitingPose(person,seat,p=null) {
    const s=person.scale,u=p===null?0:smooth((p-seat.standAt)/seat.standDuration),facing=seat.facing;
    const standingY=person.y+groundedBodyOffset(person,seat.feet,{facing,turn:this.run?.7:.5});
    const hip={x:mix(seat.hipX,person.x,u),y:mix(seat.seatY-2.4*s,standingY-HIP_H*s,u)};
    const angle=-facing*.035*(1-u)+facing*.17*Math.sin(Math.PI*u);
    return {x:hip.x-HIP_H*s*Math.sin(angle),y:hip.y+HIP_H*s*Math.cos(angle),angle,scale:s,facing,
      walk:0,feet:seat.feet,kick:0,grip:null,reach:0,shadow:1,labelOpacity:1,groundY:seat.groundY,hip,
      benchHands:seat.hands,benchBlend:1-smooth((u-.10)/.55),benchSeated:true,standProgress:u};
  }

  abduct(selected, { duration = 24000, warningDuration = 0, warningReducedDuration = 0, warningComplete = () => true, suspenseLevel = 'normal', onPhase = () => {}, onEffects = () => {}, follow = false, reducedMotion = false, sharedClock = false, choreographyVersion = 1, nearMisses = false } = {}) {
    this._clearIdleDialogueRequest();
    this.streetVendors?.cancelInteraction();
    if (this.dead || !Array.isArray(selected) || !selected.length) return Promise.resolve();
    for(const id of this.welcomes?.keys()||[])this.cancelWelcome(id);
    if (this.run) this._finish();
    const used = new Set();
    const chosen = selected.filter(s => s && !used.has(s.id) && used.add(s.id)).map((s, i) => {
      let person = this.students.find(p => p.id === s.id);
      if (!person) { person = { ...s, seed: hash(s.id), x: 280 + ((i * 227) % 720), y: 608, direction: 1, scale: 1, removed: false }; this.students.push(person); }
      person.removed = false; return person;
    });
    if (!chosen.length) return Promise.resolve();
    const timelineReduced=follow?!!reducedMotion:this.reduced;
    const ms = timelineReduced ? Math.min(1700 + chosen.length * 250, Number(duration) || 24000) : Math.max(3500, Number(duration) || 24000);
    const warningMs=Math.max(0,Math.min(30000,Number(warningDuration)||Number(warningReducedDuration)||0));
    const level=normalizeSuspenseLevel(suspenseLevel);
    const scale=ms/24000,slot=(CAPTURE_END-CAPTURE_START)*ms/chosen.length;
    const requestedSuspenseDuration=timelineReduced?0:SUSPENSE_LEVELS[level].duration*scale;
    // Make room on the elapsed clock; never squeeze extra sweeps into a pupil's
    // ascent. Later pauses sit at slot starts, after the previous boarding ends.
    const firstWindow=(SCAN_ROUNDS[level]*SCAN_ROUND_MS+SCAN_SETTLE_MS+500)*scale;
    const firstLead=(CAPTURE_START-UFO_TIMING.suspenseStart)*ms+slot*.2;
    const suspenseDuration=timelineReduced?0:Math.max(requestedSuspenseDuration,firstWindow-firstLead);
    const laterHold=timelineReduced?0:Math.max(0,(SCAN_ROUND_MS+SCAN_SETTLE_MS+400)*scale-slot*.2);
    const scanHoldDuration=laterHold*(chosen.length-1);
    const scanSchedule=timelineReduced?[]:chosen.map((_,index)=>{
      const start=index?(CAPTURE_START*ms+index*slot+suspenseDuration+(index-1)*laterHold):UFO_TIMING.suspenseStart*ms;
      const release=index?start+laterHold+slot*.2:CAPTURE_START*ms+slot*.2+suspenseDuration;
      const lockAt=release-(index?400:500)*scale;
      return Object.freeze({targetIndex:index,start,release,lockAt,searchEnd:lockAt-SCAN_SETTLE_MS*scale,rounds:index?1:SCAN_ROUNDS[level],scale,fade:220*scale,fadeIn:220*scale,hold:index?laterHold:suspenseDuration});
    });
    this.daylightReturn=null;this.resultNight=null;
    return new Promise(resolve => {
      this.run = { started: performance.now(), elapsed: 0, warningDuration: warningMs, warningElapsed: 0, warningReducedDuration: Math.max(0,Number(warningReducedDuration)||0), duration: ms, suspenseLevel:level, requestedSuspenseDuration,suspenseDuration, suspenseElapsed:0,scanHoldDuration,scanHoldElapsed:0,scanSchedule:Object.freeze(scanSchedule), totalDuration:ms+suspenseDuration+scanHoldDuration+warningMs, selected: chosen, resolve, onPhase, onEffects:typeof onEffects==='function'?onEffects:()=>{}, phase: '', progress: 0, trafficTime:this.time, scan:null };
      this.run.follow=!!follow;
      this.run.sharedClock=!!sharedClock;
      this.run.choreographyVersion=choreographyVersion===2?2:1;
      this.run.nearMissesEnabled=false;
      this.run.nearMissActors=new Map();
      this.run.nearMissReducedAt=null;
      this.run.totalDuration=this._totalDuration();
      this.run.waitingSeats=new Map(this.students.filter(person=>person.waitingSeat).map(person=>[person.id,person.waitingSeat]));
      for(const person of this.students)person.waitingSeat=null;
      this.run.warningComplete=typeof warningComplete==='function'?warningComplete:()=>true;
      this.run.warningActive=warningMs>0;
      this.run.alarmElapsed=0;
      this.run.warningActors=warningMs>0||this.run.choreographyVersion===2?this._makeWarningActors():null;
      this.run.grips=this._makeGrips(chosen);
      // The decorative scan uses the visible roster, never the random draw.
      const candidates=this.students.filter(person=>!person.removed&&this.run.grips.has(person.id)).sort((a,b)=>this.run.grips.get(a.id).groundX-this.run.grips.get(b.id).groundX||a.y-b.y);
      this.run.scanCandidates=candidates.map(person=>person.id);
      const scans=Math.min(4,candidates.length);
      this.run.scanRoute=Array.from({length:scans},(_,i)=>candidates[scans===1?0:Math.round(i*(candidates.length-1)/(scans-1))].id);
      this.run.walkers=new Map();this.run.releases=new Map();
      // A queued RAF can predate this draw. Start the warning after setup and
      // keep its clock separate from the continuously running idle animation.
      this.run.started=performance.now();this.run.warningAt=this.run.started;
      this._phase(translate('Tàu UFO đang đến…'));
    });
  }

  destroy() {
    this._clearIdleDialogueRequest();
    this.welcomes?.clear();
    this.streetVendors?.reset();
    this.dead = true; cancelAnimationFrame(this.raf); this.observer.disconnect(); if (this.run) this._finish();
  }

  _phase(value) { if (this.run && this.run.phase !== value) { this.run.phase = value; try { this.run.onPhase(value); } catch (_) { /* UI callbacks cannot interrupt rendering. */ } } }
  _finish({waitForResult=false}={}) { const run = this.run; if (!run) return;
    const darkness=this.lighting?.darkness??.68*smooth(run.choreographyVersion===2?(run.progress-ARRIVAL_START)/(ARRIVAL_END-ARRIVAL_START):run.progress/.19);
    this.resultNight=waitForResult?darkness:null;
    this.daylightReturn=waitForResult?null:{started:this.last||0,duration:this.reduced?0:450/this.speed,from:darkness};
    this.run = null; this.nameHitFrame=null; run.selected.forEach(s => { s.removed = true; });
    for(const person of this.students){
      if(!person.removed){
        const fall=run.falls?.get(person.id);
        if(fall){
          person.x=fall.seatX;person.direction=person.facing=fall.facing;person.walking=person.chatting=false;
          person.recovery={...fall,started:this.time,startedReal:performance.now(),delay:this.reduced?.5:2.2+person.seed*.6,duration:this.reduced?.4:1.05+person.seed*.2};
        }else{
          person.walking=false;person.chatting=false;
          person.stepPose=resetFootPlants(person);
        }
      }
    }
    try { run.onEffects({ufoEffect:null,effectProgress:0,effectDuration:0,lightEffect:null,lightProgress:0,lightDuration:0,suspenseEffect:null,suspenseProgress:0,suspenseDuration:0,targetId:null,speed:this.speed}); } catch (_) { /* Effects must never prevent completion. */ }
    run.resolve();
  }

  _buildStreet(c) {
    if(this.environment.theme!=='street'){drawEnvironment(c,this.environment);return;}
    // The sky/clouds are a live layer behind this transparent street bitmap.
    c.fillStyle = '#9ac9c5';
    [[0,293,100,173],[70,260,106,204],[176,306,75,150],[238,237,133,209],[393,281,120,166],[521,223,90,242],[621,286,126,170],[762,219,85,241],[889,269,89,190],[996,232,109,228],[1113,282,99,175],[1210,240,70,220]].forEach(a=>c.fillRect(...a));
    c.fillStyle = '#daebe0'; c.fillRect(0,442,1280,70);

    this._house(c, -30, 247, 186, 250, '#ead8b3', '#9b4437', 'PHỞ HÀ NỘI', 'PHỞ BÒ · PHỞ GÀ', 3, true);
    this._house(c, 159, 206, 155, 291, '#e7dfbd', '#386f54', 'BÁNH MÌ', 'LÒ BÁNH BA ĐÌNH', 2, true);
    this._house(c, 318, 245, 155, 252, '#e2c4a6', '#b64d3b', 'BÚN CHẢ', 'CHẢ NƯỚNG HÀ NỘI', 2, true);
    this._house(c, 835, 214, 165, 283, '#e7d7b7', '#a84d3b', 'BÚN THỊT NƯỚNG', 'MÓN NGON BA MIỀN', 2, true);
    this._house(c, 1004, 254, 178, 243, '#c9d4ae', '#47764f', 'CHÈ VIỆT', 'CHÈ SEN · CHÈ ĐỖ', 3, true);
    this._house(c, 1186, 195, 145, 302, '#e2cba9', '#79553b', 'BÁNH CUỐN', 'THANH TRÌ', 2, true);
    this._mausoleum(c, 483, 190, 326, 307);

    // Paving, shop steps and road markings.
    c.fillStyle = '#e5ddc6'; c.fillRect(0,497,W,40);
    c.fillStyle = '#d0cbb9'; c.fillRect(0,530,W,9);
    c.fillStyle = '#778f89'; c.fillRect(0,539,W,181);
    c.fillStyle = '#9aad9d'; c.fillRect(0,542,W,3);
    for (let x=0; x<W; x+=53) { line(c,x,500,x-20,530,'#ccc6b0',1); }
    line(c,0,515,W,515,'#d7cfb8',1);
    for(let x=28;x<W;x+=163) rr(c,x,628,88,4,2,'#d5d9be');
    // Zebra crossing adds depth without crowding the foreground characters.
    for(let i=0;i<6;i++) poly(c,[[1099+i*23,549],[1116+i*23,549],[1156+i*23,604],[1133+i*23,604]],'#dddcc2');
    c.fillStyle='#b4c5ad'; c.fillRect(0,695,W,25); c.fillStyle='#dce1c9'; c.fillRect(0,695,W,5);
    for(let x=0;x<W;x+=62) line(c,x,703,x+7,720,'#96b299',1);

    // Street furniture: scooter parking, shop baskets and leafy street trees.
    this._tree(c, 91, 475, .92); this._tree(c, 1103, 480, 1.1);
    this._tree(c, 773, 485, .78); this._tree(c, 1244, 466, .77);
    this._scooter(c, 217, 508, '#cd6953', .86, 1);
    this._scooter(c, 371, 507, '#edd28a', .86, -1);
    this._scooter(c, 908, 511, '#70a6a2', .9, 1);
    this._scooter(c, 1160, 514, '#e7a884', .78, -1);
    this._planter(c, 504, 495, 22); this._planter(c, 660, 495, 21);
    this._planter(c, 847, 495, 18); this._planter(c, 116, 493, 20);
    this._signboard(c, 266, 501, 'TRÀ ĐÁ', '5.000 Đ', '#477b70');
    this._signboard(c, 722, 506, 'BÁNH RÁN', 'NÓNG GIÒN', '#a84d3b');
    this._signboard(c, 440, 508, 'NƯỚC MÍA', 'MÁT LẠNH', '#628447');
    this._vietnamFlag(c, 130, 185, .9);
    this._vietnamFlag(c, 300, 228, .72);
    this._vietnamFlag(c, 1042, 236, .72);
    // A bus stop at the left makes the crowd feel like a little town.
    line(c, 34, 426, 34, 529, '#526b60',4); rr(c, 14, 411, 41, 36, 7, '#487a6d'); rr(c, 22, 418, 25, 17, 4, '#f3efd8');
    ellipse(c,26,438,2,2,'#f3efd8'); ellipse(c,43,438,2,2,'#f3efd8');
    // Power poles and sagging telephone wires are characteristic of this street.
    [137,1017].forEach(x=>{line(c,x,269,x,523,'#617c70',5);line(c,x-21,285,x+21,285,'#617c70',4);line(c,x-17,282,x-17,274,'#617c70',3);line(c,x+17,282,x+17,274,'#617c70',3);});
    c.strokeStyle='#577365'; c.lineWidth=1.35;
    [0,9,19].forEach(d=>{c.beginPath();c.moveTo(-5,278+d);c.quadraticCurveTo(59,306+d,137,280+d);c.quadraticCurveTo(566,371+d,1017,280+d);c.quadraticCurveTo(1160,312+d,1290,291+d);c.stroke();});
    text(c,'HÀ NỘI · VIỆT NAM',W/2,705,9,'#527461',700);
  }

  _mausoleum(c,x,y,w,h) {
    const bottom=y+h;
    rr(c,x+14,bottom-61,w-28,18,1,'#9c9582');
    rr(c,x+28,bottom-80,w-56,20,1,'#c3bdab');
    rr(c,x,bottom-61,w,13,1,'#d4cebb');
    rr(c,x+12,bottom-48,w-24,13,1,'#eee7d2');
    rr(c,x+34,y+50,w-68,h-116,2,'#d8d2c1');
    rr(c,x+44,y+61,w-88,h-137,1,'#b9b7aa');
    rr(c,x+52,y+69,w-104,h-154,1,'#c9c7b9');
    c.fillStyle='#797c73';c.fillRect(x+52,y+69,w-104,8);
    c.fillStyle='#8d8e83';c.fillRect(x+52,y+69,8,h-154);
    c.fillStyle='#a4a295';c.fillRect(x+w-60,y+69,8,h-154);
    text(c,this.environment.title,x+w/2,y+88,17,'#f4efdc',800,'center',w-78);
    if(this.environment.subtitle)text(c,this.environment.subtitle,x+w/2,y+107,9,'#e6dfca',650,'center',w-78);
    rr(c,x+w*.37,bottom-133,w*.26,70,2,'#827f70');
    rr(c,x+w*.37+8,bottom-125,w*.26-16,62,1,'#5f6a5c');
    for(let i=0;i<4;i++){
      const cx=x+w*.39+i*w*.055;
      rr(c,cx,bottom-120,5,52,1,'#d4cdb8');
    }
    for(const px of [x+22,x+w-22])rr(c,px-4,bottom-74,8,13,1,'#8d8773');
    this._vietnamFlag(c, x + w / 2, y + 2, 1.0);
  }

  _vietnamFlag(c,x,y,s=1) {
    c.save();c.translate(x,y);c.scale(s,s);
    line(c,0,-2,0,28,'#d8e2dc',2);
    ellipse(c,0,-2,2.5,2.5,'#ffd54f');
    c.fillStyle='#da251d';c.fillRect(1,0,22,14);
    const points=[];
    for(let i=0;i<10;i++){
      const angle=-Math.PI/2+i*Math.PI/5,radius=i%2?2.4:5.5;
      points.push([12+Math.cos(angle)*radius,7+Math.sin(angle)*radius]);
    }
    poly(c,points,'#ffeb3b');
    c.restore();
  }

  _house(c,x,y,w,h,wall,accent,sign,sub,cols,awning) {
    rr(c,x,y,w,h,2,wall); c.fillStyle='#ffffff40';c.fillRect(x+5,y+5,w-10,7);
    c.fillStyle='#566b5225';c.fillRect(x+w-7,y,7,h); c.fillStyle='#f6e9cf';c.fillRect(x-3,y-5,w+6,6);
    const upperH=h-119, windowW=Math.min(31,(w-32)/cols-15);
    for(let row=0;row<Math.max(1,Math.floor(upperH/79));row++) {
      for(let col=0;col<cols;col++) {
        const wx=x+18+col*(w-28)/cols, wy=y+25+row*77;
        rr(c,wx-3,wy-3,windowW+6,46,1,'#f8edce');rr(c,wx,wy,windowW,40,1,'#7eab9f');
        c.fillStyle='#9dc5b0';c.fillRect(wx+3,wy+3,windowW/2-4,34);line(c,wx+windowW/2,wy,wx+windowW/2,wy+40,'#eadfbd',2);
        c.fillStyle='#65796b33';c.fillRect(wx-6,wy+43,windowW+12,5);
        if(row===1 && col===0) {rr(c,wx-7,wy+26,windowW+14,21,2,'#e4d8bd');for(let z=0;z<5;z++)line(c,wx-5+z*(windowW+8)/4,wy+29,wx-5+z*(windowW+8)/4,wy+44,'#b9baa2',1.6);}
      }
    }
    const sy=y+h-117;rr(c,x+4,sy,w-8,40,2,accent);text(c,sign,x+w/2,sy+14,Math.min(12,(w-15)/(sign.length*.65)),'#fff2d8',800,'center',w-17);text(c,sub,x+w/2,sy+29,8,'#fff2d8',700,'center',w-17);
    c.fillStyle='#314e42';c.fillRect(x+10,sy+44,w-20,69);
    c.fillStyle='#668b73';c.fillRect(x+14,sy+48,(w-32)/2,61);c.fillStyle='#adc0a0';c.fillRect(x+w/2+2,sy+48,w/2-17,61);
    line(c,x+w/2,sy+48,x+w/2,sy+110,'#eadbbe',4);
    if(awning) {
      const stripes=Math.floor(w/17);for(let j=0;j<stripes;j++){const dx=x+3+j*(w-6)/stripes;poly(c,[[dx,sy+41],[dx+(w-6)/stripes,sy+41],[dx+(w-6)/stripes+3,sy+57],[dx-3,sy+57]],j%2?'#f3e7c9':accent);rr(c,dx-3,sy+55,(w-6)/stripes+6,6,2,j%2?'#f3e7c9':accent);}
    } else {rr(c,x+1,sy+40,w-2,10,1,accent);}
    // Books, bottles and jars behind each shop window.
    for(let j=0;j<5;j++){const bx=x+20+j*10;rr(c,bx,sy+83-(j%2)*7,7,17+(j%2)*7,1,['#d79568','#dfc478','#8baa80','#eee0b3','#c1775e'][j]);}
    line(c,x+16,sy+100,x+75,sy+100,'#c3ab85',3);
    for(let j=0;j<3;j++)rr(c,x+w-47+j*10,sy+79,6,22,1,'#eee3b7');
    rr(c,x+7,y+h-5,w-14,6,0,'#aba997');
    // Rooftop tank and antenna add distinct silhouettes.
    if(w>175){rr(c,x+w-45,y-29,29,23,5,'#91a8a2');ellipse(c,x+w-30.5,y-28,14.5,4,'#bdd0c4');line(c,x+w-45,y-5,x+w-45,y,'#637e70',2);}
    if(x>800){line(c,x+30,y-4,x+30,y-35,'#688175',2);line(c,x+15,y-28,x+43,y-28,'#688175',1.5);line(c,x+19,y-20,x+40,y-20,'#688175',1.5);}
  }

  _tree(c,x,y,s) {
    c.save();c.translate(x,y);c.scale(s,s);ellipse(c,3,28,44,8,'#314e3821');
    rr(c,-24,8,48,20,3,'#b5b394');rr(c,-27,6,54,7,2,'#cbc5a8');
    line(c,0,11,0,-94,'#8c8260',10);line(c,0,-51,-25,-79,'#8c8260',7);line(c,0,-65,26,-95,'#8c8260',7);
    [[-30,-99,31,'#709c66'],[23,-106,35,'#77a66c'],[-5,-129,35,'#87b478'],[-40,-130,23,'#8bb776'],[37,-136,23,'#91b979'],[-7,-157,26,'#96bd7e'],[-10,-106,29,'#82ae6e']].forEach(([a,b,r,col])=>ellipse(c,a,b,r,r,col));
    ellipse(c,-28,-143,9,7,'#a9c68b77');ellipse(c,22,-120,11,8,'#a9c68b77');c.restore();
  }
  _planter(c,x,y,s){poly(c,[[x-s/2,y],[x+s/2,y],[x+s*.4,y+20],[x-s*.4,y+20]],'#c08763');rr(c,x-s*.6,y-1,s*1.2,5,2,'#d39b70');for(let i=0;i<5;i++){const a=-Math.PI+i*.6;ellipse(c,x+Math.cos(a)*s*.4,y-11+Math.sin(a)*9,5,13,['#5e9367','#709e6d','#90b276'][i%3]);}}
  _signboard(c,x,y,a,b,color){line(c,x-13,y-44,x-20,y+9,'#ba9e74',3);line(c,x+13,y-44,x+20,y+9,'#ba9e74',3);rr(c,x-19,y-45,38,46,2,'#d7bd8c');rr(c,x-16,y-42,32,39,1,color);text(c,a,x,y-29,6.5,'#fff0c9',700,'center',28);text(c,b,x,y-17,4.8,'#fff0c9',700,'center',28);line(c,x-9,y-9,x+9,y-9,'#d6e0bb',1);}

  _scooter(c,x,y,color,s=1,direction=1) {
    c.save();c.translate(x,y);c.scale(s*direction,s);ellipse(c,0,5,40,6,'#2c493529');
    [-23,27].forEach(a=>{ellipse(c,a,0,10,10,'#40544e');ellipse(c,a,0,5.5,5.5,'#d6d9c2');ellipse(c,a,0,2,2,'#7b9385');});
    line(c,-22,-1,13,-1,'#50695f',5);poly(c,[[7,-2],[18,-28],[25,-28],[26,-1]],color);
    rr(c,-31,-25,42,21,8,color);rr(c,-28,-30,33,7,4,'#4d6155');line(c,20,-27,17,-42,'#4d6155',3);line(c,12,-43,26,-43,'#4d6155',3);ellipse(c,24,-29,5,5,'#efecc6');line(c,15,-41,12,-51,'#60756b',1.5);ellipse(c,9,-53,6,3,'#b3c9b4');rr(c,-31,-17,3,7,1,'#eec37d');c.restore();
  }

  _vehicleLightLevel(id) {
    if(!this.run)return 0;
    const p=this.run.progress||0,envelope=smooth((p-.02)/.045)*(1-smooth((p-.95)/.05));
    // Rounded alarm pulses, with each vehicle slightly out of phase. Reduced
    // motion keeps a steady lamp while the UFO is present instead of flashing.
    const pulse=this.reduced?.6:.08+.92*(.5+.5*Math.sin(this.time*TAU*1.25+hash(id+'alarm')*TAU))**2;
    return envelope*pulse;
  }

  _vehicleLights(c,x,y,type,s=1,direction=1,id=type) {
    const level=this._vehicleLightLevel(id);if(level<=0)return;
    c.save();c.translate(x,y);c.scale(s*direction,s);c.globalAlpha*=level;
    const lamps=type==='car'?[[60.5,-17.5,4.5,24,false],[-60.5,-16,4,18,true]]:[[24,-29,5,22,false],[-29.5,-13.5,2,13,true]];
    for(const [lx,ly,radius,halo,rear] of lamps){
      const color=rear?'255,166,77':'255,223,139',glow=c.createRadialGradient(lx,ly,0,lx,ly,halo);
      glow.addColorStop(0,`rgba(${color},.7)`);glow.addColorStop(.3,`rgba(${color},.32)`);glow.addColorStop(1,`rgba(${color},0)`);
      c.fillStyle=glow;c.fillRect(lx-halo,ly-halo,halo*2,halo*2);
      ellipse(c,lx,ly,radius,radius*.84,rear?'#ffbd75':'#fff6c9');
    }
    c.restore();
  }

  _props() {
    const v=this.view,t=this.run?.trafficTime??this.time;
    return {busX:v.left+25,poleX:v.portrait?v.left+34:137,carX:clamp(640+v.width*.18+Math.sin(t*.12)*28,v.left+95,v.right-95),
      redCarX:v.left+v.width*.20+Math.sin(t*.1+1)*23,carY:596};
  }

  _makeGrips(selected) {
    const grips=new Map();
    for(const person of this.students.filter(p=>!p.removed)){
      const s=person.scale,side=person.x<640?1:-1;
      const handX=person.x,handY=person.y-48*s;
      const hands=[{x:handX-3*s,y:handY},{x:handX+3*s,y:handY}];
      grips.set(person.id,{handX,handY,hands,side,groundX:person.x,groundY:person.y,crouch:0,
        type:'ground',support:{axis:'vertical',x:person.x,top:person.y-100,bottom:person.y,side},
        style:'brace',shoulderReach:0,shoulderLift:0,angle:0,phase:hash(person.id+'swing')*TAU});
    }
    return grips;
  }

  _nearMissPlan(person,baseGrip) {
    const episode=this.run?.nearMissActors?.get(person.id),support=baseGrip?.support;
    if(!episode||support?.axis!=='vertical')return null;
    // Rebuild from the current support, so resize/reconnect never accumulate a
    // second offset or reuse a contact from the previous viewport.
    const s=person.scale,room=Math.min(...baseGrip.hands.map(h=>h.y-support.top))/s;
    const shift=Math.min(12,room);if(shift<7.99)return null;
    const to={...baseGrip,handY:baseGrip.handY-shift*s,hands:baseGrip.hands.map(h=>({...h,y:h.y-shift*s}))};
    return {...episode,id:person.id,from:baseGrip,to,shift};
  }

  _nearMissPose(person,pose,plan,p) {
    if(p<plan.start)return pose;
    const q=clamp((p-plan.start)/(plan.end-plan.start)),s=person.scale;
    const reducedAt=this.run.nearMissReducedAt;
    // Let a started arc settle; a later preference change must not drop a body
    // instantly. Subsequent episodes use only the small, quiet higher re-grip.
    const restrained=reducedAt!==null&&reducedAt!==undefined&&reducedAt<=plan.start;
    const catchAt=plan.variant==='one-hand'?[.76,.94]:[.84,.84];
    const caught=catchAt.map(at=>q>=at),phase=caught.every(Boolean)?'held':caught.some(Boolean)?'one-hand':q<.18?'release':'reach';
    const details={id:person.id,variant:plan.variant,q,phase,caught,from:plan.from.hands,to:plan.to.hands,restrained};
    if(q>=1)return {...pose,nearMiss:details};
    const u=clamp(q/.72),blend=smooth(u),arc=Math.sin(Math.PI*u)**2;
    const dx=restrained?0:plan.from.side*3*s*arc;
    const dy=-plan.shift*s*pose.rise*blend-(restrained?0:22*s*arc);
    // The original palm endpoints travel with the torso during the release.
    // Bringing them back only after the torso settles keeps both arms inside
    // their real two-bone reach instead of stretching toward an early catch.
    const angle=pose.angle+(restrained?0:-plan.from.side*.065*arc),turn=angle-pose.angle;
    const x=pose.x+dx,y=pose.y+dy;
    const hands=plan.from.hands.map((hand,index)=>{
      const hx=hand.x-pose.x,hy=hand.y-pose.y;
      let free={x:x+hx*Math.cos(turn)-hy*Math.sin(turn),y:y+hx*Math.sin(turn)+hy*Math.cos(turn)};
      const delayed=plan.variant==='one-hand'&&index===1&&!restrained;
      if(delayed){
        // The second hand visibly folds back toward its own shoulder while the
        // first catches. A later reach makes this a genuine one-handed save.
        const side=pose.facing<0?-1:1,turnAmount=Math.abs(pose.facing*.7);
        const shoulderX=-side*mix(7.5,1.5,turnAmount),shoulderY=-SHOULDER_H;
        const shoulder={x:x+(shoulderX*Math.cos(angle)-shoulderY*Math.sin(angle))*s,y:y+(shoulderX*Math.sin(angle)+shoulderY*Math.cos(angle))*s};
        const tuck=.6*smooth((q-.35)/.2);
        free={x:mix(free.x,shoulder.x,tuck),y:mix(free.y,shoulder.y,tuck)};
      }
      const reachAt=delayed?.78:.58,amount=smooth((q-reachAt)/(catchAt[index]-reachAt));
      return {x:mix(free.x,plan.to.hands[index].x,amount),y:mix(free.y,plan.to.hands[index].y,amount)};
    });
    return {...pose,x,y,angle,grip:caught.some(Boolean)?plan.to:null,reach:caught.some(Boolean)?1:0,
      nearMissHands:hands,nearMiss:details,legLift:pose.legLift.map(value=>mix(value,1,arc*.65)),
      // Keep the normal bent-arm side throughout the grip/free/grip transition.
      nearMissHanging:true};
  }

  _foregroundSupports(c, supports=this.supports||[]) {
    for(const support of supports){
      const {x,y,index}=support;
      if(support.type==='scooter'){this._scooter(c,x,y,['#c86757','#7fa6b6','#e4b578'][index%3],.93,index%2?-1:1);continue;}
      ellipse(c,x,y+3,12,3,'#36534226');poly(c,[[x-8,y],[x+8,y],[x+4,y-20],[x-4,y-20]],'#487763');
      line(c,x,y-14,x,y-94,'#537f69',5);line(c,x-1,y-14,x-1,y-94,'#88a68c',1.3);
      if(index%3===0){c.beginPath();c.moveTo(x,y-79);c.quadraticCurveTo(x,y-105,x+15,y-104);c.strokeStyle='#537f69';c.lineWidth=4;c.stroke();rr(c,x+9,y-107,24,7,3,'#4b725f');ellipse(c,x+21,y-100,8,2,'#ebebbf');}
      else {ellipse(c,x,y-94,5,3,'#79967b');}
      rr(c,x-3,y-33,6,7,0,'#c1c9a1');
    }
  }

  _busShelter(c,x,part='all') {
    const bottom=Math.min(this.view.bottom-17,703),top=bottom-139;
    if(part!=='phone'){
    // A flat route-map board at the front LEFT, as in the source street.
    line(c,x+7,top,x+7,bottom,'#4b7890',7);line(c,x+110,top,x+110,bottom,'#4b7890',7);
    rr(c,x-4,top+4,124,113,3,'#6c9aad');rr(c,x+1,top+10,114,102,1,'#efe8d5');rr(c,x-7,top-4,131,29,3,'#3f789e');text(c,translate('XE BUÝT'),x+58,top+11,14,'#f6f1d8',800,'center',119);
    c.beginPath();c.moveTo(x+15,top+43);c.lineTo(x+42,top+60);c.lineTo(x+27,top+88);c.lineTo(x+78,top+72);c.lineTo(x+101,top+97);c.strokeStyle='#b76f61';c.lineWidth=2.8;c.stroke();
    c.beginPath();c.moveTo(x+85,top+35);c.lineTo(x+54,top+66);c.lineTo(x+62,top+99);c.strokeStyle='#638e9f';c.lineWidth=2.5;c.stroke();
    [[15,43],[42,60],[27,88],[78,72],[101,97],[85,35],[62,99]].forEach(([dx,dy])=>{ellipse(c,x+dx,top+dy,3.5,3.5,'#f9efce');ellipse(c,x+dx,top+dy,2,2,'#9b6a5c');});
    }
    if(part!=='board'){
    const tx=this.view.right-48,ty=Math.min(this.view.bottom-17,703);
    rr(c,tx-24,ty-111,48,111,3,'#82b9bfb0');rr(c,tx-29,ty-119,58,18,3,'#4384a5');text(c,translate('ĐIỆN THOẠI'),tx,ty-110,6,'#f5f4d7',800,'center',52);line(c,tx-22,ty-101,tx-22,ty,'#477c9b',5);line(c,tx+22,ty-101,tx+22,ty,'#477c9b',5);
    rr(c,tx-9,ty-88,21,35,3,'#cfddcd');rr(c,tx-6,ty-84,15,12,2,'#66968f');for(let k=0;k<6;k++)ellipse(c,tx-3+(k%3)*4,ty-67+Math.floor(k/3)*4,1,1,'#6e9188');line(c,tx-13,ty-83,tx-13,ty-62,'#44695e',5);rr(c,tx-27,ty-4,54,5,1,'#5687a0');
    }
  }

  _busBench(c) {
    const {x,width,seatY,groundY}=this._waitingBench();
    ellipse(c,x+width/2,groundY+1,width*.52,3,'#344b3422');
    for(const px of [x+10,x+width-10]){
      line(c,px,seatY-24,px,groundY-2,'#546b60',3.2);
      line(c,px,groundY-2,px+5,groundY-2,'#546b60',3.2);
    }
    rr(c,x+2,seatY-24,width-4,6,1.5,'#a8774d');
    rr(c,x+2,seatY-14,width-4,6,1.5,'#b98b59');
    rr(c,x,seatY,width,6,1.5,'#8a6344');
    line(c,x+1,seatY,x+width-1,seatY,'#d2a772',2);
    for(const px of [x+10,x+width-10])for(const py of [seatY-21,seatY-11])ellipse(c,px,py,1,1,'#665540');
  }

  _roadAndPavement(c) {
    const v=this.view;c.fillStyle='#66727c';c.fillRect(0,539,W,86);line(c,0,542,W,542,'#d3d4c3',4);line(c,0,620,W,620,'#d4d7c7',3);
    for(let x=28;x<W;x+=163)rr(c,x,580,88,4,2,'#e8e9db');
    for(let i=0;i<7;i++)poly(c,[[1088+i*23,548],[1101+i*23,548],[1101+i*23,614],[1088+i*23,614]],'#e4e5d6');
    c.fillStyle='#e0d5c1';c.fillRect(0,625,W,Math.max(100,v.bottom-625));line(c,0,625,W,625,'#b7bfad',6);
    for(let y=650;y<v.bottom;y+=31){line(c,0,y,W,y,'#c9c1ad',.8);for(let x=(Math.floor(y/31)%2)*37;x<W;x+=74)line(c,x,y,x+6,y+31,'#c9c1ad',.7);}
    c.fillStyle='#bac6ae';c.fillRect(0,v.bottom-7,W,7);
  }

  _streetLamps(c, onlyIndex=null) {
    const v=this.view,positions=v.width>900?[.12,.88]:[.16,.76];
    positions.forEach((f,i)=>{if(onlyIndex!==null&&i!==onlyIndex)return;const x=v.left+v.width*f,base=Math.min(v.bottom-22,695),top=328+(i%2)*9;
      poly(c,[[x-8,base],[x+8,base],[x+4,base-31],[x-4,base-31]],'#4e705e');line(c,x,base-23,x,top+27,'#5b7c69',5);line(c,x-1,base-23,x-1,top+27,'#90a48a',1);
      c.beginPath();c.moveTo(x,top+28);c.quadraticCurveTo(x,top,x+29,top);c.strokeStyle='#567763';c.lineWidth=5;c.stroke();poly(c,[[x+20,top-4],[x+47,top-4],[x+52,top+5],[x+18,top+5]],'#4e705e');ellipse(c,x+36,top+6,13,2,'#f2edc5');
    });
  }

  _powerPole(c,x) {
    line(c,x,260,x,543,'#8a8e7a',8);line(c,x+2,260,x+2,543,'#b1b49a',3);
    line(c,x-27,280,x+27,280,'#6a8073',5);
    [-21,-7,8,22].forEach(dx=>{line(c,x+dx,280,x+dx,267,'#657d70',3);rr(c,x+dx-4,265,8,7,2,'#8aa18d');});
    rr(c,x-10,363,21,29,3,'#8d9981');rr(c,x-6,367,13,19,1,'#aeb59c');
    for(let i=0;i<3;i++){c.beginPath();c.moveTo(this.view.left-10,281+i*9);c.quadraticCurveTo(x-28,303+i*10,x,277+i*10);c.quadraticCurveTo(x+160,351+i*10,this.view.right+10,283+i*9);c.strokeStyle='#536e626b';c.lineWidth=1.2;c.stroke();}
    for(let i=0;i<4;i++)rr(c,x-4,435+i*15,8,7,0,i%2?'#d9c28b':'#556e5e');
  }

  _car(c,x,y,color="#c2ddd2",taxi=false) {
    c.save();c.translate(x,y);ellipse(c,0,4,62,8,'#2c4e3c26');
    [-37,35].forEach(wx=>{ellipse(c,wx,0,12,12,'#344a42');ellipse(c,wx,0,6,6,'#d4ddc4');ellipse(c,wx,0,3,3,'#869b8d');});
    rr(c,-62,-31,125,30,8,color);poly(c,[[-43,-28],[-26,-59],[29,-59],[49,-28]],color);
    if(taxi){rr(c,-14,-68,28,9,2,'#4c8e75');text(c,'TAXI',0,-63,6,'#f5f2d7',800);line(c,-58,-17,59,-17,'#4b9579',3);}
    poly(c,[[-35,-32],[-23,-53],[-3,-53],[-3,-32]],'#709b99');poly(c,[[3,-53],[25,-53],[41,-32],[3,-32]],'#7eaeab');
    line(c,0,-28,0,-7,'#92b8a9',1.5);rr(c,7,-25,12,3,1,'#699185');rr(c,-27,-25,12,3,1,'#699185');
    rr(c,-65,-20,9,8,2,'#d28364');rr(c,56,-22,9,9,3,'#fff0bc');line(c,-56,-6,55,-6,'#eff4dc',3);
    // One friendly driver behind the front window.
    ellipse(c,17,-42,5,6,'#d3a17b');ellipse(c,17,-47,5,3,'#54634b');
    c.restore();
  }

  _frame(now) {
    if(this.dead)return;
    const elapsed=Math.max(0,now-this.last),delta=Math.min(40,elapsed);this.last=now;this.delta=delta/1000;this.time+=(this.reduced?0:delta)/1000;
    this._updateWelcomes(now);
    this._updateIdleDialogueRequest(delta/1000);
    this.petPassers??=createPetPassers();
    this.petVisitor=this.petPassers.update(delta/1000,{allowed:!this.run&&!this.attendanceStudentId&&!this.welcomes?.size,visible:!this.warningPaused,reduced:this.reduced,view:this.view});
    this.streetVendors??=createStreetVendors();
    this.streetVendors.update(delta/1000,{allowed:!this.run&&!this.attendanceStudentId&&!this.welcomes?.size&&!this.idleDialogueRequest,visible:!this.warningPaused,reduced:this.reduced,view:this.view,students:this.students});
    if(!this.run&&!this.warningPaused){for(const person of this.students){
      const visitor=this.streetVendors.actorFor(person.id);
      if(visitor){Object.assign(person,visitor);person.chatUntil=0;continue;}
      if(this.reduced)continue;
      if(this.idleDialogueRequest?.id===person.id){person.chatting=true;person.walking=false;continue;}
      if(person.id===this.attendanceStudentId){person.walking=person.chatting=false;person.chatUntil=0;continue;}
      if(person.recovery||person.waitingSeat||this.welcomes?.has(person.id)){person.walking=person.chatting=false;continue;}
      person.chatting=(person.chatUntil||0)>this.time;
      person.walking=!person.chatting&&(this.time+hash(person.id+'pause')*11)%10<7.8;
      if(person.walking){person.x+=person.direction*(12+hash(person.id+'speed')*13)*delta/1000;
        if(person.x>this.view.right-42){person.x=this.view.right-42;person.direction=-1;}
        else if(person.x<this.view.left+42){person.x=this.view.left+42;person.direction=1;}
      }
    }
      if(!this.reduced&&!this.vendorConversationActive)for(const person of this.students){if(person.id===this.attendanceStudentId||person.recovery||person.waitingSeat||this.welcomes?.has(person.id)||person.walking||person.chatting||person.removed)continue;
        const peer=this.students.find(other=>other.id!==this.attendanceStudentId&&other!==person&&!other.removed&&!other.recovery&&!other.waitingSeat&&!this.welcomes?.has(other.id)&&!other.chatting&&Math.abs(other.y-person.y)<22&&Math.abs(other.x-person.x)>25&&Math.abs(other.x-person.x)<100);
        if(peer){person.chatting=peer.chatting=true;person.walking=peer.walking=false;person.chatUntil=peer.chatUntil=this.time+2.1;person.chatPeer=peer.id;peer.chatPeer=person.id;person.direction=peer.x>person.x?1:-1;peer.direction=-person.direction;}
      }
      for(const person of this.students){if(person.recovery||person.waitingSeat||this.welcomes?.has(person.id))continue;person.facing=mix(person.facing??person.direction,person.direction,1-Math.exp(-delta/180));person.stepPose=updateFootPlants(person,delta/1000);}
    }
    if(this.run?.follow)this._advanceFollowFlight(now);
    else if(this.run){
      const run=this.run,remaining=Math.max(0,(run.warningDuration||0)-(run.warningElapsed||0));
      // Audio keeps native time even on a slow display. Only the flight's body
      // simulation is capped; hidden tabs explicitly pause the warning clock.
      const warningDelta=Math.max(0,now-(run.warningAt??now));
      run.warningAt=Math.max(run.warningAt??now,now);
      if(run.warningDuration&&(run.choreographyVersion===2?run.warningActive||run.progress<INTRO_END:run.progress<.10)&&!this.warningPaused)run.alarmElapsed=(run.alarmElapsed||0)+warningDelta;
      const warningStep=this.warningPaused?0:Math.min(warningDelta,remaining);
      run.warningElapsed=(run.warningElapsed||0)+warningStep;
      let audioComplete=true;
      if(run.warningDuration&&run.warningElapsed>=run.warningDuration){try{audioComplete=run.warningComplete?.()!==false;}catch{/* A failed audio device must not block the draw. */}}
      run.warningActive=!!(run.warningDuration&&(run.warningElapsed<run.warningDuration||!audioComplete||this.warningPaused&&run.warningActive));
      if(run.choreographyVersion!==2&&run.warningActors&&(remaining||run.warningActive))this._updateWarningReactions();
      // A shared flight has one real-time choreography clock on every screen.
      // Keep the bounded delta for feet/idle integration, never let a slow
      // teacher display make its logical clock lag behind the remote viewers.
      const flightClock=run.sharedClock?warningDelta:delta;
      const flightDelta=run.warningActive||this.warningPaused&&(run.sharedClock||run.progress<.10)?0:remaining?Math.min(flightClock,Math.max(0,warningDelta-warningStep)):run.warningDuration&&run.progress<.10?Math.min(flightClock,warningDelta):flightClock;
      Object.assign(run,this._timelineAt(run.choreographyVersion===2?this._advanceChoreography(run.elapsed,this.warningPaused?0:warningDelta):run.elapsed+flightDelta*this.speed));
      if(run.choreographyVersion===2&&run.warningActors)this._updateWarningReactions();
    }
    this._draw();
    for(const [id,entry] of this.welcomes||[])if(entry.landed&&!entry.delivered&&!this.warningPaused&&!this.run){entry.delivered=true;try{entry.onLand(id);}catch{/* A welcome voice cannot interrupt the scene. */}}
    if(this.run?.progress>=1&&!this.run.follow)this._finish({waitForResult:true});
    this.raf=requestAnimationFrame(this._frame);
  }

  warningEffects() {
    const run=this.run;
    if(run?.choreographyVersion===2){
      if(!run.warningDuration||run.progress>=INTRO_END)return {};
      return {warningDuration:run.warningDuration/1000,warningElapsed:(run.alarmElapsed||0)/1000,
        warningProgress:Math.min(.999999,run.warningElapsed/run.warningDuration),warningIntro:run.progress<ARRIVAL_START,warningLoop:true};
    }
    if(!run||!run.warningDuration||!run.warningActive&&run.progress>=.10)return {};
    return {warningDuration:run.warningDuration/1000,warningElapsed:(run.alarmElapsed||0)/1000,
      warningProgress:Math.min(.999999,run.warningElapsed/run.warningDuration),warningIntro:run.warningActive,warningLoop:true};
  }

  _makeWarningActors() {
    // Reaction choices use only the visible pupil's ID, never the draw result.
    return new Map(this.students.filter(person=>!person.removed).map(person=>{
      const recoveryPose=person.recovery?this._recoveryPose(person):null;
      const random=key=>hash(`${person.id}:warning:${key}`);
      return [person.id,{originX:person.x,lastX:person.x,y:person.y,scale:person.scale,
        facing:person.facing??person.direction,initialStride:0,
        initialAngle:0,
        initialYaw:(person.facing??person.direction)*.5,
        delay:.1+random('delay')*.2,direction:0,distance:0,backstep:0,
        moveDelay:0,moveDuration:1,
        backDelay:0,backDuration:1,
        style:['ears','head','gesture'][Math.floor(random('style')*3)],phase:random('phase')*TAU,
        seat:this.run.waitingSeats.get(person.id),floor:person.recovery,
        floorPose:person.recovery?recoveryPose:null,floorProgress:recoveryPose?.recoveryProgress||0,
        lastAge:0,travel:0,travelOffset:0,wasReduced:this.reduced,sprint:0,
      }];
    }));
  }

  _rebaseWarningActors() {
    for(const person of this.students){const actor=this.run.warningActors?.get(person.id);if(!actor)continue;
      actor.distance=0;actor.backstep=0;
      actor.originX=person.x;actor.lastX=person.x;actor.y=person.y;actor.scale=person.scale;actor.wasReduced=true;
      actor.seat=null;actor.floor=null;actor.floorPose=null;person.recovery=null;this.run.waitingSeats.delete(person.id);
    }
  }

  _updateWarningReactions() {
    const run=this.run,age=this._reactionAge()/1000;
    for(const person of this.students){const actor=run.warningActors?.get(person.id);if(!actor||person.removed)continue;
      const local=Math.max(0,age-actor.delay);
      if(actor.floor){
        const progress=mix(actor.floorProgress,1,smooth((local-.45)/1.3));
        actor.floorPose=this._recoveryPose(person,progress);
        if(!person.recovery){actor.floor=null;actor.floorPose=null;actor.originX=person.x;actor.lastX=person.x;}
      }
      person.x=actor.originX;
      person.chatting=false;person.chatUntil=0;person.walking=false;
      actor.sprint=0;actor.travel=0;actor.lastX=person.x;actor.lastAge=age;actor.wasReduced=this.reduced;
      person.stepPose=resetFootPlants(person);
      if(actor.seat&&local>=2)this.run.waitingSeats.delete(person.id);
      const pose=this._warningPose(person);
      if(pose){person.facing=pose.facing;person.direction=Math.sign(pose.facing)||person.direction;}
    }
  }

  _warningPose(person) {
    const run=this.run,actor=run?.warningActors?.get(person.id);if(!actor)return null;
    const age=this._reactionAge()/1000,local=Math.max(0,age-actor.delay),s=person.scale;
    const react=smooth(local/.18);
    const startle=this.reduced?.16*react:react*(1-smooth((local-.65)/1.1));
    const settle=smooth((local-1.8)/.6);
    const alert=smooth((local-.6)/.4);
    const pulse=this.reduced?0:Math.sin(local*3.2+actor.phase);
    const skyFacing=person.x<640?1:-1,facing=skyFacing;
    const angle=this.reduced?0:(.02*pulse-.035*settle);
    const flightGaze=this._arrivalGaze(run.progress);
    const step=resetFootPlants(person),yaw=skyFacing*.7;
    const crouch=this.reduced?0:(startle*2.5+settle*(3.2+pulse*.5))*s;
    const base={x:actor.originX,y:person.y+groundedBodyOffset(person,step.feet,{angle,facing,turn:Math.abs(yaw)})+crouch,
      angle,scale:s,facing,yaw,walk:0,feet:step.feet,kick:0,grip:null,reach:0,
      shadow:1,labelOpacity:1,captureOpacity:1,groundY:person.y};
    if(actor.seat&&local<2){
      const standing=clamp((local-.7)/1.3),seatPose=this._waitingPose(person,actor.seat,actor.seat.standAt+actor.seat.standDuration*standing);
      Object.assign(base,seatPose,{y:seatPose.y+crouch,angle:seatPose.angle+angle,walk:0});
      base.benchBlend*=1-startle;
    }
    if(actor.floorPose){Object.assign(base,actor.floorPose,{y:actor.floorPose.y+crouch,angle:actor.floorPose.angle+angle});base.brace*=1-startle;}
    const side=clamp(facing,-1,1);
    const hands=actor.style==='ears'?[{x:side*7,y:-69},{x:-side*7,y:-69}]:actor.style==='head'?[{x:side*4,y:-78},{x:-side*4,y:-78}]:[{x:-side*2,y:-49},{x:side*(18+pulse*2),y:-52-settle*10}];
    return {...base,startle,sprint:0,
      fear:Math.min(1,(this.reduced?.5:.8+settle*.2)*Math.max(.85,react)),
      lookUp:Math.min(1,(this.reduced?.45:.5*alert+.5*settle+.3*flightGaze)),
      alarmHands:hands,alarmBlend:Math.max(.85,alert*react),
      alarmStyle:actor.style,alarmStage:age<2?'startle':'settle',alarmDelay:actor.delay,
      reactionTime:age,alarmTremble:!this.reduced&&react>.05,
    };
  }

  _timelineAt(elapsed) {
    const run=this.run;if(!run)return null;
    // Only the choreography pauses. Struggle, particles and ambient playback
    // follow elapsed time, while every original active stage retains its speed.
    const suspenseElapsed=clamp(elapsed-UFO_TIMING.suspenseStart*run.duration,0,run.suspenseDuration||0);
    const scanHoldElapsed=(run.scanSchedule||[]).slice(1).reduce((sum,cue)=>sum+clamp(elapsed-cue.start,0,cue.hold),0);
    const end=run.duration+(run.suspenseDuration||0)+(run.scanHoldDuration||0);
    return {elapsed,suspenseElapsed,scanHoldElapsed,progress:elapsed>=end-1e-7?1:clamp((elapsed-suspenseElapsed-scanHoldElapsed)/run.duration)};
  }

  _totalDuration() {
    const run=this.run;
    return (run.choreographyVersion===2?INTRO_MS+run.duration*(1-INTRO_END):run.duration+(run.warningDuration||0))+(run.suspenseDuration||0)+(run.scanHoldDuration||0);
  }

  _advanceChoreography(elapsed,delta,speed=this.speed) {
    const intro=this.run.duration*INTRO_END,rate=intro/INTRO_MS;
    const first=Math.min(Math.max(0,delta),Math.max(0,intro-elapsed)/rate);
    const next=elapsed+first*rate+Math.max(0,delta-first)*speed;
    // Fractional reduced-motion units still land on the exact cue boundary.
    return [ARRIVAL_START,ARRIVAL_END,INTRO_END].map(p=>p*this.run.duration).find(at=>Math.abs(at-next)<1e-7)??next;
  }

  _reactionAge() {
    const run=this.run;
    return run?.choreographyVersion===2?Math.min(INTRO_MS,(run.elapsed||0)/(run.duration*INTRO_END)*INTRO_MS):run?.warningElapsed||0;
  }

  _arrivalGaze(p) {
    return this.run?.choreographyVersion===2?smooth((p-ARRIVAL_START)/(.5/24))*(1-smooth((p-ARRIVAL_END)/(.6/24))):smooth((p-.018)/.035)*(1-smooth((p-.115)/.035));
  }

  _bodyPose(person, grip, p, isTarget, lift, localPhase, portal) {
    const run=this.run,s=person.scale,t=this.time;
    if(!run&&this.welcomes?.has(person.id))return this._welcomePose(person,this.welcomes.get(person.id));
    if(!run&&person.recovery)return this._recoveryPose(person);
    if(!run&&person.waitingSeat&&!person.walking)return this._waitingPose(person,person.waitingSeat);
    const waitingSeat=run?.waitingSeats?.get(person.id);
    if(waitingSeat&&p<.045)return this._waitingPose(person,waitingSeat,p);

    if(!run){
      const step=person.stepPose||resetFootPlants(person),facing=person.facing??person.direction;
      const angle=person.walking?facing*.055:0,turn=Math.abs(facing)*(person.walking?.94:person.chatting?.68:.50);
      return {x:person.x,y:person.y+groundedBodyOffset(person,step.feet,{angle,facing,turn}),angle,scale:s,facing,
        walk:step.stride,feet:step.feet,kick:0,shadow:1,labelOpacity:1,captureOpacity:1,groundY:person.y};
    }

    // Phase 1 (Warning/Siren & initial arrival before suction):
    // Students remain immobilized at their spots, trembling and looking up in terror (no running to sides).
    if(p<UFO_TIMING.riseStart){
      const warnPose=this._warningPose(person);
      if(warnPose)return warnPose;
      const step=person.stepPose||resetFootPlants(person),facing=person.facing??(person.x<640?1:-1);
      return {x:person.x,y:person.y+groundedBodyOffset(person,step.feet,{angle:0,facing,turn:0.5}),angle:0,scale:s,facing,
        walk:0,feet:step.feet,kick:0,shadow:1,labelOpacity:1,captureOpacity:1,groundY:person.y,fear:1,lookUp:1,startle:1};
    }

    // Phase 2 (Tractor beam & anti-gravity suction - "bay kiểu môi trường không trọng lực chậm thôi quay vòng"):
    const rise=smooth((p-UFO_TIMING.riseStart-person.seed*.016)/UFO_TIMING.riseDuration);
    const step=resetFootPlants(person);
    const facing=person.facing??(person.x<640?1:-1);
    const originX=person.x,groundY=person.y;

    const struggleAge=Math.max(0,(p-UFO_TIMING.riseStart-person.seed*.016)*((run?.duration)||24000)+(run?.suspenseElapsed||0)+(run?.scanHoldElapsed||0))/1000;
    const effortCycle=(struggleAge/(1.12+person.seed*.28)+person.seed*.65)%1;
    const effortPulse=smooth(effortCycle/.24)*(1-smooth((effortCycle-.34)/.56));
    const strain=this.reduced?0:effortPulse*smooth((rise-.08)/.30);
    const pullEnvelope=this.reduced?0:smooth((rise-.18)/.44),suction=effortPulse*pullEnvelope;

    // Slow zero-gravity tumbling and graceful weightless drifting
    const smoothRise=smooth(rise);
    const spinRate=(0.32+(person.seed%0.35)*0.35)*(person.seed>0.5?1:-1);
    const zeroGTumble=(t*spinRate+person.seed*TAU);
    let bodyAngle=this.reduced?0:mix(0,zeroGTumble,smoothRise)+Math.sin(t*0.9+person.seed*3)*0.12*smoothRise;

    const floatHeight=(80+person.seed*55)*smoothRise*s;
    const floatOscillation=Math.sin(t*1.15+person.seed*TAU)*(14+person.seed*8)*smoothRise*s;
    const floatSway=Math.cos(t*0.85+person.seed*TAU)*(18+person.seed*12)*smoothRise*s;

    let x=originX+floatSway;
    let y=groundY-floatHeight+floatOscillation;
    let kick=this.reduced?0:Math.sin(t*1.2+person.seed*TAU)*0.12*smoothRise;
    let scale=s,labelOpacity=1,captureOpacity=1,release=null;
    const airborne=rise>0.03;
    const legLift=[0.24+Math.sin(t*0.9+person.seed)*0.1,0.28+Math.cos(t*0.9+person.seed)*0.1];

    // Target student gets pulled up into the UFO hatch
    if(isTarget&&localPhase>=.2){
      if(!run.releases.has(person.id)){
        const defHands = [
          { x: x - 12 * s, y: y - 48 * s },
          { x: x + 12 * s, y: y - 48 * s }
        ];
        run.releases.set(person.id, { x, y, angle: bodyAngle, scale: s, hands: defHands });
      }
      release=run.releases.get(person.id);
      scale=s*mix(1,.82,smooth((lift-.55)/.45));
      x=mix(release.x,portal.x,smooth(lift/.60));
      y=mix(release.y,portal.y-(HATCH.ry+1)*portal.size-8*scale,smooth(lift));
      bodyAngle=mix(release.angle,0,smooth(lift/.68));
      kick=mix(.08,.01,smooth(lift/.68));
      labelOpacity=1-smooth((lift-.48)/.18);
      captureOpacity=1-smooth((lift-.90)/.10);
    }

    const pose={
      x, y, angle: bodyAngle, scale, facing,
      walk: 0, feet: airborne?null:step.feet, airborne,
      kick, legLift: airborne?legLift:null,
      strain: strain*(1-smooth(lift/.35)),
      suction: suction*(1-smooth(lift/.35)),
      holdStyle: 'brace', holdBlend: 0,
      rise, grip: null, reach: 0,
      startle: 1, sprint: 0, braking: 0,
      fear: Math.min(1,.75+rise*.25), lookUp: 1, alarmTremble: !this.reduced,
      shadow: Math.max(0,1-rise*.92),
      labelOpacity, captureOpacity,
      release, releaseBlend: smooth(lift/.24),
      groundY
    };

    // When abduction is complete, non-target students drop out of the sky back to the ground!
    if(p>=CAPTURE_END&&!isTarget){
      const safeGrip = (grip && grip.hands && grip.hands.length >= 2) ? grip : {
        side: facing < 0 ? -1 : 1,
        groundX: originX,
        hands: [
          { x: originX - 12 * s, y: groundY - 48 * s },
          { x: originX + 12 * s, y: groundY - 48 * s }
        ]
      };
      return this._fallPose(person, safeGrip, p, pose);
    }

    return pose;
  }

  _seatedPose(person,fall,compression=0) {
    const s=person.scale,angle=-fall.facing*(.22+compression*.08),hipHeight=7-compression*1.5;
    return {x:fall.seatX-HIP_H*s*Math.sin(angle),y:fall.groundY-hipHeight*s+HIP_H*s*Math.cos(angle),angle,scale:s,
      facing:fall.facing,walk:0,feet:fall.feet,kick:0,grip:null,reach:0,shadow:1,labelOpacity:1,groundY:fall.groundY,
      fallHands:fall.hands,brace:1,groundedFall:true,fallStage:'seated',hip:{x:fall.seatX,y:fall.groundY-hipHeight*s}};
  }

  _fallPose(person,grip,p,hanging) {
    const s=person.scale,run=this.run;run.falls??=new Map();
    let fall=run.falls.get(person.id);
    if(!fall){
      const facing=-grip.side,seatX=grip.groundX+grip.side*8*s,groundY=person.y;
      const releaseHands = (grip && grip.hands && grip.hands.length >= 2)
        ? grip.hands.map(hand => ({ ...hand }))
        : [
            { x: seatX - facing * 15 * s, y: groundY - 48 * s },
            { x: seatX + facing * 11 * s, y: groundY - 48 * s }
          ];
      let startAngle = hanging.angle || 0;
      const targetAngle = -facing * 0.22;
      while (startAngle - targetAngle > Math.PI) startAngle -= TAU;
      while (startAngle - targetAngle < -Math.PI) startAngle += TAU;
      fall={facing,seatX,groundY,dropAt:CAPTURE_END+person.seed*.0025,dropDuration:.017+person.seed*.002,
        start:{...hanging, angle: startAngle},startHip:{x:hanging.x+HIP_H*s*Math.sin(startAngle),y:hanging.y-HIP_H*s*Math.cos(startAngle)},
        feet:[{x:seatX+facing*(23+person.seed*3)*s,y:groundY-2.2*s,planted:true,phase:0},{x:seatX+facing*(34-person.seed*2)*s,y:groundY-2.2*s,planted:true,phase:0}],
        hands:[{x:seatX-facing*15*s,y:groundY-2.2*s},{x:seatX+facing*11*s,y:groundY-2.2*s}],
        releaseHands};
      run.falls.set(person.id,fall);
    }
    const q=clamp((p-fall.dropAt)/fall.dropDuration);
    if(p<fall.dropAt)return {...hanging,fallStage:'holding'};
    if(q===1){const age=(p-fall.dropAt-fall.dropDuration)*(run.duration||24000)/1000;
      return this._seatedPose(person,fall,1-smooth(age/.16));}
    const seated=this._seatedPose(person,fall,1),angle=mix(fall.start.angle,seated.angle,smooth(q/.86));
    // Hip height follows gravity; the torso unrolls before the low seated impact.
    const hip={x:mix(fall.startHip.x,fall.seatX,smooth(q)),y:mix(fall.startHip.y,fall.groundY-5.5*s,q*q)};
    return {...seated,x:hip.x-HIP_H*s*Math.sin(angle),y:hip.y+HIP_H*s*Math.cos(angle),angle,hip,
      kick:1-smooth((q-.38)/.6),holdStyle:fall.start.holdStyle,holdBlend:1-smooth(q/.38),strain:(fall.start.strain||0)*(1-smooth(q/.45)),shadow:smooth(q),groundedFall:q>.8,fallStage:'dropping',fallProgress:q,
      fallHands:fall.hands.map((hand,index)=>{
        const rel = (fall.releaseHands && fall.releaseHands[index]) ? fall.releaseHands[index] : hand;
        return {x:mix(rel.x,hand.x,smooth(q/.84)),y:mix(rel.y,hand.y,smooth(q/.84))};
      })};
  }

  _recoveryPose(person,progress=null) {
    const fall=person.recovery,s=person.scale,elapsed=this.reduced?(performance.now()-(fall.startedReal??performance.now()))/1000:this.time-fall.started;
    const u=progress===null?clamp((elapsed-fall.delay)/fall.duration):clamp(progress),seat=this._seatedPose(person,fall);
    if(u===0)return seat;
    const finalX=fall.seatX+fall.facing*12*s;
    const step=(index,from,to)=>{const q=smooth((u-from)/(to-from)),start=fall.feet[index],targetX=finalX+(index?1:-1)*3.2*s;
      return {x:mix(start.x,targetX,q),y:start.y-Math.sin(Math.PI*q)*3.2*s,planted:q===0||q===1,phase:q};};
    const feet=[step(0,0,.35),step(1,.32,.73)];
    const angle=u<.45?mix(seat.angle,fall.facing*.22,smooth(u/.45)):mix(fall.facing*.22,0,smooth((u-.45)/.55));
    const standingFeet=[-1,1].map(sign=>({x:finalX+sign*3.2*s,y:person.y-2.2*s}));
    const standingOffset=groundedBodyOffset({...person,x:finalX},standingFeet,{facing:fall.facing,turn:.5});
    const hip={x:mix(fall.seatX,finalX,smooth(u/.8)),y:fall.groundY-mix(7,HIP_H-standingOffset/s,smooth(u))*s};
    if(u===1){person.x=finalX;person.direction=person.facing=fall.facing;person.recovery=null;person.stepPose=resetFootPlants(person);
      return {x:person.x,y:person.y+standingOffset,scale:s,angle:0,facing:fall.facing,walk:0,feet:person.stepPose.feet,kick:0,shadow:1,labelOpacity:1,groundY:person.y};}
    return {...seat,x:hip.x-HIP_H*s*Math.sin(angle),y:hip.y+HIP_H*s*Math.cos(angle),angle,hip,feet,
      brace:1-smooth((u-.08)/.4),fallStage:'recovering',recoveryProgress:u};
  }

  _arrivalElapsed() {
    const run=this.run;
    if(run?.choreographyVersion===2)return run.elapsed/run.duration*24000;
    // The warning clock is shared and pauses when the teacher is hidden. A
    // short warning hands the presentation over to the existing flight clock.
    return run?.warningDuration?(run.warningElapsed||0)+(run.elapsed||0):0;
  }

  _shipProgress(p=this.run?.progress||0) {
    if(this.run?.choreographyVersion===2)return p;
    // Arrival, night and the broad light share a presentation clock. Pupil
    // choreography and the selected result still use the original flight p.
    const age=this._arrivalElapsed();
    const preview=age>WARNING_SHIP_START ? .015+.085*clamp((age-WARNING_SHIP_START)/WARNING_SHIP_ENTRY) : 0;
    // Retain the reached position when the warning ends, until the real flight
    // catches up; reconnects and delayed audio cannot replay the descent.
    return Math.max(p,preview);
  }

  _shipPose(p,t=this.time,v=this.view) {
    // Keep the reference scale throughout: descend from above, hover, then
    // bank and accelerate mostly upward with only a short move to the right.
    const size=Math.min(2.4,v.width/260),hoverY=Math.max(141,v.top+92/(v.scale||1)+20*size);
    const sway=this.reduced?0:Math.sin(t*.7)*2.4,bob=this.reduced?0:Math.sin(t*1.2)*1.6;
    const arrival=this.run?.choreographyVersion===2?smooth((p-ARRIVAL_START)/(ARRIVAL_END-ARRIVAL_START)):smooth((p-.015)/.085),takeoff=clamp((p-.953)/.047),flight=takeoff*takeoff;
    const outsideTop=v.top-105*size;
    const x=640+sway*arrival+212*size*.2*flight;
    const y=mix(outsideTop,hoverY+bob,arrival)+(outsideTop-hoverY)*flight;
    const angle=this.reduced?0:Math.sin(t*1.2)*.004*arrival-.22*smooth(takeoff/.42);
    return {x,y,size,angle};
  }

  _shipBounds(ship) {
    // The rectangle includes the saucer, canopy, hatch, lamp glow and halo.
    const points=[-120,120].flatMap(x=>[-34,65].map(y=>({
      x:ship.x+(x*Math.cos(ship.angle)-y*Math.sin(ship.angle))*ship.size,
      y:ship.y+(x*Math.sin(ship.angle)+y*Math.cos(ship.angle))*ship.size,
    })));
    return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
  }

  _lightingState(p,ship,v=this.view,now=this.last||0) {
    const bounds=this._shipBounds(ship),outside=bounds.bottom<=v.top||bounds.top>=v.top+v.height||bounds.right<=v.left||bounds.left>=v.right;
    const departed=!this.run||p>=.953&&outside;
    if(this.run){const dark=this.run.choreographyVersion===2?smooth((p-ARRIVAL_START)/(ARRIVAL_END-ARRIVAL_START)):Math.max(smooth(p/.19),smooth((this._arrivalElapsed()-WARNING_SHIP_START)/WARNING_SHIP_ENTRY));return {darkness:.68*dark,bounds,departed,daylightProgress:0};}
    if(this.resultNight!=null)return {darkness:this.resultNight,bounds,departed,daylightProgress:0};
    const fade=this.daylightReturn,progress=fade?this.reduced||!fade.duration?1:clamp((now-fade.started)/fade.duration):1;
    const darkness=fade?fade.from*(1-smooth(progress)):0;
    if(!this.run&&progress===1)this.daylightReturn=null;
    return {darkness,bounds,departed,daylightProgress:progress};
  }

  _portal(x,y,size,t,angle=this.reduced?0:Math.sin(t*1.2)*.009) {
    return {x:x-Math.sin(angle)*HATCH.y*size,y:y+Math.cos(angle)*HATCH.y*size,shipX:x,shipY:y,size,angle};
  }

  _clipAtPortal(c,portal) {
    // Keep the entire opening visible to the passenger. Only the far edge is
    // the ceiling: clipping at the near edge turns the opening into a solid lid.
    const h=HATCH;
    c.save();c.translate(portal.shipX,portal.shipY);c.scale(portal.size,portal.size);c.rotate(portal.angle);
    c.beginPath();c.moveTo(-2000,h.hullBottom);c.lineTo(-h.rx,h.hullBottom);c.lineTo(-h.rx,h.y);
    c.ellipse(0,h.y,h.rx,h.ry,0,Math.PI,TAU);c.lineTo(h.rx,h.hullBottom);c.lineTo(2000,h.hullBottom);c.lineTo(2000,2000);c.lineTo(-2000,2000);c.closePath();c.restore();c.clip();
  }

  _portalLip(c,portal,beam) {
    const h=HATCH;
    c.save();c.translate(portal.shipX,portal.shipY);c.scale(portal.size,portal.size);c.rotate(portal.angle);
    // Both halves share the same ring. Draw this before an approaching body:
    // repainting a strip over its middle makes the torso and legs look severed.
    c.beginPath();c.ellipse(0,h.y,h.rimRx,h.rimRy,0,0,Math.PI);c.lineTo(-h.rx,h.y);
    c.ellipse(0,h.y,h.rx,h.ry,0,Math.PI,0,true);c.closePath();c.fillStyle='#61847c';c.fill();
    c.beginPath();c.ellipse(0,h.y,h.rimRx,h.rimRy,0,0,Math.PI);c.strokeStyle='#abc8ad';c.lineWidth=.7;c.stroke();
    if(beam){c.beginPath();c.ellipse(0,h.y,h.rx,h.ry,0,.05,Math.PI-.05);c.strokeStyle='#e8ffce';c.lineWidth=.8;c.stroke();}c.restore();
  }

  _depthObjects(props, trafficTime) {
    const v=this.view,jobs=[];
    const add=(id,depth,bounds,draw,contact=null,glow=null)=>jobs.push({id,depth,bounds,draw,contact,glow,palms:[]});
    const scooter=(id,x,y,color,s,direction,draw=null,contact=null)=>add(id,y,{x:x-46*s,y:y-60*s,width:92*s,height:76*s},draw||((c)=>this._scooter(c,x,y,color,s,direction)),contact,c=>this._vehicleLights(c,x,y,'scooter',s,direction,id));
    if(v.portrait)add('power-pole',543,{x:v.left-14,y:251,width:v.width+28,height:302},c=>this._powerPole(c,props.poleX));
    for(const [id,x,y,color,taxi] of [['taxi',props.carX,props.carY,'#e8ede4',true],['red-car',props.redCarX,props.carY-5,'#bf5b52',false]]){
      add(id,y,{x:x-70,y:y-73,width:140,height:90},c=>this._car(c,x,y,color,taxi),g=>g.type==='car'&&Math.abs(g.handY-(y-23.5))<.1&&[-21,13].some(dx=>Math.abs(g.handX-x-dx)<.1),c=>this._vehicleLights(c,x,y,'car',1,1,id));
    }
    for(let i=0;i<7;i++)scooter(`rear-scooter-${i}`,480+i*85,516,['#729393','#ada05f','#b96555','#8298b2'][i%4],.58,i%2?-1:1);
    const sx=((trafficTime*20+550)%1500)-110;
    add('traffic-forward',593,{x:sx-40,y:514,width:80,height:92},c=>{this._scooter(c,sx,593,'#f0c56e',.76,1);this._rider(c,sx-7,566,.73);},null,c=>this._vehicleLights(c,sx,593,'scooter',.76,1,'traffic-forward'));
    const sx2=1390-((trafficTime*15+211)%1500);
    add('traffic-reverse',611,{x:sx2-40,y:531,width:80,height:94},c=>{this._scooter(c,sx2,611,'#c97765',.79,-1);this._rider(c,sx2+6,583,.76);},null,c=>this._vehicleLights(c,sx2,611,'scooter',.79,-1,'traffic-reverse'));
    (v.width>900?[.12,.88]:[.16,.76]).forEach((f,i)=>{
      const x=v.left+v.width*f,base=Math.min(v.bottom-22,695),top=328+(i%2)*9;
      add(`street-lamp-${i}`,base,{x:x-14,y:top-10,width:72,height:base-top+22},c=>this._streetLamps(c,i),g=>g.type==='post'&&Math.abs(g.handX-x)<=1.6,c=>ellipse(c,x+36,top+6,13,2,'#fff0bc'));
    });
    for(const support of this.supports||[]){
      const {x,y,index,type}=support;
      if(type==='scooter'){
        const direction=index%2?-1:1;
        scooter(`support-${index}`,x,y,['#c86757','#7fa6b6','#e4b578'][index%3],.93,direction,c=>this._foregroundSupports(c,[support]),g=>g.type==='scooter'&&[[19,-43],[-23,-30]].some(([dx,dy])=>Math.abs(g.handX-(x+dx*.93*direction))<.1&&Math.abs(g.handY-(y+dy*.93))<.1));
      }else add(`support-${index}`,y,{x:x-15,y:y-112,width:54,height:126},c=>this._foregroundSupports(c,[support]),g=>g.type==='post'&&Math.abs(g.handX-x)<=1.6&&g.handY>=y-90&&g.handY<=y-14);
    }
    const parkedY=Math.min(v.bottom-15,697);
    scooter('parked-left',v.left+v.width*.27,parkedY,'#c65e55',1.17,1);
    scooter('parked-right',v.left+v.width*.71,parkedY,'#638eab',1.17,-1);
    const bottom=Math.min(v.bottom-17,703),top=bottom-139;
    add('bus-board',bottom,{x:props.busX-12,y:top-10,width:146,height:155},c=>this._busShelter(c,props.busX,'board'),g=>g.type==='bus'&&[props.busX-3,props.busX+119].some(x=>Math.abs(g.handX-x)<=1.6));
    const bench=this._waitingBench();
    add('bus-bench',bench.depth,{x:bench.x-7,y:bench.seatY-29,width:bench.width+14,height:bench.groundY-bench.seatY+36},c=>this._busBench(c));
    add('phone-booth',bottom,{x:v.right-83,y:bottom-124,width:70,height:132},c=>this._busShelter(c,props.busX,'phone'),g=>g.type==='phone'&&Math.abs(g.handX-(v.right-70))<=1.6);
    return jobs;
  }

  _depthProp(c,job,darkness) {
    if(!darkness){job.draw(c);return;}
    // One scratch surface is reused for every prop. Tint only its alpha silhouette;
    // the world underneath remains untouched, including people behind the object.
    const b=job.bounds,factor=Math.max(.5,this.dpr*this.view.scale),width=Math.ceil(b.width*factor),height=Math.ceil(b.height*factor);
    if(!this.depthCanvas){this.depthCanvas=document.createElement('canvas');this.depthContext=this.depthCanvas.getContext('2d');}
    const canvas=this.depthCanvas,paint=this.depthContext;
    if(canvas.width<width)canvas.width=width;
    if(canvas.height<height)canvas.height=height;
    paint.setTransform(1,0,0,1,0,0);paint.clearRect(0,0,width,height);paint.save();
    paint.scale(factor,factor);paint.translate(-b.x,-b.y);job.draw(paint);
    paint.globalCompositeOperation='source-atop';paint.fillStyle=`rgba(10,30,54,${darkness})`;paint.fillRect(b.x,b.y,b.width,b.height);paint.restore();
    c.drawImage(canvas,0,0,width,height,b.x,b.y,width/factor,height/factor);
    if(job.glow){c.save();c.globalAlpha*=darkness/.68;job.glow(c);c.restore();}
  }

  _gripPalms(c,person,motion) {
    const skin=(person.art||(person.art=characterStyle(person))).skin;
    for(const [index,hand] of motion.grip.hands.entries())if(!motion.nearMiss||motion.nearMiss.caught[index])ellipse(c,hand.x,hand.y,2.2*motion.scale,2.8*motion.scale,skin);
  }

  _suspenseCue() {
    const run=this.run;
    if(!run||this.reduced||!run.suspenseDuration)return null;
    const scale=run.duration/24000,start=UFO_TIMING.suspenseStart*run.duration;
    const release=run.scanSchedule?.[0]?.release??((CAPTURE_START+(CAPTURE_END-CAPTURE_START)/run.selected.length*.2)*run.duration+run.suspenseDuration);
    const quiet=500*scale,quietStart=release-quiet,elapsed=run.elapsed;
    return {...run.scanSchedule?.[0],start,release,quietStart,quiet,scale,elapsed,
      effect:elapsed>=start&&elapsed<quietStart?'build':elapsed>=quietStart&&elapsed<release?'silence':null,
      progress:elapsed<quietStart?clamp((elapsed-start)/(quietStart-start)):clamp((elapsed-quietStart)/quiet),
      duration:(elapsed<quietStart?quietStart-start:quiet)/1000};
  }

  _scanPose(motions,cue) {
    const run=this.run;
    if(!cue||cue.elapsed<cue.start||cue.elapsed>=cue.release+(cue.fade??220*cue.scale))return null;
    const index=cue.targetIndex||0,winner=run.selected[index]?.id;
    let route=(run.scanRoute||[]).filter(id=>motions.has(id));
    if(index>0){
      const remaining=(run.scanCandidates||run.scanRoute||[]).filter(id=>id!==winner&&motions.has(id)&&!run.releases.has(id));
      const count=Math.min(4,remaining.length);
      route=Array.from({length:count},(_,i)=>remaining[count===1?0:Math.round(i*(remaining.length-1)/(count-1))]);
      if(!route.length&&motions.has(winner))route=[winner];
    }
    if(!route.length||!motions.has(winner))return null;
    const lockAt=cue.lockAt??Math.min(cue.start+run.suspenseDuration,cue.quietStart),settle=SCAN_SETTLE_MS*cue.scale;
    const searchEnd=cue.searchEnd??Math.max(cue.start+200*cue.scale,lockAt-settle);
    let fromId,toId,blend,phase;
    if(cue.elapsed<searchEnd){
      // Constant progress along the path, with a gentle continuous turn at each
      // end. No pause at every pupil and no teleport when another round starts.
      const cycle=clamp((cue.elapsed-cue.start)/(searchEnd-cue.start))*(cue.rounds||1);
      const position=(1-Math.cos(cycle*TAU))/2,lengths=[0];
      for(let i=1;i<route.length;i++){const a=motions.get(route[i-1]),b=motions.get(route[i]);lengths.push(lengths.at(-1)+Math.hypot(b.x-a.x,b.y-a.y));}
      const distance=position*lengths.at(-1);let segment=0;
      while(segment<route.length-2&&distance>lengths[segment+1])segment++;
      fromId=route[segment];toId=route[Math.min(segment+1,route.length-1)];
      blend=lengths[segment+1]>lengths[segment]?(distance-lengths[segment])/(lengths[segment+1]-lengths[segment]):0;phase='search';
    }else{fromId=route[0];toId=winner;blend=smooth((cue.elapsed-searchEnd)/(lockAt-searchEnd));phase='lock';}
    const from=motions.get(fromId),to=motions.get(toId);
    // With only one pupil left, visibly sweep that pupil's position before lock.
    const soloOffset=route.length===1&&route[0]===winner&&phase==='search'?Math.sin((cue.elapsed-cue.start)/(searchEnd-cue.start)*(cue.rounds||1)*TAU)*28*from.scale:0;
    return {phase,fromId,toId,targetIndex:index,targetId:winner,start:cue.start,release:cue.release,searchEnd,lockAt,rounds:cue.rounds||1,
      x:mix(from.x,to.x,blend)+soloOffset,y:mix(from.y,to.y,blend),scale:mix(from.scale,to.scale,blend),progress:blend,
      groundY:mix(from.groundY??from.y+40*from.scale,to.groundY??to.y+40*to.scale,blend),
      alpha:smooth((cue.elapsed-cue.start)/(cue.fadeIn??220*cue.scale))*(1-smooth((cue.elapsed-cue.release)/(cue.fade??220*cue.scale)))};
  }

  _scanCue(firstCue=this._suspenseCue()) {
    const run=this.run;
    if(!firstCue||!run||this.reduced)return null;
    const elapsed=run.elapsed,cue=run.scanSchedule?.find(cue=>elapsed>=cue.start&&elapsed<cue.release+cue.fade);
    return cue?{...cue,elapsed}:null;
  }

  _captureState() {
    const run=this.run,p=run?.progress||0,n=run?.selected.length||0;
    if(!n)return {active:-1,localPhase:0,target:null,revealedTarget:null,lift:0,boarded:0};
    const position=clamp((p-CAPTURE_START)/(CAPTURE_END-CAPTURE_START))*n;
    const active=p>=CAPTURE_START&&p<CAPTURE_END?Math.min(n-1,Math.floor(position+1e-9)):-1;
    const localPhase=active<0?0:Math.max(0,position-active),target=active<0?null:run.selected[active];
    const cue=run.scanSchedule?.find(item=>item.targetIndex===(active<0?0:active));
    // Slot selection belongs to choreography, not presentation: later scan
    // holds already sit inside their capture slot. Reveal only after the light
    // has actually reached its lock point (or ascent starts without a scan).
    let revealedTarget=null;
    if(cue&&run.elapsed>=cue.lockAt&&p<CAPTURE_END&&(active>=0||p<CAPTURE_START))revealedTarget=run.selected[cue.targetIndex];
    else if(!cue&&target&&localPhase>=.2)revealedTarget=target;
    const boarded=p>=CAPTURE_END?n:active<0?0:active+(localPhase>=.92?1:0);
    return {active,localPhase,target,revealedTarget,lift:smooth((localPhase-.2)/.72),boarded};
  }

  _drawScanner(c,portal,scan) {
    if(!scan||scan.alpha<=0)return;
    const radius=48*scan.scale,depth=15*scan.scale,x=scan.x,y=scan.groundY??scan.y+40*scan.scale;
    c.save();c.globalAlpha*=scan.alpha;c.globalCompositeOperation='screen';
    // A circular spotlight meets the pavement as a flattened ellipse. Its
    // front arc also closes the cone, so there is no straight cut or gap.
    const cone=c.createLinearGradient(portal.x,portal.y,x,y);
    cone.addColorStop(0,'#f8ffe13d');cone.addColorStop(.6,'#f9ffd66b');cone.addColorStop(1,'#faffd69c');
    c.beginPath();c.moveTo(portal.x-7*portal.size,portal.y);c.lineTo(portal.x+7*portal.size,portal.y);
    c.lineTo(x+radius,y);c.ellipse(x,y,radius,depth,0,0,Math.PI);c.closePath();c.fillStyle=cone;c.fill();
    const core=c.createLinearGradient(portal.x,portal.y,x,y);
    core.addColorStop(0,'#ffffed20');core.addColorStop(1,'#ffffe638');
    poly(c,[[portal.x-3*portal.size,portal.y],[portal.x+3*portal.size,portal.y],[x+radius*.52,y],[x-radius*.52,y]],core);
    c.save();c.translate(x,y);c.scale(radius,depth);
    const halo=c.createRadialGradient(0,0,.15,0,0,1.24);
    halo.addColorStop(0,'#faffd638');halo.addColorStop(.7,'#faffd61c');halo.addColorStop(1,'#faffd600');
    ellipse(c,0,0,1.24,1.24,halo);
    const glow=c.createRadialGradient(0,0,.06,0,0,1);
    glow.addColorStop(0,'#ffffebc4');glow.addColorStop(.62,'#faffd98f');glow.addColorStop(.92,'#f4ffcf38');glow.addColorStop(1,'#f4ffcf00');
    ellipse(c,0,0,1,1,glow);c.restore();
    c.restore();
  }

  _draw() {
    const c=this.ctx,v=this.view;
    this.flightDialogueVisible=new Set();this.vendorDialogueVisible=new Set();this.idleDialogueVisible=new Set();

    const run=this.run,p=run?.progress||0,t=this.time,warning=this.warningEffects();
    const shipProgress=this._shipProgress(p),ship=this._shipPose(shipProgress,t,v),lighting=this._lightingState(p,ship,v),darkness=lighting.darkness;
    this.lighting=lighting;

    const {x:ux,y:uy,size:shipScale,angle:shipAngle}=ship;
    const portal=this._portal(ux,uy,shipScale,t,shipAngle);
    const beamShape=this._beamShape(p,portal),charge=run?beamShape.alpha:0;
    const {target,revealedTarget,lift,active,localPhase}=this._captureState();
    const beam=charge;

    // Cinematic smooth camera zoom along the UFO tractor beam during capture
    let zoom=1,camX=W/2,camY=H/2;
    if(run&&!this.reduced&&p>=CAPTURE_START-.055&&p<CAPTURE_END+.075){
      let zProg=0;
      if(p<CAPTURE_START){
        zProg=smooth((p-(CAPTURE_START-.055))/.055);
      }else if(p<=CAPTURE_END){
        zProg=1;
      }else{
        zProg=1-smooth((p-CAPTURE_END)/.075);
      }
      zoom=1+.18*zProg;
      const targetPupil=target||(run.selected&&run.selected[0]);
      const personX=targetPupil?.x??portal.x;
      const groundY=targetPupil?.y??580;
      const personY=lift>0?mix(groundY,portal.y+20,smooth(lift*.8)):groundY;
      const focusX=mix(personX,portal.x,smooth(lift*.7));
      const focusY=mix(personY,portal.y+38,.46);
      camX=mix(W/2,focusX,zProg);
      camY=mix(H/2,focusY,zProg);
    }

    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.fillStyle='#ace2f0';c.fillRect(0,0,this.width,this.height);c.scale(v.scale,v.scale);c.translate(-v.left,-v.top);

    const hasZoom=zoom>1.001;
    if(hasZoom){
      c.save();
      c.translate(camX,camY);
      c.scale(zoom,zoom);
      c.translate(-camX,-camY);
    }

    drawSky(c,this.time,this.view,this.reduced);c.drawImage(this.background,0,0);
    drawEnvironmentMotion(c,this.environment.theme,this.time,this.reduced,v);
    this._roadAndPavement(c);
    const props=this._props(),depthJobs=this._depthObjects(props,run?.trafficTime??t);
    if(darkness){c.fillStyle=`rgba(10,30,54,${darkness})`;c.fillRect(v.left,v.top,v.width,v.height);this._nightLights(c,darkness);}
    // Sparse birds make the idle scene gently alive.
    c.strokeStyle=darkness>.3?'#deecc5':'#5c8d86';c.lineWidth=2;
    for(let i=0;i<3;i++){const bx=(940+t*(this.reduced?0:6)+i*31)%1390-50,by=188+i%2*13;c.beginPath();c.moveTo(bx-7,by);c.quadraticCurveTo(bx-3,by-5-Math.sin(t*2+i)*2,bx,by);c.quadraticCurveTo(bx+3,by-5-Math.sin(t*2+i)*2,bx+7,by);c.stroke();}
    if(run){
      let phase;
      if(p<(run.choreographyVersion===2?ARRIVAL_END:.14)){phase=translate('Tàu UFO đang đến…');}
      else if(p<CAPTURE_START){phase=translate(run.suspenseElapsed>0?'Bạn nào sắp tuột tay đây…':'Bám chặt nhé! UFO đang dò tín hiệu…');}
      else if(p<CAPTURE_END){
        phase=translate('Bạn nào sắp tuột tay đây…');
      }else{phase=translate('Đã đón đủ hành khách!');}
      this._phase(revealedTarget?translate('Đã tìm thấy {name}!',{name:revealedTarget.name}):phase);
    }
    const alarm=!!run&&p>=(run.choreographyVersion===2?ARRIVAL_START:.02)&&p<(run.choreographyVersion===2?INTRO_END:.24);
    if(alarm){const pulse=this.reduced?.8:(Math.sin(t*TAU*1.2)+1)/2;
      for(const [side,color,alpha] of [[-1,'238,103,75',pulse],[1,'91,178,228',1-pulse]]){
        const glow=c.createRadialGradient(ux+side*45*shipScale,uy+40*shipScale,3,ux+side*45*shipScale,uy+40*shipScale,140*shipScale);
        glow.addColorStop(0,`rgba(${color},${.045+alpha*.045})`);glow.addColorStop(1,`rgba(${color},0)`);c.fillStyle=glow;c.fillRect(ux-200*shipScale,uy-100*shipScale,400*shipScale,300*shipScale);
      }
    }

    if(run&&(run.choreographyVersion===2?p>ARRIVAL_START:!run.warningActive||shipProgress>0)){
      this._ufo(c,ux,uy,t,true,beam,shipScale,shipAngle);
      this._portalLip(c,portal,beam);
    }
    // Light leaves the hatch in front of the lower hull and rim. Painting the
    // hull afterwards cuts the beam off until it clears the ship's bottom edge.
    if(beam>.001)this._beam(c,portal,beamShape,t);
    this.labelBoxes=[];
    this.nameOccluders=[];
    this.nameHitFrame={left:v.left,top:v.top,scale:v.scale,width:this.width,height:this.height};
    this.attendanceAnchor=null;
    this.idleSpeechBudget=2;
    const airborne=[],labels=[],ownMarkers=[],speeches=[],flightSpeeches=[],scanMotions=new Map(),personMotions=new Map(),speech=(...args)=>speeches.push(()=>this._speech(c,...args));
    let genericFlightBudget=2;
    const flightSpeech=(person,x,y,kind,selected=false)=>{
      if(!run||this.warningPaused||y+20<=v.top||y-13>=v.bottom||!selected&&genericFlightBudget<=0)return;
      if(!selected)genericFlightBudget--;
      run.dialoguePicker??=createSceneDialoguePicker();
      const key=`flight:${run.started}:${person.id}:${kind}`,choice=run.dialoguePicker.pick(kind,key);
      const paint=()=>{this._speech(c,x,y,choice.text,selected);this.flightDialogueVisible.add(key);
        if(!run.dialogueHandled?.has(key))try{if(this.onFlightDialogue?.({id:person.id,key,...choice,gender:person.gender==='female'?'female':'male',isCurrent:()=>this.run===run&&!this.warningPaused&&this.flightDialogueVisible?.has(key)})===true){run.dialogueHandled??=new Set();run.dialogueHandled.add(key);}}catch{/* Voices cannot interrupt drawing. */}
      };
      if(selected)flightSpeeches.unshift(paint);else flightSpeeches.push(paint);
    };
    const sorted=[...this.students].sort((a,b)=>a.y-b.y);
    for(const person of sorted){
      if(person.removed)continue;
      const selectedIndex=run?run.selected.indexOf(person):-1;
      if(selectedIndex>=0 && ((active>=0 && selectedIndex<active)||p>=CAPTURE_END))continue;
      const isCaptureTarget=person===target,isRevealed=person===revealedTarget,isTarget=isCaptureTarget&&isRevealed;
      if(isCaptureTarget&&lift>=1)continue;
      const grip=run?.grips.get(person.id);
      const motion=this._bodyPose(person,grip,p,isTarget,lift,localPhase,portal);
      personMotions.set(person.id,motion);
      const px=motion.x,py=motion.y,holding=!!motion.grip&&motion.reach===1;
      scanMotions.set(person.id,{x:px+Math.sin(motion.angle||0)*40*motion.scale,y:py-Math.cos(motion.angle||0)*40*motion.scale,groundY:motion.groundY??person.y,scale:motion.scale});
      if(person.id===this.attendanceStudentId&&!run){
        const facing=motion.facing??person.facing??person.direction,side=facing<0?-1:1,yaw=facing*(person.walking?.94:person.chatting?.68:.50),localX=yaw*1.8+side*Math.abs(yaw)*.8,angle=motion.angle||0;
        this.attendanceAnchor={id:person.id,x:px+(localX*Math.cos(angle)+70*Math.sin(angle))*motion.scale,y:py+(localX*Math.sin(angle)-70*Math.cos(angle))*motion.scale,scale:motion.scale,groundX:px,groundY:motion.groundY??person.y};
      }
      const drawPerson=()=>{c.save();c.globalAlpha*=motion.captureOpacity??1;if(isTarget&&lift>0)this._clipAtPortal(c,portal);
        if(person.id===this.currentStudentId)this._currentStudentAura(c,motion);
        this._person(c,person,px,py,motion.scale,motion.walk,isRevealed,darkness,motion.grip,charge,motion.angle,{...motion,deferLabel:true});c.restore();};
      if(isTarget&&localPhase>=.2)airborne.push(drawPerson);
      else depthJobs.push({depth:person.y,drawPerson});
      if(holding){const contact=depthJobs.find(job=>job.contact?.(motion.grip));if(contact&&person.y<contact.depth)contact.palms.push(()=>this._gripPalms(c,person,motion));}
      if(person.id!==this.attendanceStudentId)labels.push(()=>this._personLabel(c,person,px,py,motion.scale,isRevealed,darkness,motion.angle,motion));
      if(person.id===this.currentStudentId)ownMarkers.push(()=>{c.save();c.globalAlpha*=motion.captureOpacity??1;
        if(isTarget&&lift>0)this._clipAtPortal(c,portal);this._currentStudentBadge(c,motion);c.restore();});
      if(run&&p>(run.choreographyVersion===2?ARRIVAL_START:.035)&&p<(run.choreographyVersion===2?ARRIVAL_END:.125)&&person.seed>.9)flightSpeech(person,px+12,py-99*person.scale,'arrival');
      const idleRequest=this.idleDialogueRequest,requestedIdle=idleRequest?.id===person.id;
      if(!run&&!this.vendorConversationActive&&this.idleSpeechBudget>0&&(requestedIdle||!idleRequest&&person.chatting&&String(person.id)<String(person.chatPeer)&&hash(person.id+'chat')>.40)){
        const key=requestedIdle?idleRequest.key:`${person.id}:${person.chatUntil}`;
        if(person.idleDialogue?.key!==key){
          let choice;try{choice=this.pickIdleDialogue?.(key);}catch{}
          if(!choice||!IDLE_DIALOGUE_LINES.some(line=>line.id===choice.phraseId)||typeof choice.text!=='string'){
            const line=IDLE_DIALOGUE_LINES[Math.floor(hash(key+'line')*IDLE_DIALOGUE_LINES.length)%IDLE_DIALOGUE_LINES.length];choice={phraseId:line.id,text:translate(line.source)};
          }
          person.idleDialogue={key,...choice};
        }
        const {text:value,phraseId}=person.idleDialogue,y=py-104*person.scale;
        speech(px+10,y,value,false);speeches.push(()=>this.idleDialogueVisible.add(key));this.idleSpeechBudget--;
        if(requestedIdle)speeches.push(()=>{idleRequest.painted=true;});
        // The hook follows this exact painted bubble. Flight/attendance/welcome
        // dialogue has its own voice rules and never enters the idle channel.
        if(!this.attendanceStudentId&&!this.welcomes?.size&&y+20>v.top&&y-13<v.bottom&&this.idleDialogueHandled?.get(person.id)!==key)speeches.push(()=>{
          try{if(this.onIdleDialogue?.({id:person.id,text:value,key,phraseId,gender:person.gender==='female'?'female':'male',
            isCurrent:()=>!this.run&&!this.warningPaused&&!this.attendanceStudentId&&!this.welcomes?.size&&!this.vendorConversationActive&&this.students.includes(person)&&this.idleDialogueVisible?.has(key)&&
              (requestedIdle?this.idleDialogueRequest===idleRequest:person.chatting&&`${person.id}:${person.chatUntil}`===key)})===true){this.idleDialogueHandled??=new Map();this.idleDialogueHandled.set(person.id,key);}}catch{/* Speech cannot interrupt the canvas. */}
        });
      }
      if(isRevealed&&localPhase>.07&&lift<.74)flightSpeech(person,px+19,Math.min(py,grip?.handY??py)-80*person.scale,holding?'cling':'selected',true);
      else if(holding&&p<CAPTURE_START&&person.seed>.96)flightSpeech(person,px+10,Math.min(py,grip.handY)-76*person.scale,'cling');
      else if(run&&p>.94&&selectedIndex<0&&person.seed>.88)flightSpeech(person,px+10,py-106*person.scale,'relief');
    }
    const suspenseCue=this._suspenseCue();
    if(run){run.scan=this._scanPose(scanMotions,this._scanCue(suspenseCue));this._drawScanner(c,portal,run.scan);}
    if(this.petVisitor&&!run&&!this.attendanceStudentId&&!this.welcomes?.size&&!this.warningPaused)depthJobs.push({depth:this.petVisitor.y,drawPerson:()=>this._pet(c,this.petVisitor)});
    const vendorState=this.streetVendors;
    for(const stall of vendorState?.stalls||[])depthJobs.push({depth:stall.y,drawPerson:()=>drawStreetVendor(c,stall,{time:t,talking:vendorState.dialogues.some(cue=>cue.id===stall.id),alert:!!run})});
    if(vendorState?.cart)depthJobs.push({depth:vendorState.cart.y,drawPerson:()=>drawStreetVendor(c,vendorState.cart,{time:t,talking:vendorState.dialogues.some(cue=>cue.id===vendorState.cart.id),alert:!!run})});
    if(!run&&!this.attendanceStudentId&&!this.welcomes?.size&&!this.warningPaused)for(const cue of vendorState?.dialogues||[]){
      this.vendorDialoguePicker??=createSceneDialoguePicker();
      const choice=this.vendorDialoguePicker.pick(cue.kind,cue.key,{turn:cue.turn}),motion=cue.pupilId?personMotions.get(cue.pupilId):null;
      if(cue.pupilId&&!motion)continue;
      const x=motion?motion.x+10:cue.x,y=motion?motion.y-104*motion.scale:cue.y;
      if(y+20<=v.top||y-13>=v.bottom)continue;
      speeches.push(()=>{this._speech(c,x,y,choice.text,false);this.vendorDialogueVisible.add(cue.key);
        if(!this.vendorDialogueHandled?.has(cue.key))try{if(this.onVendorDialogue?.({...cue,...choice,isCurrent:()=>!this.run&&!this.warningPaused&&!this.attendanceStudentId&&!this.welcomes?.size&&this.vendorDialogueVisible?.has(cue.key)})===true){this.vendorDialogueHandled??=new Set();this.vendorDialogueHandled.add(cue.key);if(this.vendorDialogueHandled.size>128)this.vendorDialogueHandled.delete(this.vendorDialogueHandled.values().next().value);}}catch{/* Voices cannot interrupt drawing. */}
      });
    }
    depthJobs.sort((a,b)=>a.depth-b.depth);
    for(const job of depthJobs){if(job.drawPerson)job.drawPerson();else{this._depthProp(c,job,darkness);for(const palms of job.palms)palms();}}
    for(const drawPerson of airborne)drawPerson();
    if(beam>.1)this._beamParticles(c,portal,beamShape,t);
    for(const drawLabel of labels)drawLabel();
    for(const drawMarker of ownMarkers)drawMarker();
    for(const drawSpeech of speeches)drawSpeech();
    for(const drawSpeech of flightSpeeches)drawSpeech();
    if(this.attendanceAnchor){const a=this.attendanceAnchor;c.save();c.strokeStyle='#3c7747';c.lineWidth=2.5; c.beginPath();c.ellipse(a.x,a.y,12*a.scale+3,13*a.scale+3,0,0,TAU);c.stroke();c.strokeStyle='#f4ffbf';c.lineWidth=2;c.beginPath();c.ellipse(a.groundX,a.groundY+2,18*a.scale,6*a.scale,0,0,TAU);c.stroke();c.restore();}
    if(run&&this.run===run){
      let ufoEffect=null,effectProgress=0,effectDuration=0;
      if(run.choreographyVersion===2&&p>=ARRIVAL_START&&p<ARRIVAL_END){ufoEffect='landing';effectProgress=(p-ARRIVAL_START)/(ARRIVAL_END-ARRIVAL_START);effectDuration=2;}
      else if(run.choreographyVersion!==2&&p>=.015&&p<.10){ufoEffect='landing';effectProgress=(p-.015)/.085;effectDuration=.085*run.duration/1000;}
      else if(target&&localPhase>=.2&&localPhase<.92){ufoEffect='beam';effectProgress=(localPhase-.2)/.72;effectDuration=.72*(CAPTURE_END-CAPTURE_START)*run.duration/run.selected.length/1000;}
      else if(p>=.953&&p<1){ufoEffect='departure';effectProgress=(p-.953)/.047;effectDuration=.047*run.duration/1000;}
      try { run.onEffects({...warning,ufoEffect,effectProgress,effectDuration,...this._lightEffects(p),suspenseEffect:suspenseCue?.effect||null,suspenseProgress:suspenseCue?.effect?suspenseCue.progress:0,suspenseDuration:suspenseCue?.effect?suspenseCue.duration:0,targetId:target&&target===revealedTarget?String(target.id):null,speed:run.choreographyVersion===2&&p<INTRO_END?1:this.speed}); } catch (_) { /* Audio/UI callbacks cannot interrupt the scene. */ }
    }
    if(hasZoom)c.restore();
  }

  _nightLights(c,darkness) {
    c.save();c.globalAlpha=darkness/.68;
    (this.environment.theme==='street'?[[-30,247,186,250,3],[159,206,155,291,2],[318,245,155,252,2],[476,176,191,321,3],[671,232,160,265,2],[835,214,165,283,2],[1004,254,178,243,3],[1186,195,145,302,2]]:[]).forEach(([x,y,w,h,cols],i)=>{
      const ww=Math.min(31,(w-32)/cols-15);
      for(let row=0;row<Math.max(1,Math.floor((h-119)/79));row++)for(let col=0;col<cols;col++)if((row+col+i)%3!==0){const wx=x+18+col*(w-28)/cols,wy=y+25+row*77;rr(c,wx+2,wy+2,ww-4,35,0,'#f5d789aa');line(c,wx+ww/2,wy,wx+ww/2,wy+40,'#688570',2);}
    });
    // These four parked scooters are part of the cached shop background.
    if(this.environment.theme==='street')[[217,508,.86,1],[371,507,.86,-1],[908,511,.9,1],[1160,514,.78,-1]].forEach(([x,y,s,direction],i)=>this._vehicleLights(c,x,y,'scooter',s,direction,`shop-scooter-${i}`));
    (this.view.width>900?[.12,.88]:[.16,.76]).forEach((f,i)=>{const x=this.view.left+this.view.width*f+36,y=334+(i%2)*9,g=c.createRadialGradient(x,y,2,x,y,85);g.addColorStop(0,'#ffe9a888');g.addColorStop(.3,'#ffe9a82b');g.addColorStop(1,'#ffe9a800');c.fillStyle=g;c.fillRect(x-85,y-85,170,170);ellipse(c,x,y,14,3,'#fff0bc');});
    for(let i=0;i<24;i++){const x=hash(i+'starx')*W,y=hash(i+'stary')*220;star(c,x,y,1.2+(i%3)*.5,'#efffe08a');}
    c.restore();
  }

  _pet(c,visitor) {
    const painted=drawPet(c,visitor),cue=this.petPassers?.soundFor(visitor.id);
    if(cue){try{this.onPetSound?.(cue);}catch{/* A bark cannot interrupt the street scene. */}}
    return painted;
  }

  _beamOpening(p) {
    if(this.run?.choreographyVersion===2)return {progress:(p-ARRIVAL_END)/(INTRO_END-ARRIVAL_END),early:false};
    const logical=(p-UFO_TIMING.beamStart)/UFO_TIMING.beamSweepDuration;
    const early=this.run?.warningDuration?(this._arrivalElapsed()-WARNING_LIGHT_START)/WARNING_LIGHT_ENTRY:-Infinity;
    return {progress:Math.max(logical,early),early:early>=logical};
  }

  _lightEffects(p) {
    const run=this.run,opening=this._beamOpening(p),lightEnd=CAPTURE_END+UFO_TIMING.beamFadeOut;
    if(run?.choreographyVersion===2){
      const idle={lightEffect:null,lightProgress:0,lightDuration:0,lightFadeDuration:0,lightSpeed:p<INTRO_END?1:this.speed};
      if(opening.progress<0||p>=lightEnd)return idle;
      if(p<INTRO_END)return {...idle,lightEffect:'start',lightProgress:clamp(opening.progress),lightDuration:2};
      const duration=(lightEnd-INTRO_END)*run.duration+(run.suspenseDuration||0)+(run.scanHoldDuration||0);
      return {...idle,lightEffect:'loop',lightProgress:clamp((run.elapsed-INTRO_END*run.duration)/duration),lightDuration:duration/1000,lightFadeDuration:UFO_TIMING.beamFadeOut*run.duration/1000};
    }
    const idle={lightEffect:null,lightProgress:0,lightDuration:0,lightFadeDuration:0,lightSpeed:run?.warningActive?1:this.speed};
    if(!run||opening.progress<0||p>=lightEnd)return idle;
    if(opening.progress<1)return {...idle,lightEffect:'start',lightProgress:opening.progress,
      lightDuration:(opening.early?WARNING_LIGHT_ENTRY:UFO_TIMING.beamSweepDuration*run.duration)/1000};
    // Choose whichever opening finishes first. This keeps very short/reduced
    // flights compatible and gives one uninterrupted loop through the warning
    // handoff, scan holds and captures. The original capture phase owns its fade.
    const warning=run.warningDuration||0;
    const loopStart=Math.min(warning?WARNING_LIGHT_START+WARNING_LIGHT_ENTRY:Infinity,warning+(UFO_TIMING.beamStart+UFO_TIMING.beamSweepDuration)*run.duration);
    const end=warning+lightEnd*run.duration+(run.suspenseDuration||0)+(run.scanHoldDuration||0);
    const duration=end-loopStart,elapsed=(run.warningElapsed||0)+(Number.isFinite(run.elapsed)?run.elapsed:p*run.duration+(run.suspenseElapsed||0)+(run.scanHoldElapsed||0));
    return {...idle,lightEffect:'loop',lightProgress:clamp((elapsed-loopStart)/duration),lightDuration:duration/1000,
      lightFadeDuration:UFO_TIMING.beamFadeOut*run.duration/1000};
  }

  _beamShape(p,portal) {
    const opening=this._beamOpening(p).progress,extent=smooth(opening);
    const alpha=smooth(opening*UFO_TIMING.beamSweepDuration/.012)*(1-smooth((p-CAPTURE_END)/UFO_TIMING.beamFadeOut));
    const ground=Math.max(this.view.bottom+65,portal.y+240),depth=(ground-portal.y)*extent,topRadius=HATCH.rx*portal.size*.96;
    return {alpha,extent,ground,bottom:portal.y+depth,depth,topRadius,radius:topRadius+depth*1.8};
  }

  _beam(c,portal,shape,t) {
    if(shape.depth<.1||shape.alpha<=0)return;
    const {x,y,angle}=portal,{bottom,depth,topRadius,radius,alpha}=shape;
    const edgeFade=1-Math.min(55,depth*.33)/depth;
    c.save();c.globalAlpha=alpha;
    // Source frames 12–28s: a broad mint fan with a pale core, no outlined rings.
    // Its lower edge grows downward first; the soft front has no ground ellipse.
    const wash=c.createLinearGradient(0,y,0,bottom);
    wash.addColorStop(0,'#b7f5dca6');wash.addColorStop(.42,'#b8ead685');wash.addColorStop(edgeFade,'#c4eedb75');wash.addColorStop(1,'#d2f4e400');
    poly(c,[[x-topRadius*Math.cos(angle),y-topRadius*Math.sin(angle)],[x+topRadius*Math.cos(angle),y+topRadius*Math.sin(angle)],[x+radius,bottom],[x-radius,bottom]],wash);
    const core=c.createLinearGradient(0,y,0,bottom);
    core.addColorStop(0,'#f4fff12b');core.addColorStop(edgeFade,'#e5fff50c');core.addColorStop(1,'#e5fff500');
    poly(c,[[x-topRadius*.62,y],[x+topRadius*.62,y],[x+radius*.36,bottom],[x-radius*.36,bottom]],core);
    // A restrained change in brightness keeps the light alive without strobing.
    const rays=c.createLinearGradient(0,y,0,bottom);rays.addColorStop(0,'#effff8');rays.addColorStop(edgeFade,'#effff8');rays.addColorStop(1,'#effff800');
    c.globalAlpha=alpha*(this.reduced?.035:.035+.012*Math.sin(t*1.7));
    poly(c,[[x-topRadius*.8,y],[x-topRadius*.35,y],[x-radius*.34,bottom],[x-radius*.72,bottom]],rays);
    poly(c,[[x+topRadius*.3,y],[x+topRadius*.65,y],[x+radius*.57,bottom],[x+radius*.23,bottom]],rays);
    c.restore();
  }

  _beamParticles(c,portal,shape,t) {
    if(shape.depth<20)return;
    c.save();
    // Small rising, tumbling paper flecks match the reference's suction debris.
    for(let i=0;i<34;i++){
      const f=this.reduced?hash(i+'beam-phase'):(t*(.18+hash(i+'beam-speed')*.08)+i*.618033)%1;
      const y=mix(shape.bottom,portal.y+8,f),spread=shape.topRadius+Math.max(0,y-portal.y)*1.8;
      const x=portal.x+(hash(i+'beam-x')*2-1)*spread*.91+(this.reduced?0:Math.sin(t*2+i)*Math.min(8,spread*.04));
      const size=1.4+hash(i+'beam-size')*2.4;
      c.save();c.globalAlpha=shape.alpha*Math.sin(f*Math.PI)*(.4+hash(i+'beam-alpha')*.45);c.translate(x,y);c.rotate(this.reduced?i:t*(i%2?2:-1.7)+i);
      c.fillStyle=i%7===0?'#bddfbc':i%5===0?'#e8e8c9':'#f5fff6';c.fillRect(-size*.65,-size*.35,size*1.3,size*.7);c.restore();
    }
    c.restore();
  }

  _ufo(c,x,y,t,active,beam,size=1,angle=this.reduced?0:Math.sin(t*1.2)*(active?.009:.032)) {
    c.save();c.translate(x,y);c.scale(size,size);c.rotate(angle);
    // The reference has a broad white lid, a shallow grey belly and a small low dome.
    const halo=c.createRadialGradient(0,13,20,0,13,115);halo.addColorStop(0,active?'#baf3d00d':'#eaf1da0d');halo.addColorStop(1,'#bcebdd00');c.fillStyle=halo;c.fillRect(-118,-32,236,95);
    const canopy=()=>{c.beginPath();c.ellipse(0,-1,32,17,0,Math.PI,TAU);c.closePath();};
    const dome=c.createLinearGradient(0,-18,0,-1);dome.addColorStop(0,'#94afc2d9');dome.addColorStop(1,'#7095acd9');
    canopy();c.fillStyle=dome;c.fill();
    c.save();canopy();c.clip();
    for(const [pilotX,phase] of [[-10,0],[10,1.7]]) {
      const bob=this.reduced?0:Math.sin(t*1.9+phase)*.12;
      c.save();c.translate(pilotX,-1.8+bob);
      // Only the green crowns and four slender stalks peek above the front deck.
      line(c,-1.8,-1.5,-3.4,-5.6,'#b1d786',.8);line(c,1.8,-1.5,3.5,-5.8,'#b1d786',.8);
      ellipse(c,-3.4,-5.8,1.1,1.2,'#cee5a5');ellipse(c,3.5,-6,1.1,1.2,'#cee5a5');
      ellipse(c,0,1,3.4,2.8,phase?'#a9d482':'#b5dc8d');
      c.restore();
    }
    canopy();c.fillStyle='#dceef10e';c.fill();c.restore();
    canopy();c.strokeStyle='#c8dce348';c.lineWidth=.65;c.stroke();
    c.beginPath();c.moveTo(-26,-4.5);c.quadraticCurveTo(-21,-11.5,-10,-14.5);c.strokeStyle='#edf5edab';c.lineWidth=1.15;c.lineCap='round';c.stroke();
    line(c,-4,-15,3,-15,'#edf5ed80',.65);
    // One continuous shell joins the white rim to the belly. Its shoulders
    // start behind the lid's edge, with no independent floating underside oval.
    const shell=c.createLinearGradient(0,12,0,41);shell.addColorStop(0,'#75898b');shell.addColorStop(.42,'#9aacab');shell.addColorStop(1,'#819795');
    c.beginPath();c.moveTo(-104,14);
    c.bezierCurveTo(-85,12,-45,10,0,10);c.bezierCurveTo(45,10,85,12,104,14);
    c.bezierCurveTo(106,21,90,27,77,31);c.bezierCurveTo(58,37,30,41,0,41);
    c.bezierCurveTo(-30,41,-58,37,-77,31);c.bezierCurveTo(-90,27,-106,21,-104,14);
    c.closePath();c.fillStyle=shell;c.fill();
    // The reference bulbs stay fixed: a bright spot with a short fading tail
    // runs inward on the left wing and outward on the right every 0.78 seconds.
    // The central run is concealed by the shell; only the two shoulders show.
    const chase=this.reduced?0:t/.13;
    for(let i=0;i<36;i++) {
      const angle=i*TAU/36,depth=Math.sin(angle);
      if(depth<0)continue;
      const px=Math.cos(angle)*100,py=18+depth*7,color=i%2?'#f0c454':'#89dfd7';
      if(Math.abs(px)<76)continue;
      const phase=(i+chase)%6,distance=phase<=2.5?phase:phase-6;
      const pulse=this.reduced?.6:Math.exp(-distance*distance/(distance>=0?1.5:.2));
      c.save();c.globalAlpha=.3+pulse*.7;
      c.shadowColor=color;c.shadowBlur=active?2+pulse*8:1+pulse*3;
      ellipse(c,px,py,1.6+depth*.65,1.7+depth*.45,color);
      c.shadowBlur=0;ellipse(c,px-.35,py-.45,.6,.65,i%2?'#f8df88':'#c0f1e9');c.restore();
    }
    // A restrained contour follows the same shell bottom rather than outlining
    // a second plate. It fades into the shoulders on either side of the hatch.
    c.beginPath();c.moveTo(-75,30.5);c.bezierCurveTo(-55,36.2,-28,39.3,0,39.3);c.bezierCurveTo(28,39.3,55,36.2,75,30.5);
    c.strokeStyle='#bdcbc62b';c.lineWidth=.55;c.stroke();
    const lid=c.createLinearGradient(0,-1,0,22);lid.addColorStop(0,'#f4f1e8');lid.addColorStop(1,'#d9dfdc');
    c.beginPath();c.moveTo(-106,14);c.bezierCurveTo(-105,6,-59,-1,0,-1);c.bezierCurveTo(59,-1,105,6,106,14);
    c.bezierCurveTo(107,18,102,20,97,19);c.quadraticCurveTo(0,12,-97,19);c.bezierCurveTo(-103,20,-107,18,-106,14);c.closePath();c.fillStyle=lid;c.fill();
    c.beginPath();c.moveTo(-101,16);c.quadraticCurveTo(0,8,101,16);c.strokeStyle='#f4f1e737';c.lineWidth=.8;c.stroke();
    const alarm=!!this.run&&this.run.progress>=(this.run.choreographyVersion===2?ARRIVAL_START:.02)&&this.run.progress<(this.run.choreographyVersion===2?INTRO_END:.24);
    if(alarm){const pulse=this.reduced?.85:(Math.sin(t*TAU*1.2)+1)/2;
      for(const [side,color,intensity] of [[-1,'#ed735e',pulse],[1,'#65b9ed',this.reduced?.85:1-pulse]]){
        c.save();c.globalAlpha=.28+intensity*.55;c.shadowColor=color;c.shadowBlur=5+intensity*6;ellipse(c,side*99,20,2.4,2.3,color);c.restore();
      }
    }
    rr(c,-17.5,12,35,11,2,'#acd4aa');rr(c,-16.7,12.7,33.4,9.6,1.6,'#284e43');
    const passengerCount=this._captureState().boarded;
    text(c,this.run?`${passengerCount} / ${this.run.selected.length}`:'U F O',0,18,this.run?6.8:6,'#c4f3be',800);
    // A single shared rim surrounds the shallow mint aperture from the reference.
    ellipse(c,0,HATCH.y,HATCH.rimRx,HATCH.rimRy,'#61847c');
    const well=c.createLinearGradient(0,HATCH.y-HATCH.ry,0,HATCH.y+HATCH.ry);
    well.addColorStop(0,beam?'#85b89e':'#65968b');well.addColorStop(.5,beam?'#c4efbb':'#8dbba3');well.addColorStop(1,beam?'#e2ffd2':'#a3c9ac');
    if(beam){c.shadowColor='#aff1c9';c.shadowBlur=12;}
    ellipse(c,0,HATCH.y,HATCH.rx,HATCH.ry,well);c.shadowBlur=0;
    c.restore();
  }

  _person(c,p,x,y,s,walk,selected,darkness,grip=null,force=0,poseAngle=null,motion={}) {
    const tilt=poseAngle??(grip?-grip.side*(.23+force*.42)+(this.reduced?0:Math.sin(this.time*11+p.seed)*force*.06):selected&&!this.reduced?Math.sin(this.time*2+p.seed*7)*.16:Math.sin(this.time*3+p.seed)*force*.14);
    const art=p.art||(p.art=characterStyle(p)),skin=art.skin,shirt=art.shirt,female=art.wearsSkirt,seed=p.seed;
    const gaze=Math.max(motion.lookUp||0,this.run?this._arrivalGaze(this.run.progress):0),modern=this.run?.choreographyVersion===2;
    const chatting=!this.run&&p.chatting;
    const facing=motion.facing??p.facing??p.direction,side=facing<0?-1:1;
    const yaw=motion.yaw??(this.run?(gaze>.2?(x<640?1:-1)*.7:facing*.7):facing*(p.walking?.94:chatting?.68:.50));
    const turn=Math.abs(yaw),half=mix(7.5,5.7,turn),seam=yaw*4;
    const hipY=-HIP_H,nearHip=-side*mix(4,1.2,turn),farHip=side*mix(4,1.2,turn);
    const nearShoulder={x:-side*mix(7.5,1.5,turn),y:-SHOULDER_H},farShoulder={x:side*mix(7.5,2.7,turn),y:-SHOULDER_H-1};
    const local=point=>{const dx=(point.x-x)/s,dy=(point.y-y)/s;return {x:dx*Math.cos(tilt)+dy*Math.sin(tilt),y:-dx*Math.sin(tilt)+dy*Math.cos(tilt)};};
    if((motion.shadow??(!selected&&!grip?1:0))>.01){c.save();c.globalAlpha*=motion.shadow??1;ellipse(c,x,motion.groundY??p.y,12*s,3.2*s,'#273e3227');c.restore();}
    c.save();c.translate(x,y);c.scale(s,s);c.rotate(tilt);
    const hanging=selected||!!grip||!!motion.nearMissHanging||!!motion.airborne,stride=walk;
    const legs=[{hip:farHip,shade:true,index:0},{hip:nearHip,shade:false,index:1}];
    const drawLeg=leg=>{
      const hip={x:leg.hip,y:hipY};
      // A released passenger has no ground contact. As the kick relaxes, the
      // legs hang beneath the hips instead of aiming back at distant pavement.
      const ankle=motion.airborne?{x:hip.x+(leg.index?1.6:-1.6),y:hip.y+38}:
        motion.feet?.[leg.index]?local(motion.feet[leg.index]):{x:leg.hip,y:-2.2};
      let planted=solveTwoBone(hip,ankle,19.5,19.5,-side);
      if(motion.groundedFall){const other=solveTwoBone(hip,ankle,19.5,19.5,side),height=point=>point.x*Math.sin(tilt)+point.y*Math.cos(tilt);if(height(other.joint)<height(planted.joint))planted=other;}
      const kick=kickLeg(hip,this.reduced?p.seed*5:this.time*1.22,seed,leg.index,side,selected?mix(1+(motion.strain||0)*.18,.12,motion.releaseBlend??0):1+(motion.strain||0)*.18,{style:motion.holdStyle,blend:motion.holdBlend??1});
      const blend=motion.legLift?.[leg.index]??motion.kick??(hanging?1:0);
      let knee=planted.joint,foot=planted.end,shoeAngle=-tilt;
      if(blend>0){
        const lerpAngle=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
        const thigh=lerpAngle(Math.atan2(knee.x-hip.x,knee.y-hip.y),Math.atan2(kick.knee.x-hip.x,kick.knee.y-hip.y),blend);
        const shin=lerpAngle(Math.atan2(foot.x-knee.x,foot.y-knee.y),Math.atan2(kick.foot.x-kick.knee.x,kick.foot.y-kick.knee.y),blend);
        knee={x:hip.x+Math.sin(thigh)*19.5,y:hip.y+Math.cos(thigh)*19.5};foot={x:knee.x+Math.sin(shin)*19.5,y:knee.y+Math.cos(shin)*19.5};shoeAngle=lerpAngle(-tilt,kick.shoeAngle,blend);
      }
      // A foot that is still peeling off the pavement can push against it, but
      // cannot kick through it as its planted IK pose blends into the struggle.
      if(motion.rise>0&&!motion.airborne){
        const floor=(motion.groundY??p.y)-2.2*s,worldFootY=y+(foot.x*Math.sin(tilt)+foot.y*Math.cos(tilt))*s;
        if(worldFootY>floor){const floorTarget=local({x:x+(foot.x*Math.cos(tilt)-foot.y*Math.sin(tilt))*s,y:floor});
          const braceLeg=solveTwoBone(hip,floorTarget,19.5,19.5,-side);knee=braceLeg.joint;foot=braceLeg.end;shoeAngle=-tilt;}
      }
      const legColor=female?skin:art.bottom;
      line(c,hip.x,hip.y,knee.x,knee.y,legColor,female?4.2:5.4);line(c,knee.x,knee.y,foot.x,foot.y,legColor,female?4:5);
      if(leg.shade){c.save();c.globalAlpha*=.13;line(c,hip.x,hip.y,knee.x,knee.y,'#223c37',female?4:5);line(c,knee.x,knee.y,foot.x,foot.y,'#223c37',female?3.7:4.7);c.restore();}
      c.save();c.translate(foot.x,foot.y);c.rotate(shoeAngle);
      if(female)line(c,0,-4,0,-1,'#f4e8d4',4.2);
      line(c,-side,0,side*4.5,0,art.shoe,4);line(c,-side,1.6,side*4.5,1.6,'#e6e5d4',1.2);c.restore();
    };
    drawLeg(legs[0]);drawLeg(legs[1]);
    // The far arm is drawn behind the narrow, turned torso.
    const arm=(shoulder,isNear)=>{
      const phase=isNear?-stride:stride;
      const relaxed=walkingArm(shoulder,stride,isNear,side);
      let elbowX=relaxed.joint.x,elbowY=relaxed.joint.y,handX=relaxed.end.x,handY=relaxed.end.y;
      if(modern&&gaze>0){const blend=smooth((gaze-.2)/.3);elbowX=mix(elbowX,shoulder.x+side*4,blend);elbowY=mix(elbowY,-42,blend);handX=mix(handX,shoulder.x+side*11,blend);handY=mix(handY,-49,blend);}
      else if(gaze>.3){elbowX=shoulder.x+side*4;elbowY=-42;handX=shoulder.x+side*11;handY=-49;}
      else if(chatting&&isNear){elbowX=shoulder.x+side*8;elbowY=-42;handX=shoulder.x+side*16;handY=-46+Math.sin(this.time*5)*2;}
      else if(hanging){elbowX=shoulder.x+side*(isNear?8:-8);elbowY=-39;handX=shoulder.x+side*(isNear?14:-14);handY=-32;}
      let end={x:handX,y:handY};
      if(motion.sprint>0){const pumping=runningArm(shoulder,stride,isNear,side);end={x:mix(end.x,pumping.end.x,motion.sprint),y:mix(end.y,pumping.end.y,motion.sprint)};}
      if(motion.startle>0){const out=isNear?-1:1;end={x:mix(end.x,shoulder.x+out*15,motion.startle),y:mix(end.y,-76,motion.startle)};}
      if(grip){const anchor=local(grip.hands[isNear?1:0]);end={x:mix(end.x,anchor.x,motion.reach??1),y:mix(end.y,anchor.y,motion.reach??1)};}
      else if(motion.benchHands){const anchor=local(motion.benchHands[isNear?1:0]),blend=motion.benchBlend??1;end={x:mix(end.x,anchor.x,blend),y:mix(end.y,anchor.y,blend)};}
      else if(motion.fallHands){const anchor=local(motion.fallHands[isNear?1:0]),brace=motion.brace??1;end={x:mix(end.x,anchor.x,brace),y:mix(end.y,anchor.y,brace)};}
      else if(motion.release && motion.release.hands && motion.release.hands[isNear?1:0]){
        const r=motion.release,h=r.hands[isNear?1:0],dx=(h.x-r.x)/r.scale,dy=(h.y-r.y)/r.scale;
        const released={x:dx*Math.cos(r.angle)+dy*Math.sin(r.angle),y:-dx*Math.sin(r.angle)+dy*Math.cos(r.angle)};
        end={x:mix(released.x,end.x,motion.releaseBlend),y:mix(released.y,end.y,motion.releaseBlend)};}
      if(motion.alarmHands&&!hanging){const hand=motion.alarmHands[isNear?1:0];end={x:mix(end.x,hand.x,motion.alarmBlend||0),y:mix(end.y,hand.y,motion.alarmBlend||0)};}
      let limb=solveTwoBone(shoulder,end,16,15,grip||motion.release||motion.fallHands||hanging?(isNear?-side:side):side);
      if(motion.groundedFall&&motion.brace>.8){const other=solveTwoBone(shoulder,end,16,15,isNear?side:-side),height=point=>point.x*Math.sin(tilt)+point.y*Math.cos(tilt);if(height(other.joint)<height(limb.joint))limb=other;}
      elbowX=limb.joint.x;elbowY=limb.joint.y;handX=limb.end.x;handY=limb.end.y;
      line(c,shoulder.x,shoulder.y,elbowX,elbowY,skin,4.1);line(c,elbowX,elbowY,handX,handY,skin,3.7);ellipse(c,handX,handY,2.2,2.8,skin);
      line(c,shoulder.x,shoulder.y,mix(shoulder.x,elbowX,.43),mix(shoulder.y,elbowY,.43),shirt,6.2);
      if(!isNear){c.save();c.globalAlpha=.1;line(c,shoulder.x,shoulder.y,elbowX,elbowY,'#233f38',4);c.restore();}
    };
    arm(farShoulder,false);
    rr(c,-side*(half+3)-4,-54,8,20,3,art.accent);
    // Hips and shoulders rotate together; the shirt front moves toward the facing side.
    poly(c,[[-half,-57],[half,-57],[half+1,-51],[half-.6,-35],[-half+.6,-35],[-half-1,-51]],shirt);
    c.save();c.globalAlpha=.09;poly(c,[[-side*half,-55],[-side*(half+1),-51],[-side*(half-.6),-35],[-side*(half-2),-35],[-side*(half-2),-52]],'#27493a');c.restore();
    if(female){const seated=motion.groundedFall?1-smooth(motion.recoveryProgress??0):0,hem=mix(art.skirtStyle==='pleated'?10:8,12,seated),hemY=mix(-23,-HIP_H+5,seated);poly(c,[[-half+.5,-37],[half-.5,-37],[hem,hemY],[-hem,hemY]],art.bottom);if(art.skirtStyle==='pleated')for(let z=-5;z<=5;z+=3.4)line(c,z,-35,z*1.5,hemY-1,'#ffffff38',.8);}
    else {rr(c,-half+.6,-37,half*2-1.2,5,1,art.bottom);line(c,-half+1,-36,half-1,-36,art.accent,1.1);}
    if(art.shirtType==='cardigan'){line(c,seam,-56,seam,-36,art.accent,1.5);for(let z=0;z<3;z++)ellipse(c,seam+side*1.4,-51+z*5,.7,.7,'#e9ead5');}
    else if(art.shirtType==='sweater'){line(c,-half+1,-37,half-1,-37,art.accent,1.5);poly(c,[[seam-4,-57],[seam,-51],[seam+4,-57],[seam+2,-57],[seam,-54],[seam-2,-57]],art.accent);}
    else {poly(c,[[seam-3,-57],[seam,-51],[seam+3,-57]],'#fff6e5');if(art.shirtType==='polo'){line(c,seam,-51,seam,-46,art.accent,1);ellipse(c,seam,-48,.7,.7,art.accent);}else poly(c,[[seam,-52],[seam-1.5,-47],[seam,-42],[seam+1.5,-47]],art.accent);}
    rr(c,seam+side*2,-50,3,3,1,'#ffffff70');
    arm(nearShoulder,true);
    const neckX=yaw*1.8;line(c,neckX,-58,neckX,-63-gaze*4,skin,4.2);
    c.save();c.translate(neckX+side*turn*.8,-70-gaze*4);c.scale(.81,.81);drawHead(c,art,{time:motion.reactionTime??this.time,lookUp:Math.max(gaze,(motion.startle||0)*.65),facing:gaze?(x<640?1:-1):facing,talking:chatting,yaw,fear:motion.fear||0,strain:motion.strain||0,tremble:motion.alarmTremble??(!this.reduced&&!!motion.fear)});c.restore();
    c.restore();
    if(!motion.deferLabel)this._personLabel(c,p,x,y,s,selected,darkness,tilt,motion);
  }

  _personLabel(c,p,x,y,s,selected,darkness,tilt,motion={}) {
    if((motion.labelOpacity??1)<.01)return;
    const gaze=Math.max(motion.lookUp||0,this.run?this._arrivalGaze(this.run.progress):0);
    const tagScale=clamp(.86+(s-.85)*.35,.68,1.08),name=p.name;
    const labelX=x+40*s*Math.sin(tilt),labelY=Math.min(...[[-18,1],[18,1],[-15,-CHARACTER_TOP],[15,-CHARACTER_TOP]].map(([cx,cy])=>y+(cx*Math.sin(tilt)+cy*Math.cos(tilt))*s))-13*tagScale-gaze*6*s;
    c.save();c.globalAlpha*=motion.labelOpacity??1;
    let fontSize=selected?14:11.5;
    const max=Math.max(96,Math.min(selected?300:235,this.view.width-20)/tagScale),textMax=max-18;
    c.font=`600 ${fontSize}px "Be Vietnam Pro", Arial, sans-serif`;
    while(c.measureText(name).width>textMax&&fontSize>8){fontSize=Math.max(8,fontSize-.5);c.font=`600 ${fontSize}px "Be Vietnam Pro", Arial, sans-serif`;}
    const tw=Math.min(max,c.measureText(name).width+18);
    const lx=clamp(labelX,this.view.left+tw*tagScale/2+3,this.view.right-tw*tagScale/2-3);let ly=labelY;
    for(let attempt=0;attempt<12;attempt++){
      const overlap=this.labelBoxes.some(box=>Math.abs(box.x-lx)<(box.w+tw*tagScale)/2+3&&Math.abs(box.y-ly)<(box.h+22*tagScale)/2+3);
      if(!overlap)break;ly-=24*tagScale;
    }
    this.labelBoxes.push({id:p.id,x:lx,y:ly,w:tw*tagScale,h:22*tagScale,r:11*tagScale,
      tail:[[lx-3*tagScale,ly+10*tagScale],[lx+3*tagScale,ly+10*tagScale],[lx,ly+14*tagScale]]});
    if(ly<labelY-5)line(c,lx,ly+9*tagScale,labelX,labelY+10*tagScale,'#e7f4d98a',1);
    c.translate(lx,ly);c.scale(tagScale,tagScale);
    const own=p.id===this.currentStudentId;
    const fill=own?'#174f64':selected?'#dbffb0':darkness>.3?'#e9efd8':'#ffffef';
    const border=own?(selected?'#f2cf75':'#ffffff'):selected?'#89bb54':'#496f4b18';
    const ink=own?'#ffffff':selected?'#2e5d2a':'#415d49';
    c.shadowColor='#345c3920';c.shadowBlur=5;c.shadowOffsetY=2;rr(c,-tw/2,-11,tw,22,11,fill,border);c.shadowBlur=0;c.shadowOffsetY=0;
    poly(c,[[-3,10],[3,10],[0,14]],fill);c.textAlign='center';c.textBaseline='middle';c.fillStyle=ink;c.fillText(name,0,0,textMax);c.restore();
  }

  _currentStudentAura(c,motion) {
    // A steady outline follows the actual body, not its old ground position.
    // It identifies the viewer equally before, during and after a selection.
    const {x,y,scale:s}=motion;c.save();c.translate(x,y);c.rotate(motion.angle||0);
    c.beginPath();c.ellipse(0,-42*s,26*s+3,46*s+3,0,0,TAU);
    c.fillStyle='#164f6430';c.fill();c.strokeStyle='#ffffff';c.lineWidth=3;c.stroke();
    c.strokeStyle='#174f64';c.lineWidth=1.4;c.stroke();c.restore();
  }

  _currentStudentBadge(c,motion) {
    const s=motion.scale,angle=motion.angle||0,size=clamp(s,.8,1),label=this.currentStudentLabel||'Bạn';
    const bottom=Math.max(...[[-20,3],[20,3],[-20,-CHARACTER_TOP],[20,-CHARACTER_TOP]].map(([x,y])=>motion.y+(x*Math.sin(angle)+y*Math.cos(angle))*s));
    c.save();c.font=`800 ${11*size}px "Be Vietnam Pro", Arial, sans-serif`;
    const width=c.measureText(label).width+18*size,height=19*size;
    const x=clamp(motion.x+42*s*Math.sin(angle),this.view.left+width/2+3,this.view.right-width/2-3);
    const y=clamp(bottom+height/2+5*size,this.view.top+height/2+3,this.view.bottom-height/2-3);
    rr(c,x-width/2,y-height/2,width,height,height/2,'#174f64','#ffffff');
    poly(c,[[x-3*size,y-height/2+1],[x+3*size,y-height/2+1],[x,y-height/2-4*size]],'#174f64');
    text(c,label,x,y,11*size,'#ffffff',800);c.restore();
  }

  _speech(c,x,y,value,selected) {
    c.save();let fontSize=12;c.font=`600 ${fontSize}px "Be Vietnam Pro", Arial, sans-serif`;
    const limit=Math.max(24,Math.min(360,this.view.right-this.view.left-16));
    while(c.measureText(value).width>limit-22&&fontSize>9){fontSize-=.5;c.font=`600 ${fontSize}px "Be Vietnam Pro", Arial, sans-serif`;}
    const width=Math.min(limit,c.measureText(value).width+22);
    const sx=clamp(x,this.view.left+8,this.view.right-width-8),tail=[[sx+12,y+13],[sx+22,y+13],[sx+9,y+20]];
    this.nameOccluders?.push({x:sx+width/2,y:y+1,w:width,h:28,r:12,tail});
    rr(c,sx,y-13,width,28,12,selected?'#fff4d4':'#e5f6d7','#45694222');poly(c,tail,selected?'#fff4d4':'#e5f6d7');text(c,value,sx+width/2,y+1,fontSize,'#426344',600,'center',width-22);c.restore();
  }

  _rider(c,x,y,s){c.save();c.translate(x,y);c.scale(s,s);line(c,-2,-2,7,12,'#486661',6);line(c,7,12,23,14,'#486661',5);rr(c,-8,-24,14,25,5,'#f4e6c6');line(c,4,-21,21,-9,'#d6aa7a',4);ellipse(c,0,-31,8,9,'#dbad82');ellipse(c,0,-37,10,6,'#f0c369');c.restore();}
}

/** Uses the same full-body renderer as the game without starting an animation loop. */
export function drawCharacterPreview(canvas, person = {}) {
  const c = canvas.getContext('2d');
  if (!c) return;
  const w = canvas.width, h = canvas.height;
  const s = Math.min(w / 85, h / 105);
  const x = w / 2, y = h * .91;
  const actor = { ...person, seed: characterSeed(person.id ?? person.name ?? ''), x, y, scale: s, direction: 0, facing: 0, art: null };
  const feet = [4, -4].map(dx => ({x: x + dx * s, y: y - 2.2 * s, planted: true}));
  const standingY = y + groundedBodyOffset(actor, feet, {facing: 0, turn: 0});
  const renderer = Object.create(UFOScene.prototype);
  Object.assign(renderer, { time: 1, reduced: true, run: null });
  c.clearRect(0, 0, w, h);
  renderer._person(c, actor, x, standingY, s, 0, false, 0, null, 0, 0, { shadow: 1, groundY: y, feet, facing: 0, deferLabel: true });
}
