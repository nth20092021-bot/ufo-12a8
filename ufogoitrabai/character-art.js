/* Deterministic, original flat-school character details. Canvas only. */
import { APPEARANCE_OPTIONS, sanitizeAppearance } from './appearance.js';
const TAU = Math.PI * 2;
const { skin: SKINS, hair: HAIRS, shirt: SHIRTS, bottom: BOTTOMS, shoe: SHOES, accent: ACCENTS } = APPEARANCE_OPTIONS;

function hash(value) {
  let n = 2166136261;
  for (const ch of String(value)) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  return n >>> 0;
}

export const characterSeed = identity => hash(identity) / 4294967295;

export function characterStyle(person = {}) {
  const seed = Number.isFinite(person.seed) ? Math.max(0, Math.min(1, person.seed)) : 0.5;
  const identity = `${person.id ?? person.name ?? ''}:${Math.round(seed * 1e8)}`;
  const choice = (values, salt) => values[hash(`${identity}:${salt}`) % values.length];
  const female = person.gender === 'female';
  const hairTypes = female
    ? ['long', 'long-parted', 'ponytail', 'bob', 'ponytail', 'long']
    : person.gender === 'other'
      ? ['short-side', 'short-wave', 'bob', 'short-fringe']
      : ['short-side', 'short-crop', 'short-wave', 'short-fringe'];
  const appearance = sanitizeAppearance(person.appearance);
  const skirtStyle = appearance.bottomType && appearance.bottomType !== 'pants' ? appearance.bottomType : choice(['pleated', 'straight'], 'skirt');
  const bottomType = appearance.bottomType ?? (female ? skirtStyle : 'pants');
  return {
    skin: choice(SKINS, 'skin'),
    hair: choice(HAIRS, 'hair'),
    shirt: choice(SHIRTS, 'shirt'),
    bottom: choice(BOTTOMS, 'bottom'),
    shoe: choice(SHOES, 'shoe'),
    accent: choice(ACCENTS, 'accent'),
    hairType: choice(hairTypes, 'hair-type'),
    glasses: hash(`${identity}:glasses`) % 5 === 0,
    shirtType: choice(['plain', 'polo', 'sweater', 'cardigan'], 'shirt-type'),
    skirtStyle,
    bottomType,
    wearsSkirt: bottomType !== 'pants',
    female,
    faceType: hash(`${identity}:face`) % 4,
    phase: (hash(`${identity}:phase`) / 4294967296) * TAU,
    ...appearance,
  };
}

function ellipse(c, x, y, rx, ry, fill) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU);
  c.fillStyle = fill; c.fill();
}

function stroke(c, points, color, width = 1) {
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
}

function shape(c, points, fill) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath(); c.fillStyle = fill; c.fill();
}

function scaredSweat(c, fear, time, phase, direction) {
  if (fear < .05) return;
  c.save(); c.globalAlpha *= fear;
  const x = -direction * 12.5, y = -3 + Math.sin(time * 5 + phase) * 1.1;
  shape(c, [[x, y - 4], [x - 1.7, y], [x + 1.7, y]], '#b5eaf0');
  ellipse(c, x, y, 1.7, 2.4, '#b5eaf0');
  ellipse(c, x - .4, y - .3, .4, 1.1, '#f0ffff');
  c.restore();
}

function hairBack(c, s) {
  if (s.hairType === 'long' || s.hairType === 'long-parted') {
    c.beginPath(); c.moveTo(-8, -7); c.quadraticCurveTo(-12, 4, -11, 19);
    c.quadraticCurveTo(-5, 22, -4, 16); c.lineTo(5, 16);
    c.quadraticCurveTo(12, 21, 12, 16); c.lineTo(10, -6);
    c.closePath(); c.fillStyle = s.hair; c.fill();
  } else if (s.hairType === 'ponytail') {
    ellipse(c, 10.5, -3, 4.5, 5, s.hair);
    c.beginPath(); c.moveTo(10, -1); c.quadraticCurveTo(17, 7, 12, 19);
    c.quadraticCurveTo(18, 15, 17, 9); c.quadraticCurveTo(19, 2, 13, -3);
    c.closePath(); c.fillStyle = s.hair; c.fill();
    ellipse(c, 12, -1, 2.5, 1.5, s.accent);
  } else if (s.hairType === 'bob') {
    c.beginPath(); c.moveTo(-9, -6); c.quadraticCurveTo(-12, 3, -10, 10);
    c.quadraticCurveTo(-1, 14, 10, 10); c.quadraticCurveTo(12, 0, 8, -8);
    c.closePath(); c.fillStyle = s.hair; c.fill();
  }
}

