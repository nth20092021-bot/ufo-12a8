/** One decorative phone per appearance: CSS drives their timing; no animation timer or RAF is owned here. */
export class ResultPhones {
  constructor(stage, {reducedMotion = false, onPhase = () => {}, random = Math.random} = {}) {
    this.stage = stage;
    this.reducedMotion = reducedMotion;
    this.onPhase = onPhase;
    this.random = random;
    this.active = false;
    this.phase = 'idle';
    this.current = [];
    this.previous = [];
    this.ended = new Set();
    this.cycle = -1;
    this.prepared = null;
    this.failed = new Set();
    this.imageWaits = new Map();
    // Some site editions omit the result promotion entirely.
    if (!stage) return;
    this.showcase = stage.closest?.('.result-sponsor-showcase');
    this.actions = this.showcase?.querySelector('.result-footer-actions');
    if (this.actions && typeof ResizeObserver !== 'undefined') {
      this.layoutObserver = new ResizeObserver(() => this.resize());
      this.layoutObserver.observe(this.showcase);
      for (const control of this.actions.children) this.layoutObserver.observe(control);
    }
    stage.addEventListener('animationstart', event => {
      if (!this.active || this.reducedMotion || !this.current.includes(event.target)) return;
      const phase = event.animationName === 'result-sponsor-phone-rise' ? 'rise' : event.animationName === 'result-sponsor-phone-sink' ? 'sink' : null;
      if (!phase || (phase === 'rise' ? this.phase !== 'waiting' : this.phase !== 'rise')) return;
      this.phase = phase;
      this.onPhase(phase, {duration: (phase === 'rise' ? this.riseSpan : this.sinkSpan) / 1000, cycle: this.cycle});
    });
    stage.addEventListener('animationend', event => {
      if (!this.active || this.reducedMotion || !this.current.includes(event.target) || event.animationName !== 'result-sponsor-phone-sink' || this.phase !== 'sink') return;
      this.ended.add(event.target);
      if (this.ended.size !== this.current.length) return;
      this.onPhase(null);
      this.previous = this.current.slice();
      this._clearPhones();
      this._beginGroup(false);
    });
  }

  resize() {
    if (!this.actions || !this.stage.clientWidth) return;
    const stage = this.stage.getBoundingClientRect();
    if (!stage.width) return;
    const controls = [...this.actions.children].map(control => control.getBoundingClientRect());
    const left = Math.min(...controls.map(box => box.left));
    const right = Math.max(...controls.map(box => box.right));
    // Normalize the modal entrance scale and center over the two actual buttons.
    const scale = this.stage.clientWidth / stage.width;
    const center = ((left + right) / 2 - stage.left) * scale;
    const limit = parseFloat(getComputedStyle(this.showcase).getPropertyValue('--phone-max-height'));
    const height = Math.min(limit, ((right - left) * scale - 12) / 1.25);
    for (const [name, value] of Object.entries({height, peek: height * .6})) {
      this.showcase.style.setProperty('--phone-' + name, `${value}px`);
    }
    this.stage.style.setProperty('--phone-center', `${center}px`);
  }

  _clearPhones() {
    for (const cleanup of this.imageWaits.values()) cleanup();
    this.imageWaits.clear();
    for (const phone of this.stage?.children || []) {
      phone.classList.remove('result-phone-current');
      for (const name of ['offset','angle','delay','rise','sway','sway-delay','sink','sink-delay']) phone.style.removeProperty('--phone-' + name);
    }
    this.current = [];
  }

  _place(phone) {
    phone.style.setProperty('--phone-offset', '0px');
    phone.style.setProperty('--phone-angle', '-1deg');
    this._load(phone);
    const show = () => {
      this.imageWaits.get(phone)?.();this.imageWaits.delete(phone);
      if (!this.active || !this.current.includes(phone)) return;
      phone.classList.add('result-phone-current');
      // Only one following model is fetched, after the visible one is ready.
      if (!this.reducedMotion) this.prepare();
    };
    if (!phone.getAttribute?.('data-src') || phone.complete && phone.naturalWidth > 0) { show();return; }
    const failed = () => {
      this.imageWaits.get(phone)?.();this.imageWaits.delete(phone);
      if (!this.active || !this.current.includes(phone)) return;
      this.failed.add(phone);this.previous=this.current.slice();this._clearPhones();this._beginGroup(false);
    };
    if (phone.complete && !phone.naturalWidth) {failed();return;}
    phone.addEventListener('load', show, {once:true});
    phone.addEventListener('error', failed, {once:true});
    this.imageWaits.set(phone, () => {phone.removeEventListener('load',show);phone.removeEventListener('error',failed);});
  }

