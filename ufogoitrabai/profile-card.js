import {t, locale} from './i18n.js';
import {drawCharacterPreview} from './scene.js';
import {drawQR} from './qr.js';

const SIZE = 1080;
const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const INK = '#2d513a';
const textValue = (value, max) => Array.from(String(value || '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim()).slice(0, max).join('');

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
}
function star(ctx, x, y, radius, color) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4, r = i % 2 ? radius * .27 : radius;
    const px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r;
    if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
function setFont(ctx, size, weight = 500) { ctx.font = `${weight} ${size}px ${FONT}`; }
function wordsToLines(ctx, text, width) {
  const lines = []; let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= width) { line = candidate; continue; }
    if (line) { lines.push(line); line = ''; }
    if (ctx.measureText(word).width <= width) { line = word; continue; }
    const letters = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(locale, {granularity: 'grapheme'}).segment(word)].map(part => part.segment) : Array.from(word);
    for (const letter of letters) {
      if (line && ctx.measureText(line + letter).width > width) { lines.push(line); line = ''; }
      line += letter;
    }
  }
  if (line) lines.push(line);
  return lines;
}
function fittedText(ctx, text, {x, y, width, height, maxSize, minSize, weight = 700, color = INK, maxLines = 3, align = 'left'}) {
  let size = maxSize, lines = [];
  for (; size >= minSize; size--) {
    setFont(ctx, size, weight); lines = wordsToLines(ctx, text, width);
    if (lines.length <= maxLines && lines.length * size * 1.15 <= height) break;
  }
  size = Math.max(minSize, size); setFont(ctx, size, weight);
  ctx.fillStyle = color; ctx.textBaseline = 'top'; ctx.textAlign = align;
  const left = align === 'center' ? x + width / 2 : x;
  lines.forEach((line, index) => ctx.fillText(line, left, y + index * size * 1.15));
  ctx.textAlign = 'left';
}
function trackedText(ctx, text, x, y, size, tracking, color, weight = 700) {
  setFont(ctx, size, weight); ctx.textBaseline = 'top'; ctx.fillStyle = color;
  for (const letter of text) { ctx.fillText(letter, x, y); x += ctx.measureText(letter).width + tracking; }
}
function normalizeCard(value) {
  if (!value?.person?.id || !value.privateUrl) throw new Error(t('Lưu nhân vật trước khi tạo thẻ.'));
  const url = new URL(value.privateUrl, location.origin);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (url.origin !== location.origin || !fragment.get('edit') || fragment.get('profile') !== String(value.person.id)) {
    throw new Error(t('Chưa có link riêng hợp lệ cho nhân vật này.'));
  }
  return {
    person: {...value.person, name: textValue(value.person.name, 80), appearance: {...value.person.appearance}},
    className: textValue(value.className, 100) || t('Lớp của mình'),
    joinCode: /^[A-Z2-9]{8}$/.test(String(value.joinCode || '')) ? value.joinCode : '',
    privateUrl: url.href,
  };
}
function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error(t('Chưa xuất được ảnh. Hãy thử lại.'))), 'image/png'));
}
function blobDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(t('Chưa mở được ảnh. Hãy thử lại.')));
    reader.readAsDataURL(blob);
  });
}

/** Render a saved profile only. The personal capability appears in QR pixels, never image metadata. */
export async function renderProfileCard(input) {
  const {person, className, joinCode, privateUrl} = normalizeCard(input);
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = document.createElement('canvas'); canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(t('Trình duyệt chưa hỗ trợ tạo ảnh.'));
  ctx.fillStyle = '#f1f2e6'; ctx.fillRect(0, 0, SIZE, SIZE);
  ellipse(ctx, 1070, 10, 260, 250, '#e0eacb'); ellipse(ctx, -20, 1090, 210, 200, '#e8dec4');
  ctx.lineWidth = 2;
  roundRect(ctx, 30, 30, 1020, 1020, 42, '#fffef5', '#d3dec6');

  trackedText(ctx, 'KROMA', 76, 73, 33, 4, INK, 850);
  trackedText(ctx, t('UFO TRA BÀI'), 715, 81, 17, 2.1, '#81916e', 700);
  ctx.save(); ctx.translate(976, 91); ctx.rotate(-.16);
  ellipse(ctx, 0, -4, 14, 11, '#bedbcf'); ellipse(ctx, 0, 2, 24, 8, '#789376');
  ellipse(ctx, 0, 0, 23, 5, '#a4b68a'); ellipse(ctx, -10, 3, 2, 1.5, '#fff6cb'); ellipse(ctx, 3, 5, 2, 1.5, '#fff6cb'); ellipse(ctx, 15, 3, 2, 1.5, '#fff6cb'); ctx.restore();
  ctx.beginPath(); ctx.moveTo(76, 131); ctx.lineTo(1004, 131); ctx.strokeStyle = '#e1e6d8'; ctx.stroke();

  fittedText(ctx, person.name || t('Nhân vật của tôi'), {x: 75, y: 158, width: 927, height: 137, maxSize: 65, minSize: 33, weight: 780});
  trackedText(ctx, t('LỚP HỌC'), 78, 314, 15, 2.2, '#8b9c7a');
  fittedText(ctx, className, {x: 76, y: 342, width: joinCode ? 692 : 926, height: 70, maxSize: 29, minSize: 18, weight: 550, color: '#718761'});
  if (joinCode) {
    roundRect(ctx, 796, 305, 208, 101, 17, '#eef4e3', '#d6e1c9');
    trackedText(ctx, t('MÃ LỚP'), 816, 322, 12, 1.5, '#7f956a');
    ctx.font = '700 29px ui-monospace, "SFMono-Regular", Consolas, monospace'; ctx.fillStyle = '#466c47'; ctx.fillText(joinCode, 813, 350);
  }

  roundRect(ctx, 75, 437, 435, 468, 30, '#edf3e1');
  ellipse(ctx, 292, 676, 169, 187, '#e0eccf');
  ctx.save(); ctx.strokeStyle = '#cfddb9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(293, 691, 185, 58, -.3, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  star(ctx, 145, 506, 15, '#b2c792'); star(ctx, 447, 579, 10, '#e3b980'); star(ctx, 154, 767, 9, '#b4c698');
  const avatar = document.createElement('canvas'); avatar.width = 600; avatar.height = 660;
  drawCharacterPreview(avatar, person); ctx.drawImage(avatar, 78, 424, 429, 472);
  trackedText(ctx, t('NHÂN VẬT CỦA TÔI'), 148, 923, 13, 1.6, '#8a9a77');

  roundRect(ctx, 559, 437, 445, 468, 30, '#ffffff', '#dae2d1');
  const qr = document.createElement('canvas'); await drawQR(qr, privateUrl);
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(qr, 574, 449, 415, 415); ctx.restore();
  ctx.textAlign = 'center'; ctx.fillStyle = '#587c4a'; setFont(ctx, 16, 750); ctx.fillText(t('QR RIÊNG · MỞ NHÂN VẬT'), 782, 872); ctx.textAlign = 'left';

  ctx.beginPath(); ctx.moveTo(77, 965); ctx.lineTo(1003, 965); ctx.strokeStyle = '#e0e6d7'; ctx.stroke();
  ellipse(ctx, 88, 1003, 5, 5, '#bb9c64');
  fittedText(ctx, t('Giữ ảnh riêng: QR này cho phép xem và sửa nhân vật.'), {x: 107, y: 987, width: 887, height: 31, maxSize: 22, minSize: 18, weight: 500, color: '#8d866d', maxLines: 1});
  const blob = await canvasBlob(canvas);
  return {blob, dataUrl: await blobDataURL(blob), width: SIZE, height: SIZE};
}