function hairFront(c, s) {
  c.beginPath(); c.ellipse(0, -4.7, 9.2, 6.3, 0, Math.PI, TAU);
  c.lineTo(9.1, 0.4);
  if (s.hairType === 'short-crop') {
    c.lineTo(6.5, -4.8); c.lineTo(-6.8, -4.8); c.lineTo(-8.6, 0);
  } else if (s.hairType === 'short-wave') {
    c.lineTo(6, -2.1); c.quadraticCurveTo(5, -6.5, 1, -4.2);
    c.quadraticCurveTo(-4, 0, -8.8, -1.3);
  } else if (s.hairType === 'short-fringe') {
    c.lineTo(7, -3); c.lineTo(4.8, -1.7); c.lineTo(2.6, -4.5);
    c.lineTo(0, -2.5); c.lineTo(-2.8, -4.8); c.lineTo(-6, -2.3); c.lineTo(-9, 0);
  } else if (s.hairType === 'long-parted') {
    c.lineTo(7.8, 5.2); c.quadraticCurveTo(7, -1, 1, -6.1);
    c.quadraticCurveTo(-5, -1.5, -8.1, 5.3); c.lineTo(-9.2, 0);
  } else if (s.hairType === 'bob') {
    c.lineTo(8, 5); c.lineTo(6, -3.2); c.lineTo(-5, -3.2); c.lineTo(-8.3, 5);
  } else {
    c.lineTo(6.5, -1.5); c.lineTo(3.7, -6.2);
    c.quadraticCurveTo(-2.4, -1.8, -8.8, -0.8);
  }
  c.closePath(); c.fillStyle = s.hair; c.fill();
  if (s.hairType === 'short-wave') {
    ellipse(c, -2.4, -10, 4.2, 2, s.hair);
    ellipse(c, 2, -10.7, 3.8, 1.5, s.hair);
  }
  if (s.female && (s.hairType === 'bob' || s.hairType === 'long')) {
    stroke(c, [[-8, -3], [-5.6, -5]], s.accent, 1.8);
  }
}