  _load(image) {
    const source=image?.getAttribute?.('data-src');
    if (source && !image.getAttribute('src')) {image.fetchPriority='low';image.setAttribute('src',source);}
  }

  /** Warm just the next model and logo during the flight, never at page startup. */
  prepare() {
    if (!this.stage) return;
    this._load(this.showcase?.querySelector('.result-sponsor-logo'));
    if (!this.prepared) {
      const candidates=[...this.stage.children].filter(phone=>!this.current.includes(phone)&&!this.failed.has(phone));
      this.prepared=candidates[Math.min(candidates.length-1,Math.floor(this.random()*candidates.length))]||null;
    }
    this._load(this.prepared);
  }

  _beginGroup(first) {
    this.resize();
    const candidates = [...this.stage.children].filter(phone => !this.previous.includes(phone) && !this.failed.has(phone));
    if (candidates.length < 1) { this.phase = 'done'; this.stage.classList.remove('result-phones-active'); return; }
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    this.current = this.prepared && candidates.includes(this.prepared) ? [this.prepared] : candidates.slice(0, 1);
    this.prepared = null;
    this.cycle++;
    this.groupDelay = first ? 5800 + this.random() * 800 : 1200 + this.random() * 1800;
    if (first) this.firstDelay = this.groupDelay;
    this.ended.clear();
    this.profiles = this.current.map(phone => ({phone, stagger: 0, rise: 1600 + this.random() * 350, sway: 1100 + this.random() * 300, hold: 350 + this.random() * 200, sink: 950 + this.random() * 250}));
    this.riseSpan = Math.max(...this.profiles.map(p => p.stagger + p.rise));
    for (const profile of this.profiles) {
      profile.swayOffset = this.riseSpan + profile.stagger / 2;
      profile.sinkOffset = profile.swayOffset + profile.sway + profile.hold;
    }
    this.sinkOffset = Math.min(...this.profiles.map(p => p.sinkOffset));
    this.sinkSpan = Math.max(...this.profiles.map(p => p.sinkOffset + p.sink)) - this.sinkOffset;
    this.phase = this.reducedMotion ? 'static' : 'waiting';
    this.stage.classList.add(this.reducedMotion ? 'result-phones-static' : 'result-phones-active');
    for (const profile of this.profiles) {
      const phone = profile.phone;
      this._place(phone);
      for (const [name, value] of Object.entries({delay: this.groupDelay + profile.stagger, rise: profile.rise, sway: profile.sway, 'sway-delay': this.groupDelay + profile.swayOffset, sink: profile.sink, 'sink-delay': this.groupDelay + profile.sinkOffset})) phone.style.setProperty('--phone-' + name, `${value}ms`);
    }
  }

  start() {
    this.stop();
    // Keep the optional result decoration dormant while its stage is hidden.
    if (!this.stage || this.stage.hidden) return;
    this.active = true;
    this.previous = [];
    this.cycle = -1;
    this.prepare();
    this._beginGroup(true);
  }

  stop() {
    const wasActive = this.active;
    this.active = false;
    this.phase = 'idle';
    this.stage?.classList.remove('result-phones-active', 'result-phones-static');
    this._clearPhones();
    if (wasActive) this.onPhase(null);
  }

  setReducedMotion(value) {
    if (this.reducedMotion === !!value) return;
    this.reducedMotion = !!value;
    if (!this.active) return;
    const selected = this.current.slice();
    this.stop();
    this.active = true;
    this.phase = this.reducedMotion ? 'static' : 'done';
    if (this.reducedMotion) {
      this.current = selected;
      selected.forEach(phone => this._place(phone));
      this.stage.classList.add('result-phones-static');
    }
  }
}