function element(tag, className, text) {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
}

export function createProfileCard(host) {
  const section = element('section', 'profile-card'); section.hidden = true;
  const heading = element('div', 'profile-card-heading');
  heading.append(element('span', 'profile-card-eyebrow', t('MANG NHÂN VẬT THEO BẠN')), element('h2', '', t('Thẻ nhân vật của bạn')));
  const description = element('p', 'profile-card-description', t('Thẻ hiển thị thông tin đã lưu. Bấm Lưu thay đổi ở trên để cập nhật nhân vật trên thẻ.'));
  const status = element('p', 'profile-card-status'); status.setAttribute('role', 'status');
  const image = element('img', 'profile-card-image'); image.width = SIZE; image.height = SIZE; image.hidden = true; image.decoding = 'async';
  const actions = element('div', 'profile-card-actions'); actions.hidden = true;
  const download = element('a', 'primary-btn', t('Lưu ảnh PNG')); download.download = 'ufo-the-nhan-vat.png';
  const open = element('a', 'secondary-btn', t('Mở ảnh')); open.target = '_blank'; open.rel = 'noopener';
  actions.append(download, open);
  const hint = element('p', 'profile-card-hint', t('Ảnh vuông 1080 × 1080. Trên điện thoại, nhấn giữ ảnh để lưu. Giữ ảnh riêng vì QR cho phép sửa nhân vật.'));
  const retry = element('button', 'secondary-btn', t('Tạo lại thẻ')); retry.type = 'button'; retry.hidden = true;
  section.append(heading, description, status, image, actions, hint, retry); host.append(section);
  let generation = 0, disposed = false, lastKey = '', currentInput = null, pending = null, objectUrl = null;

  function releaseImage() {
    image.hidden = true; image.removeAttribute('src'); actions.hidden = true;
    download.removeAttribute('href'); open.removeAttribute('href');
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  }
  function update(value) {
    if (disposed) return Promise.resolve(null);
    let data;
    try { data = normalizeCard(value); }
    catch (error) { clear(); section.hidden = false; status.hidden = false; status.textContent = error.message; return Promise.resolve(null); }
    const key = JSON.stringify([data.person.id, data.person.name, data.person.gender, data.person.appearance || {}, data.className, data.joinCode, data.privateUrl]);
    if (key === lastKey && pending) return pending;
    const run = ++generation; lastKey = key; currentInput = data;
    releaseImage(); section.hidden = false; retry.hidden = true; status.hidden = false; status.textContent = t('Đang tạo thẻ nhân vật…');
    pending = renderProfileCard(data).then(result => {
      if (disposed || run !== generation) return null;
      objectUrl = URL.createObjectURL(result.blob);
      image.src = result.dataUrl; image.alt = t('Thẻ nhân vật {name} · {className}', {name: data.person.name, className: data.className}); image.hidden = false;
      download.href = objectUrl; open.href = objectUrl; actions.hidden = false;
      status.textContent = ''; status.hidden = true;
      return {width: result.width, height: result.height};
    }).catch(() => {
      if (disposed || run !== generation) return null;
      status.textContent = t('Chưa tạo được thẻ. Nhân vật đã lưu vẫn được giữ nguyên.'); retry.hidden = false; lastKey = '';
      return null;
    });
    return pending;
  }
  function clear() {
    generation++; lastKey = ''; currentInput = null; pending = null;
    releaseImage(); section.hidden = true; retry.hidden = true;
  }
  const retryCard = () => { if (currentInput) update(currentInput); };
  retry.addEventListener('click', retryCard);
  return {
    update, clear,
    destroy() { if (disposed) return; clear(); disposed = true; retry.removeEventListener('click', retryCard); section.remove(); },
  };
}