/** Draw at a head centre; caller owns the body and its neck. Time is seconds. */
function drawFrontHead(ctx, style, { time = 0, lookUp = 0, facing = 1, talking = false, fear = 0, strain = 0, tremble = false } = {}) {
  const c = ctx, s = style;
  const gaze = Math.max(0, Math.min(1, Number(lookUp) || 0));
  const direction = facing < 0 ? -1 : 1;
  const phase = s.phase ?? 0, face = s.faceType ?? 0;
  const t = Number(time) || 0;
  const panic = Math.max(0, Math.min(1, Number(fear) || 0));
  const effort = Math.max(0, Math.min(1, Number(strain) || 0));
  c.save();
  if (tremble) c.rotate(Math.sin(t * 34 + phase) * .025 * panic);
  // Turn only the head around the neck attachment, leaving the torso stable.
  c.translate(0, 9); c.rotate(-direction * gaze * 0.15); c.translate(direction * gaze * 0.7, -9 - gaze * 0.7);
  hairBack(c, s);
  ellipse(c, -8.4, 1, 2, 2.8, s.skin); ellipse(c, 8.4, 1, 2, 2.8, s.skin);
  ellipse(c, 0, 0, face === 1 ? 8.7 : face === 2 ? 9.2 : 9, face === 3 ? 9.5 : 10, s.skin);
  hairFront(c, s);

  const eyeY = -0.3 - gaze * 1.8;
  const spacing = face === 1 ? 3.1 : face === 2 ? 3.9 : 3.5;
  const eyeShift = direction * (0.25 + gaze * 0.35);
  const cycle = 3.6 + phase * 0.25;
  const blink = panic < .2 && ((t + phase) % cycle + cycle) % cycle < 0.13;
  const ink = '#343d34';
  for (const side of [-1, 1]) {
    const x = side * spacing + eyeShift;
    if (blink) stroke(c, [[x - 1, eyeY + 0.15], [x + 0.9, eyeY + 0.15]], ink, 0.9);
    else {
      if (panic > .05) ellipse(c, x, eyeY, 1.65 * panic, 2.25 * panic, '#fff9ea');
      ellipse(c, x, eyeY, (face === 2 ? 1 : 0.85) - panic * .12, 1.25 - gaze * 0.2 + panic * .35, ink);
      ellipse(c, x + 0.16, eyeY - 0.35, 0.23, 0.27, '#faf0d9');
    }
    const browLift = gaze * 0.7 + (talking ? 0.25 : 0) + panic * 1.2;
    stroke(c, [[x - 1.1, eyeY - 2.6 - browLift + side * (.2 + panic * .55)], [x + 1, eyeY - 2.8 - browLift - side * panic * .55]], s.hair, 0.85);
  }
  // Small warm cheek tint stays within the skin palette.
  const originalAlpha = c.globalAlpha;
  c.globalAlpha = originalAlpha * 0.17;
  ellipse(c, -5.2, 3.2, 1.8, 1, '#bc6e5b'); ellipse(c, 5.2, 3.2, 1.8, 1, '#bc6e5b');
  c.globalAlpha = originalAlpha;
  stroke(c, [[direction * 0.6, 1.3 - gaze], [direction * 1.1, 2.8 - gaze], [direction * 0.25, 3]], '#9a684b', 0.5);
  const mouthY = 5.4 - gaze * 0.3;
  if (panic > .15) {
    ellipse(c, direction * .25, mouthY, 1.3 + panic * .9 + effort * .5, 1.1 + panic * 1.5 - effort * 1.5, '#68453d');
    if (effort > .45) stroke(c, [[-1.4, mouthY], [1.8, mouthY]], '#fff4dc', 1.1);
    else ellipse(c, direction * .25, mouthY + 1.3, 1.05, .6, '#c59188');
  } else if (talking) {
    const open = 0.75 + (Math.sin(t * 16 + phase) + 1) * 0.9;
    ellipse(c, direction * 0.25, mouthY, 1.6, open, '#725143');
    if (open > 1.6) ellipse(c, direction * 0.25, mouthY + 0.8, 0.8, 0.45, '#c38b79');
  } else if (gaze > 0.5) {
    ellipse(c, direction * 0.2, mouthY, 1.05, 1.1, '#795947');
  } else {
    c.beginPath(); c.moveTo(-1.8, mouthY - 0.2); c.quadraticCurveTo(0, mouthY + (face === 1 ? 0.6 : 1.3), 1.8, mouthY - 0.2);
    c.strokeStyle = '#805b48'; c.lineWidth = 0.8; c.lineCap = 'round'; c.stroke();
  }
  if (s.glasses) {
    c.strokeStyle = '#535e55'; c.lineWidth = 0.85;
    for (const side of [-1, 1]) {
      c.beginPath(); c.roundRect(side * spacing + eyeShift - 2.5, eyeY - 1.9, 5, 4.6, 1.6); c.stroke();
    }
    stroke(c, [[-spacing + eyeShift + 2.5, eyeY], [spacing + eyeShift - 2.5, eyeY]], '#535e55', 0.75);
    stroke(c, [[-8.3, eyeY - 0.8], [-spacing + eyeShift - 2.5, eyeY]], '#535e55', 0.75);
    stroke(c, [[spacing + eyeShift + 2.5, eyeY], [8.3, eyeY - 0.8]], '#535e55', 0.75);
  }
  scaredSweat(c, panic, tremble ? t : 0, phase, direction);
  c.restore();
}


