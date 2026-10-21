/* Original illustrated scenery. The moving sky is drawn behind this layer. */
const TAU = Math.PI * 2;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const DEFAULT_ENVIRONMENTS = Object.freeze({
  school: { title: 'TRƯỜNG THPT LƯƠNG VĂN CAN', subtitle: '12A8' },
  park: { title: 'HỒ GƯƠM', subtitle: 'THĂNG LONG · HÀ NỘI' },
  seaside: { title: 'VỊNH HẠ LONG', subtitle: 'DI SẢN VIỆT NAM' },
});

function rr(c, x, y, w, h, r, fill, stroke) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.stroke(); }
}
function ellipse(c, x, y, rx, ry, fill) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = fill; c.fill();
}
function poly(c, points, fill) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath(); c.fillStyle = fill; c.fill();
}
function line(c, x, y, xx, yy, color, width = 2) {
  c.beginPath(); c.moveTo(x, y); c.lineTo(xx, yy);
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function text(c, value, x, y, size, color, weight = 700, maxWidth = 900) {
  const label = String(value ?? '');
  let fit = size;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color;
  c.font = `${weight} ${fit}px ${FONT}`;
  while (c.measureText(label).width > maxWidth && fit > 8) {
    fit -= .5; c.font = `${weight} ${fit}px ${FONT}`;
  }
  c.fillText(label, x, y, maxWidth);
}
function sign(c, title, subtitle, { x = 640, y = 355, width = 410, color = '#487a69', light = '#fff4d5' } = {}) {
  rr(c, x - width / 2 + 3, y - 31, width, 70, 5, '#304f342b');
  rr(c, x - width / 2, y - 35, width, 70, 5, light);
  rr(c, x - width / 2 + 5, y - 30, width - 10, 60, 3, color);
  text(c, title, x, y - 7, 25, light, 850, width - 34);
  text(c, subtitle, x, y + 17, 10.5, light, 650, width - 29);
  ellipse(c, x - width / 2 + 11, y, 2, 2, '#fff5d5');
  ellipse(c, x + width / 2 - 11, y, 2, 2, '#fff5d5');
}
function tree(c, x, ground, s = 1, colors = ['#6c9e77', '#83b887', '#a4c591']) {
  c.save(); c.translate(x, ground); c.scale(s, s);
  ellipse(c, 1, 1, 41, 5, '#52795324');
  poly(c, [[-9,0],[-6,-115],[3,-131],[8,0]], '#967e58');
  line(c, 0, -73, -30, -111, '#967e58', 5);
  line(c, 1, -80, 31, -126, '#967e58', 5);
  ellipse(c, -32, -126, 42, 37, colors[0]);
  ellipse(c, 29, -144, 42, 43, colors[0]);
  ellipse(c, -3, -165, 49, 43, colors[1]);
  ellipse(c, -38, -150, 29, 26, colors[1]);
  ellipse(c, 32, -126, 38, 32, colors[1]);
  ellipse(c, -13, -181, 28, 19, colors[2]);
  ellipse(c, 28, -151, 22, 15, colors[2]);
  line(c, -3, -60, -3, -13, '#bba170', 2);
  c.restore();
}
function shrub(c, x, y, width = 80, color = '#7fab78') {
  ellipse(c, x - width * .28, y, width * .29, 17, color);
  ellipse(c, x, y - 8, width * .34, 23, color);
  ellipse(c, x + width * .3, y, width * .29, 18, color);
}
function flowers(c, x, y, width, count = 9) {
  shrub(c, x + width / 2, y, width, '#7b9d6e');
  for (let i = 0; i < count; i++) {
    const fx = x + 8 + i * (width - 16) / Math.max(1, count - 1), fy = y - 8 - (i % 3) * 5;
    const color = ['#edb286', '#e9c768', '#d29a9a'][i % 3];
    ellipse(c, fx - 2, fy, 3, 3, color); ellipse(c, fx + 2, fy - 2, 3, 3, color);
    ellipse(c, fx, fy + 2, 3, 3, color); ellipse(c, fx, fy, 1.5, 1.5, '#fff1ad');
  }
}
function bench(c, x, y, scale = 1) {
  c.save(); c.translate(x, y); c.scale(scale, scale);
  ellipse(c, 0, 1, 50, 4, '#526f4328');
  line(c, -35, -34, -35, 0, '#506f5c', 5); line(c, 35, -34, 35, 0, '#506f5c', 5);
  for (let j = 0; j < 3; j++) rr(c, -46, -39 + j * 7, 92, 5, 2, j === 0 ? '#bd8f60' : '#caa574');
  rr(c, -50, -13, 100, 7, 2, '#a47e58');
  line(c, -43, -19, -43, -9, '#506f5c', 3); line(c, 43, -19, 43, -9, '#506f5c', 3);
  line(c, -48, -20, -31, -20, '#506f5c', 3); line(c, 31, -20, 48, -20, '#506f5c', 3);
  c.restore();
}
function fence(c, from, to, y, color = '#789c83', height = 43) {
  for (let x = from; x < to; x += 20) {
    rr(c, x, y - height, 5, height, 2, color);
    ellipse(c, x + 2.5, y - height - 1, 3.8, 3.8, color);
  }
  line(c, from, y - height + 13, to, y - height + 13, color, 3);
  line(c, from, y - 8, to, y - 8, color, 3);
}
function window(c, x, y, w = 36, h = 51, trim = '#f8eecf') {
  rr(c, x - 4, y - 4, w + 8, h + 8, 1, trim);
  rr(c, x, y, w, h, 0, '#709d94');
  c.fillStyle = '#b8d4b6'; c.fillRect(x + 3, y + 3, w * .42, h - 6);
  line(c, x + w / 2, y, x + w / 2, y + h, trim, 2);
  line(c, x, y + h * .48, x + w, y + h * .48, trim, 2);
  rr(c, x - 7, y + h + 4, w + 14, 5, 1, '#8e9b7838');
}
function paving(c, color = '#dedac2') {
  c.fillStyle = color; c.fillRect(0, 497, 1280, 42);
  line(c, 0, 530, 1280, 530, '#bbbca2', 8);
  line(c, 0, 514, 1280, 514, '#b9b79b55', 1);
  for (let x = 0; x < 1280; x += 64) line(c, x, 498, x - 14, 526, '#b8b59866', 1);
}

function school(c, title, subtitle) {
  c.fillStyle = '#c5ddba'; c.fillRect(0, 433, 1280, 64);
  for (const [x, y, s] of [[35,465,1.22],[229,457,.88],[1046,461,1.04],[1263,465,1.37]]) {
    tree(c, x, y, s, ['#9bbb91', '#afd0a1', '#c2d7ac']);
  }
  // A broad four-storey facade with the green framing and orange entrance band
  // of the Lương Văn Can school in the reference photo.
  rr(c, 187, 171, 906, 326, 2, '#e6e9e5', '#78877f');
  rr(c, 177, 166, 926, 13, 1, '#388b57');
  rr(c, 190, 181, 900, 5, 0, '#e6bd64');
  // Flagpole on central rooftop
  rr(c, 634, 161, 12, 6, 2, '#28623d');
  line(c, 640, 86, 640, 166, '#d8e2dc', 3);
  ellipse(c, 640, 86, 3.5, 3.5, '#ffd54f');
  for (const y of [250, 316, 375]) {
    rr(c, 191, y, 898, 7, 0, '#c7ceca');
    line(c, 191, y + 7, 1089, y + 7, '#f7f8f5', 2);
  }
  for (const x of [397, 883]) rr(c, x, 179, 10, 196, 1, '#39a65f');
  for (const y of [197, 263, 329]) {
    for (let col = 0; col < 8; col++) {
      const x = 226 + col * 108;
      window(c, x, y, 48, 39, '#f7f8f4');
    }
  }
  // Metal louvres on both side blocks echo the tall screened wings in the photo.
  for (const x of [91, 1098]) {
    rr(c, x, 177, 96, 320, 1, '#aeb8b5', '#73817d');
    for (let y = 185; y < 490; y += 8) line(c, x + 5, y, x + 91, y, y % 16 ? '#7f8d89' : '#d4dbd7', 2);
    for (const side of [x + 8, x + 88]) line(c, side, 180, side, 495, '#64736e', 2);
  }
  rr(c, 190, 375, 900, 36, 0, '#eabf5c');
  rr(c, 190, 406, 900, 5, 0, '#d5a94d');
  rr(c, 440, 375, 400, 36, 1, '#f1c65e');
  text(c, title, 640, 385, 13, '#715435', 800, 380);
  if (subtitle) text(c, subtitle, 640, 401, 8, '#76583a', 650, 360);
  // The glazed central entrance sits behind the school gate.
  rr(c, 531, 412, 218, 85, 1, '#9daba2');
  rr(c, 541, 416, 198, 77, 1, '#657a70');
  for (let i = 0; i < 4; i++) {
    const x = 547 + i * 47;
    rr(c, x, 420, 41, 69, 1, i % 2 ? '#9ebdb0' : '#83a99a');
    rr(c, x + 4, 425, 33, 40, 1, '#dce9e2');
    line(c, x + 20, 420, x + 20, 489, '#61796e', 2);
  }
  for (const x of [520, 760]) rr(c, x, 410, 9, 87, 1, '#db9c5a');
  paving(c, '#e3dbc2');
  fence(c, 0, 486, 497, '#8d9b94', 42); fence(c, 795, 1280, 497, '#8d9b94', 42);
  for (const x of [32,486,794,1231]) {
    rr(c, x, 450, 17, 49, 1, '#7da06d'); rr(c, x-3, 447, 23, 6, 1, '#b3cb96');
  }
  bench(c, 244, 503, .8); bench(c, 1042, 505, .8);
  tree(c, 52, 498, 1.05); tree(c, 1204, 497, 1.13);
  flowers(c, 332, 496, 69, 6); flowers(c, 880, 496, 66, 6);
}

function park(c, title, subtitle) {
  c.fillStyle = '#b9d3a2'; c.fillRect(0, 400, 1280, 100);
  for (const [x,y,s] of [[48,436,1.05],[198,424,1.08],[390,418,.88],[902,420,1],[1118,430,1.12],[1240,438,.94]]) {
    tree(c,x,y,s,['#668e64','#83a978','#a6c08b']);
  }
  const water=c.createLinearGradient(0,315,0,492);
  water.addColorStop(0,'#90c8c1');water.addColorStop(1,'#6daaa1');
  c.fillStyle=water;c.fillRect(0,322,1280,174);
  line(c,0,322,1280,322,'#d7e3c0',3);
  for(let i=0;i<19;i++){
    const x=(i*179+39)%1260,y=347+(i%5)*23;
    line(c,x,y,x+32+(i%3)*18,y,'#c6e3ce88',1.5);
  }
  // Turtle Tower rises from the small island at the centre of Hoan Kiem Lake.
  ellipse(c,640,437,102,17,'#718e5d');
  poly(c,[[555,435],[725,435],[702,417],[579,417]],'#c2aa79');
  rr(c,592,370,96,49,2,'#d6c79f');
  rr(c,601,352,78,21,2,'#d1bf91');
  poly(c,[[584,371],[598,354],[676,354],[696,371]],'#8b6244');
  poly(c,[[596,352],[607,338],[673,338],[684,352]],'#754d37');
  for(const x of [611,635,659]){rr(c,x,379,10,29,1,'#817357');rr(c,x-3,376,16,4,1,'#ece1bd');}
  line(c, 640, 308, 640, 338, '#d5dfd8', 2.5);
  ellipse(c, 640, 308, 2.5, 2.5, '#ffd54f');
  // The red Huc Bridge leads to Ngoc Son Temple on the right bank.
  c.beginPath();c.moveTo(682,429);c.bezierCurveTo(731,405,758,394,807,395);
  c.strokeStyle='#a54437';c.lineWidth=17;c.stroke();
  c.beginPath();c.moveTo(686,420);c.bezierCurveTo(731,397,761,386,807,387);
  c.strokeStyle='#e1b983';c.lineWidth=3;c.stroke();
  for(let i=0;i<8;i++){
    const x=696+i*14,y=418-i*3.4;
    line(c,x,y-5,x,y+6,'#f1d5a4',2);
  }
  rr(c,845,354,153,92,2,'#e3d3ae');
  poly(c,[[832,357],[862,333],[980,333],[1011,357]],'#634a36');
  poly(c,[[845,350],[870,334],[972,334],[996,350]],'#9b4537');
  for(const x of [870,907,944,971])rr(c,x,372,14,51,1,'#815c3d');
  rr(c,856,424,132,10,1,'#98734c');
  for(const [x,y,s] of [[75,457,.75],[1146,459,.82]])tree(c,x,y,s);
  bench(c,280,471,.78);bench(c,1040,470,.8);
  sign(c,title,subtitle,{y:286,width:400,color:'#8f4938'});
  fence(c,0,350,499,'#748865',38);fence(c,927,1280,499,'#748865',38);
  paving(c,'#ddd5b7');
  flowers(c,365,492,90,9);flowers(c,1008,492,95,9);
  bench(c,173,514,.94);bench(c,1114,514,.94);
}

function seaside(c,title,subtitle) {
  const sea=c.createLinearGradient(0,278,0,500);sea.addColorStop(0,'#8ac8c5');sea.addColorStop(1,'#55a6a3');
  c.fillStyle=sea;c.fillRect(0,278,1280,230);
  // Limestone islands of Ha Long Bay create the distant horizon.
  const karst=(x,y,s)=>{
    c.save();c.translate(x,y);c.scale(s,s);
    poly(c,[[-74,95],[-66,40],[-49,11],[-39,-50],[-26,-73],[-12,-36],[2,-67],[17,-58],[27,-5],[47,18],[69,95]],'#719887');
    poly(c,[[-55,64],[-43,14],[-30,-39],[-23,28],[-5,-30],[4,39],[26,7],[47,63]],'#91b09a');
    poly(c,[[-26,95],[-20,41],[-8,24],[4,39],[16,95]],'#527b70');
    c.restore();
  };
  karst(120,304,1.18);karst(342,296,.92);karst(592,302,1.25);
  karst(861,297,1.04);karst(1108,303,1.27);karst(1280,300,.82);
  for(let i=0;i<25;i++){
    const x=(i*149+23)%1270,y=337+(i%6)*24;
    line(c,x,y,x+25+(i%4)*13,y,'#d6efda78',1.5);
  }
  // Traditional Ha Long tourist junks with red sails and wooden hulls.
  for(const [x,y,s] of [[285,381,.9],[804,357,.68],[1050,389,.76]]){
    c.save();c.translate(x,y);c.scale(s,s);
    poly(c,[[-49,0],[48,0],[30,16],[-31,16]],'#754d3a');
    line(c,0,-89,0,2,'#694e37',3);
    poly(c,[[-4,-82],[-4,-8],[-43,-8]],'#a94c3b');
    poly(c,[[3,-72],[3,-8],[39,-8]],'#d5ad75');
    for(const wx of [-23,-8,9,25])rr(c,wx,-3,9,5,1,'#edd5a6');
    c.restore();
  }
  // Floating fishing village and stilt houses along the near shore.
  c.beginPath();c.moveTo(0,442);c.bezierCurveTo(206,420,337,453,565,431);
  c.bezierCurveTo(841,409,1061,448,1280,422);c.lineTo(1280,539);c.lineTo(0,539);
  c.closePath();c.fillStyle='#ddc992';c.fill();
  line(c,0,442,1280,422,'#ece2b9',5);
  for(const [x,y,s,color] of [[100,391,1,'#d8c695'],[428,402,.82,'#c9bb8d'],[902,393,.9,'#dfcc9f']]){
    c.save();c.translate(x,y);c.scale(s,s);
    for(const px of [0,96])line(c,px,37,px,78,'#785c43',5);
    rr(c,3,0,91,42,2,color);
    poly(c,[[-5,2],[15,-20],[78,-20],[102,2]],'#764b38');
    poly(c,[[6,-1],[20,-14],[74,-14],[91,-1]],'#a34f3f');
    for(const wx of [18,47,73])window(c,wx+3,11,12,17,'#eee1bd');
    c.restore();
  }
  // A stone marker evokes the fishing communities and sea routes of the bay.
  rr(c,565,419,151,31,3,'#b9a77d');
  rr(c,579,389,123,32,2,'#d7c497');
  // Flagpole on stone pier
  line(c, 525, 355, 525, 420, '#d8e2dc', 2.5);
  ellipse(c, 525, 355, 2.5, 2.5, '#ffd54f');
  sign(c,title,subtitle,{y:333,width:390,color:'#39766f'});
  // Baskets, fish traps and a small salt-worn jetty.
  for(let i=0;i<6;i++){
    const x=348+i*32;
    line(c,x,480,x+35,474,'#795e42',3);
    line(c,x+5,480,x+6,502,'#795e42',2);line(c,x+28,476,x+29,502,'#795e42',2);
  }
  for(const [x,y] of [[385,474],[422,469],[1017,464],[1056,462]]){
    rr(c,x,y,20,12,4,'#b98752');line(c,x+3,y+6,x+17,y+6,'#e0bd80',1);
  }
  paving(c,'#d8cba9');
  shrub(c,60,493,120,'#698e70');shrub(c,1205,491,130,'#718e69');
  bench(c,174,514,.88);bench(c,1109,514,.9);
  for(const x of [78,1194]){rr(c,x,446,9,53,1,'#887255');line(c,x-17,458,x+26,458,'#887255',4);}
}

export function drawEnvironment(c, { theme, title, subtitle } = {}) {
  const defaults = DEFAULT_ENVIRONMENTS[theme];
  if (!defaults) return;
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  const draw = { school, park, seaside }[theme];
  draw(c, title ?? defaults.title, subtitle ?? defaults.subtitle);
  c.restore();
}

function drawWavingFlag(c, hoistX, topY, flagWidth, flagHeight, phase, direction = 1) {
  const segments = 22, top = [], bottom = [];
  const point = (u, v) => [
    hoistX + direction * u * flagWidth,
    topY + v * flagHeight + u * (flagHeight * 0.08 + Math.sin(phase - u * 6.5) * (flagHeight * 0.1))
      + Math.sin(phase * 0.73 - u * 4) * u * v * (flagHeight * 0.03),
  ];
  for (let i = 0; i <= segments; i++) {
    top.push(point(i / segments, 0)); bottom.push(point(i / segments, 1));
  }
  c.save(); c.lineJoin = 'round';
  // Vivid Vietnamese national red cloth
  poly(c, [...top, ...bottom.slice().reverse()], '#da251d');
  for (let i = 0; i < segments; i++) {
    const u = (i + 0.5) / segments, fold = Math.cos(phase - u * 6.5);
    const shade = fold < 0 ? `rgba(80,10,10,${-fold * 0.24})` : `rgba(255,215,160,${fold * 0.18})`;
    poly(c, [top[i], top[i + 1], bottom[i + 1], bottom[i]], shade);
  }
  // Golden yellow five-pointed star
  const star = [];
  const starRadius = flagHeight * 0.28, starInner = starRadius * 0.38;
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? starInner : starRadius;
    star.push(point(0.5 + Math.cos(angle) * radius / flagWidth, 0.5 + Math.sin(angle) * radius / flagHeight));
  }
  poly(c, star, '#ffeb3b');
  // Top hem highlights
  c.beginPath(); top.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.strokeStyle = '#e57373'; c.lineWidth = 0.8; c.stroke();
  // Hoist line
  line(c, hoistX, topY, hoistX, topY + flagHeight, '#fff8e1', 1.2);
  c.restore();
}

/** Live details share the backdrop's world coordinates and receive the same night tint. */
export function drawEnvironmentMotion(c, theme, time, reduced = false, view) {
  const t = reduced || !Number.isFinite(time) ? 0 : time;
  const phase = t * 2.2;
  if (theme === 'school') {
    const width = 64 + (reduced ? 0 : Math.sin(t * 1.3) * 1.5);
    drawWavingFlag(c, 640, 90, width, 42, phase, 1);
  } else if (theme === 'park') {
    const width = 28 + (reduced ? 0 : Math.sin(t * 1.5) * 1.0);
    drawWavingFlag(c, 640, 310, width, 19, phase, 1);
  } else if (theme === 'seaside') {
    const width = 36 + (reduced ? 0 : Math.sin(t * 1.4) * 1.2);
    drawWavingFlag(c, 525, 358, width, 24, phase, 1);
  }
}
