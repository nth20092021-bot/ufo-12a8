import {t, locale} from './i18n.js';
import {apiRequest} from './api-client.js';
import {downloadAttendanceWorkbook} from './attendance-export.js';

const STATUS = {running: t('Chưa kết thúc'), completed: t('Đã hoàn tất'), stopped: t('Đã dừng')};
const RECORD_STATUS = {present: t('Có mặt'), absent: t('Vắng'), unmarked: t('Chưa điểm danh')};
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const button = (text, action, className = 'secondary-btn') => { const node = element('button', className, text); node.type = 'button'; node.addEventListener('click', action); return node; };
function localDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
function displayDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return date;
  try { return new Intl.DateTimeFormat(locale, {timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(`${date}T00:00:00Z`)); } catch { return date; }
}
function displayTime(session) { try { return new Intl.DateTimeFormat(locale, {timeZone: session.timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}).format(session.startedAt); } catch { return '—'; } }
const countRecords = records => records.reduce((counts, record) => { counts.total++; if (Object.hasOwn(counts, record.status)) counts[record.status]++; return counts; }, {total: 0, present: 0, absent: 0, unmarked: 0});

export function createAttendanceHistory({getClassroom, ensureShared, notify, getSyncState, onSyncRetry}) {
  let view = null, destroyed = false, opening = null, serial = 0;
  const notifyError = error => notify?.(error.message || t('Chưa tải được lịch sử điểm danh.'));
  const isCurrent = state => !destroyed && view === state && state.dialog.open && getClassroom()?.id === state.roomId && (!state.classId || getClassroom()?.cloud?.id === state.classId);
  function stopRequests(state) { state.listRequest?.abort(); state.detailRequest?.abort(); state.listSequence++; state.detailSequence++; }
  function close() { view?.dialog.close(); }
  function setNotice(state, text, error = false) { state.notice.textContent = text; state.notice.hidden = !text; state.notice.dataset.error = String(error); }
  function apiPath(state, suffix = '') { return `/classes/${encodeURIComponent(state.classId)}/attendance${suffix}`; }
  function renderSync(state) {
    const sync = getSyncState?.() || {}, pending = Math.max(0, Number(sync.pending) || 0);
    state.syncNote.hidden = !pending && !sync.error;
    state.syncText.textContent = pending ? t('Có {count} lượt điểm danh đang chờ đồng bộ từ thiết bị này.', {count: pending}) + (sync.sending ? t(' Đang gửi…') : t(' Lịch sử trên máy chủ bên dưới sẽ cập nhật sau khi gửi xong.')) : t('Chưa đồng bộ được lịch sử từ thiết bị này.');
    state.syncRetry.hidden = !onSyncRetry || (!pending && !sync.error); state.syncRetry.disabled = !!sync.sending;
    state.syncRetry.textContent = sync.sending ? t('Đang đồng bộ…') : t('Thử đồng bộ');
  }

  function renderRecords(state) {
    if (!state.detail) return;
    const records = state.detail.records || [], counts = countRecords(records);
    state.summary.replaceChildren();
    for (const [key, label] of [['total',t('Tổng số')],['present',t('Có mặt')],['absent',t('Vắng')],['unmarked',t('Chưa điểm danh')]]) {
      const item = element('div', 'attendance-count'); item.dataset.status = key;
      item.append(element('strong', '', String(counts[key])), element('span', '', label)); state.summary.append(item);
    }
    const filtered = records.map((record, index) => ({...record, number: index + 1})).filter(record => state.filter.value === 'all' || record.status === state.filter.value);
    state.tbody.replaceChildren();
    for (const record of filtered) {
      const row = element('tr'), status = element('span', 'attendance-record-status', RECORD_STATUS[record.status] || record.status); status.dataset.status = record.status;
      row.append(element('td', 'attendance-number', String(record.number)), element('td', 'attendance-record-name', record.name), element('td', '', record.gender === 'female' ? t('Nữ') : record.gender === 'other' ? t('Khác') : t('Nam')));
      const cell = element('td'); cell.append(status); row.append(cell); state.tbody.append(row);
    }
    state.emptyRecords.hidden = filtered.length > 0;
    state.table.hidden = filtered.length === 0;
    state.emptyRecords.textContent = records.length ? t('Không có học sinh trong nhóm này.') : t('Lượt điểm danh này chưa có học sinh.');
    state.visibleCount.textContent = t('{shown} / {total} bạn', {shown: filtered.length, total: records.length});
    state.export.disabled = false;
  }
  function showDetail(state, session) {
    state.detail = session; state.detailPanel.hidden = false; state.detailPlaceholder.hidden = true;
    state.detailTitle.textContent = `${displayDate(session.date)} · ${displayTime(session)}`;
    state.detailMeta.textContent = `${STATUS[session.status] || session.status} · ${session.timeZone}`;
    state.detailMeta.dataset.status = session.status;
    state.runningNote.hidden = session.status !== 'running';
    renderRecords(state);
  }
  async function loadDetail(state, id, {quiet = false} = {}) {
    if (!isCurrent(state)) return;
    state.detailRequest?.abort(); const request = new AbortController(), run = ++state.detailSequence;
    state.detailRequest = request; state.export.disabled = true;
    if (!quiet || state.detail?.id !== id) { state.detail = null; state.detailPanel.hidden = true; state.detailPlaceholder.hidden = false; state.detailPlaceholder.textContent = t('Đang tải lượt điểm danh…'); }
    try {
      const session = await apiRequest(apiPath(state, `/${encodeURIComponent(id)}`), {token: state.ownerToken, signal: request.signal});
      if (!isCurrent(state) || run !== state.detailSequence || state.selectedId !== id) return;
      if (state.detail?.id === id && session.revision < state.detail.revision) return;
      showDetail(state, session);
    } catch (error) {
      if (error.name === 'AbortError' || !isCurrent(state) || run !== state.detailSequence) return;
      state.detail = null; state.detailPanel.hidden = true; state.detailPlaceholder.hidden = false;
      state.detailPlaceholder.textContent = error.message || t('Chưa tải được lượt điểm danh. Bấm Làm mới để thử lại.');
      state.export.disabled = true;
    } finally { if (run === state.detailSequence) { state.detailRequest = null; if (state.detail?.id === state.selectedId) state.export.disabled = false; } }
  }
  function selectSession(state, id) {
    if (!isCurrent(state)) return;
    state.selectedId = id; state.filter.value = 'all'; renderSessions(state); void loadDetail(state, id);
  }
  function renderSessions(state) {
    state.list.replaceChildren();
    for (const session of state.sessions) {
      const item = element('li'), choose = button('', () => selectSession(state, session.id), 'attendance-run');
      choose.setAttribute('aria-pressed', String(state.selectedId === session.id));
      const line = element('div', 'attendance-run-top'); line.append(element('strong', '', displayTime(session)), element('span', '', displayDate(session.date)));
      const status = element('span', 'attendance-run-status', STATUS[session.status] || session.status); status.dataset.status = session.status;
      const counts = session.counts || {};
      choose.append(line, status, element('small', '', t('{present} có mặt · {absent} vắng · {unmarked} chưa điểm danh', {present: counts.present || 0, absent: counts.absent || 0, unmarked: counts.unmarked || 0})));
      item.append(choose); state.list.append(item);
    }
    state.loadMore.hidden = !state.nextCursor;
    state.emptyList.hidden = state.sessions.length > 0;
    state.emptyList.textContent = state.date.value ? t('Ngày này chưa có lượt điểm danh nào được lưu.') : t('Chưa có lịch sử điểm danh được lưu cho lớp này.');
    state.listCount.textContent = t('{count}{more} lượt', {count: state.sessions.length, more: state.nextCursor ? '+' : ''});
  }
  async function loadSessions(state, {append = false, quiet = false} = {}) {
    if (!isCurrent(state) || !state.classId) return;
    if (append && (!state.nextCursor || state.listRequest)) return;
    state.listRequest?.abort(); const request = new AbortController(), run = ++state.listSequence;
    const date = state.date.value, cursor = append ? state.nextCursor : null;
    state.listRequest = request; state.reload.disabled = true; state.loadMore.disabled = true;
    if (!quiet) setNotice(state, t('Đang tải lịch sử điểm danh…'));
    const query = new URLSearchParams({limit: '30'}); if (date) query.set('date', date); if (cursor) query.set('cursor', cursor);
    try {
      const result = await apiRequest(apiPath(state, `?${query}`), {token: state.ownerToken, signal: request.signal});
      if (!isCurrent(state) || run !== state.listSequence || date !== state.date.value) return;
      const incoming = result.sessions || [];
      state.sessions = append || (quiet && state.paginated) ? [...incoming, ...state.sessions.filter(item => !incoming.some(next => next.id === item.id))].sort((a,b) => b.startedAt - a.startedAt || b.id.localeCompare(a.id)) : incoming;
      if (append || !quiet || !state.paginated) state.nextCursor = result.nextCursor || null;
      if (append) state.paginated = true;
      else if (!quiet) state.paginated = false;
      setNotice(state, ''); renderSync(state);
      let selected = state.sessions.find(session => session.id === state.selectedId);
      if (!selected && !append) {
        state.selectedId = state.sessions[0]?.id || null; selected = state.sessions[0]; state.detail = null; state.filter.value = 'all';
      }
      renderSessions(state);
      if (selected && (state.detail?.id !== selected.id || state.detail.revision < selected.revision)) await loadDetail(state, selected.id, {quiet});
      else if (selected && state.detail) state.export.disabled = false;
      if (!state.selectedId) {
        state.detailRequest?.abort(); state.detailSequence++; state.detail = null; state.detailPanel.hidden = true;
        state.detailPlaceholder.hidden = false; state.detailPlaceholder.textContent = t('Chọn ngày có lịch sử để xem kết quả từng lượt.'); state.export.disabled = true;
      }
    } catch (error) {
      if (error.name === 'AbortError' || !isCurrent(state) || run !== state.listSequence) return;
      setNotice(state, error.message || t('Chưa tải được lịch sử. Bấm Làm mới để thử lại.'), true);
    } finally {
      if (run === state.listSequence) { state.listRequest = null; state.reload.disabled = false; state.loadMore.disabled = false; }
    }
  }
  function buildView(room) {
    const dialog = element('dialog', 'attendance-history-dialog'); const heading = element('div', 'attendance-history-heading');
    const titleWrap = element('div'), eyebrow = element('span', 'attendance-history-eyebrow', t('THEO DÕI TỪNG BUỔI HỌC')), title = element('h2', '', t('Lịch sử điểm danh'));
    title.id = `attendanceHistoryTitle${++serial}`; dialog.setAttribute('aria-labelledby', title.id); titleWrap.append(eyebrow, title);
    heading.append(titleWrap, button(t('Đóng'), () => dialog.close(), 'text-btn'));
    const className = element('p', 'attendance-history-class', room.name), controls = element('div', 'attendance-history-controls');
    const dateLabel = element('label', '', t('Ngày điểm danh')), date = element('input'); date.type = 'date'; date.value = localDate(); date.id = `attendanceHistoryDate${serial}`; dateLabel.htmlFor = date.id;
    const dateWrap = element('div', 'attendance-date-control'); dateWrap.append(dateLabel, date);
    const reload = button(t('Làm mới'), () => { if (state.classId) void loadSessions(state); else { dialog.close(); void open(); } }, 'secondary-btn');
    const allDays = button(t('Tất cả ngày'), () => { date.value = ''; changeDate(); }, 'text-btn'); controls.append(dateWrap, allDays, reload);
    const notice = element('p', 'attendance-history-notice'); notice.hidden = true; notice.setAttribute('role', 'status');
    const syncNote = element('div', 'attendance-history-sync'), syncText = element('p'); syncNote.hidden = true;
    const syncRetry = button(t('Thử đồng bộ'), async () => { syncRetry.disabled = true; try { await onSyncRetry?.(); await refresh(); } catch (error) { notifyError(error); } finally { if (isCurrent(state)) renderSync(state); } });
    syncNote.append(syncText, syncRetry);
    const layout = element('div', 'attendance-history-layout'), sidebar = element('section', 'attendance-history-sidebar');
    const listHeading = element('div', 'attendance-list-heading'), listCount = element('span', '', t('{count}{more} lượt', {count: 0, more: ''})); listHeading.append(element('h3', '', t('Các lượt đã lưu')), listCount);
    const list = element('ul', 'attendance-run-list'), emptyList = element('p', 'attendance-empty', t('Đang tải lịch sử…'));
    const loadMore = button(t('Xem lượt trước'), () => void loadSessions(state, {append: true}), 'secondary-btn attendance-load-more'); loadMore.hidden = true;
    sidebar.append(listHeading, emptyList, list, loadMore);
    const content = element('section', 'attendance-history-content'), detailPlaceholder = element('p', 'attendance-detail-placeholder', t('Đang kết nối với lớp…')), detailPanel = element('div', 'attendance-detail-panel'); detailPanel.hidden = true;
    const detailTitle = element('h3'), detailMeta = element('p', 'attendance-detail-meta'), summary = element('div', 'attendance-summary');
    const runningNote = element('p', 'attendance-running-note', t('Lượt này chưa được ghi nhận kết thúc. Các bạn chưa được gọi vẫn được ghi là “Chưa điểm danh”.')); runningNote.hidden = true;
    const tableControls = element('div', 'attendance-table-controls'), filterWrap = element('label', 'attendance-filter', t('Hiển thị ')), filter = element('select'); filter.setAttribute('aria-label', t('Lọc trạng thái điểm danh'));
    for (const [value,label] of [['all',t('Tất cả học sinh')],['present',t('Có mặt')],['absent',t('Vắng')],['unmarked',t('Chưa điểm danh')]]) { const option = element('option', '', label); option.value = value; filter.append(option); }
    filter.value = 'all'; filterWrap.append(filter); const visibleCount = element('span', 'attendance-visible-count'); tableControls.append(filterWrap, visibleCount);
    const tableWrap = element('div', 'attendance-table-wrap'), table = element('table', 'attendance-records-table'), thead = element('thead'), header = element('tr');
    for (const label of [t('STT'),t('Họ tên'),t('Giới tính'),t('Trạng thái')]) { const cell = element('th', '', label); cell.scope = 'col'; header.append(cell); }
    thead.append(header); const tbody = element('tbody'); table.append(thead, tbody); const emptyRecords = element('p', 'attendance-empty'); emptyRecords.hidden = true; tableWrap.append(table, emptyRecords);
    const footer = element('div', 'attendance-export-row'), exportButton = button(t('Tải Excel (.xlsx)'), () => {
      if (!isCurrent(state) || !state.detail) return;
      try { downloadAttendanceWorkbook(state.detail, {className: getClassroom().name}); notify?.(t('Đã chuẩn bị tệp Excel điểm danh.')); }
      catch (error) { notifyError(error); }
    }, 'primary-btn'); exportButton.disabled = true;
    footer.append(element('p', '', t('Tệp Excel gồm 3 trang: Tổng hợp, Có mặt và Vắng. Bộ lọc trên màn hình không làm mất học sinh trong tệp.')), exportButton);
    detailPanel.append(detailTitle, detailMeta, summary, runningNote, tableControls, tableWrap, footer); content.append(detailPlaceholder, detailPanel); layout.append(sidebar, content);
    dialog.append(heading, className, controls, notice, syncNote, layout);
    const state = {dialog, roomId: room.id, classId: null, ownerToken: null, className, date, reload, notice, syncNote, syncText, syncRetry, list, listCount, emptyList, loadMore,
      detailPanel, detailPlaceholder, detailTitle, detailMeta, summary, runningNote, filter, visibleCount, table, tbody, emptyRecords, export: exportButton,
      sessions: [], nextCursor: null, paginated: false, selectedId: null, detail: null, listRequest: null, detailRequest: null, listSequence: 0, detailSequence: 0};
    function changeDate() { stopRequests(state); state.sessions = []; state.selectedId = null; state.detail = null; state.nextCursor = null; state.paginated = false; state.export.disabled = true; state.detailPanel.hidden = true; state.detailPlaceholder.hidden = false; state.detailPlaceholder.textContent = t('Đang tải lịch sử theo ngày…'); renderSessions(state); void loadSessions(state); }
    date.addEventListener('change', changeDate); filter.addEventListener('change', () => renderRecords(state));
    dialog.addEventListener('close', () => { stopRequests(state); if (view === state) view = null; state.ownerToken = null; state.detail = null; dialog.remove(); }, {once: true});
    document.body.append(dialog); dialog.showModal(); renderSync(state); return state;
  }
  async function open() {
    if (destroyed) return;
    if (view && isCurrent(view)) { view.dialog.focus(); return refresh(); }
    close(); const room = getClassroom(); if (!room) { notify?.(t('Chọn lớp học để xem lịch sử điểm danh.')); return; }
    const state = buildView(room); view = state;
    const openToken = {}; opening = openToken;
    const pending = (async () => {
      try {
        await ensureShared();
        if (!isCurrent(state)) { if (view === state) close(); return; }
        const cloud = getClassroom()?.cloud;
        if (!cloud?.id || !cloud.ownerToken&&!cloud.accountId) throw new Error(t('Chưa kết nối được lớp. Đóng và mở lại lịch sử để thử lại.'));
        state.classId = cloud.id; state.ownerToken = cloud.ownerToken;
        await loadSessions(state);
      } catch (error) { if (isCurrent(state)) { setNotice(state, error.message || t('Chưa kết nối được lớp.'), true); state.detailPlaceholder.textContent = t('Bấm Làm mới để thử kết nối lại.'); } }
      finally { if (opening === openToken) opening = null; }
    })();
    return pending;
  }
  async function refresh() {
    const state = view; if (!state) return;
    if (!isCurrent(state)) { close(); return; }
    state.className.textContent = getClassroom().name;
    renderSync(state);
    if (state.classId) return loadSessions(state, {quiet: true});
  }
  const tick = () => { if (!document.hidden && view && !view.listRequest && !view.detailRequest && !opening) void refresh(); };
  const timer = setInterval(tick, 5000); document.addEventListener('visibilitychange', tick);
  return {open, refresh, close, destroy() { destroyed = true; close(); clearInterval(timer); document.removeEventListener('visibilitychange', tick); }};
}
