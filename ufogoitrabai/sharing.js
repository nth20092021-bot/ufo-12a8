import {t, locale} from './i18n.js';
import {apiRequest, APP_BASE, joinLink, editLink, copyText} from './api-client.js';
import {createAvatarEditor} from './avatar-editor.js';
import {createProfileCard} from './profile-card.js';
import {drawQR} from './qr.js';
import {sameCreatedClassroom} from './teacher-account.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (label, action, className = 'secondary-btn') => {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
};
const rosterPayload = students => students.map(({id, name, gender, appearance}) => ({id, name, gender, ...(appearance ? {appearance} : {})}));

export function setupClassSharing(host, adapter) {
  let classKey = null, snapshot = null, queued = null, stopped = false, fetchBusy = false, mutationBusy = false, generation = 0;
  let lastPaint = '', online = true, dialogCount = 0, codeDisplay = null, studentCardDisplay = null, studentCardOpening = null;
  const dialogs = new Set();
  const creationRequests = new Map();
  const current = () => adapter.getClassroom();
  const connection = () => current()?.cloud;
  const key = () => `${current()?.id || ''}:${connection()?.id || ''}:${connection()?.accountId || 'guest'}`;
  const notice = message => adapter.notify?.(message);
  const failure = error => { notice(error.message || t('Có lỗi xảy ra. Hãy thử lại.')); adapter.onError?.(error); };

  function statusText() {
    if (!online) return t('Mất kết nối · Sẽ tự thử lại');
    if (queued) return t('Có thay đổi · Cập nhật sau lượt UFO hoặc điểm danh');
    return snapshot ? t('Đang đồng bộ') : t('Đang kết nối…');
  }
  function updateStatus() {
    const status = host.querySelector('[data-sync-status]');
    if (status) { status.textContent = statusText(); status.dataset.offline = String(!online); }
    updateCodeDisplay();
  }
  function accept(next, expectedKey = key()) {
    if (stopped || expectedKey !== key() || !next || next.id !== connection()?.id) return;
    if (snapshot && next.revision < snapshot.revision) return;
    const changed = !snapshot || next.revision !== snapshot.revision || next.joinCode !== snapshot.joinCode;
    snapshot = next; online = true;
    adapter.onLiveSnapshot?.(next);
    if (changed) {
      if (adapter.isRunning()) queued = next;
      else { queued = null; adapter.onSnapshot(next); }
    }
    paint();
    updateCodeDisplay();
    updateStatus();
    updateStudentCardDisplay();
  }
  async function poll({force = false} = {}) {
    if (stopped || fetchBusy || !connection() || (!force && document.hidden)) return;
    const activeKey = key(), activeGeneration = generation, cloud = {...connection()};
    fetchBusy = true;
    try {
      const result = await apiRequest(`/classes/${encodeURIComponent(cloud.id)}`, {token: cloud.ownerToken});
      if (activeGeneration === generation) accept(result, activeKey);
    } catch (error) {
      if (activeKey === key()) {
        online = false; updateStatus();
        if (force) failure(error);
      }
    } finally { fetchBusy = false; }
  }
  async function mutate(path, method, body, {expectedRevision = snapshot?.revision, notifySuccess} = {}) {
    if (adapter.isRunning()) throw new Error(t('Chờ hoàn tất lượt UFO hoặc điểm danh trước khi sửa lớp.'));
    if (mutationBusy) throw new Error(t('Đang lưu thay đổi. Vui lòng chờ một chút.'));
    const cloud = connection();
    if (!cloud) throw new Error(t('Lớp này chưa bật chia sẻ.'));
    const activeKey = key();
    mutationBusy = true;
    try {
      const result = await apiRequest(`/classes/${encodeURIComponent(cloud.id)}${path}`, {
        method, token: cloud.ownerToken, body: {...body, expectedRevision}
      });
      accept(result.class || result, activeKey);
      if (notifySuccess) notice(notifySuccess);
      return result;
    } catch (error) {
      if (error.status === 409) await poll({force: true});
      throw error;
    } finally { mutationBusy = false; }
  }
  async function ensureShared() {
    const room = current(), originalKey = key();
    if (!room) throw new Error(t('Chọn lớp học trước khi tạo mã lớp.'));
    if (creationRequests.has(room.id)) return creationRequests.get(room.id);
    if (room.cloud) {
      let result = snapshot?.id === room.cloud.id ? snapshot : await apiRequest(`/classes/${encodeURIComponent(room.cloud.id)}`, {token: room.cloud.ownerToken});
      accept(result, originalKey);
      // Legacy classes retain their device-local scenery until its owner shares it.
      if(result.environmentConfigured===false&&originalKey===key()){
        const updated=await mutate('', 'PATCH', {environmentTheme:room.environmentTheme||'street',environmentNames:room.environmentNames||{}}, {expectedRevision:result.revision});
        result=updated.class||updated;
      }
      return result;
    }
    if (adapter.isRunning()) throw new Error(t('Chờ hoàn tất lượt UFO hoặc điểm danh trước khi tạo mã lớp.'));
    if (mutationBusy) throw new Error(t('Đang lưu thay đổi. Vui lòng chờ một chút.'));
    const pending = createShared(room, originalKey);
    creationRequests.set(room.id, pending);
    try { return await pending; }
    finally { creationRequests.delete(room.id); }
  }
  async function createShared(room, originalKey) {
    mutationBusy = true;
    const requestAccountId=adapter.getAccount?.()?.id,requestIdentityVersion=adapter.getIdentityVersion?.();
    try {
      const result = await apiRequest('/classes', {method: 'POST', body: {name: room.name, students: rosterPayload(room.state.students), expectedSize: room.expectedSize ?? null, environmentTheme:room.environmentTheme||'street',environmentNames:room.environmentNames||{},...(requestAccountId?{creationKey:room.id}:{})}});
      if(requestAccountId!==adapter.getAccount?.()?.id||requestIdentityVersion!==adapter.getIdentityVersion?.()||result.accountId!==requestAccountId)throw new Error(t('Phiên đăng nhập đã thay đổi.'));
      // A retry may recover the first create after its response was lost. That
      // snapshot must not overwrite edits made locally while disconnected.
      if(!sameCreatedClassroom(room,result.class))throw Object.assign(new Error(t('Lớp đã có cập nhật mới. Dữ liệu trên thiết bị này vẫn được giữ.')),{status:409});
      const stillActive = key() === originalKey;
      adapter.onConnected({id: result.class.id, ...(result.accountId?{accountId:result.accountId}:{ownerToken:result.ownerToken}), revision: result.class.revision}, result.class, room.id);
      if (stillActive) { classKey = key(); generation++; snapshot = null; lastPaint = ''; accept(result.class); }
      else refresh();
      return result.class;
    } finally { mutationBusy = false; }
  }
  function run(fn) { return async event => { event?.preventDefault(); try { await fn(); } catch (error) { failure(error); } }; }

  function openDialog(title, description, {iconClose = false} = {}) {
    const dialog = el('dialog', 'share-dialog');
    const header = el('div', 'share-dialog-heading');
    const heading = el('h2', '', title);
    heading.id = `sharing-dialog-${++dialogCount}`;
    dialog.setAttribute('aria-labelledby', heading.id);
    const close = button(iconClose ? '' : t('Đóng'), () => dialog.close(), iconClose ? 'icon-btn share-code-close' : 'text-btn');
    if (iconClose) {
      close.setAttribute('aria-label', t('Đóng')); close.title = t('Đóng');
      close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    }
    header.append(heading, close); dialog.append(header);
    if (description) dialog.append(el('p', 'share-hint', description));
    document.body.append(dialog); dialogs.add(dialog);
    dialog.addEventListener('close', () => { dialogs.delete(dialog); dialog.remove(); }, {once: true});
    dialog.showModal();
    return dialog;
  }
  function updateCodeDisplay() {
    if (!codeDisplay || !snapshot || codeDisplay.classId !== snapshot.id) return;
    const {dialog, title, code, state, qr, copy} = codeDisplay;
    if (!dialog.open) return;
    if (title.textContent !== snapshot.name) title.textContent = snapshot.name;
    if (code.textContent !== snapshot.joinCode) { code.textContent = snapshot.joinCode; setCodeCopyState(copy); }
    code.setAttribute('aria-label', t('Mã lớp {code}', {code: snapshot.joinCode.split('').join(' ')}));
    const stateText = !online ? t('Đang mất kết nối · Mã đã lưu; trạng thái đăng ký sẽ cập nhật khi có mạng') : snapshot.registrationOpen ? t('Quét QR hoặc nhập mã lớp để tham gia') : t('Lớp đang tạm đóng đăng ký');
    if (state.textContent !== stateText) state.textContent = stateText;
    state.dataset.closed = String(!online || !snapshot.registrationOpen);
    const invite = joinLink(snapshot.inviteCode);
    qr.setAttribute('aria-label', t('Mã QR tham gia lớp {name}', {name: snapshot.name}));
    if (codeDisplay.invite !== invite) {
      codeDisplay.invite = invite;
      qr.hidden = false;
      drawQR(qr, invite).catch(() => { qr.hidden = true; });
    }
  }
  function setCodeCopyState(copy, copied = false) {
    const label = t(copied ? 'Đã sao chép mã' : 'Sao chép mã lớp');
    copy.setAttribute('aria-label', label); copy.title = label; copy.dataset.copied = String(copied);
    copy.innerHTML = copied
      ? '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 12 4 4L19 6"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/></svg>';
  }
  function showClassCode() {
    if (!snapshot?.joinCode) return;
    if (codeDisplay?.dialog.open) { codeDisplay.dialog.focus(); return; }
    const dialog = openDialog(t('Tham gia lớp học'), undefined, {iconClose: true});
    dialog.classList.add('share-code-dialog');
    const title = el('p', 'share-code-class-name', snapshot.name);
    const presentation = el('div', 'share-code-presentation');
    const codePane = el('div', 'share-code-pane');
    const label = el('p', 'share-code-eyebrow', t('MÃ LỚP'));
    const code = el('strong', 'share-code-large', snapshot.joinCode);
    code.setAttribute('aria-label', t('Mã lớp {code}', {code: snapshot.joinCode.split('').join(' ')}));
    const entry = el('a', 'share-code-entry', `${location.host}${APP_BASE}`);
    entry.href = `${APP_BASE}/`; entry.target = '_blank'; entry.rel = 'noopener';
    const copy = button('', run(async () => {
      const copiedCode = code.textContent; copy.disabled = true; copy.setAttribute('aria-busy', 'true');
      try {
        await copyText(copiedCode);
        if (code.textContent === copiedCode) setCodeCopyState(copy, true);
        notice(t('Đã sao chép mã lớp.'));
      } finally { copy.disabled = false; copy.setAttribute('aria-busy', 'false'); }
    }), 'secondary-btn share-code-copy');
    setCodeCopyState(copy);
    const codeToolbar = el('div', 'share-code-toolbar'); codeToolbar.append(label, copy);
    codePane.append(codeToolbar, code, entry);
    const qrPane = el('div', 'share-code-qr-pane'), qr = el('canvas', 'share-code-qr');
    qr.setAttribute('role', 'img');
    qrPane.append(qr);
    presentation.append(qrPane, codePane);
    const state = el('p', 'share-code-state'); state.setAttribute('role', 'status');
    dialog.append(title, presentation, state);
    codeDisplay = {dialog, classId: snapshot.id, title, code, state, qr, copy, invite: null};
    dialog.addEventListener('close', () => { if (codeDisplay?.dialog === dialog) codeDisplay = null; }, {once: true});
    updateCodeDisplay();
  }
  async function showCode() {
    const roomId = current()?.id;
    await ensureShared();
    if (current()?.id === roomId) showClassCode();
  }
  function cardDisplayIsCurrent(display) {
    return !stopped && studentCardDisplay === display && display.dialog.open &&
      display.classKey === key() && display.generation === generation;
  }
  function showUnavailableCard(display) {
    // Remove the old QR, image and download URL, including any render in flight.
    // The dialog stays open until its explicit Close button is used.
    display.card.clear();
    display.loadedRevision = null; display.failedRevision = snapshot?.revision;
    display.status.textContent = t('Nhân vật này không còn trong lớp. Hãy mở lại danh sách mới nhất.');
    display.status.dataset.error = 'true'; display.status.hidden = false; display.retry.hidden = true;
  }
  async function loadStudentCard(display) {
    if (!cardDisplayIsCurrent(display) || display.loading || adapter.isRunning() || mutationBusy) return;
    const revision = snapshot?.revision;
    if (!snapshot?.students.some(person => person.id === display.studentId)) { showUnavailableCard(display); return; }
    display.loading = true;
    display.card.clear();
    display.status.textContent = t('Đang chuẩn bị thẻ nhân vật…');
    display.status.hidden = false; display.status.dataset.error = 'false';
    display.retry.hidden = true;
    try {
      const result = await mutate(`/students/${encodeURIComponent(display.studentId)}/card`, 'POST', {}, {expectedRevision: revision});
      if (!cardDisplayIsCurrent(display)) return;
      if (adapter.isRunning()) return;
      if (!snapshot?.students.some(person => person.id === display.studentId)) { showUnavailableCard(display); return; }
      // A newer poll may arrive while the capability request is in flight.
      // Do not display an older card after a rename, removal or link rotation.
      if (result.class.revision < snapshot.revision) return;
      display.loadedRevision = result.class.revision;
      display.failedRevision = null;
      display.status.hidden = true;
      display.card.update({person: result.student, className: result.className, joinCode: result.joinCode, privateUrl: editLink(result.student.id, result.editToken)});
    } catch (error) {
      if (!cardDisplayIsCurrent(display)) return;
      if (error.status === 404 || !snapshot?.students.some(person => person.id === display.studentId)) { showUnavailableCard(display); return; }
      display.failedRevision = snapshot?.revision;
      display.status.textContent = error.status === 409 ? t('Lớp vừa có thay đổi. Bấm Thử lại để lấy thẻ mới nhất.') : (error.message || t('Chưa tạo được thẻ. Hãy thử lại.'));
      display.status.dataset.error = 'true'; display.status.hidden = false; display.retry.hidden = false;
    } finally {
      display.loading = false;
      if (cardDisplayIsCurrent(display)) updateStudentCardDisplay();
    }
  }
  function updateStudentCardDisplay() {
    const display = studentCardDisplay;
    if (!display) return;
    const person = snapshot?.students.find(item => item.id === display.studentId);
    if (!cardDisplayIsCurrent(display)) { display.dialog.close(); return; }
    if (!person) { showUnavailableCard(display); return; }
    const title = t('Thẻ nhân vật · {name}', {name: person.name});
    if (display.title.textContent !== title) display.title.textContent = title;
    if (!display.loading && display.loadedRevision !== snapshot.revision && display.failedRevision !== snapshot.revision) void loadStudentCard(display);
  }
  async function showStudentCard(studentId) {
    if (stopped) return;
    if (adapter.isRunning()) throw new Error(t('Chờ hoàn tất lượt UFO hoặc điểm danh trước khi mở thẻ nhân vật.'));
    const roomId = current()?.id;
    if (!roomId) throw new Error(t('Chọn lớp học trước khi mở thẻ nhân vật.'));
    if (studentCardOpening) {
      if (studentCardOpening.roomId === roomId && studentCardOpening.studentId === studentId) return studentCardOpening.promise;
      throw new Error(t('Đang chuẩn bị thẻ nhân vật. Vui lòng chờ một chút.'));
    }
    if (studentCardDisplay?.studentId === studentId && studentCardDisplay.classKey === key()) {
      studentCardDisplay.dialog.focus(); return;
    }
    if (mutationBusy) throw new Error(t('Đang lưu thay đổi. Vui lòng chờ một chút.'));
    const request = {roomId, studentId, promise: null};
    studentCardOpening = request;
    request.promise = (async () => {
      await ensureShared();
      if (stopped || current()?.id !== roomId) return;
      if (adapter.isRunning()) throw new Error(t('Chờ hoàn tất lượt UFO hoặc điểm danh trước khi mở thẻ nhân vật.'));
      const person = snapshot?.students.find(item => item.id === studentId);
      if (!person) throw new Error(t('Nhân vật này không còn trong lớp. Hãy mở lại danh sách mới nhất.'));
      studentCardDisplay?.dialog.close();
      const dialog = openDialog(t('Thẻ nhân vật · {name}', {name: person.name}), t('Tải ảnh để gửi riêng cho đúng học sinh. Người giữ QR có thể mở và sửa nhân vật này.'));
      dialog.classList.add('teacher-card-dialog');
      const status = el('p', 'teacher-card-status'); status.setAttribute('role', 'status');
      const cardHost = el('div', 'teacher-card-host');
      const display = {dialog, title: dialog.querySelector('h2'), status, card: createProfileCard(cardHost), studentId,
        classKey: key(), generation, loading: false, loadedRevision: null, failedRevision: null, retry: null};
      display.retry = button(t('Thử lại'), () => { display.failedRevision = null; void loadStudentCard(display); });
      display.retry.hidden = true;
      dialog.append(status, display.retry, cardHost);
      studentCardDisplay = display;
      dialog.addEventListener('close', () => {
        display.card.destroy();
        if (studentCardDisplay === display) studentCardDisplay = null;
      }, {once: true});
      await loadStudentCard(display);
    })();
    try { return await request.promise; }
    finally { if (studentCardOpening === request) studentCardOpening = null; }
  }
  function secretDialog(title, description, value) {
    const dialog = openDialog(title, description);
    const field = el('input', 'share-link-field'); field.readOnly = true; field.value = value;
    field.setAttribute('aria-label', title);
    field.addEventListener('focus', () => field.select());
    const copy = button(t('Sao chép'), run(async () => { await copyText(value); copy.textContent = t('Đã sao chép'); notice(t('Đã sao chép.')); }), 'primary-btn');
    const row = el('div', 'share-link-row'); row.append(field, copy); dialog.append(row);
  }
  function editStudent(person) {
    const revision = snapshot.revision, activeKey = key();
    const dialog = openDialog(t('Sửa nhân vật · {name}', {name: person.name}), t('Thay đổi giữ nguyên mã thành viên và lịch sử gọi tên.'));
    const form = el('form'), editorHost = el('div'), error = el('p', 'form-error'); error.hidden = true;
    const editor = createAvatarEditor(editorHost, person);
    const actions = el('div', 'dialog-actions'), save = el('button', 'primary-btn', t('Lưu nhân vật')); save.type = 'submit';
    actions.append(button(t('Hủy'), () => dialog.close()), save); form.append(editorHost, error, actions); dialog.append(form);
    dialog.addEventListener('close', () => editor.destroy(), {once: true});
    form.addEventListener('submit', async event => {
      event.preventDefault(); error.hidden = true;
      if (key() !== activeKey) { error.textContent = t('Lớp đang chọn đã thay đổi. Hãy mở lại nhân vật trong lớp cần sửa.'); error.hidden = false; return; }
      save.disabled = true;
      try { await mutate(`/students/${encodeURIComponent(person.id)}`, 'PATCH', editor.getValue(), {expectedRevision: revision}); dialog.close(); notice(t('Đã cập nhật nhân vật.')); }
      catch (reason) { error.textContent = reason.status === 409 ? t('Lớp vừa có thay đổi. Đóng và mở lại nhân vật để sửa trên bản mới nhất.') : reason.message; error.hidden = false; }
      finally { save.disabled = false; }
    });
  }
  function confirmAction(title, detail, label, action) {
    const dialog = openDialog(title, detail), actions = el('div', 'dialog-actions');
    const confirm = button(label, run(async () => { confirm.disabled = true; try { await action(); dialog.close(); } finally { confirm.disabled = false; } }), 'primary-btn');
    actions.append(button(t('Hủy'), () => dialog.close()), confirm); dialog.append(actions);
  }
  function studentRow(person) {
    const row = el('li', 'share-student-row');
    const label = button('', run(() => showStudentCard(person.id)), 'share-student-label student-card-trigger');
    label.setAttribute('aria-haspopup', 'dialog');
    label.setAttribute('aria-label', t('Xem và tải thẻ nhân vật của {name}', {name: person.name}));
    label.title = t('Xem thẻ nhân vật và QR riêng');
    label.append(el('strong', '', person.name), el('small', '', person.claimed ? t('Đã tham gia · Có thể tự sửa nhân vật') : t('Chưa có người nhận')));
    const actions = el('div', 'share-student-actions');
    actions.append(button(t('Sửa'), () => editStudent(person)));
    if (!person.claimed) actions.append(button(t('Mã nhận'), run(async () => {
      const result = await mutate(`/students/${encodeURIComponent(person.id)}/claim`, 'POST', {});
      secretDialog(t('Mã nhận · {name}', {name: person.name}), t('Gửi mã này riêng cho đúng người. Người đó mở link mời của lớp và nhập mã để nhận nhân vật có sẵn. Mã mới thay thế mã cũ và chỉ dùng một lần.'), result.claimCode);
    })));
    if (person.claimed) actions.append(button(t('Cấp lại link sửa'), () => confirmAction(t('Cấp lại link riêng?'), t('Link chỉnh sửa cũ của {name} sẽ hết hiệu lực. Chỉ gửi link mới cho đúng người.', {name: person.name}), t('Cấp link mới'), async () => {
      const result = await mutate(`/students/${encodeURIComponent(person.id)}/recovery`, 'POST', {});
      secretDialog(t('Link riêng · {name}', {name: person.name}), t('Ai giữ link này đều có thể sửa nhân vật. Gửi riêng cho chủ nhân, không chia sẻ với cả lớp.'), editLink(result.studentId, result.editToken));
    })));
    actions.append(button(t('Xóa'), () => confirmAction(t('Xóa thành viên?'), t('{name} sẽ rời danh sách lớp. Link chỉnh sửa của người này cũng hết hiệu lực.', {name: person.name}), t('Xóa thành viên'), () => mutate(`/students/${encodeURIComponent(person.id)}`, 'DELETE', {})), 'text-btn share-danger'));
    row.append(label, actions); return row;
  }
  function paint() {
    const cloud = connection();
    const paintKey = `${key()}:${snapshot?.revision ?? 'none'}:${snapshot?.joinCode || ''}`;
    if (lastPaint === paintKey) return;
    lastPaint = paintKey;
    const expanded = host.querySelector('.share-members')?.open || false;
    host.replaceChildren(); host.classList.add('share-settings');
    const heading = el('div', 'share-heading');
    const sectionTitle = el('div', 'share-section-title');
    const number = el('span', 'share-section-number', '02'); number.setAttribute('aria-hidden', 'true');
    const headingText = el('div', 'share-heading-copy'); headingText.append(el('h3', '', t('Học sinh tham gia bằng mã lớp')), el('p', 'share-hint', t('Gửi mã hoặc QR để mỗi người tự nhập thông tin và chọn nhân vật.')));
    sectionTitle.append(number, headingText); heading.append(sectionTitle); host.append(heading);
    if (!cloud) {
      const create = button(t('Tạo mã lớp'), run(async () => {
        create.disabled = true;
        try { await ensureShared(); notice(t('Đã tạo mã lớp và QR để mọi người tham gia.')); }
        finally { create.disabled = false; }
      }), 'primary-btn');
      host.append(create, el('p', 'share-hint', t('Danh sách hiện tại được giữ lại. Người đã có tên có thể nhận đúng nhân vật bằng mã riêng.')));
      return;
    }
    const status = el('span', 'share-status', statusText()); status.dataset.syncStatus = ''; heading.append(status);
    if (!snapshot) { host.append(button(t('Kết nối lại'), () => poll({force: true}))); return; }
    if (snapshot.joinCode) {
      const codeRow = el('div', 'share-class-code-row');
      const codeButton = button('', showClassCode, 'share-class-code-button');
      codeButton.setAttribute('aria-label', t('Phóng to mã lớp {code} và QR', {code: snapshot.joinCode.split('').join(' ')}));
      codeButton.setAttribute('aria-haspopup', 'dialog');
      codeButton.append(el('span', 'share-code-eyebrow', t('MÃ LỚP')), el('strong', '', snapshot.joinCode), el('small', '', t('Bấm để phóng to mã và QR ↗')));
      const copyCode = button(t('Sao chép mã'), run(async () => { await copyText(snapshot.joinCode); copyCode.textContent = t('Đã sao chép mã'); notice(t('Đã sao chép mã lớp.')); }));
      codeRow.append(codeButton, copyCode); host.append(codeRow);
    }
    const invite = joinLink(snapshot.inviteCode), inviteCard = el('div', 'share-invite-card'), qr = el('canvas', 'share-qr');
    qr.setAttribute('role', 'img'); qr.setAttribute('aria-label', t('Mã QR tham gia {name}', {name: snapshot.name}));
    const details = el('div', 'share-invite-details');
    details.append(el('strong', '', t('Quét mã để tham gia')));
    const field = el('input', 'share-link-field'); field.readOnly = true; field.value = invite; field.setAttribute('aria-label', t('Link mời của lớp'));
    field.addEventListener('focus', () => field.select());
    const copy = button(t('Sao chép link mời'), run(async () => { await copyText(invite); notice(t('Đã sao chép link mời.')); }), 'primary-btn');
    const open = el('a', 'secondary-btn', t('Mở trang tham gia')); open.href = invite; open.target = '_blank'; open.rel = 'noopener';
    const links = el('div', 'share-link-actions'); links.append(copy, open);
    details.append(field, links, el('p', 'share-hint', t('Chỉ link mời được hiển thị trong QR. Mỗi người có link chỉnh sửa riêng.')));
    inviteCard.append(qr, details); host.append(inviteCard);
    drawQR(qr, invite).catch(() => { qr.hidden = true; });
    const controls = el('div', 'share-controls');
    for (const [property, label] of [['registrationOpen', t('Cho phép đăng ký mới')]]) {
      const wrap = el('label', 'share-toggle'), input = el('input'); input.type = 'checkbox'; input.checked = !!snapshot[property];
      input.addEventListener('change', run(async () => { input.disabled = true; try { await mutate('', 'PATCH', {[property]: input.checked}); } catch (error) { input.checked = !input.checked; throw error; } finally { input.disabled = false; } }));
      wrap.append(input, el('span', '', label)); controls.append(wrap);
    }
    host.append(controls);
    const tools = el('div', 'share-tools');
    tools.append(button(t('Đổi link mời'), () => confirmAction(t('Đổi link mời?'), t('Link và QR cũ sẽ không nhận đăng ký mới nữa. Mã lớp giữ nguyên; các nhân vật đã nhận vẫn chỉnh sửa được bằng link riêng.'), t('Đổi link mời'), () => mutate('/invite', 'POST', {})), 'text-btn'));
    if(cloud.ownerToken)tools.append(button(t('Lưu link quản trị riêng'), () => secretDialog(t('Link quản trị · Giữ riêng'), t('Link này mở toàn quyền quản lý lớp trên thiết bị khác. Không gửi cho học sinh hoặc đưa vào QR công khai.'), `${location.origin}${APP_BASE}/#class=${encodeURIComponent(cloud.id)}&owner=${encodeURIComponent(cloud.ownerToken)}`), 'text-btn'));
    host.append(tools);
    const joined = snapshot.students.filter(person => person.claimed);
    const newcomers = el('section', 'share-newcomers');
    const newcomerHeading = el('div', 'share-newcomers-heading');
    const newcomerTitle = el('h4', '', t('Mới tham gia')); newcomerTitle.id = 'shareNewcomersTitle';
    newcomers.setAttribute('aria-labelledby', newcomerTitle.id);
    const joinedBadge = el('span', 'share-joined-count', t('{count} bạn đã tham gia', {count: new Intl.NumberFormat(locale).format(joined.length)}));
    joinedBadge.dataset.empty = String(joined.length === 0);
    newcomerHeading.append(newcomerTitle, joinedBadge); newcomers.append(newcomerHeading);
    if (joined.length) {
      newcomers.append(el('p', 'share-hint', t('Nhân vật được thêm vào lớp ngay khi gửi thông tin. Mỗi người có thể tự chỉnh sửa bằng link riêng.')));
      const requests = el('ul', 'share-student-list share-newcomer-list');
      joined.forEach(person => requests.append(studentRow(person)));
      newcomers.append(requests);
    } else {
      newcomers.append(el('p', 'share-newcomers-empty', t('Chưa có ai tham gia bằng mã lớp. Gửi mã hoặc QR để mọi người tự tạo nhân vật và tham gia lớp.')));
    }
    host.append(newcomers);
    const manual = snapshot.students.filter(person => !person.claimed);
    const members = el('details', 'share-members'); members.open = expanded;
    const summary = el('summary', '', t('Quản lý danh sách nhập tay · {count} bạn', {count: new Intl.NumberFormat(locale).format(manual.length)}));
    const list = el('ul', 'share-student-list');
    manual.forEach(person => list.append(studentRow(person)));
    if (!manual.length) list.append(el('li', 'share-hint', t('Không có nhân vật nhập tay chưa được nhận. Bạn có thể thêm danh sách ở phần trên.')));
    members.append(summary, list); host.append(members);
  }
  function refresh() {
    if (stopped) return;
    const nextKey = key();
    if (nextKey !== classKey) {
      dialogs.forEach(dialog=>dialog.close());
      codeDisplay?.dialog.close();
      studentCardDisplay?.dialog.close();
      classKey = nextKey; snapshot = null; queued = null; lastPaint = ''; generation++; online = true;
    }
    paint(); updateStatus();
    return poll({force: true});
  }
  function flush() {
    if (queued && !adapter.isRunning()) { const next = queued; queued = null; adapter.onSnapshot(next); updateStatus(); }
    updateStudentCardDisplay();
  }
  const timer = setInterval(() => { if (key() !== classKey) refresh(); else poll(); }, 3000);
  const visibility = () => { if (!document.hidden) poll(); };
  document.addEventListener('visibilitychange', visibility);
  refresh();
  return {
    refresh, flush, ensureShared, showCode, showClassCode, showStudentCard, getSnapshot: () => snapshot, isMutating: () => mutationBusy || !!studentCardOpening || !!studentCardDisplay?.loading,
    saveRoster: (students, expectedRevision) => mutate('/roster', 'PUT', {students: rosterPayload(students)}, {expectedRevision}).then(result => result.class || result),
    rename: name => mutate('', 'PATCH', {name}).then(result => result.class || result),
    setExpectedSize: expectedSize => mutate('', 'PATCH', {expectedSize}).then(result => result.class || result),
    setEnvironment: (environmentTheme,environmentNames) => mutate('', 'PATCH', {environmentTheme,environmentNames}).then(result => result.class || result),
    stop() { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', visibility); dialogs.forEach(dialog => dialog.close()); }
  };
}
