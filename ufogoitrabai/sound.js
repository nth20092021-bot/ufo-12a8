/* Original Web Audio music with bundled UFO and result recordings.
 * See ufo-audio-SOURCE.txt. Playback uses the audio clock; idle music has one short look-ahead timer. */
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const smooth = value => { const p = clamp(value); return p * p * (3 - 2 * p); };
export const AIR_RAID_WARNING = Object.freeze({ file: 'ufo-air-raid-siren.mp3', duration: 15.046531 });
const IDLE = () => ({ warningDuration: 0, warningProgress: 0, warningElapsed: 0, warningLoop: false, warningIntro: true, ufoEffect: null, effectProgress: 0, effectDuration: 0, lightEffect: null, lightProgress: 0, lightDuration: 0, lightFadeDuration:0, lightSpeed:1, suspenseEffect: null, suspenseProgress: 0, suspenseDuration: 0, targetId: null, speed: 1 });
const MELODY = [220, 293.66, 329.63, 440, 392, 329.63, 293.66, 261.63];
// Original 24-second, 32-beat idle phrase. Rests leave room for the classroom.
const AMBIENT_BEAT = .75;
const AMBIENT_NOTES = Object.freeze([60,null,64,null,67,null,64,null,62,null,69,null,67,null,62,null,60,null,64,null,69,null,67,null,62,null,67,null,64,null,null,null]);
const AMBIENT_HARMONY = Object.freeze([[48,55],[45,52],[41,48],[43,50]].map(Object.freeze));
const noteFrequency = midi => 440 * 2 ** ((midi - 69) / 12);
const PET_STYLES = Object.freeze({dog:Object.freeze({corgi:0,dachshund:1,poodle:2}),cat:Object.freeze({tabby:0,tuxedo:1,siamese:2})});
const FIREWORK_LEVELS = Object.freeze([.30, .42, .34, .45, .28, .39, .33, .44, .36]);
const UFO_EFFECTS = Object.freeze({
  landing: { file: 'ufo-landing.mp3', level: .27, onset: .06 },
  beam: { file: 'ufo-beam.mp3', level: .12, onset: 0 },
  departure: { file: 'ufo-departure.mp3', level: .29, onset: .10 },
});

const LIGHT_EFFECTS = Object.freeze({
  start: { file: 'ufo-light-start.mp3', level: .38, onset: .04 },
  loop: { file: 'ufo-light-loop.mp3', level: .60, onset: 0 },
});

export class Soundtrack {
  constructor({ context = null, audioContextFactory = null, ufoBuffers = null, lightBuffers = null, resultBuffer = null, fireworkBuffer = null, warningBuffer = null, birdBuffer = null, setTimer = (fn, delay) => globalThis.setTimeout(fn, delay), clearTimer = id => globalThis.clearTimeout(id) } = {}) {
    this.context = context;
    this._factory = audioContextFactory;
    this._enabled = true;
    this._running = false;
    this._phase = IDLE();
    this._voices = new Set();
    this._ufoVoice = null;
    this._warningAllowed = true;
    this._resumePending = null;
    this._warningBuffer = warningBuffer;
    this._warningLoad = null;
    this._warningVoice = null;
    this._warningKey = null;
    this._warningPlayedKey = null;
    this._warningFinished = false;
    this._warningArrived = false;
    this._warningSnapshots = new WeakSet();
    this._ufoBuffers = ufoBuffers || {};
    this._ufoLoad = null;
    this._ufoKey = null;
    this._ufoPlayedKey = null;
    this._lightVoice = null;
    this._lightBuffers = lightBuffers || {};
    this._lightLoad = null;
    this._flightLoad = null;
    this._lightKey = null;
    this._lightPlayedKey = null;
    this._master = null;
    this._resultBuffer = resultBuffer;
    this._fireworkBuffer = fireworkBuffer;
    this._resultActive = false;
    this._burstIds = new Set();
    this._fireworkCount = 0;
    this._resultLoad = null;
    this._resultVoice = null;
    this._phoneVoice = null;
    this._phonePlayed = new Set();
    this._phoneCycle = -1;
    this._resultPending = null;
    this._resultEpoch = 0;
    this._note = 0;
    this._nextNote = 0;
    this._suspenseEffect = null;
    this._suspenseFinished = false;
    this._nextSuspensePulse = 0;
    this._speechDucking = false;
    this._sceneSpeechDucking = false;
    this._ambientRequested = false;
    this._ambientDucking = false;
    this._ambientTimer = null;
    this._ambientNext = 0;
    this._ambientStep = 0;
    this._setTimer = setTimer;
    this._clearTimer = clearTimer;
    this._petBuffers = new Map();
    this._petVoice = null;
    this._lastPetAt = -Infinity;
    this._playbackUnavailable = false;
    this._playbackListeners = new Map();
    this._foregroundListeners = new Map();
    this._foregroundHold = 0;
    this._resultWaitTimer = null;
    this._birdBuffer = birdBuffer;
    this._birdLoad = null;
    this._birdVoice = null;
  }

  get enabled() { return this._enabled; }
  set enabled(value) { this.setEnabled(value); }

  get playbackState() {
    if(!this._enabled)return 'muted';
    if(this._playbackUnavailable)return 'unavailable';
    if(this.context?.state==='closed')return 'closed';
    if(!this.context||!this._master)return 'uninitialized';
    const state=this.context.state;
    return ['running','suspended','interrupted'].includes(state)?state:'unavailable';
  }

  get ready() { return this.playbackState==='running'; }

  get foregroundBusy() {
    return this._foregroundHold>0||this._running||this._resultPending!==null||
      [...this._voices].some(voice=>!voice.kind.startsWith('ambient-'));
  }

  onForegroundChange(listener) {
    if(typeof listener!=='function')return ()=>{};
    this._foregroundListeners.set(listener,null);this._notifyForegroundChange();
    return ()=>this._foregroundListeners.delete(listener);
  }

  _notifyForegroundChange() {
    if(this._foregroundHold)return;
    for(const [listener] of [...this._foregroundListeners]){
      if(!this._foregroundListeners.has(listener))continue;
      const busy=this.foregroundBusy;
      if(this._foregroundListeners.get(listener)===busy)continue;
      this._foregroundListeners.set(listener,busy);
      try{listener(busy);}catch{/* An observer must not interrupt native audio cleanup. */}
    }
    if(this._resultActive)this._refreshAmbient();
  }

  /** Reports native playback readiness, not permission for browser speech. */
  onPlaybackStateChange(listener) {
    if(typeof listener!=='function')return ()=>{};
    this._playbackListeners.set(listener,null);this._notifyPlaybackState();
    return ()=>this._playbackListeners.delete(listener);
  }

  _notifyPlaybackState() {
    for(const [listener] of [...this._playbackListeners]){
      if(!this._playbackListeners.has(listener))continue;
      const state=this.playbackState;
      if(this._playbackListeners.get(listener)===state)continue;
      this._playbackListeners.set(listener,state);
      try{listener(state);}catch{/* An unavailable UI listener must not interrupt audio. */}
    }
  }

