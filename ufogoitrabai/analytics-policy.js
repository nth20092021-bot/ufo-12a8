// Dedicated Jcalit GA4 web stream. Analytics still requires consent on this site.
export const MEASUREMENT_ID = 'G-KP6EXRD5HN';
export const CONSENT_KEY = 'kroma.analytics.consent.v1';
export const CHANNEL = 'kroma-ufo-analytics-v1';
export const FRAME_PATH = '/ufogoitrabai/analytics-frame.html';
export function analyticsPage(path) {
  return ['/ufogoitrabai/join','/ufogoitrabai/join/','/ufogoitrabai/join.html'].includes(path) ? 'join' : 'game';
}
export function pageFields(page) {
  if (!['game','join'].includes(page)) return null;
  return {
    page_location: 'https://jcalit.com/ufogoitrabai/' + (page === 'join' ? 'join' : ''),
    page_referrer: '',
    page_title: page === 'join' ? 'UFO · Nhân vật' : 'UFO · Trả bài',
  };
}
export function cleanEvent(name, input = {}) {
  if (!['ufo_draw_start','ufo_draw_complete','ufo_class_shared','ufo_profile_join','ufo_profile_update','ufo_kroma_download_open','ufo_kroma_download_click'].includes(name)) return null;
  const params = {};
  if (name.startsWith('ufo_draw_')) {
    if (!Number.isInteger(input?.selected_count) || input.selected_count < 1 || input.selected_count > 10) return null;
    params.selected_count = input.selected_count;
  }
  if (name === 'ufo_kroma_download_open') params.placement = 'result_modal';
  if (name === 'ufo_kroma_download_click') {
    params.placement = input?.placement === 'result_modal' ? 'result_modal' : 'download_modal';
    params.destination = 'app_store';
  }
  // No caller-supplied text, identifiers, URLs or arbitrary property names cross this boundary.
  return {name, params};
}
