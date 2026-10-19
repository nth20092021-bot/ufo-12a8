const THEMES = new Set(['street', 'school', 'park', 'seaside']);
const SUSPENSE_LEVELS = new Set(['light', 'normal', 'intense']);
const MAX_STUDENTS = 120;
const MAX_SHARE_LENGTH = 20000;

function cleanStudents(students) {
  if (!Array.isArray(students) || students.length > MAX_STUDENTS) throw new Error('Danh sách không hợp lệ để chia sẻ.');
  return students.map(student => {
    const name = typeof student?.name === 'string'
      ? student.name.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
      : '';
    if (!name || !['male', 'female', 'other'].includes(student.gender)) throw new Error('Danh sách có tên hoặc giới tính không hợp lệ.');
    return { name, gender: student.gender };
  });
}

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

export function createShareUrl(location, settings) {
  const payload = {...settings, students:cleanStudents(settings.students)};
  const hash = new URLSearchParams();
  hash.set('ufo-share', encodeBase64Url(payload));
  const url = `${location.origin}${location.pathname}${location.search}#${hash}`;
  if (url.length > MAX_SHARE_LENGTH) throw new Error('Danh sách quá dài để đưa vào liên kết chia sẻ.');
  return url;
}

export function readSharedSettings(hash) {
  const value = new URLSearchParams(hash.slice(1)).get('ufo-share');
  if (!value || value.length > MAX_SHARE_LENGTH) return null;
  try {
    const source = JSON.parse(decodeBase64Url(value));
    if (source?.version !== 1 || !THEMES.has(source.theme)
      || !Number.isInteger(source.count) || source.count < 1 || source.count > 10
      || typeof source.noRepeat !== 'boolean' || !SUSPENSE_LEVELS.has(source.suspense)) return null;
    const students = source.students === undefined ? undefined : cleanStudents(source.students);
    const names = {};
    if (source.names && typeof source.names === 'object' && !Array.isArray(source.names)) {
      for (const theme of THEMES) {
        const entry = source.names[theme];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const clean = {};
        if (typeof entry.title === 'string') clean.title = entry.title.replace(/[\r\n]/g, ' ').slice(0, 32);
        if (typeof entry.subtitle === 'string') clean.subtitle = entry.subtitle.replace(/[\r\n]/g, ' ').slice(0, 48);
        if (Object.keys(clean).length) names[theme] = clean;
      }
    }
    return { version: 1, theme: source.theme, names, count: source.count, noRepeat: source.noRepeat, suspense: source.suspense, ...(students ? {students} : {}) };
  } catch {
    return null;
  }
}