  /** Use resume:false at startup; userGesture may retry an older blocked resume. */
  init({ warning = false, resume = true, userGesture = false } = {}) {
    if (!this._enabled) {this._notifyPlaybackState();return null;}
    try {
      if (!this.context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!this._factory && !AudioContext) {this._playbackUnavailable=true;this._notifyPlaybackState();return null;}
        this.context = this._factory ? this._factory() : new AudioContext();
      }
      if (this.context.state === 'closed') {this._notifyPlaybackState();return null;}
      if (!this._master) {
        const ctx = this.context;
        this._master = ctx.createGain();
        this._master.gain.value = this._speechDucking && this._resultActive ? .15 : .6;
        this._limiter = ctx.createDynamicsCompressor();
        this._limiter.threshold.value = -15;
        this._limiter.knee.value = 18;
        this._limiter.ratio.value = 6;
        this._limiter.attack.value = 0.005;
        this._limiter.release.value = 0.12;
        // Speech uses a separate bus so existing suspense automation and every
        // native source's playback cursor keep running unchanged underneath it.
        this._sceneSpeechBus=ctx.createGain();
        this._sceneSpeechBus.gain.value=this._sceneSpeechDucking?.28:1;
        this._master.connect(this._sceneSpeechBus);
        this._sceneSpeechBus.connect(this._limiter);
        this._limiter.connect(ctx.destination);
        // An already-started siren phrase may outlast arrival and the flight's
        // suspense silence. Give it the same initial level on its own bus.
        this._warningBus = ctx.createGain();
        this._warningBus.gain.value = .6;
        this._warningBus.connect(this._sceneSpeechBus);
        this._ambientBus = ctx.createGain();
        this._ambientBus.gain.value = this._ambientDucking ? .24 : 1;
        this._ambientBus.connect(this._master);
        ctx.addEventListener?.('statechange',()=>{if(ctx.state!=='running'){this.stopPets();this.stopBirds();}this._refreshAmbient();this._notifyPlaybackState();});
      }
      this._playbackUnavailable=false;
      if (resume && ['suspended','interrupted'].includes(this.context.state) && typeof this.context.startRendering !== 'function') {
        if(!this._resumePending||userGesture){
          // A fresh real gesture must reach native resume even if an earlier
          // WebKit request still awaits permission or an interruption's end.
          const pending=Promise.resolve(this.context.resume()).catch(()=>{}).finally(()=>{
            if(this._resumePending===pending)this._resumePending=null;
            this._refreshAmbient();this._notifyPlaybackState();
          });
          this._resumePending=pending;
        }
      }
      if(warning||this._phase.warningDuration)this._loadWarningSound();
      this._refreshAmbient();
      this._notifyPlaybackState();
      return this.context;
    } catch { this._playbackUnavailable=true;this._notifyPlaybackState();return null; }
  }

  _loadWarningSound() {
    if (this._warningLoad) return this._warningLoad;
    if (this._warningBuffer || !this.context?.decodeAudioData || typeof globalThis.fetch !== 'function') return null;
    const ctx = this.context;
    this._warningLoad = (async () => {
      try {
        const response = await fetch(new URL(AIR_RAID_WARNING.file, import.meta.url));
        if (response.ok) this._warningBuffer = await ctx.decodeAudioData(await response.arrayBuffer());
        // Loading never starts sound. Each draw waits for readiness before its clock starts.
      } catch { /* A missing recording must not hold the saved draw open. */ }
    })().finally(() => { this._warningLoad = null; });
    return this._warningLoad;
  }

  /** Wait before the scene starts, so a first download never cuts off the intro. */
  prepareWarning({ timeoutMs = 5000, signal = null } = {}) {
    const unavailable=()=>({ready:false,duration:AIR_RAID_WARNING.duration});
    if(signal?.aborted)return Promise.resolve(unavailable());
    const ctx=this.init({warning:true});
    if(!ctx)return Promise.resolve(unavailable());
    this._prepareFlightSounds();
    const readiness=()=>{
      const duration=Number(this._warningBuffer?.duration);
      const ready=Number.isFinite(duration)&&duration>0&&duration<=120&&(ctx.state==='running'||typeof ctx.startRendering==='function');
      return ready?{ready:true,duration}:unavailable();
    };
    const cached=readiness();if(cached.ready)return Promise.resolve(cached);
    return new Promise(resolve=>{
      let settled=false;
      const done=value=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve(value);};
      const abort=()=>done(unavailable());
      const timer=setTimeout(()=>done(unavailable()),clamp(timeoutMs,0,10000));
      signal?.addEventListener('abort',abort,{once:true});
      Promise.all([this._warningLoad,this._resumePending]).then(()=>done(readiness()),()=>done(unavailable()));
      if(signal?.aborted)abort();
    });
  }

  /** The scene's final warning pose waits for the sampled tail before arrival. */
  warningComplete() {
    const voice=this._warningVoice;
    const ctx=this.context,unavailable=!ctx||(ctx.state!=='running'&&typeof ctx.startRendering!=='function');
    return !this._warningAllowed||!this._enabled||!voice||unavailable||ctx.currentTime>=voice.endsAt;
  }

  /** Load only same-origin bundled clips. Failure never prevents a flight. */
  _loadUfoEffects() {
    if (this._ufoLoad) return this._ufoLoad;
    if (Object.keys(UFO_EFFECTS).every(kind => this._ufoBuffers[kind])) return null;
    if (!this.context?.decodeAudioData || typeof globalThis.fetch !== 'function') return null;
    const ctx = this.context;
    this._ufoLoad = Promise.all(Object.entries(UFO_EFFECTS).map(async ([kind, { file }]) => {
      if (this._ufoBuffers[kind]) return;
      try {
        const response = await fetch(new URL(file, import.meta.url));
        if (!response.ok) return;
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        this._ufoBuffers[kind] = buffer;
        // Loading does not play anything: only the current scene frame can do so.
      } catch { /* Music remains available when an effect cannot be loaded. */ }
    })).finally(() => { this._ufoLoad = null; });
    return this._ufoLoad;
  }

  _loadLightEffects() {
    if (this._lightLoad) return this._lightLoad;
    if (Object.keys(LIGHT_EFFECTS).every(kind => this._lightBuffers[kind])) return null;
    if (!this.context?.decodeAudioData || typeof globalThis.fetch !== 'function') return null;
    const ctx = this.context;
    this._lightLoad = Promise.all(Object.entries(LIGHT_EFFECTS).map(async ([kind, { file }]) => {
      if (this._lightBuffers[kind]) return;
      try {
        const response = await fetch(new URL(file, import.meta.url));
        if (response.ok) this._lightBuffers[kind] = await ctx.decodeAudioData(await response.arrayBuffer());
        // The next current scene frame decides whether this clip still belongs.
      } catch { /* Retry missing light recordings at a later init, never per frame. */ }
    })).finally(() => { this._lightLoad = null; });
    return this._lightLoad;
  }

  _loadResultSounds() {
    if (this._resultLoad) return this._resultLoad;
    if ((this._resultBuffer && this._fireworkBuffer) || !this.context?.decodeAudioData || typeof globalThis.fetch !== 'function') return null;
    const ctx = this.context;
    this._resultLoad = Promise.all([
      ['_resultBuffer', 'result-fanfare.mp3'], ['_fireworkBuffer', 'result-firework.mp3'],
    ].map(async ([field, file]) => {
      if (this[field]) return;
      try {
        const response = await fetch(new URL(file, import.meta.url));
        if (response.ok) {
          this[field] = await ctx.decodeAudioData(await response.arrayBuffer());
          // The fanfare need not wait for an unrelated firework download.
          if (field === '_resultBuffer') this._playResultFanfare(this._resultPending);
        }
      } catch { /* A later init/result can retry missing recordings independently. */ }
      finally { if(field==='_resultBuffer'&&!this._resultBuffer)this._skipResultFanfare(this._resultPending); }
    })).finally(() => { this._resultLoad = null; });
    return this._resultLoad;
  }

  /** Optional preloading hook, also useful for offline audio rendering. */
  prepare() { return this.init() ? Promise.all([this._warningLoad, this._loadUfoEffects(), this._loadLightEffects(), this._loadResultSounds()]) : null; }

  _prepareFlightSounds() {
    if(this._flightLoad)return this._flightLoad;
    // Idle music needs no recordings. Once a draw is requested, give its UFO
    // and light clips a head start; result clips wait behind that decode work.
    this._flightLoad=Promise.all([this._loadUfoEffects(),this._loadLightEffects()])
      .finally(()=>{this._flightLoad=null;this._loadResultSounds();});
    return this._flightLoad;
  }

  start(phase = {}, { warningReady = true } = {}) {
    this._foregroundHold++;
    try {
    this.stop();
    this._warningAllowed=!!warningReady;
    this.sync(phase);
    this._running = true;
    if (this.init()) {
      this._prepareFlightSounds();
      this._nextNote = this.context.currentTime;
      this._update();
    }
    } finally {this._foregroundHold--;this._notifyForegroundChange();}
  }

  /** Scene progress controls audio timing, including mid-flight speed changes. */
  sync({ warningDuration = 0, warningProgress = 0, warningElapsed = null, warningLoop = false, warningIntro = true, ufoEffect = null, effectProgress = 0, effectDuration = 0, lightEffect = null, lightProgress = 0, lightDuration = 0, lightFadeDuration=0, lightSpeed=null, suspenseEffect = null, suspenseProgress = 0, suspenseDuration = 0, targetId = null, speed = 1 } = {}) {
    this._phase = {
      warningDuration: clamp(warningDuration, 0, 120),
      warningProgress: clamp(warningProgress),
      warningElapsed: clamp(warningElapsed ?? warningDuration * warningProgress, 0, 86400),
      warningLoop: !!warningLoop,
      warningIntro: !!warningIntro,
      ufoEffect: Object.hasOwn(UFO_EFFECTS, ufoEffect) ? ufoEffect : null,
      effectProgress: clamp(effectProgress),
      effectDuration: clamp(effectDuration, 0, 120),
      lightEffect: Object.hasOwn(LIGHT_EFFECTS, lightEffect) ? lightEffect : null,
      lightProgress: clamp(lightProgress),
      lightDuration: clamp(lightDuration, 0, 3600),
      lightFadeDuration:clamp(lightFadeDuration,0,120),
      lightSpeed:clamp(lightSpeed??speed,.25,8),
      suspenseEffect: suspenseEffect === 'build' || suspenseEffect === 'silence' ? suspenseEffect : null,
      suspenseProgress: clamp(suspenseProgress),
      suspenseDuration: clamp(suspenseDuration, 0, 120),
      targetId: targetId == null ? null : String(targetId),
      speed: clamp(speed, 0.25, 8),
    };
    if (this._running && this._enabled && this._master) this._update();
  }

  stop({ preserveWarning = false } = {}) {
    this._foregroundHold++;
    try {
    this._ambientRequested=false;this._cancelAmbient();
    this._resultActive = false;
    this._burstIds.clear();
    this._phonePlayed.clear();
    this._phoneCycle = -1;
    this._fireworkCount = 0;
    this._running = false;
    this._phase = IDLE();
    this._silence({preserveWarning});
    this._note = 0;
    this._nextNote = 0;
    this._suspenseEffect = null;
    this._suspenseFinished = false;
    this._nextSuspensePulse = 0;
    this._speechDucking = false;
    this.setSceneSpeechDucking(false);
    if (this._master) {
      this._master.gain.cancelScheduledValues(this.context.currentTime);
      this._master.gain.setValueAtTime(.6, this.context.currentTime);
    }
    } finally {this._foregroundHold--;this._notifyForegroundChange();}
  }

  setEnabled(value) {
    const enabled = !!value;
    if (enabled === this._enabled) return;
    this._enabled = enabled;
    if (!enabled) {this._ambientRequested=false;this._cancelAmbient();this._silence();}
    else if (this.init() && this._running) {
      this._prepareFlightSounds();
      // The latest scene phase survives mute; no restart of the animation.
      this._nextNote = this.context.currentTime;
      this._update();
    }
    this._notifyPlaybackState();
  }

  /** Remember idle playback intent; only an existing, unlocked context can play. */
  setAmbient(active) {
    this._ambientRequested=!!active;
    if(!this._ambientRequested){this.stopPets();this.stopBirds();}
    return this._refreshAmbient();
  }

  /** Dialogue and welcomes lower only the idle score, never sampled UFO audio. */
  setAmbientDucking(active) {
    const duck=!!active;if(duck){this.stopPets();this.stopBirds();}if(duck===this._ambientDucking)return;
    this._ambientDucking=duck;
    if(!this._ambientBus||!this.context)return;
    const now=this.context.currentTime,gain=this._ambientBus.gain;
    gain.cancelScheduledValues(now);gain.setValueAtTime(gain.value,now);
    gain.linearRampToValueAtTime(duck?.24:1,now+(duck?.12:.45));
  }

  _canAmbient() {
    return this._ambientRequested&&this._enabled&&!this._running&&(!this._resultActive||(!this.foregroundBusy&&!this._speechDucking))&&
      !!this._ambientBus&&this.context?.state==='running'&&globalThis.document?.hidden!==true;
  }

  _cancelAmbient() {
    if(this._ambientTimer!==null)this._clearTimer(this._ambientTimer);
    this._ambientTimer=null;this._ambientNext=0;this._ambientStep=0;
    for(const voice of [...this._voices])if(voice.kind.startsWith('ambient-'))this._release(voice);
  }

  _refreshAmbient() {
    if(!this._canAmbient()){this._cancelAmbient();return false;}
    const now=this.context.currentTime;
    for(const voice of [...this._voices])if(voice.kind.startsWith('ambient-')&&voice.endsAt<=now)this._clean(voice);
    if(!this._ambientNext)this._ambientNext=now+.03;
    if(this._ambientNext<now-.2){
      // Skip missed beats; a delayed background task must never catch up in a burst.
      const skipped=Math.ceil((now+.03-this._ambientNext)/AMBIENT_BEAT);
      this._ambientNext+=skipped*AMBIENT_BEAT;this._ambientStep=(this._ambientStep+skipped)%AMBIENT_NOTES.length;
    }
    while(this._ambientNext<=now+.6){
      const step=this._ambientStep,when=this._ambientNext;
      if(step%8===0)this._ambientChord(AMBIENT_HARMONY[step/8],when);
      if(AMBIENT_NOTES[step]!==null)this._ambientPluck(AMBIENT_NOTES[step],when);
      this._ambientStep=(step+1)%AMBIENT_NOTES.length;this._ambientNext+=AMBIENT_BEAT;
    }
    if(this._ambientTimer===null){
      const timer=this._setTimer(()=>{if(this._ambientTimer!==timer)return;this._ambientTimer=null;this._refreshAmbient();},250);
      this._ambientTimer=timer;
    }
    return true;
  }

  _ambientPluck(note,when) {
    const voice=this._voice('ambient-melody'),gain=voice.gain.gain,end=when+2.1;
    const fundamental=this._oscillator(voice,'triangle',noteFrequency(note),1,when);
    const overtone=this._oscillator(voice,'sine',noteFrequency(note+12),.2,when);
    gain.setValueAtTime(0,when);gain.linearRampToValueAtTime(.046,when+.035);
    gain.exponentialRampToValueAtTime(.0001,end-.1);gain.linearRampToValueAtTime(0,end);
    fundamental.stop(end+.01);overtone.stop(end+.01);voice.endsAt=end+.01;
  }

  _ambientChord(notes,when) {
    const voice=this._voice('ambient-harmony'),gain=voice.gain.gain,end=when+6.3;
    notes.forEach((note,index)=>this._oscillator(voice,'sine',noteFrequency(note),index?.45:.65,when).stop(end+.01));
    gain.setValueAtTime(0,when);gain.linearRampToValueAtTime(.022,when+.8);
    gain.setValueAtTime(.022,end-1.5);gain.linearRampToValueAtTime(0,end);voice.endsAt=end+.01;
  }

  /** Idle visitors never create/unlock audio, queue late sounds, or speak words. */
  pet(species,variant=0) {
    const ctx=this.context;
    if((species!=='dog'&&species!=='cat')||!this._enabled||!this._master||ctx?.state!=='running'||
      this._running||this._resultActive||this._ambientDucking||globalThis.document?.hidden===true)return false;
    const now=ctx.currentTime;
    if(this._petVoice&&this._petVoice.endsAt<=now){this._clean(this._petVoice);this._petVoice=null;}
    if(this._petVoice||now-this._lastPetAt<2)return false;
    const named=typeof variant==='string'&&Object.hasOwn(PET_STYLES[species],variant);
    const numeric=Number(variant),style=named?PET_STYLES[species][variant]:Number.isFinite(numeric)?Math.abs(Math.trunc(numeric))%4:0;
    const buffer=this._petBuffer(species,style),voice=this._voice(`pet-${species}`),source=this._source(voice,ctx.createBufferSource());
    voice.variant=style;voice.endsAt=now+buffer.duration;voice.source=source;
    source.buffer=buffer;source.loop=false;source.playbackRate.value=1;source.connect(voice.gain);voice.nodes.push(source);
    voice.gain.gain.setValueAtTime(species==='dog'?.24:.21,now);
    source.start(now);source.stop(voice.endsAt);this._petVoice=voice;this._lastPetAt=now;
    return true;
  }

  /** Human voices and modal/flight transitions take immediate priority. */
  stopPets() {
    this._release(this._petVoice);this._petVoice=null;
  }

  /** A quiet, complete same-origin field recording; loading never starts it. */
  bird() {
    if(!this._canAmbient()||this._ambientDucking||this._speechDucking)return false;
    const ctx=this.context;
    if(this._birdVoice&&this._birdVoice.endsAt<=ctx.currentTime)this._clean(this._birdVoice);
    if(this._birdVoice)return false;
    if(!this._birdBuffer){this._loadBirdSound();return false;}
    const buffer=this._birdBuffer,now=ctx.currentTime;
    if(!Number.isFinite(buffer.duration)||buffer.duration<=0)return false;
    const voice=this._voice('ambient-bird'),source=this._source(voice,ctx.createBufferSource());
    source.buffer=buffer;source.loop=false;source.playbackRate.value=1;
    source.connect(voice.gain);voice.nodes.push(source);voice.source=source;
    voice.clip='ambient-cardinal.mp3';voice.endsAt=now+buffer.duration;
    const edge=Math.min(.01,buffer.duration/4),gain=voice.gain.gain;
    gain.setValueAtTime(0,now);gain.linearRampToValueAtTime(.28,now+edge);
    gain.setValueAtTime(.28,voice.endsAt-edge);gain.linearRampToValueAtTime(0,voice.endsAt);
    source.start(now);source.stop(voice.endsAt);this._birdVoice=voice;
    return true;
  }

  _loadBirdSound() {
    if(this._birdLoad)return this._birdLoad;
    if(this._birdBuffer||!this.context?.decodeAudioData||typeof globalThis.fetch!=='function')return null;
    const ctx=this.context;
    this._birdLoad=(async()=>{
      try{
        const response=await fetch(new URL('ambient-cardinal.mp3',import.meta.url));
        if(response.ok)this._birdBuffer=await ctx.decodeAudioData(await response.arrayBuffer());
      }catch{/* The next occasional visit may retry; it never holds up the game. */}
    })().finally(()=>{this._birdLoad=null;});
    return this._birdLoad;
  }

  stopBirds() {this._release(this._birdVoice);this._birdVoice=null;}

  _petBuffer(species,variant) {
    const key=`${species}:${variant}`;
    if(this._petBuffers.has(key))return this._petBuffers.get(key);
    const ctx=this.context,rate=ctx.sampleRate,dog=species==='dog',duration=dog?.76:1.06;
    const buffer=ctx.createBuffer(1,Math.ceil(rate*duration),rate),data=buffer.getChannelData(0);
    const pitch=(dog?[155,120,195,170]:[550,470,650,590])[variant];
    let seed=3847+variant*917+(dog?0:151),phase=0,peak=0,previous=0,highpass=0;
    const resonances=[{a:0,b:0},{a:0,b:0},{a:0,b:0}];
    const resonate=(input,index,frequency,bandwidth)=>{
      const state=resonances[index],radius=Math.exp(-Math.PI*bandwidth/rate);
      const value=(1-radius)*input+2*radius*Math.cos(2*Math.PI*frequency/rate)*state.a-radius*radius*state.b;
      state.b=state.a;state.a=value;return value;
    };
    // A jittered glottal pulse excites moving vocal-tract resonances: short,
    // breathy /ow/ bursts for a bark; a voiced /mee-aa-ow/ contour for a meow.
    // Rendering locally once per four timbres avoids a bank of live oscillators.
    for(let index=0;index<data.length;index++){
      const time=index/rate;
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const noise=seed/2147483648-1;
      let elapsed,length,level;
      if(dog){
        const second=time>=.365;elapsed=time-(second?.365:.018);length=second?.29:.235;level=second?.9:1;
      }else{elapsed=time-.015;length=.99;level=1;}
      if(elapsed<0||elapsed>=length){data[index]=0;continue;}
      const progress=elapsed/length,open=dog?smooth(progress*1.5):smooth((progress-.14)/.62);
      const frequency=dog?pitch*(1.58-.85*progress)*(1+.055*Math.sin(elapsed*2*Math.PI*32)):
        pitch*(progress<.15?.74+progress*3.2:1.22-.62*smooth((progress-.15)/.85))*(1+.018*Math.sin(elapsed*2*Math.PI*7));
      phase=(phase+frequency*(1+noise*(dog?.025:.003))/rate)%1;
      const pulse=Math.exp(-phase*(dog?9:7))-(dog?1/9:1/7);
      const excitation=pulse*3.5+noise*(dog?.24:.035);
      const first=dog?780-430*open:480+230*Math.sin(open*Math.PI)-130*open;
      const second=dog?1550-700*open:2050-1150*open;
      const third=dog?2900-600*open:2900-650*open;
      const voiced=resonate(excitation,0,first,dog?230:110)*1.1+
        resonate(excitation,1,second,dog?340:150)*.75+resonate(excitation,2,third,400)*.22;
      const attack=Math.min(1,elapsed/(dog?.009:.055)),release=Math.min(1,(length-elapsed)/(dog?.06:.13));
      const envelope=attack*release*(dog?Math.exp(-progress*1.6):.78+.22*Math.sin(progress*Math.PI))*level;
      const raw=(voiced+excitation*(dog?.025:.008))*envelope;
      highpass=raw-previous+.995*highpass;previous=raw;
      data[index]=highpass;peak=Math.max(peak,Math.abs(highpass));
    }
    // A consistent quiet peak leaves headroom for the ambient score and mixer.
    if(peak>0)for(let index=0;index<data.length;index++)data[index]*=.82/peak;
    this._petBuffers.set(key,buffer);return buffer;
  }

  /** Lower result music while names are spoken; flight silence keeps priority. */
  setSpeechDucking(active) {
    const duck = !!active && this._resultActive && !this._running;
    if (duck === this._speechDucking) return;
    this._speechDucking = duck;
    if (!this._master || this._running || this._suspenseEffect) return;
    const now = this.context.currentTime, gain = this._master.gain;
    gain.cancelScheduledValues(now);gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(duck ? .15 : .6, now + .05);
    this._refreshAmbient();
  }

  /** Let a visible flight character speak over the continuous original siren. */
  setSceneSpeechDucking(active) {
    const duck=!!active&&this._running&&!this._resultActive;
    if(duck===this._sceneSpeechDucking)return;
    this._sceneSpeechDucking=duck;
    if(!this._sceneSpeechBus||!this.context)return;
    const now=this.context.currentTime,gain=this._sceneSpeechBus.gain;
    gain.cancelScheduledValues(now);gain.setValueAtTime(gain.value,now);
    gain.linearRampToValueAtTime(duck?.28:1,now+(duck?.06:.18));
  }

  /** Original short typing click, restored from the pre-Classic implementation. */
  keyTick() {
    // Typing is automatic: it must not create/unlock audio without a prior gesture.
    const ctx = this.context;
    if (!this._enabled || !this._master || this._suspenseEffect === 'silence' || (ctx?.state !== 'running' && typeof ctx?.startRendering !== 'function')) return;
    const now = ctx.currentTime;
    if (this._lastKeyTick != null && now - this._lastKeyTick < .03) return;
    this._lastKeyTick = now;
    if (!this._keyTickBuffer) {
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .025), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let seed = 1949, previous = 0;
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const noise = seed / 2147483648 - 1, time = i / ctx.sampleRate;
        data[i] = (noise - previous) * .5 * Math.exp(-time / .004) * Math.min(1, time / .0005);
        previous = noise;
      }
      this._keyTickBuffer = buffer;
    }
    const voice = this._voice('key-tick'), source = this._source(voice, ctx.createBufferSource());
    source.buffer = this._keyTickBuffer; source.loop = false;
    source.connect(voice.gain); voice.nodes.push(source);
    voice.gain.gain.setValueAtTime(.12, now);
    source.start(now); source.stop(now + .026);
  }

  /** The visual flight ended; a cloud-release wait must not add siren cycles. */
  finishFlight() {this._finishWarning();}

  win() {
    this._foregroundHold++;
    try {
    this._finishWarning();
    this.stop({preserveWarning:true});
    this._resultActive = true;
    const epoch = this._resultEpoch;
    this._resultPending = epoch;
    if (!this.init()) {this._skipResultFanfare(epoch);return;}
    const loading=this._loadResultSounds();
    if (!this._playResultFanfare(epoch)) {
      // A cold-cache result may wait for its recording, but closing/muting or a
      // newer result invalidates this request before asynchronous loading ends.
      if(!loading){this._skipResultFanfare(epoch);return;}
      if(this._resultPending!==epoch)return;
      const timer=this._setTimer(()=>{if(this._resultWaitTimer!==timer)return;this._resultWaitTimer=null;this._skipResultFanfare(epoch);},5000);
      this._resultWaitTimer=timer;
      loading.then(()=>{if(!this._playResultFanfare(epoch))this._skipResultFanfare(epoch);},()=>this._skipResultFanfare(epoch));
    }
    } finally {this._foregroundHold--;this._notifyForegroundChange();}
  }

  _clearResultWait() {
    if(this._resultWaitTimer!==null)this._clearTimer(this._resultWaitTimer);
    this._resultWaitTimer=null;
  }

  _skipResultFanfare(epoch) {
    if(epoch===null||this._resultPending!==epoch)return;
    this._resultPending=null;this._clearResultWait();this._notifyForegroundChange();
  }

  _playResultFanfare(epoch) {
    if (epoch !== this._resultEpoch || this._resultPending !== epoch || !this._enabled ||
        !this._resultActive || this._running || !this._resultBuffer || this.context.state === 'closed') return false;
    this._resultPending = null;
    this._clearResultWait();
    const ctx = this.context, now = ctx.currentTime, buffer = this._resultBuffer;
    const voice = this._voice('result-fanfare'), source = this._source(voice, ctx.createBufferSource());
    source.buffer = buffer; source.loop = false;
    source.playbackRate.setValueAtTime(1, now);
    source.connect(voice.gain); voice.nodes.push(source);
    voice.source = source; voice.clip = 'result-fanfare.mp3';
    // Preserve the complete native-pitch trumpet phrase and its natural tail.
    // Tiny edge fades prevent a click without cropping or repeating the sample.
    const gain = voice.gain.gain, end = now + buffer.duration;
    gain.setValueAtTime(0, now);
    gain.linearRampToValueAtTime(.8, now + Math.min(.005, buffer.duration / 4));
    gain.setValueAtTime(.8, end - Math.min(.02, buffer.duration / 4));
    gain.linearRampToValueAtTime(0, end);
    source.start(now); source.stop(end);
    this._resultVoice = voice;
    return true;
  }

  /** Called once when a firework actually appears; never catch up an old burst. */
  firework(burstId = null) {
    if (!this._resultActive) return;
    if (burstId != null) {
      const key = String(burstId);
      if (this._burstIds.has(key)) return;
      this._burstIds.add(key);
    }
    const ctx = this.context, buffer = this._fireworkBuffer;
    if (!this._enabled || !this._master || !buffer || ctx?.state === 'closed') return;
    // Four tails fit the existing .38-second spacing; the cap also bounds callers.
    const overlapping = [...this._voices].filter(voice => voice.kind === 'result-firework');
    if (overlapping.length >= 4) this._release(overlapping[0]);
    const voice = this._voice('result-firework'), source = this._source(voice, ctx.createBufferSource());
    const now = ctx.currentTime, onset = Math.min(.034, Math.max(0, buffer.duration - .01));
    const duration = buffer.duration - onset, end = now + duration;
    source.buffer = buffer; source.loop = false;source.playbackRate.setValueAtTime(1, now);
    source.connect(voice.gain);voice.nodes.push(source);
    voice.source = source;voice.clip = 'result-firework.mp3';voice.burstId = burstId;
    const numericId = Number(burstId);
    const index = burstId == null ? this._fireworkCount : Number.isInteger(numericId) && numericId > 0 ? numericId - 1 :
      [...String(burstId)].reduce((hash, character) => (Math.imul(hash, 31) + character.codePointAt(0)) >>> 0, 0);
    const level = FIREWORK_LEVELS[index % FIREWORK_LEVELS.length];
    this._fireworkCount += 1;voice.level = level;
    const gain = voice.gain.gain;
    gain.setValueAtTime(0, now);
    gain.linearRampToValueAtTime(level, now + Math.min(.001, duration / 4));
    gain.setValueAtTime(level, end - Math.min(.02, duration / 4));
    gain.linearRampToValueAtTime(0, end);
    source.start(now, onset);source.stop(end);
  }

  /** Follow the visible phone cycle. Durations are seconds; null cancels only phones. */
  phoneRevealPhase(phase, { duration = 1, cycle = 0 } = {}) {
    if (phase !== 'rise' && phase !== 'sink') {
      this._release(this._phoneVoice);this._phoneVoice = null;return false;
    }
    if (!this._resultActive || this._running || !Number.isSafeInteger(cycle) || cycle < 0 || cycle < this._phoneCycle) return false;
    if (cycle > this._phoneCycle) {
      if (phase !== 'rise' || cycle !== this._phoneCycle + 1 ||
          (this._phoneCycle >= 0 && !this._phonePlayed.has('sink'))) return false;
      this._phoneCycle = cycle;this._phonePlayed.clear();
    }
    if (this._phonePlayed.has(phase) || (phase === 'rise' && this._phonePlayed.has('sink'))) return false;
    this._phonePlayed.add(phase);
    this._release(this._phoneVoice);this._phoneVoice = null;
    const ctx = this.context, buffer = phase === 'rise' ? this._lightBuffers.start : this._ufoBuffers.beam;
    // A missed, muted or unloaded visual phase is never replayed asynchronously.
    if (!this._enabled || !this._master || !buffer ||
        (ctx?.state !== 'running' && typeof ctx?.startRendering !== 'function')) return false;
    const seconds = Number(duration);
    if (!Number.isFinite(seconds) || seconds <= 0) return false;
    const onset = Math.min(phase === 'rise' ? LIGHT_EFFECTS.start.onset : 0, Math.max(0, buffer.duration - .01));
    const span = Math.min(clamp(seconds, .03, 3), buffer.duration - onset);
    if (span <= 0) return false;
    const now = ctx.currentTime, end = now + span, level = phase === 'rise' ? .24 : .045;
    const voice = this._voice(`result-phone-${phase}`), source = this._source(voice, ctx.createBufferSource());
    source.buffer = buffer;source.loop = false;source.playbackRate.setValueAtTime(1, now);
    source.connect(voice.gain);voice.nodes.push(source);
    voice.source = source;voice.clip = phase === 'rise' ? LIGHT_EFFECTS.start.file : UFO_EFFECTS.beam.file;
    voice.level = level;voice.phase = phase;voice.cycle = cycle;
    const gain = voice.gain.gain;
    gain.setValueAtTime(0, now);gain.linearRampToValueAtTime(level, now + Math.min(.012, span / 4));
    gain.setValueAtTime(level, end - Math.min(.08, span / 4));gain.linearRampToValueAtTime(0, end);
    source.start(now, onset);source.stop(end);this._phoneVoice = voice;
    return true;
  }

  _voice(kind) {
    const ctx = this.context, gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(kind === 'air-raid-warning' ? this._warningBus : kind.startsWith('ambient-') ? this._ambientBus : this._master);
    const voice = { kind, gain, sources: [], nodes: [gain], remaining: 0, ended: false };
    this._voices.add(voice);
    if(!kind.startsWith('ambient-'))this._notifyForegroundChange();
    return voice;
  }

  _source(voice, source) {
    voice.sources.push(source);
    voice.remaining += 1;
    source.onended = () => {
      voice.remaining -= 1;
      if (voice.remaining <= 0) this._clean(voice);
    };
    return source;
  }

  _oscillator(voice, type, frequency, level = 1, when = this.context.currentTime) {
    const ctx = this.context, source = this._source(voice, ctx.createOscillator()), gain = ctx.createGain();
    source.type = type;
    source.frequency.setValueAtTime(frequency, when);
    gain.gain.value = level;
    source.connect(gain); gain.connect(voice.gain);
    voice.nodes.push(source, gain);
    source.start(when);
    return source;
  }

  _clean(voice) {
    if (voice.ended) return;
    voice.ended = true;
    this._voices.delete(voice);
    if (this._warningVoice === voice) this._warningVoice = null;
    if (this._ufoVoice === voice) this._ufoVoice = null;
    if (this._lightVoice === voice) this._lightVoice = null;
    if (this._resultVoice === voice) this._resultVoice = null;
    if (this._phoneVoice === voice) this._phoneVoice = null;
    if (this._petVoice === voice) this._petVoice = null;
    if (this._birdVoice === voice) this._birdVoice = null;
    for (const source of voice.sources) source.onended = null;
    for (const node of voice.nodes) { try { node.disconnect(); } catch {} }
    if(!voice.kind.startsWith('ambient-'))this._notifyForegroundChange();
  }

  _release(voice) {
    if (!voice || voice.ended || !this._voices.has(voice)) return;
    this._voices.delete(voice);
    const now = this.context.currentTime;
    // Eight milliseconds suppresses switching clicks without an audible tail.
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + 0.008);
    for (const source of voice.sources) { try { source.stop(now + 0.008); } catch {} }
    if(!voice.kind.startsWith('ambient-'))this._notifyForegroundChange();
  }

  _silence({ preserveWarning = false } = {}) {
    this._resultEpoch += 1;
    this._resultPending = null;
    this._clearResultWait();
    this._resultVoice = null;
    this._phoneVoice = null;
    this._petVoice = null;
    this._birdVoice = null;
    const warning=preserveWarning&&(this._warningVoice?.source.loop||this._warningVoice?.tail)?this._warningVoice:null;
    for (const voice of [...this._voices]) if(voice!==warning)this._release(voice);
    if(!warning){
      this._warningVoice = null;
      this._warningKey = null;
      this._warningPlayedKey = null;
      this._warningFinished = false;
      this._warningArrived = false;
    }
    this._ufoVoice = null;
    this._ufoKey = null;
    this._ufoPlayedKey = null;
    this._lightVoice = null;
    this._lightKey = null;
    this._lightPlayedKey = null;
    this._nextSuspensePulse = 0;
    this._notifyForegroundChange();
  }

  _tone(frequency, when, duration, level, type = 'triangle', kind = 'melody') {
    const voice = this._voice(kind);
    const osc = this._oscillator(voice, type, frequency, 1, when);
    const gain = voice.gain.gain;
    gain.setValueAtTime(0, when);
    gain.linearRampToValueAtTime(level, when + 0.018);
    gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.stop(when + duration + 0.015);
  }

  _heartbeat(when, progress) {
    const voice=this._voice('suspense-heartbeat'),gain=voice.gain.gain;
    const level=.22+.28*progress*progress,gap=.13-.03*progress,thump=.085;
    voice.beatTimes=[when,when+gap];voice.pairDuration=gap+thump;
    // Two short falling sine thumps form a rounded lub–dub, not a pitched beep.
    for(const [index,at] of voice.beatTimes.entries()){
      const peak=level*(index?.62:1),frequency=index?112:86;
      const osc=this._oscillator(voice,'sine',frequency,1,at);
      osc.frequency.exponentialRampToValueAtTime(index?56:43,at+thump*.85);
      gain.setValueAtTime(0,at);gain.linearRampToValueAtTime(peak,at+.009);
      gain.exponentialRampToValueAtTime(.0001,at+thump-.006);gain.linearRampToValueAtTime(0,at+thump);
      osc.stop(at+thump);
    }
    return voice;
  }

  _updateSuspense(now, phase) {
    const previous = this._suspenseEffect;
    let effect = this._suspenseFinished ? null : phase.suspenseEffect;
    // A late/repeated frame cannot start another build after the first release.
    if (previous === 'silence' && effect === 'build') effect = null;
    if (previous && !effect) this._suspenseFinished = true;
    this._suspenseEffect = effect;
    const master = this._master.gain;
    if (effect === 'silence') {
      if (previous !== 'silence') {
        this._silence({preserveWarning:true});
        this._nextNote = now;
        // Flight voices use this bus, including already scheduled melody. A
        // siren continues throughout the flight on its independent bus.
        master.cancelScheduledValues(now);
        master.setValueAtTime(master.value, now);
        master.linearRampToValueAtTime(0, now + .005);
      }
      return true;
    }
    if (previous && !effect) {
      master.cancelScheduledValues(now);
      master.setValueAtTime(master.value, now);
      master.linearRampToValueAtTime(.6, now + .012);
      this._nextNote = now;
      for (const voice of [...this._voices]) if (voice.kind === 'suspense-heartbeat') this._release(voice);
    }
    if (effect !== 'build') return false;
    const p = phase.suspenseProgress;
    const remaining = phase.suspenseDuration * (1 - p) / phase.speed;
    // Schedule the silence boundary on the audio clock, not the next paint.
    // Recompute on each sync so a speed change cannot move sound past it.
    master.cancelScheduledValues(now);
    master.setValueAtTime(.6, now);
    master.setValueAtTime(.6, now + Math.max(0, remaining - .008));
    master.linearRampToValueAtTime(0, now + Math.max(.001, remaining));
    if (previous !== 'build' || this._nextSuspensePulse < now - .2) this._nextSuspensePulse = now;
    if (remaining > .05 && this._nextSuspensePulse <= now + .04) {
      const when = Math.max(now, this._nextSuspensePulse);
      const pairDuration=.215-.03*p;
      if (when+pairDuration+.02<=now+remaining) {
        this._heartbeat(when,p);
        this._nextSuspensePulse = when + Math.max(pairDuration+.05,(.86-.5*smooth(p))/Math.sqrt(phase.speed));
      }
    }
    return false;
  }

  _updateWarning(now, phase) {
    const active=phase.warningDuration>0&&(phase.warningLoop||phase.warningProgress<1),key=active?(phase.warningLoop?'loop':'full'):null;
    if(!active){
      if(this._warningVoice?.source.loop)this._duckWarning();
      else if(!this._warningVoice?.tail){this._release(this._warningVoice);this._warningVoice=null;}
      this._warningKey=null;
      return false;
    }
    if(this._warningFinished||this._warningArrived)return false;
    if(key!==this._warningKey){
      this._release(this._warningVoice);this._warningVoice=null;
      this._warningKey=key;this._warningPlayedKey=null;
    }
    // Before full arrival the alarm leads the scene. After arrival it continues
    // more quietly alongside the beam, captures and departure until win().
    // The early beam has its own sound while the alarm still guards capture.
    // Keep that voice across frames; its current phase owns the transition.
    for(const voice of [...this._voices])if(voice!==this._warningVoice&&voice!==this._lightVoice&&(phase.warningIntro||voice.kind!=='ufo-landing'))this._release(voice);
    this._nextNote=now;
    if(!this._warningAllowed||this._warningVoice||this._warningPlayedKey===key||!this._warningBuffer)return true;
    const elapsed=phase.warningElapsed;
    const offset=phase.warningLoop?elapsed%this._warningBuffer.duration:elapsed;
    const remaining=this._warningBuffer.duration-offset;
    if(remaining<=0)return true;
    const voice=this._voice('air-raid-warning'),source=this._source(voice,this.context.createBufferSource());
    source.buffer=this._warningBuffer;source.loop=phase.warningLoop;source.playbackRate.value=1;
    if(phase.warningLoop){source.loopStart=0;source.loopEnd=this._warningBuffer.duration;}
    source.connect(voice.gain);voice.nodes.push(source);voice.source=source;
    voice.startedAt=now;voice.offset=offset;
    voice.clip=AIR_RAID_WARNING.file;voice.call=0;voice.endsAt=now+(elapsed>=this._warningBuffer.duration?0:remaining);
    const gain=voice.gain.gain,edge=Math.min(.008,remaining/3);
    gain.setValueAtTime(0,now);gain.linearRampToValueAtTime(.85,now+edge);
    if(!phase.warningLoop){gain.setValueAtTime(.85,voice.endsAt-edge);gain.linearRampToValueAtTime(0,voice.endsAt);}
    // No cropped loop or pitch change. Departure finishes the current iteration.
    source.start(now,offset);
    this._warningVoice=voice;this._warningPlayedKey=key;
    return true;
  }

  _duckWarning() {
    const voice=this._warningVoice;
    if(!voice||voice.ended||this._warningArrived)return;
    this._warningArrived=true;voice.arrived=true;
    const now=this.context.currentTime,gain=voice.gain.gain;
    gain.cancelScheduledValues(now);gain.setValueAtTime(gain.value,now);gain.linearRampToValueAtTime(.68,now+.15);
  }

  /** Departure ends looping, never the already-started recording. */
  _finishWarning() {
    const voice=this._warningVoice,ctx=this.context;
    if(!voice||voice.ended||voice.tail||!voice.source.loop||!this._voices.has(voice))return;
    const now=ctx.currentTime,duration=voice.source.buffer.duration;
    const elapsed=Math.max(0,now-voice.startedAt)+voice.offset;
    voice.tail=true;voice.tailEndsAt=voice.startedAt-voice.offset+(Math.floor(elapsed/duration)+1)*duration;
    this._warningFinished=true;
    // Audio-clock stop prevents another repeat even if no more frames arrive.
    // Setting loop=false also lets the native read cursor reach its natural end.
    voice.source.loop=false;voice.source.stop(voice.tailEndsAt);
    const gain=voice.gain.gain;gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value,now);gain.linearRampToValueAtTime(.68,Math.min(voice.tailEndsAt,now+.15));
  }

  /** The caller holds this one-use snapshot only while the page is hidden. */
  pauseWarning() {
    const voice=this._warningVoice,ctx=this.context;
    if(!voice||voice.ended||!ctx||(!voice.tail&&!voice.arrived)||voice.tail&&ctx.currentTime>=voice.tailEndsAt)return null;
    const duration=voice.source.buffer.duration,loop=!!voice.source.loop;
    const offset=loop?(Math.max(0,ctx.currentTime-voice.startedAt)+voice.offset)%duration:duration-(voice.tailEndsAt-ctx.currentTime);
    const remaining=duration-offset;
    const snapshot=Object.freeze({kind:loop?'air-raid-warning-loop':'air-raid-warning-tail',duration,offset,remaining,loop});
    this._warningSnapshots.add(snapshot);
    this._release(voice);this._warningVoice=null;
    return snapshot;
  }

  /** Resume a paused in-flight loop, or only the remaining phrase after results. */
  resumeWarning(snapshot) {
    if(!snapshot||!this._warningSnapshots.has(snapshot))return false;
    this._warningSnapshots.delete(snapshot);
    const buffer=this._warningBuffer;
    if(!this._enabled||!this._warningAllowed||this._warningVoice||!buffer||!this.init()||
        Math.abs(buffer.duration-snapshot.duration)>1e-6||snapshot.remaining<=0||snapshot.loop&&!this._running)return false;
    const now=this.context.currentTime,voice=this._voice('air-raid-warning'),source=this._source(voice,this.context.createBufferSource());
    source.buffer=buffer;source.loop=!!snapshot.loop;source.playbackRate.value=1;
    if(snapshot.loop){source.loopStart=0;source.loopEnd=buffer.duration;}
    source.connect(voice.gain);voice.nodes.push(source);voice.source=source;
    voice.clip=AIR_RAID_WARNING.file;voice.startedAt=now;voice.offset=snapshot.offset;
    voice.endsAt=now;voice.tail=!snapshot.loop;voice.arrived=true;
    if(voice.tail)voice.tailEndsAt=now+snapshot.remaining;
    voice.gain.gain.setValueAtTime(0,now);voice.gain.gain.linearRampToValueAtTime(.68,now+Math.min(.008,snapshot.remaining));
    source.start(now,snapshot.offset);if(voice.tail)source.stop(voice.tailEndsAt);
    this._warningVoice=voice;this._warningFinished=voice.tail;this._warningArrived=true;
    return true;
  }

  _updateUfoEffect(now, phase) {
    const kind = phase.ufoEffect;
    const key = kind ? `${kind}:${kind === 'beam' ? phase.targetId || 'target' : 'ship'}` : null;
    if (key !== this._ufoKey) {
      this._release(this._ufoVoice); this._ufoVoice = null;
      this._ufoKey = key; this._ufoPlayedKey = null;
    }
    const remaining = phase.effectDuration * (1 - phase.effectProgress) / phase.speed;
    if (!key || remaining <= 0) {
      this._release(this._ufoVoice); this._ufoVoice = null;
      return;
    }
    if (!this._ufoVoice) {
      const buffer = this._ufoBuffers[kind];
      if (this._ufoPlayedKey === key || !buffer || remaining < .035) return;
      const voice = this._voice(`ufo-${kind}`), source = this._source(voice, this.context.createBufferSource());
      source.buffer = kind === 'beam' ? this._beamLoopBuffer(buffer) : buffer;
      source.loop = kind === 'beam';
      source.playbackRate.setValueAtTime(1, now);
      source.connect(voice.gain); voice.nodes.push(source);
      voice.source = source; voice.targetId = phase.targetId;
      voice.clip = UFO_EFFECTS[kind].file; voice.lastGain = 0;
      // Keep the selected recording's pitch. Join at the current scene position
      // after mute/visibility/load delays, never replay the beginning of an old phase.
      const phaseLength = phase.effectDuration / phase.speed;
      const onset = Math.min(UFO_EFFECTS[kind].onset, Math.max(0, buffer.duration - .05));
      const segmentLength = Math.min(buffer.duration - onset, phaseLength);
      const offset = source.loop ? (phase.effectProgress * phaseLength) % source.buffer.duration : onset + phase.effectProgress * segmentLength;
      source.start(now, Math.min(offset, Math.max(0, source.buffer.duration - .001)));
      this._ufoVoice = voice; this._ufoPlayedKey = key;
    }
    const voice = this._ufoVoice, p = phase.effectProgress;
    // Fade before the scene boundary, especially the short1.128-second takeoff.
    // Recompute the deadline every frame so slow/fast controls remain synchronized.
    const level = UFO_EFFECTS[kind].level * smooth(p / .055) * (1 - smooth((p - .76) / .24));
    const ramp = Math.min(.012, remaining * .2), fade = Math.min(.24, remaining * .25);
    const gain = voice.gain.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(voice.lastGain, now);
    gain.linearRampToValueAtTime(level, now + ramp);
    gain.setValueAtTime(level, now + Math.max(ramp, remaining - fade));
    gain.linearRampToValueAtTime(0, now + remaining);
    voice.lastGain = level;
    voice.source.stop(now + remaining);
  }

  _updateLightEffect(now, phase) {
    const kind = phase.lightEffect;
    if (kind !== this._lightKey) {
      this._release(this._lightVoice);this._lightVoice = null;
      this._lightKey = kind;this._lightPlayedKey = null;
    }
    const remaining = phase.lightDuration * (1 - phase.lightProgress) / phase.lightSpeed;
    if (!kind || remaining <= 0) { this._release(this._lightVoice);this._lightVoice = null;return; }
    if (!this._lightVoice) {
      const buffer = this._lightBuffers[kind];
      if (this._lightPlayedKey === kind || !buffer || remaining < .035) return;
      const voice = this._voice(`ufo-light-${kind}`), source = this._source(voice, this.context.createBufferSource());
      source.buffer = kind === 'loop' ? this._beamLoopBuffer(buffer, '_lightLoop', { start: 1.5, end: 18.5, fade: .16 }) : buffer;
      source.loop = kind === 'loop';source.playbackRate.setValueAtTime(1, now);
      source.connect(voice.gain);voice.nodes.push(source);
      voice.source = source;voice.clip = LIGHT_EFFECTS[kind].file;voice.lastGain = 0;
      const length = phase.lightDuration / phase.lightSpeed;
      const onset = Math.min(LIGHT_EFFECTS[kind].onset, Math.max(0, buffer.duration - .05));
      const offset = source.loop ? phase.lightProgress * length % source.buffer.duration :
        onset + phase.lightProgress * Math.min(buffer.duration - onset, length);
      source.start(now, Math.min(offset, Math.max(0, source.buffer.duration - .001)));
      this._lightVoice = voice;this._lightPlayedKey = kind;
    }
    const voice = this._lightVoice, p = phase.lightProgress;
    // The ambient light stays steady through captures, then fades with the last
    // .014 scene-progress of visible light. The startup excerpt fades at opening.
    const fadeFraction = kind === 'loop' ? phase.lightFadeDuration>0?Math.min(1,phase.lightFadeDuration/phase.lightDuration):.014/(.924-.25) : .16;
    const suspenseDuck = this._suspenseEffect === 'build' ? .65 - .3 * phase.suspenseProgress : 1;
    const level = LIGHT_EFFECTS[kind].level * suspenseDuck * smooth(p / (kind === 'loop' ? .012 : .035)) *
      (1 - smooth((p - (1 - fadeFraction)) / fadeFraction));
    const ramp = Math.min(.012, remaining * .2), fade = Math.min(kind === 'loop' ? .12 : .18, remaining * .25);
    const gain = voice.gain.gain;
    gain.cancelScheduledValues(now);gain.setValueAtTime(voice.lastGain, now);
    gain.linearRampToValueAtTime(level, now + ramp);
    gain.setValueAtTime(level, now + Math.max(ramp, remaining - fade));gain.linearRampToValueAtTime(0, now + remaining);
    voice.lastGain = level;voice.source.stop(now + remaining);
  }

  _beamLoopBuffer(buffer, cache = '_beamLoop', { start = 0, end = buffer.duration, fade = .08 } = {}) {
    if (this[cache]?.original === buffer) return this[cache].buffer;
    if (!buffer.getChannelData || buffer.duration < .25) return buffer;
    // Overlap the tail and beginning without changing pitch or the bundled asset.
    // This prevents a hard seam when one student's lift outlasts the3.5-second clip.
    const from = Math.min(Math.round(start * buffer.sampleRate), buffer.length - 1);
    const available = Math.max(1, Math.min(buffer.length, Math.round(end * buffer.sampleRate)) - from);
    const overlap = Math.min(Math.round(buffer.sampleRate * fade), Math.floor(available / 4));
    const length = available - overlap;
    const loop = this.context.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const input = buffer.getChannelData(channel), output = loop.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const blend = clamp((i - (length - overlap)) / overlap);
        output[i] = input[from + i + overlap] * (1 - blend) + input[from + Math.max(0, i - (length - overlap))] * blend;
      }
    }
    this[cache] = { original: buffer, buffer: loop };
    return loop;
  }

  _update() {
    const ctx = this.context, now = ctx.currentTime, phase = this._phase;
    if (this._updateWarning(now, phase)) {
      if(!phase.warningIntro)this._updateUfoEffect(now,phase);
      this._updateLightEffect(now,phase);
      return;
    }
    if (this._updateSuspense(now, phase)) return;
    this._updateUfoEffect(now, phase);
    this._updateLightEffect(now, phase);

    // The scene clock services a short scheduling window; there is no timer to leak.
    if (this._nextNote < now - 0.2) this._nextNote = now;
    if (this._nextNote <= now + 0.08) {
      this._tone(MELODY[this._note % MELODY.length], Math.max(now, this._nextNote), 0.23,
        this._suspenseEffect === 'build' ? .004 : phase.ufoEffect ? 0.01 : 0.025);
      this._note += 1;
      this._nextNote = Math.max(now, this._nextNote) + 0.34 / Math.sqrt(phase.speed);
    }
  }
}
