// Limbs use world-space contacts. A planted ankle never follows the body.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const smooth = t => t * t * (3 - 2 * t);
const TAU = Math.PI * 2;

/** A two-link limb, with an exact endpoint when it is within reach. */
export function solveTwoBone(start, end, upperLength, lowerLength, bendSign = 1) {
  if (!(upperLength > 0 && lowerLength > 0)) throw new RangeError('Limb lengths must be positive');
  const dx = end.x - start.x, dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  const minimum = Math.abs(upperLength - lowerLength), maximum = upperLength + lowerLength;
  const reachable = distance >= minimum - 1e-8 && distance <= maximum + 1e-8;
  const reach = clamp(distance, minimum, maximum);
  const ux = distance > 1e-9 ? dx / distance : 0;
  const uy = distance > 1e-9 ? dy / distance : 1;
  const sign = bendSign < 0 ? -1 : 1;
  if (reach < 1e-9) {
    return { joint: { x: start.x - uy * upperLength * sign, y: start.y + ux * upperLength * sign },
      end: { ...start }, reachable };
  }
  const along = (upperLength ** 2 - lowerLength ** 2 + reach ** 2) / (2 * reach);
  const across = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)) * sign;
  return {
    joint: { x: start.x + ux * along - uy * across, y: start.y + uy * along + ux * across },
    end: reachable ? { ...end } : { x: start.x + ux * reach, y: start.y + uy * reach },
    reachable,
  };
}

/**
 * Raise the body onto its supporting leg without moving either ankle. Include
 * the swinging foot's reach so a turn cannot pull that foot off its path.
 */
export function groundedBodyOffset(person, feet, { angle = 0, facing = 1, turn = .94 } = {}) {
  const scale = person.scale || 1, side = facing < 0 ? -1 : 1;
  const hipSpread = 4 + (1.2 - 4) * clamp(turn, 0, 1);
  const cosine = Math.cos(angle), sine = Math.sin(angle), reach = 38.8 * scale;
  let originY = -Infinity;
  for (let index = 0; index < Math.min(2, feet?.length || 0); index++) {
    const hipX = (index ? -side : side) * hipSpread, hipY = -35;
    const rotatedX = (hipX * cosine - hipY * sine) * scale;
    const rotatedY = (hipX * sine + hipY * cosine) * scale;
    const horizontal = feet[index].x - person.x - rotatedX;
    // A vertical correction cannot fix impossible horizontal separation, but
    // keeping the root finite lets the ordinary IK reach clamp handle it.
    const height = Math.sqrt(Math.max(0, reach * reach - horizontal * horizontal));
    originY = Math.max(originY, feet[index].y - rotatedY - height);
  }
  return originY === -Infinity ? 0 : originY - person.y;
}

/** World-X stride already contains direction; do not mirror it a second time. */
export function walkingArm(shoulder, stride, isNear, side = 1) {
  const swing = (isNear ? -1 : 1) * clamp(stride, -1, 1);
  const hand = { x: shoulder.x + swing * 11, y: shoulder.y + 29.5 - Math.abs(swing) * 2.5 };
  return solveTwoBone(shoulder, hand, 16, 15, side < 0 ? -1 : 1);
}

/** Folded sprint arms counter-swing the legs; the hands remain anatomical. */
export function runningArm(shoulder, stride, isNear, side = 1) {
  const swing = (isNear ? -1 : 1) * clamp(stride, -1, 1);
  const hand = { x: shoulder.x + side * 7 + swing * 15, y: shoulder.y + 7 - side * swing * 7 };
  return solveTwoBone(shoulder, hand, 16, 15, side < 0 ? -1 : 1);
}

/** Call after a layout/teleport. Feet are ankle points; shoe soles are 2.2 units below. */
export function resetFootPlants(person) {
  const scale = person.scale || 1;
  const ground = person.y - 2.2 * scale;
  person.gait = {
    lastX: person.x, lastY: person.y, scale,
    direction: person.direction < 0 ? -1 : 1,
    feet: [-1, 1].map(sign => ({ x: person.x + sign * 3.2 * scale, y: ground, planted: true, phase: 0 })),
    active: null,
  };
  return { feet: person.gait.feet.map(foot => ({ ...foot })), stride: 0, bob: 0 };
}

/**
 * Advance after person.x has moved. Walking phase advances with distance, not
 * a free-running clock; stopped and turning feet finish a short settling step.
 */
