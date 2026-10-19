import {t, locale} from './i18n.js';
export const APP_BASE = '/ufogoitrabai';

export class ApiError extends Error {
  constructor(message, status = 0, code = 'NETWORK') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest(path, {method = 'GET', token, classId, body, signal, keepalive = false} = {}) {
  let response;
  try {
    response = await fetch(`${APP_BASE}/api${path}`, {
      method, cache: 'no-store', credentials: 'same-origin', signal, keepalive,
      headers: {Accept: 'application/json', ...(method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD' ? {'X-UFO-Request': '1'} : {}), ...(classId ? {'X-UFO-Class-Id': classId} : {}), ...(body !== undefined ? {'Content-Type': 'application/json'} : {}), ...(token ? {Authorization: `Bearer ${token}`} : {})},
      ...(body !== undefined ? {body: JSON.stringify(body)} : {})
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(t('Chưa kết nối được. Kiểm tra mạng rồi thử lại.'));
  }
  let data;
  try { data = await response.json(); } catch { throw new ApiError(t('Máy chủ chưa trả lời được. Vui lòng thử lại.'), response.status); }
  if (response.status === 401 && !token && (classId || path.startsWith('/account/')) && typeof window !== 'undefined') window.dispatchEvent(new Event('ufo-account-session-expired'));
  if (!response.ok) throw new ApiError(data.error ? t(data.error) : t('Không thực hiện được thao tác này.'), response.status, data.code || 'API_ERROR');
  return data;
}

export function joinLink(inviteCode) {
  return `${location.origin}${APP_BASE}/join?invite=${encodeURIComponent(inviteCode)}`;
}

export function editLink(studentId, editToken) {
  return `${location.origin}${APP_BASE}/join#profile=${encodeURIComponent(studentId)}&edit=${encodeURIComponent(editToken)}`;
}

export async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return; }
  } catch { /* Older or embedded browsers may need the selection fallback. */ }
  const field = document.createElement('textarea');
  field.value = value;
  field.className = 'copy-fallback';
  field.setAttribute('aria-label', t('Nội dung cần sao chép'));
  const parent = [...document.querySelectorAll('dialog[open]')].at(-1) || document.body;
  parent.append(field); field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error(t('Không sao chép tự động được. Hãy chọn và sao chép đường dẫn đang hiện.'));
}
