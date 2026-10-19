import {t, locale} from './i18n.js';
import {drawCharacterPreview} from './scene.js';
import {genderLabel} from './core.js';

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
let detailSerial = 0;

function retainedCalls(state, studentId) {
  const calls = (Array.isArray(state.history) ? state.history : []).filter(item => Array.isArray(item?.ids) && item.ids.includes(studentId));
  const times = calls.map(item => Number(item.time)).filter(time => Number.isFinite(time) && time > 0);
  return {count: calls.length, lastTime: times.length ? Math.max(...times) : null};
}
function formatTime(value) {
  if (!value) return '';
  try { return new Intl.DateTimeFormat(locale, {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(value); }
  catch { return ''; }
}

/** Read-only student details. Opening never requests private links or writes a class. */
export function createStudentDetails({getClassroom, onShowCard, notify}) {
  let view = null, destroyed = false;
  function close() { view?.dialog.close(); }
  function restoreFocus(target) {
    if (destroyed) return;
    const roster = document.getElementById('rosterDialog');
    const fallback = roster?.open ? document.getElementById('rosterTab') : document.getElementById('scene');
    const node = target?.isConnected ? target : fallback?.isConnected ? fallback : document.getElementById('classMenuBtn');
    node?.focus?.({preventScroll: true});
  }
  function showUnavailable(currentView) {
    currentView.name.textContent = t('Học sinh');
    currentView.unavailable.hidden = false;
    currentView.preview.hidden = true; currentView.facts.hidden = true; currentView.stats.hidden = true;
    currentView.canvas.width = currentView.canvas.width;
    currentView.appearanceKey = null;
    if (currentView.cardButton) { currentView.cardButton.hidden = true; currentView.cardButton.disabled = true; }
  }
  function refresh() {
    if (!view || destroyed) return;
    const room = getClassroom(), state = room?.state;
    const person = state?.students?.find(item => item.id === view.studentId);
    if (!view.dialog.open) return;
    if (room?.id !== view.roomId) { close(); return; }
    if (!person) { showUnavailable(view); return; }
    const currentView = view;
    currentView.unavailable.hidden = true;
    currentView.preview.hidden = false; currentView.facts.hidden = false; currentView.stats.hidden = false;
    if (currentView.cardButton) { currentView.cardButton.hidden = false; currentView.cardButton.disabled = currentView.cardBusy; }
    currentView.name.textContent = person.name || t('Học sinh');
    currentView.className.textContent = room.name || t('Lớp học');
    currentView.gender.textContent = t(genderLabel(person.gender));
    const absent = (state.absent || []).includes(person.id), called = (state.called || []).includes(person.id);
    currentView.attendance.textContent = absent ? t('Vắng') : t('Có mặt'); currentView.attendance.dataset.status = absent ? 'absent' : 'present';
    currentView.called.textContent = called ? t('Đã được gọi') : t('Chưa được gọi'); currentView.called.dataset.called = String(called);
    const calls = retainedCalls(state, person.id), time = formatTime(calls.lastTime);
    currentView.count.textContent = String(calls.count);
    currentView.lastCall.textContent = time || (calls.count ? t('Chưa có thời gian được lưu') : t('Chưa có lượt được lưu'));
    if (time) currentView.lastCall.dateTime = new Date(calls.lastTime).toISOString();
    else currentView.lastCall.removeAttribute('datetime');
    currentView.canvas.setAttribute('aria-label', t('Nhân vật của {name}', {name: person.name || t('học sinh')}));
    const appearanceKey = JSON.stringify([person.id, person.gender, person.appearance || {}]);
    if (currentView.appearanceKey !== appearanceKey) {
      try {
        if (!currentView.canvas.getContext('2d')) throw new Error('Canvas unavailable');
        drawCharacterPreview(currentView.canvas, person);
        currentView.appearanceKey = appearanceKey; currentView.canvas.hidden = false; currentView.previewFallback.hidden = true;
      } catch {
        currentView.canvas.hidden = true; currentView.previewFallback.hidden = false;
      }
    }
  }
  function open(studentId, {returnFocus} = {}) {
    if (destroyed) return;
    const room = getClassroom(), person = room?.state?.students?.find(item => item.id === studentId);
    if (!person) { notify?.(t('Học sinh này không còn trong lớp đang chọn.')); return; }
    if (view?.roomId === room.id && view.studentId === studentId && view.dialog.open) { refresh(); view.dialog.focus(); return; }
    const focusTarget = returnFocus || document.activeElement;
    close();
    const dialog = element('dialog', 'student-details-dialog'), top = element('div', 'student-details-top');
    const eyebrow = element('span', 'student-details-eyebrow', t('THÔNG TIN HỌC SINH'));
    const closeButton = element('button', 'text-btn student-details-close', t('Đóng')); closeButton.type = 'button'; closeButton.addEventListener('click', () => dialog.close());
    top.append(eyebrow, closeButton);
    const layout = element('div', 'student-details-layout'), preview = element('div', 'student-details-preview');
    const canvas = element('canvas', 'student-details-canvas'); canvas.width = 480; canvas.height = 500; canvas.setAttribute('role', 'img');
    const previewFallback = element('p', 'student-details-preview-fallback', t('Chưa hiển thị được nhân vật.')); previewFallback.hidden = true;
    preview.append(canvas, previewFallback);
    const content = element('div', 'student-details-content'), name = element('h2', 'student-details-name'), className = element('p', 'student-details-class');
    name.id = `studentDetailsName${++detailSerial}`; dialog.setAttribute('aria-labelledby', name.id);
    const facts = element('dl', 'student-details-facts');
    const addFact = (label, valueNode) => { const group = element('div'); const definition = element('dd'); definition.append(valueNode); group.append(element('dt', '', label), definition); facts.append(group); };
    const gender = element('span'), attendance = element('span', 'student-details-status'), called = element('span', 'student-details-round');
    addFact(t('Giới tính'), gender); addFact(t('Trạng thái hiện tại'), attendance); addFact(t('Trong vòng UFO này'), called);
    const stats = element('div', 'student-details-stats');
    const countMetric = element('div', 'student-details-call-count'), count = element('strong'); countMetric.append(element('span', '', t('Lượt gọi đang lưu')), count);
    const lastMetric = element('div', 'student-details-last-call'), lastCall = element('time'); lastMetric.append(element('span', '', t('Lần gọi gần nhất còn lưu')), lastCall); stats.append(countMetric, lastMetric);
    const unavailable = element('p', 'form-error', t('Học sinh này không còn trong lớp đang chọn.')); unavailable.hidden = true; unavailable.setAttribute('role', 'status');
    content.append(name, className, unavailable, facts, stats);
    const currentView = {dialog, roomId: room.id, studentId, name, className, gender, attendance, called, count, lastCall, canvas, preview, previewFallback, facts, stats, unavailable, cardButton: null, appearanceKey: null, cardBusy: false};
    if (typeof onShowCard === 'function') {
      const cardButton = element('button', 'primary-btn student-details-card-button', t('Xem / tải thẻ nhân vật')); cardButton.type = 'button'; cardButton.setAttribute('aria-haspopup', 'dialog');
      currentView.cardButton = cardButton;
      cardButton.addEventListener('click', async () => {
        if (currentView.cardBusy || view !== currentView || getClassroom()?.id !== currentView.roomId) return;
        if (!getClassroom()?.state?.students?.some(item => item.id === studentId)) { showUnavailable(currentView); return; }
        currentView.cardBusy = true; cardButton.disabled = true;
        try { await onShowCard(studentId); }
        catch (error) { notify?.(error.message || t('Chưa mở được thẻ nhân vật. Hãy thử lại.')); }
        finally { currentView.cardBusy = false; if (view === currentView) refresh(); }
      });
      content.append(cardButton);
    }
    layout.append(preview, content); dialog.append(top, layout);
    dialog.addEventListener('close', () => {
      if (view === currentView) view = null;
      dialog.remove();
      // Do not move focus out of another modal opened by the card callback.
      const topModal = [...document.querySelectorAll('dialog[open]')].at(-1);
      if (!topModal || topModal.id === 'rosterDialog') restoreFocus(focusTarget);
    }, {once: true});
    document.body.append(dialog); view = currentView; dialog.showModal(); refresh(); closeButton.focus({preventScroll: true});
  }
  return {open, refresh, close, destroy() { if (destroyed) return; destroyed = true; close(); }};
}
