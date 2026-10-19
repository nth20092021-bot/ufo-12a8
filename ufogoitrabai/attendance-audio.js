const STORAGE_KEY = 'kroma-attendance-audio-v1';

/** Short, original synthesized cues. Context creation requires an explicit gesture. */
export class AttendanceAudio {
  constructor({audioContextFactory=null,storage=null}={}) {
    this._factory=audioContextFactory;this._storage=storage;this._context=null;this._master=null;
    this._voices=new Set();this._enabled=true;this._destroyed=false;
    try{this._enabled=storage?.getItem(STORAGE_KEY)!=='0';}catch{}
  }
  get enabled(){return this._enabled;}
  prepare(){
    if(this._destroyed||!this._enabled)return Promise.resolve(false);
    try{
      if(!this._context){
        const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
        if(!this._factory&&!Context)return Promise.resolve(false);
        this._context=this._factory?this._factory():new Context();
      }
      const context=this._context;
      if(!context||context.state==='closed')return Promise.resolve(false);
      if(!this._master){this._master=context.createGain();this._master.gain.value=.55;this._master.connect(context.destination);}
      // Resume is invoked synchronously in the gesture, including on Safari.
      const ready=context.state==='running'?null:context.resume?.();
      return Promise.resolve(ready).then(()=>!this._destroyed&&context.state==='running',()=>false);
    }catch{return Promise.resolve(false);}
  }
  setEnabled(value){
    this._enabled=Boolean(value);
    try{this._storage?.setItem(STORAGE_KEY,this._enabled?'1':'0');}catch{}
    if(!this._enabled)this.stop();
    return this._enabled;
  }
  call(index=0){
    const ratio=[1,1.125,1,1.25][Math.abs(Math.trunc(index))%4]||1;
    return this._cue([[523.25*ratio,0,.13],[659.25*ratio,.075,.14],[783.99*ratio,.15,.17]],.075);
  }
  present(){return this._cue([[659.25,0,.12],[783.99,.065,.13],[1046.5,.13,.14]],.08);}
  absent(){return this._cue([[440,0,.15],[349.23,.1,.17]],.06);}
  tick(second){
    if(![1,2,3].includes(second))return false;
    return this._cue(second===1?[[880,0,.045],[880,.085,.045]]:[[659.25,0,.055]],.035);
  }
  finish(){return this._cue([[523.25,0,.16],[659.25,.075,.16],[783.99,.15,.16],[1046.5,.225,.2]],.075);}
  _cue(notes,level){
    if(this._destroyed||!this._enabled||!this._master||!this._context||this._context.state==='closed')return false;
    this.stop();
    try{const start=this._context.currentTime;for(const [frequency,offset,duration] of notes)this._note(frequency,start+offset,duration,level);return true;}
    catch{this.stop();return false;}
  }
  _note(frequency,when,duration,level){
    const context=this._context,source=context.createOscillator(),gain=context.createGain();
    const voice={source,gain};this._voices.add(voice);
    source.onended=()=>this._clean(voice);source.type='sine';source.frequency.setValueAtTime(frequency,when);
    source.connect(gain);gain.connect(this._master);
    gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(level,when+.008);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
    source.start(when);source.stop(when+duration+.01);
  }
  _clean(voice){
    this._voices.delete(voice);voice.source.onended=null;
    try{voice.source.disconnect();}catch{}try{voice.gain.disconnect();}catch{}
  }
  stop(){
    for(const voice of [...this._voices]){
      try{
        const now=this._context.currentTime;
        voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setValueAtTime(0,now);
        voice.source.stop(now);
      }catch{}
      this._clean(voice);
    }
  }
  destroy(){
    if(this._destroyed)return;this._destroyed=true;this.stop();
    try{this._master?.disconnect();this._context?.close?.()?.catch?.(()=>{});}catch{}
  }
}
