const COLORS = ['#ffd23f', '#ff6fae', '#63f5ec', '#b99aff', '#fff6a0', '#94ef72'];
const DURATION = 5200;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const TAU = Math.PI * 2;
function variation(seed, index, salt) {
  let value = Math.imul(seed + salt * 101, 374761393) ^ Math.imul(index + 1, 668265263);
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return ((value ^ value >>> 16) >>> 0) / 4294967296;
}
function shellParticles(burst) {
  const pattern = (burst.seed - 1) % 3, count = [54, 44, 46][pattern];
  return Array.from({length: count}, (_, i) => {
    const angle = (i + variation(burst.seed, i, 1) * .85) * TAU / count;
    const speed = burst.radius * [2.1, 1.85, 2.2][pattern] * (.46 + variation(burst.seed, i, 2) * .64);
    return {vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      drag: [1.75, 1.5, 1.6][pattern], gravity: [80, 112, 88][pattern],
      life: [1.05, 1.2, .8][pattern] + variation(burst.seed, i, 3) * [.45, .3, .7][pattern],
      tail: [.18, .34, .12][pattern], size: .65 + variation(burst.seed, i, 4) * .9,
      color: pattern === 1 ? ['#ffd074', '#ffe6a8', '#ffba58'][i % 3] : pattern === 2 && i % 4 === 0 ? '#fff1c8' : burst.color,
      flicker: pattern === 2 ? 22 + variation(burst.seed, i, 5) * 15 : 0,
      phase: variation(burst.seed, i, 6) * TAU};
  });
}
function sparkPosition(particle, age) {
  const travel = (1 - Math.exp(-particle.drag * age)) / particle.drag;
  return {x: particle.vx * travel, y: particle.vy * travel + particle.gravity * (age - travel) / particle.drag};
}

/** A finite, decorative celebration. It never changes a draw or takes focus. */
export class ResultCelebration {
  constructor(canvas, { foregroundCanvas = null, reducedMotion = false, onBurst = () => {}, now = () => performance.now(), requestFrame = callback => requestAnimationFrame(callback), cancelFrame = id => cancelAnimationFrame(id) } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.foregroundCanvas = foregroundCanvas;
    this.foregroundContext = foregroundCanvas?.getContext('2d') || null;
    this.reducedMotion = reducedMotion;
    this.now = now;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.onBurst = onBurst;
    this.emittedBursts = new Set();
    this.active = false;
    this.frame = 0;
    this.width = this.height = 0;
    this._tick = time => {
      this.frame = 0;
      if (!this.active) return;
      const elapsed = time - this.startedAt;
      if (elapsed >= DURATION) { this.stop(); return; }
      this._draw(elapsed / 1000);
      this.frame = this.requestFrame(this._tick);
    };
  }

  start() {
    this.stop();
    if (!this.context) return;
    this.active = true;
    this.emittedBursts.clear();
    this.startedAt = this.now();
    this.canvas.hidden = false;
    if (this.foregroundCanvas) this.foregroundCanvas.hidden = this.reducedMotion || !this.foregroundContext;
    this.resize();
    if (!this.reducedMotion) this.frame = this.requestFrame(this._tick);
  }

  stop() {
    if (this.frame) this.cancelFrame(this.frame);
    this.frame = 0;
    this.active = false;
    this.context?.clearRect(0, 0, this.width, this.height);
    this.canvas.hidden = true;
    this.foregroundContext?.clearRect(0, 0, this.width, this.height);
    if (this.foregroundCanvas) this.foregroundCanvas.hidden = true;
  }

  setReducedMotion(value) {
    this.reducedMotion = !!value;
    if (!this.active) return;
    if (this.frame) this.cancelFrame(this.frame);
    this.frame = 0;
    if (this.reducedMotion) this._drawStill();
    else this.stop(); // A preference change must not replay the celebration.
  }

