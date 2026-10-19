const W = 1280, H = 720, TAU = Math.PI * 2;
const CLOUDS = [
  { x: 194, y: 91, scale: 1.45, speed: 4.2 },
  { x: 637, y: 64, scale: .9, speed: 3.1 },
  { x: 888, y: 140, scale: 1.1, speed: 6.3 },
  { x: 1187, y: 49, scale: .75, speed: 3.7 },
];

function ellipse(c, x, y, rx, ry, color) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  c.fillStyle = color;
  c.fill();
}

/** Draw in street world coordinates, so viewport changes do not shift clouds. */
export function drawSky(c, time, view, reduced = false) {
  c.save();
  const sky = c.createLinearGradient(0, 0, 0, 460);
  sky.addColorStop(0, '#ace2f0');
  sky.addColorStop(1, '#edf4dd');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);
  ellipse(c, 1076, 110, 48, 48, '#fff1b0');
  ellipse(c, 1076, 110, 63, 63, '#fff1b029');

  const elapsed = reduced || !Number.isFinite(time) ? 0 : time;
  // Every cloud is fully outside the canvas before its centre wraps.
  // Fixed world bounds also keep the motion continuous during resizing.
  const margin = 100, span = W + margin * 2;
  for (const cloud of CLOUDS) {
    const x = ((cloud.x + margin + elapsed * cloud.speed) % span + span) % span - margin;
    c.save();
    c.translate(x, cloud.y);
    c.scale(cloud.scale, cloud.scale);
    ellipse(c, 0, 0, 42, 13, '#f8fff0');
    ellipse(c, -20, -10, 22, 19, '#f8fff0');
    ellipse(c, 10, -16, 30, 23, '#f8fff0');
    ellipse(c, 36, -2, 25, 14, '#f8fff0');
    c.restore();
  }
  c.restore();
}
