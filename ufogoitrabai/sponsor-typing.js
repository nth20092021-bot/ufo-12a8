/** Reveal graphemes in place so the footer never moves while the sentence types. */
export function createSponsorTyping(element, {onType = () => {}} = {}) {
  if (!element) return {start() {}, stop() {}};
  const doc = element.ownerDocument, win = doc.defaultView;
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const text = element.textContent;
  const accessible = doc.createElement('span');
  accessible.className = 'sr-only'; accessible.textContent = text;
  const visual = doc.createElement('span');
  visual.className = 'sponsor-typing-visual'; visual.setAttribute('aria-hidden', 'true');
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(doc.documentElement.lang, {granularity: 'grapheme'}) : null;
  const words = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(doc.documentElement.lang, {granularity: 'word'}) : null;
  const letters = [];
  for (const part of words ? [...words.segment(text)].map(item => item.segment) : text.split(/(\s+)/)) {
    if (/^\s+$/.test(part)) { visual.append(doc.createTextNode(part)); continue; }
    const word = doc.createElement('span'); word.className = 'sponsor-typing-word';
    const graphemes = segmenter ? [...segmenter.segment(part)].map(item => item.segment) : Array.from(part.normalize('NFC'));
    for (const grapheme of graphemes) {
      const letter = doc.createElement('span'); letter.textContent = grapheme; word.append(letter); letters.push(letter);
    }
    visual.append(word);
  }
  element.replaceChildren(accessible, visual);
  let timer = null, active = false, pageActive = true, position = 0;
  function cancel() { if (timer !== null) win.clearTimeout(timer); timer = null; }
  function show(count) {
    for (let i = 0; i < letters.length; i++) {
      letters[i].style.visibility = i < count ? 'visible' : 'hidden';
      letters[i].classList.toggle('typing-caret', canRun() && i === Math.max(0, count - 1));
      letters[i].classList.toggle('typing-caret-before', count === 0 && i === 0);
    }
  }
  function canRun() { return active && pageActive && !doc.hidden && !reduced?.matches; }
  function schedule(callback, delay) { timer = win.setTimeout(() => { timer = null; if (canRun()) callback(); }, delay); }
  function step() {
    show(++position);
    onType(letters[position - 1].textContent);
    if (position < letters.length) schedule(step, /[,.!?;:]$/.test(letters[position - 1].textContent) ? 230 : 55);
    else schedule(begin, 3000);
  }
  function begin() {
    cancel(); position = 0;
    if (!canRun() || !letters.length) { show(letters.length); return; }
    show(0); schedule(step, 500);
  }
  function stop() { active = false; cancel(); show(letters.length); }
  function refresh() { cancel(); if (canRun()) begin(); else show(letters.length); }
  doc.addEventListener('visibilitychange', refresh);
  win.addEventListener('pagehide', () => { pageActive = false; refresh(); });
  win.addEventListener('pageshow', () => { pageActive = true; refresh(); });
  reduced?.addEventListener?.('change', refresh);
  return {start() { active = true; begin(); }, stop};
}
