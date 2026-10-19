import { translator, locale as pageLocale } from './i18n.js';

// Web Speech has no standard gender field. These are confirmed platform voice
// names, not an inference from a pupil's name; unfamiliar voices stay unknown.
const VOICE_NAMES = Object.freeze({
  vi: { male: ['namminh'], female: ['linh','hoaimy'] },
  en: { male: ['daniel','rishi','fred'], female: ['samantha','moira','karen','tessa'] },
  zh: { female: ['tingting','meijia'] }, ja: { female: ['kyoko'] }, ko: { female: ['yuna'] },
  es: { female: ['monica','paulina'] }, fr: { male: ['thomas'], female: ['amelie'] },
  de: { female: ['anna'] }, pt: { female: ['joana','luciana'] },
});
function voiceGender(voice) {
  const explicit=typeof voice.gender==='string'?voice.gender.toLowerCase():'';
  if(explicit==='male'||explicit==='female')return explicit;
  const label=`${voice.name||''} ${voice.voiceURI||''}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const labeled=label.match(/\b(female|male)\b/);if(labeled)return labeled[1];
  const names=VOICE_NAMES[voice.lang.replaceAll('_','-').toLowerCase().split('-')[0]];
  for(const gender of ['male','female'])if(names?.[gender]?.some(name=>new RegExp(`(?:^|[^a-z])${name}(?:neural)?(?:[^a-z]|$)`).test(label)))return gender;
  return null;
}
const voiceKey = voice => `${voice.lang.replaceAll('_','-').toLowerCase()}\0${voice.voiceURI||voice.name||''}\0${!!voice.localService}`;

/** Browser-provided speech only; names never go to an application service. */
export function createResultSpeech({ locale = pageLocale, onStateChange = () => {}, volume = 1 } = {}) {
  const win = globalThis.window || globalThis, doc = win.document;
  let synth, Utterance;
  try { synth = win.speechSynthesis; Utterance = win.SpeechSynthesisUtterance; } catch {}
  const supported = !!synth && typeof synth.speak === 'function' && typeof synth.cancel === 'function' && typeof Utterance === 'function';
  const language = typeof locale === 'string' && locale.trim() ? locale.trim().replaceAll('_', '-') : 'vi-VN';
  const translate = translator(language);
  let disposed = false, speaking = false, generation = 0, current = null, queue = [], voices = [], timer = null;
  let waiting = null, readinessTimer = null, retryTimer = null;
  let profile = null;

  function emit(error, started = false) {
    try { onStateChange({ speaking, ...(error ? {error} : {}), ...(started ? {started:true} : {}) }); } catch {}
  }
  function refreshVoices() {
    if (!supported || disposed) return;
    try { voices = Array.from(synth.getVoices?.() || []).filter(voice => voice && typeof voice.lang === 'string'); } catch { voices = []; }
  }
  function chooseVoice() {
    refreshVoices();
    const wanted = language.toLowerCase(), base = wanted.split('-')[0];
    const score = voice => {
      const lang = voice.lang.replaceAll('_', '-').toLowerCase();
      if (lang.split('-')[0] !== base) return Infinity;
      // zh-HK/zh-MO voices commonly speak Cantonese; the zh-CN UI expects
      // Mandarin. A shared "zh" prefix alone is not a safe spoken fallback.
      const cantoneseRegion = tag => /(?:^|-)(hk|mo)(?:-|$)/.test(tag);
      if (base === 'zh' && cantoneseRegion(lang) !== cantoneseRegion(wanted)) return Infinity;
      return (lang === wanted ? 0 : 2) + (voice.localService ? 0 : 1);
    };
    const candidates=voices.filter(voice => Number.isFinite(score(voice)))
      .sort((a, b) => score(a) - score(b) || Number(!!b.default) - Number(!!a.default));
    if(!profile)return candidates[0]||null;
    // A cache refresh may replace native voice objects. Rebind by identity,
    // but never switch a character to another engine halfway through a read.
    if(profile.key!==null)return candidates.find(voice=>voiceKey(voice)===profile.key)||null;
    const voice=candidates.find(voice=>voiceGender(voice)===profile.gender)||candidates[0];
    if(!voice)return null;
    const pair=candidates.some(candidate=>voiceGender(candidate)==='male')&&candidates.some(candidate=>voiceGender(candidate)==='female');
    profile.key=voiceKey(voice);
    profile.rate=pair?.95:profile.gender==='male'?.93:.98;
    profile.pitch=pair?1:profile.gender==='male'?.85:1.12;
    return voice;
  }
  function clearReadiness() {
    if (readinessTimer !== null) win.clearTimeout(readinessTimer);
    if (retryTimer !== null) win.clearTimeout(retryTimer);
    readinessTimer = retryTimer = waiting = null;
  }
  function detach() {
    clearReadiness();
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
    if (current) current.onstart = current.onend = current.onerror = null;
    current = null;
  }
  function stop() {
    const wasSpeaking = speaking;
    generation++;queue = [];detach();speaking = false;profile=null;
    // Invalidate callbacks before cancel(), which may dispatch synchronously.
    if (wasSpeaking) { try { synth.cancel(); } catch {} }
    if (wasSpeaking) emit();
  }
  function fail(token, error) {
    if (disposed || token !== generation || !speaking) return;
    stop();emit(error);
  }
  function resumeWaiting() {
    const token = waiting;
    if (token === null || disposed || token !== generation || !speaking) return false;
    if (doc?.hidden) { stop();return false; }
    const voice = chooseVoice();
    if (!voice) return false;
    clearReadiness();next(token, voice);return true;
  }
  function waitForVoice(token) {
    if (waiting === token) return true;
    waiting = token;
    // Do not hand an utterance with voice=null to a default-language engine.
    // Lists can arrive asynchronously, sometimes without a voiceschanged event.
    readinessTimer = win.setTimeout(() => {
      if (waiting === token && !resumeWaiting()) fail(token, 'language-unavailable');
    }, 2000);
    const poll = () => {
      retryTimer = null;
      if (waiting === token && !resumeWaiting() && waiting === token) retryTimer = win.setTimeout(poll, 100);
    };
    retryTimer = win.setTimeout(poll, 100);
    return true;
  }
  function next(token, readyVoice = null) {
    if (disposed || token !== generation || !speaking) return false;
    if (doc?.hidden) { stop(); return false; }
    if (!queue.length) { detach();speaking = false;emit();return true; }
    const voice = readyVoice || chooseVoice();
    if (!voice) return waitForVoice(token);
    const text = queue.shift();
    try {
      const utterance = new Utterance(text);
      current = utterance;
      utterance.lang = voice.lang.replaceAll('_', '-');utterance.voice = voice;
      utterance.rate = profile?.rate??.95;utterance.pitch = profile?.pitch??1;utterance.volume = Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):1;
      utterance.onstart = () => {
        if (token !== generation || current !== utterance || !speaking) return;
        emit(undefined, true);
      };
      utterance.onend = () => {
        if (token !== generation || current !== utterance || !speaking) return;
        detach();next(token);
      };
      utterance.onerror = event => {
        if (current !== utterance) return;
        const error = event?.error === 'not-allowed' ? 'not-allowed' :
          ['voice-unavailable', 'language-unavailable'].includes(event?.error) ? 'language-unavailable' :
          ['synthesis-unavailable', 'audio-busy', 'audio-hardware'].includes(event?.error) ? 'unavailable' : 'failed';
        fail(token, error);
      };
      // Some engines fail without end/error; do not leave music ducked forever.
      timer = win.setTimeout(() => fail(token, 'unavailable'), Math.min(60000, Math.max(12000, text.length * 180)));
      synth.speak(utterance);
      return token === generation;
    } catch { fail(token, 'unavailable');return false; }
  }
  function read(texts, { introduction = true, gender = null } = {}) {
    stop();
    if (disposed || doc?.hidden) return false;
    if (!supported) { emit('unsupported');return false; }
    const names = Array.isArray(texts) ? texts.filter(text => typeof text === 'string' && text.trim()).slice(0, 10).map(text => text.trim()) : [];
    if (!names.length) return false;
    if(gender==='male'||gender==='female')profile={gender,key:null,rate:.95,pitch:1};
    queue = introduction ? [translate('Mời các bạn sau lên trả bài.'), ...names] : names;
    const token = generation;speaking = true;emit();
    return next(token);
  }
  const onVisibility = () => { if (doc?.hidden) stop(); };
  const onPageHide = () => stop();
  const onVoicesChanged = () => { refreshVoices();resumeWaiting(); };
  let oldVoicesChanged, fallbackVoicesChanged;
  if (supported) {
    refreshVoices();
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', onVoicesChanged);
    else {
      oldVoicesChanged = synth.onvoiceschanged;
      fallbackVoicesChanged = event => { try { oldVoicesChanged?.call(synth, event); } finally { onVoicesChanged(); } };
      try { synth.onvoiceschanged = fallbackVoicesChanged; } catch {}
    }
    doc?.addEventListener('visibilitychange', onVisibility);win.addEventListener?.('pagehide', onPageHide);
  }
  return {
    supported,
    get speaking() { return speaking; },
    read,
    stop,
    dispose() {
      if (disposed) return;
      disposed = true;stop();
      synth?.removeEventListener?.('voiceschanged', onVoicesChanged);
      if (fallbackVoicesChanged && synth.onvoiceschanged === fallbackVoicesChanged) {
        try { synth.onvoiceschanged = oldVoicesChanged; } catch {}
      }
      doc?.removeEventListener('visibilitychange', onVisibility);win.removeEventListener?.('pagehide', onPageHide);
      voices = [];
    },
  };
}