export function updateFootPlants(person, dtSeconds, { walking = !!person.walking, direction = person.direction || 1, running = 0 } = {}) {
  const scale = person.scale || 1;
  const dt = clamp(dtSeconds || 0, 0, .08);
  running = clamp(running, 0, 1);
  direction = direction < 0 ? -1 : 1;
  let gait = person.gait;
  if (!gait || Math.abs(gait.scale - scale) > .001 ||
      Math.abs(person.x - gait.lastX) > 32 * scale || Math.abs(person.y - gait.lastY) > 2 * scale) {
    resetFootPlants(person);
    gait = person.gait;
  }
  const travel = Math.abs(person.x - gait.lastX);
  const ground = person.y - 2.2 * scale;
  const turned = direction !== gait.direction;
  const standingX = index => person.x + (index ? 1 : -1) * 3.2 * scale;
  const begin = (index, mode) => {
    const foot = gait.feet[index];
    const support = gait.feet[1 - index];
    const supportTrail = direction * (person.x - support.x) / scale;
    const stepDistance = Math.min(9.6, Math.max(2.5, 14.5 - supportTrail)) * scale;
    gait.active = {
      index, mode, from: { x: foot.x, y: foot.y }, phase: 0,
      to: { x: mode === 'walk' ? person.x + direction * 14.3 * scale : standingX(index), y: ground },
      distance: stepDistance, duration: .24 + .06 * Math.min(1, Math.abs(foot.x - standingX(index)) / (12 * scale)),
      clearance: mode === 'walk' ? 3.8 + running * 9.2 : 2.6,
    };
    foot.planted = false;
    foot.phase = 0;
  };

  let began = false;
  if (gait.active && ((!walking && gait.active.mode === 'walk') || (walking && (turned || gait.active.mode === 'settle')))) {
    // Rebase at the current ankle, so changing direction never teleports a foot.
    begin(gait.active.index, walking ? 'walk' : 'settle');
    began = true;
  }
  if (!gait.active) {
    if (walking) {
      const trailing = gait.feet.map(foot => direction * (person.x - foot.x));
      const index = trailing[0] > trailing[1] ? 0 : 1;
      if (trailing[index] > 5.5 * scale) { begin(index, 'walk'); began = true; }
    } else {
      const unsettled = gait.feet.map((foot, index) => Math.hypot(foot.x - standingX(index), foot.y - ground));
      const index = unsettled[0] > unsettled[1] ? 0 : 1;
      if (unsettled[index] > .08 * scale) { begin(index, 'settle'); began = true; }
    }
  }

  const step = gait.active;
  if (step && !began) {
    step.phase = Math.min(1, step.phase + (step.mode === 'walk' ? travel / step.distance : dt / step.duration));
    const foot = gait.feet[step.index], progress = smooth(step.phase);
    foot.x = step.from.x + (step.to.x - step.from.x) * progress;
    const baseline = step.from.y + (step.to.y - step.from.y) * progress;
    const clearance = (step.clearance ?? (step.mode === 'walk' ? 3.8 : 2.6)) * scale;
    // Braking can begin at the top of a high running step. Keep that starting
    // height in the settling envelope instead of snapping to walking clearance.
    const liftLimit = Math.max(3.8 * scale, clearance, ground - step.from.y);
    foot.y = Math.max(ground - liftLimit, baseline - Math.sin(Math.PI * step.phase) * clearance);
    foot.phase = step.phase;
    if (step.phase === 1) {
      foot.x = step.to.x; foot.y = step.to.y; foot.planted = true; foot.phase = 0;
      gait.active = null;
    }
  }
  gait.lastX = person.x; gait.lastY = person.y; gait.direction = direction;
  const phase = gait.active?.phase || 0;
  return {
    feet: gait.feet.map(foot => ({ ...foot })),
    stride: walking ? clamp((gait.feet[1].x - gait.feet[0].x) / (16 * scale), -1, 1) : 0,
    bob: walking ? -Math.min(.7, .6 * scale) * Math.sin(Math.PI * phase) : 0,
  };
}

/** Articulated airborne kicking, in character-local coordinates (+y down). */
export function kickLeg(hip, time, seed, legIndex, side = 1, intensity = 1, { style, blend = 1 } = {}) {
  side = side < 0 ? -1 : 1;
  intensity = clamp(intensity, 0, 1.25);
  const index = legIndex ? 1 : 0;
  const phase = time * (index ? 5.25 : 5.85) + seed * TAU + index * 2.4;
  const fold = .5 + .5 * Math.sin(phase + .65 + Math.sin(time * 1.3 + seed * 3) * .18);
  let thighAngle = side * (-.34 + intensity * (.65 * Math.sin(phase - .72) + .17 * Math.sin(phase * .57 + index))) + (index ? .1 : -.1);
  let kneeBend = side * (.14 + intensity * (1.88 * fold ** 1.35));
  // A compact tuck, one-leg flag, and bent-knee brace have different resting
  // shapes as well as different effort waves. Blend angles, never bone lengths,
  // so releasing either kind of grip stays continuous and anatomical.
  const effort = intensity * Math.sin(phase), curl = intensity * fold;
  const hold = style === 'tuck' ? { thigh: -1.14 + index * .22 + effort * .24, knee: 2.25 + curl * .35 } :
    style === 'flag' ? (index ? { thigh: -.12 + effort * .22, knee: .22 + curl * .30 } : { thigh: -1.1 + effort * .26, knee: 2.15 + curl * .35 }) :
    style === 'brace' ? (index ? { thigh: .05 + effort * .38, knee: .85 + curl * .65 } : { thigh: -.88 + effort * .30, knee: 2.0 + curl * .35 }) :
    style === 'scramble' ? { thigh: -.4 + effort * .86 + index * .18, knee: .20 + curl * 2.15 } : null;
  if (hold) {
    const amount = clamp(blend, 0, 1);
    thighAngle += (side * hold.thigh - thighAngle) * amount;
    kneeBend += (side * hold.knee - kneeBend) * amount;
  }
  const shinAngle = thighAngle + kneeBend;
  const knee = { x: hip.x + Math.sin(thighAngle) * 19.5, y: hip.y + Math.cos(thighAngle) * 19.5 };
  const foot = { x: knee.x + Math.sin(shinAngle) * 19.5, y: knee.y + Math.cos(shinAngle) * 19.5 };
  return { knee, foot, shoeAngle: -shinAngle + side * .15 };
}
