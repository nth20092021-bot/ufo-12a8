// Pure shared normalization: safe in the Worker, browser and local-state restore.
export const ENVIRONMENT_THEMES = Object.freeze(['street', 'school', 'park', 'seaside']);
export const normalizeEnvironmentTheme = value => ENVIRONMENT_THEMES.includes(value) ? value : null;

export function sanitizeEnvironmentNames(value) {
  const names = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return names;
  for (const theme of ENVIRONMENT_THEMES) {
    if (!Object.hasOwn(value, theme)) continue;
    const source = value[theme];
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    const entry = {};
    for (const [key, max] of [['title', 32], ['subtitle', 48]]) {
      if (Object.hasOwn(source, key) && typeof source[key] === 'string') {
        entry[key] = source[key].normalize('NFC').replace(/[\r\n\t]/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, max);
      }
    }
    if (Object.keys(entry).length) names[theme] = entry;
  }
  return names;
}
