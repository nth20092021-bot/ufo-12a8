const THEMES = new Set(['street', 'school', 'park', 'seaside']);
const SUSPENSE_LEVELS = new Set(['light', 'normal', 'intense']);

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
  const hash = new URLSearchParams();
  hash.set('ufo-share', encodeBase64Url(settings));
  return `${location.origin}${location.pathname}${location.search}#${hash}`;
}

export function readSharedSettings(hash) {
  const value = new URLSearchParams(hash.slice(1)).get('ufo-share');
  if (!value || value.length > 6000) return null;
  try {
    const source = JSON.parse(decodeBase64Url(value));
    if (source?.version !== 1 || !THEMES.has(source.theme)
      || !Number.isInteger(source.count) || source.count < 1 || source.count > 10
      || typeof source.noRepeat !== 'boolean' || !SUSPENSE_LEVELS.has(source.suspense)) return null;
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
    return { version: 1, theme: source.theme, names, count: source.count, noRepeat: source.noRepeat, suspense: source.suspense };
  } catch {
    return null;
  }
}