  resize() {
    if (!this.active) return;
    const layerElement=this.canvas.parentElement,layer=layerElement.getBoundingClientRect();
    const cardElement=layerElement.querySelector('.result-card');
    // The rope entrance translates/rotates the dialog above the viewport. Keep
    // the finite celebration anchored to its resting layout, not that first frame.
    const card=cardElement.offsetParent===layerElement
      ? {left:layer.left+cardElement.offsetLeft,top:layer.top+cardElement.offsetTop,
        width:cardElement.offsetWidth,bottom:layer.top+cardElement.offsetTop+cardElement.offsetHeight}
      : cardElement.getBoundingClientRect();
    this.width = Math.max(1, layer.width);
    this.height = Math.max(1, layer.height);
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.foregroundContext) {
      this.foregroundCanvas.width = this.canvas.width;
      this.foregroundCanvas.height = this.canvas.height;
      this.foregroundContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.cardBounds = { x: card.left - layer.left, y: card.top - layer.top, width: card.width, height: card.bottom - card.top };
    const w = this.width, h = this.height, side = Math.max(0, (w - card.width) / 2);
    const top = Math.max(0, card.top - layer.top), bottom = Math.max(0, h - (card.bottom - layer.top));
    // On a phone, use the sky above and below the card. Wide screens have side space.
    const points = side > 95
      ? [[side * .55, h * .35], [w - side * .55, h * .28], [side * .7, h * .66], [w - side * .7, h * .65], [w * .32, Math.max(32, top * .55)], [w * .7, Math.max(32, top * .55)], [side * .5, h * .47]]
      : [[w * .18, Math.max(32, top * .48)], [w * .82, Math.max(32, top * .5)], [w * .45, Math.max(28, top * .33)], [w * .18, bottom > 70 ? h - bottom * .46 : Math.max(32, top * .6)], [w * .82, bottom > 70 ? h - bottom * .46 : Math.max(32, top * .55)], [w * .6, Math.max(32, top * .48)], [w * .38, bottom > 70 ? h - bottom * .45 : Math.max(28, top * .35)]];
    points.push(points[1], points[2]);
    this.bursts = points.map(([x, y], i) => {
      const burst = { x, y, at: .12 + i * .38, color: COLORS[i % COLORS.length], radius: clamp(w * .19, 56, 155), seed: i + 1 };
      burst.particles = shellParticles(burst); return burst;
    });
    if (this.reducedMotion) this._drawStill();
    else this._draw((this.now() - this.startedAt) / 1000);
  }

  _drawStill() {
    const c = this.context;
    this.foregroundContext?.clearRect(0, 0, this.width, this.height);
    if (this.foregroundCanvas) this.foregroundCanvas.hidden = true;
    c.clearRect(0, 0, this.width, this.height);
    c.globalAlpha = .7;
    for (const burst of this.bursts.slice(0, 4)) {
      c.fillStyle = burst.color;
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4, radius = i % 2 ? 2.8 : 8;
        const x = burst.x + Math.cos(angle) * radius, y = burst.y + Math.sin(angle) * radius;
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.closePath(); c.fill();
    }
    c.globalAlpha = 1;
  }

  _draw(time) {
    const c = this.context;
    c.clearRect(0, 0, this.width, this.height);
    for (const burst of this.bursts) {
      const age = time - burst.at;
      if (age < -.35 || age > 1.5) continue;
      c.strokeStyle = c.fillStyle = burst.color;
      if (age < 0) {
        const rise = -age / .35, x = burst.x + Math.sin(burst.seed * 2.1) * rise * 8, y = burst.y + rise * 75;
        for (let i = 4; i >= 0; i--) {
          c.globalAlpha = (1 - i / 5) * .8; c.strokeStyle = i ? '#ffbe6c' : '#fff5d4'; c.lineWidth = i ? 1 : 1.7;
          c.beginPath(); c.moveTo(x, y + i * 5); c.lineTo(x - Math.sin(burst.seed * 2.1) * .8, y + (i + 1) * 5); c.stroke();
        }
        c.globalAlpha = 1; c.fillStyle = '#fff7de'; c.beginPath(); c.arc(x, y, 1.6, 0, TAU); c.fill();
        continue;
      }
      if (!this.emittedBursts.has(burst.seed)) {
        this.emittedBursts.add(burst.seed);
        // Emit with the visible explosion, never replay old bursts after a stalled frame.
        if (this.active && !this.reducedMotion && age <= .12) this.onBurst({id: burst.seed, age, x: burst.x, y: burst.y});
      }
      this._shell(burst, age);
    }
    this._confetti(time);
    c.globalAlpha = 1;
    this._foregroundConfetti(time);
  }