/** Continuous yaw changes the face landmarks and silhouette, never its canvas width. */
export function drawHead(ctx, style, {time=0,lookUp=0,facing=1,talking=false,yaw=0,fear=0,strain=0,tremble=false}={}) {
  const amount=Math.max(0,Math.min(1,Math.abs(Number(yaw)||0)));
  if(amount<.015){drawFrontHead(ctx,style,{time,lookUp,facing,talking,fear,strain,tremble});return;}
  const c=ctx,s=style,dir=yaw<0?-1:1,gaze=Math.max(0,Math.min(1,lookUp)),t=Number(time)||0;
  const blend=(a,b)=>a+(b-a)*amount,phase=s.phase||0,ink='#343d34',panic=Math.max(0,Math.min(1,Number(fear)||0)),effort=Math.max(0,Math.min(1,Number(strain)||0));
  c.save();if(tremble)c.rotate(Math.sin(t*34+phase)*.025*panic);c.translate(0,9);c.rotate(-dir*gaze*.38);c.translate(0,-9-gaze*.8);
  const originalAlpha=c.globalAlpha;
  // One opaque hair silhouette morphs around the skull as the head turns.
  const bx=(front,side)=>front+(dir*side-front)*amount;
  c.beginPath();
  if(s.hairType==='long'||s.hairType==='long-parted'){
    c.moveTo(bx(-8,-7),blend(-7,-8));
    c.quadraticCurveTo(bx(-12,-14),blend(4,-1),bx(-11,-10),19);
    c.quadraticCurveTo(bx(-5,-5),blend(22,24),bx(-4,1),blend(16,17));
    c.lineTo(bx(5,1),blend(16,17));c.quadraticCurveTo(bx(12,1),blend(21,19),bx(12,1),blend(16,17));
    c.lineTo(bx(10,1),blend(-6,-5));c.closePath();c.fillStyle=s.hair;c.fill();
  }else if(s.hairType==='ponytail'){
    const root=bx(10.5,-9);ellipse(c,root,blend(-3,-4),4.5,5,s.hair);
    c.beginPath();c.moveTo(bx(10,-11),blend(-1,-3));
    c.quadraticCurveTo(bx(17,-19),blend(7,4),bx(12,-12),blend(19,20));
    c.quadraticCurveTo(bx(18,-16),blend(15,12),bx(17,-14),blend(9,7));
    c.quadraticCurveTo(bx(19,-13),blend(2,3),bx(13,-8),blend(-3,2));
    c.closePath();c.fillStyle=s.hair;c.fill();ellipse(c,bx(12,-10),blend(-1,0),2.5,1.5,s.accent);
  }else if(s.hairType==='bob'){
    c.moveTo(bx(-9,-8),blend(-6,-7));c.quadraticCurveTo(bx(-12,-13),blend(3,1),bx(-10,-9),blend(10,12));
    c.quadraticCurveTo(bx(-1,-3),14,bx(10,2),blend(10,9));c.quadraticCurveTo(bx(12,4),blend(0,1),bx(8,4),blend(-8,-7));
    c.closePath();c.fillStyle=s.hair;c.fill();
  }
  // A real forehead–nose–chin contour projects ahead of the cheek in profile.
  ellipse(c,dir*amount*1.1,0,blend(9,8.1),s.faceType===3?9.5:10,s.skin);
  c.save();c.scale(dir,1);c.beginPath();c.moveTo(6.2,-4);c.lineTo(blend(8.7,9),-2.2);c.lineTo(blend(8.8,12),.3);c.quadraticCurveTo(blend(8.8,11.6),1.8,blend(8.4,8),2.2);c.lineTo(8,5.5);c.quadraticCurveTo(6.4,9.6,2.1,9.2);c.lineTo(2,-3);c.closePath();c.fillStyle=s.skin;c.fill();c.restore();
  // The far ear disappears while the visible ear settles behind the eye.
  c.save();c.globalAlpha=originalAlpha*(1-amount);ellipse(c,dir*8.4,1,2,2.8,s.skin);c.restore();
  const earX=dir*blend(-8.4,-4.7);ellipse(c,earX,1.1,2.2,3,s.skin);stroke(c,[[earX-dir*.7,.3],[earX+dir*.5,1],[earX-dir*.1,2.1]],'#a77960',.55);
  // The cap/fringe is also a single solid shape; no translucent duplicate hair.
  c.save();c.scale(dir,1);
  const hp=(x0,y0,x1,y1)=>[blend(x0,x1),blend(y0,y1)];
  const line=(x0,y0,x1,y1)=>c.lineTo(...hp(x0,y0,x1,y1));
  const quad=(x0,y0,ex0,ey0,x1,y1,ex1,ey1)=>c.quadraticCurveTo(...hp(x0,y0,x1,y1),...hp(ex0,ey0,ex1,ey1));
  c.beginPath();c.moveTo(...hp(-9.2,-4.7,-8.6,2));
  quad(-9.2,-11,0,-11,-11,-8,-4,-10);quad(9.2,-11,9.2,-4.7,3,-12.5,8,-7);
  line(9.1,.4,8,-3.8);
  if(s.hairType==='short-crop'){
    line(6.5,-4.8,4.7,-6);line(-6.8,-4.8,.5,-5);line(-8.6,0,-2,-1);
  }else if(s.hairType==='short-wave'){
    line(6,-2.1,7,-4);quad(5,-6.5,1,-4.2,5,-10,1,-5);quad(-4,0,-8.8,-1.3,-1,-1,-4,-2);
  }else if(s.hairType==='short-fringe'){
    line(7,-3,5,-2.7);line(4.8,-1.7,3,-5);line(2.6,-4.5,1,-2);line(0,-2.5,-1,-4);line(-2.8,-4.8,-2,-3);line(-6,-2.3,-3,-2);line(-9,0,-4,-1);
  }else if(s.hairType==='long-parted'){
    line(7.8,5.2,7,-4);quad(7,-1,1,-6.1,4,-5,1,-8);quad(-5,-1.5,-8.1,5.3,-3,-4,-3,4);line(-9.2,0,-5,3);
  }else if(s.hairType==='bob'){
    line(8,5,6,-1);line(6,-3.2,4,-5);line(-5,-3.2,-1,-4);line(-8.3,5,-4,4);
  }else{
    line(6.5,-1.5,5,-5.5);line(3.7,-6.2,2,-2);quad(-2.4,-1.8,-8.8,-.8,-1,-4,-3,-1);
  }
  line(-9.2,-4.7,-4.6,-1);line(-9.2,-4.7,-5.6,3);line(-9.2,-4.7,-8.6,2);
  c.closePath();c.fillStyle=s.hair;c.fill();
  if(s.hairType==='short-wave'){ellipse(c,blend(-2.4,0),-10,4.2,2,s.hair);ellipse(c,blend(2,4),blend(-10.7,-8.8),blend(3.8,3),1.8,s.hair);}
  c.restore();
  const eyeY=-.6-gaze*1.3,nearX=dir*blend(3.5,5.7),farX=dir*blend(-3.5,2.1);
  const blink=panic<.2&&((t+phase)%(3.6+phase*.25))<.13;
  const farWidth=Math.max(0,1-amount/.78);
  for(const [ex,width] of [[farX,farWidth],[nearX,1]]){
    if(width<.07)continue;
    if(blink)stroke(c,[[ex-width,eyeY],[ex+width,eyeY]],ink,.85);
    else{if(panic>.05)ellipse(c,ex,eyeY,1.65*width*panic,2.15*panic,'#fff9ea');ellipse(c,ex,eyeY,(.85-panic*.12)*width,1.1+panic*.4,ink);if(width>.35)ellipse(c,ex+.16*width,eyeY-.25,.22*width,.25,'#fff5dc');}
    stroke(c,[[ex-dir*1.1*width,eyeY-2.6-gaze*.6-panic*1.6],[ex+dir*1.1*width,eyeY-2.8-gaze*.6-panic*.5]],s.hair,.85);
    if(s.glasses){c.beginPath();c.roundRect(ex-2.4*width,eyeY-1.9,4.8*width,4.5,Math.min(1.4,width));c.strokeStyle='#536059';c.lineWidth=.85;c.stroke();}
  }
  if(s.glasses)stroke(c,[[earX,eyeY-.5],[nearX-dir*2.4,eyeY-.5]],'#536059',.85);
  stroke(c,[[dir*blend(.6,8.4),1.1-gaze],[dir*blend(1.1,9),2.3-gaze],[dir*blend(.25,7.8),2.8-gaze]],'#9a684b',.55);
  const mouthX=dir*blend(.25,5.7),mouthY=5.5;
  if(panic>.15){ellipse(c,mouthX,mouthY,1.2+panic*.7+effort*.4,1.1+panic*1.5-effort*1.5,'#68453d');if(effort>.45)stroke(c,[[mouthX-1.3,mouthY],[mouthX+1.3,mouthY]],'#fff4dc',1.1);else ellipse(c,mouthX,mouthY+1.3,.9,.6,'#c59188');}
  else if(talking)ellipse(c,mouthX,mouthY,1.4,.8+(Math.sin(t*15+phase)+1)*.6,'#775344');
  else if(gaze>.5)ellipse(c,mouthX,mouthY,1,1.1,'#795947');
  else stroke(c,[[mouthX-dir*1.2,mouthY],[mouthX+dir*1.2,mouthY-.3]],'#805b48',.8);
  scaredSweat(c,panic,tremble?t:0,phase,dir);c.restore();
}