  _shell(burst, age) {
    const c = this.context, radius = Math.max(1, burst.radius * (1 - Math.exp(-3 * age)) * .65);
    const glow = c.createRadialGradient(burst.x, burst.y, 0, burst.x, burst.y, radius);
    glow.addColorStop(0, burst.color + '38'); glow.addColorStop(1, burst.color + '00');
    c.fillStyle = glow; c.globalAlpha = Math.max(0, 1 - age / .75);
    c.beginPath(); c.arc(burst.x, burst.y, radius, 0, TAU); c.fill();
    if (age < .09) {
      const flash = 1 - age / .09, size = 3 + flash * 10;
      const core = c.createRadialGradient(burst.x, burst.y, 0, burst.x, burst.y, size);
      core.addColorStop(0, '#fffdf0'); core.addColorStop(.2, '#fff1bcdd'); core.addColorStop(1, '#ffe1a000');
      c.fillStyle = core; c.globalAlpha = flash;
      c.beginPath(); c.arc(burst.x, burst.y, size, 0, TAU); c.fill();
    }
    for (const particle of burst.particles) {
      if (age >= particle.life) continue;
      const head = sparkPosition(particle, age), fade = Math.pow(1 - age / particle.life, .85);
      const flicker = particle.flicker ? .5 + .5 * Math.sin(age * particle.flicker + particle.phase) ** 2 : 1;
      const tailAge = Math.max(0, age - particle.tail), segments = 4;
      c.strokeStyle = particle.color; c.lineWidth = particle.size * .9;
      for (let i = 0; i < segments; i++) {
        const a = sparkPosition(particle, tailAge + (age - tailAge) * i / segments);
        const b = sparkPosition(particle, tailAge + (age - tailAge) * (i + 1) / segments);
        c.globalAlpha = fade * flicker * (i + 1) / segments * .72;
        c.beginPath(); c.moveTo(burst.x + a.x, burst.y + a.y); c.lineTo(burst.x + b.x, burst.y + b.y); c.stroke();
      }
      c.globalAlpha = fade * flicker; c.fillStyle = age < .45 ? '#fff7db' : particle.color;
      c.beginPath(); c.arc(burst.x + head.x, burst.y + head.y, particle.size * (age < .25 ? 1.2 : 1), 0, TAU); c.fill();
    }
  }

  _foregroundConfetti(time) {
    const c = this.foregroundContext, card = this.cardBounds;
    if (!c) return;
    c.clearRect(0, 0, this.width, this.height);
    if (this.reducedMotion || !card) return;
    // A sparse near layer passes over the card while the denser celebration
    // stays behind it. Small translucent pieces leave names and actions legible.
    const count = this.width < 700 ? 26 : 40;
    for (let i = 0; i < count; i++) {
      const age = time - (i % 9) * .075;
      if (age < 0) continue;
      const fraction = (i * .61803398875 + .13) % 1;
      const x = card.x + 10 + fraction * Math.max(1, card.width - 20) + Math.sin(age * 1.8 + i) * 13;
      const y = card.y - 28 - (i * 37 % 90) + ((card.height + 110) / 4.3 + i % 4 * 8) * age;
      if (x < -12 || x > this.width + 12 || y < -12 || y > this.height + 12) continue;
      c.save();
      c.globalAlpha = (.58 + (i % 3) * .07) * clamp((DURATION / 1000 - time) / .65, 0, 1);
      c.fillStyle = COLORS[(i + 2) % COLORS.length];
      c.translate(x, y); c.rotate(age * (i % 2 ? 1.6 : -1.3) + i);
      const flip = .35 + Math.abs(Math.cos(age * 2.6 + i)) * .65;
      c.fillRect(-2 * flip, -3.5, (3 + i % 3) * flip, 6 + i % 4);
      c.restore();
    }
  }

  _confetti(time) {
    const c = this.context, w = this.width, h = this.height;
    const count = w < 700 ? 85 : 150;
    for (let i = 0; i < count; i++) {
      const age = time - (i % 11) * .045;
      if (age < 0) continue;
      const fraction = (i * .61803398875) % 1, fromSide = i % 3 === 0;
      let x, y;
      if (fromSide) {
        const left = i % 2 === 0;
        x = (left ? w * .05 : w * .95) + (left ? 1 : -1) * (50 + fraction * w * .22) * age;
        y = h * .85 - (h * .58 + (i % 5) * 18) * age + 125 * age * age;
      } else {
        x = fraction * w + Math.sin(age * 2 + i) * 22 + (fraction - .5) * 24 * age;
        y = -25 - (i * 31 % 180) + (65 + i % 5 * 13) * age + 28 * age * age;
      }
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
      c.save();
      c.globalAlpha = .92 * clamp((DURATION / 1000 - time) / .65, 0, 1);
      c.fillStyle = COLORS[i % COLORS.length];
      c.translate(x, y); c.rotate(age * (i % 2 ? 3 : -2.4) + i);
      const flip = .25 + Math.abs(Math.cos(age * 5 + i)) * .75;
      c.fillRect(-3 * flip, -5, (5 + i % 3) * flip, 7 + i % 5);
      c.restore();
    }
  }
}
