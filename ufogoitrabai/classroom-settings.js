import { t } from './i18n.js';

/** Move the existing editors into a class list and three detail tabs. */
export function createClassroomSettings({
  dialog, getClassrooms, getActiveId, onSelect, onCreate, onTab, onDelete,
  isDisabled = () => false, onClose = () => {}, onAccount, getAccountStatus, onConfirm,
}) {
  const document = dialog.ownerDocument;
  const find = selector => dialog.querySelector(selector);
  const manager = find('.classroom-manager'), roster = find('#editorForm'), sharing = find('#shareSettingsHost');
  const environment = find('#environmentSettingsPanel'), oldClassPanel = find('#classSettingsPanel'), oldTabs = find('.settings-tabs');
  if (!manager || !roster || !sharing || !environment || !oldClassPanel || !oldTabs) throw new TypeError('The existing classroom editors are required');
  const make = (tag, className, text) => {
    const node = document.createElement(tag); if (className) node.className = className;
    if (text !== undefined) node.textContent = text; return node;
  };
  const button = (className, text) => { const node = make('button', className, text); node.type = 'button'; return node; };
  const rooms = () => (getClassrooms() || []).filter(room => room && typeof room.id === 'string' && typeof room.name === 'string');
  let view = 'list', activeTab = 'name', selecting = false, deleting = false, confirming = false, deletion = null, intent = 0;
  const disabled = () => selecting || deleting || confirming || Boolean(isDisabled());
  const shell = make('section', 'classroom-settings-shell'); shell.id = 'classroomSettingsShell';
  const listView = make('div', 'classroom-settings-list-view'); listView.id = 'classroomSettingsListView';
  const listHeading = make('div', 'classroom-settings-list-heading');
  const intro = make('div'); intro.append(make('h3', '', t('Các lớp của bạn')), make('p', '', t('Chọn lớp để chỉnh sửa tên, bối cảnh, danh sách và mã lớp.')));
  const create = button('secondary-btn classroom-settings-create', t('Tạo lớp mới')); create.id = 'settingsCreateClassroomBtn';
  const accountButton=button('text-btn',t('Tài khoản'));accountButton.id='settingsAccountBtn';accountButton.hidden=!onAccount;accountButton.addEventListener('click',()=>onAccount?.());
  const listActions = make('div', 'classroom-settings-list-actions');
  const edit = find('#editClassroomBtn');
  if (edit) listActions.append(edit);
  listActions.append(accountButton, create); listHeading.append(intro, listActions);
  const classList = make('div', 'classroom-settings-class-list'); classList.id = 'settingsClassroomList';
  const empty = make('p', 'classroom-settings-empty', t('Chưa có lớp nào.')); empty.hidden = true;
  const error = make('p', 'form-error'); error.hidden = true; error.setAttribute('role', 'alert');
  listView.append(listHeading, classList, empty, error);

  const details = make('div', 'classroom-settings-details'); details.id = 'classroomSettingsDetails'; details.hidden = true;
  const detailHeading = make('div', 'classroom-settings-detail-heading');
  const back = button('text-btn classroom-settings-back', t('Danh sách lớp')); back.id = 'settingsBackToClasses';
  const backIcon = make('span', 'classroom-settings-back-icon', '←'); backIcon.setAttribute('aria-hidden', 'true'); back.prepend(backIcon);
  const classroomTitle = make('h3', 'classroom-settings-current-name'); classroomTitle.id = 'settingsCurrentClassroomName';
  detailHeading.append(back, classroomTitle);
  const tabList = make('div', 'classroom-detail-tabs'); tabList.setAttribute('role', 'tablist'); tabList.setAttribute('aria-label', t('Chỉnh sửa lớp'));
  const namePanel = make('section', 'classroom-settings-panel'); namePanel.id = 'classroomSettingsNamePanel';
  const rosterPanel = make('section', 'classroom-settings-panel'); rosterPanel.id = 'classroomSettingsRosterPanel';
  const panels = { name: namePanel, environment, roster: rosterPanel }, tabs = new Map();
  for (const [key, title] of [['name', 'Tên lớp'], ['environment', 'Bối cảnh'], ['roster', 'Danh sách và mã lớp']]) {
    const tab = button('classroom-detail-tab', t(title)); tab.id = `classroomDetailTab-${key}`;
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', panels[key].id); tab.setAttribute('aria-selected', 'false'); tab.tabIndex = -1;
    panels[key].setAttribute('role', 'tabpanel'); panels[key].setAttribute('aria-labelledby', tab.id); panels[key].hidden = true;
    panels[key].classList.add('classroom-settings-panel');
    tab.addEventListener('click', () => { if (!disabled()) showTab(key); });
    tab.addEventListener('keydown', event => {
      if (disabled() || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const keys = [...tabs.keys()], index = keys.indexOf(key);
      const next = event.key === 'Home' ? keys[0] : event.key === 'End' ? keys.at(-1) : keys[(index + (event.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
      showTab(next); tabs.get(next).focus({ preventScroll: true });
    });
    tabs.set(key, tab); tabList.append(tab);
  }
  namePanel.append(manager); rosterPanel.append(roster, sharing);
  const nameForm = manager.querySelector('#classroomNameForm'); if (nameForm) manager.prepend(nameForm);
  for (const node of manager.querySelectorAll('.classroom-picker, label[for="classroomSelect"], #classroomHint')) node.hidden = true;
  details.append(detailHeading, tabList, namePanel, environment, rosterPanel);
  const confirmActions=make('div','classroom-settings-confirm-actions');
  const confirmError=make('p','form-error');confirmError.hidden=true;confirmError.setAttribute('role','alert');
  const confirm=button('primary-btn','OK');confirm.id='classroomSettingsOK';
  confirmActions.append(confirmError,confirm);details.append(confirmActions);
  confirm.addEventListener('click',async()=>{
    if(disabled())return;
    confirming=true;confirmError.hidden=true;refresh();confirm.setAttribute('aria-busy','true');
    try{if(await onConfirm?.()!==false)dialog.close();}
    catch(problem){confirmError.textContent=problem?.message||t('Có lỗi xảy ra. Hãy thử lại.');confirmError.hidden=false;}
    finally{confirming=false;confirm.setAttribute('aria-busy','false');refresh();}
  });
  shell.append(listView, details); dialog.insertBefore(shell, oldTabs);
  const analytics = oldClassPanel.querySelector('.analytics-settings-row'); if (analytics) shell.append(analytics);
  oldTabs.hidden = true; oldClassPanel.hidden = true; dialog.classList.add('classroom-settings-dialog');

  const apply = button('primary-btn', t('Áp dụng')); apply.id = 'applyEnvironmentBtn';
  let environmentActions = environment.querySelector('.dialog-actions');
  if (!environmentActions) { environmentActions = make('div', 'dialog-actions'); environment.append(environmentActions); }
  for (const close of environmentActions.querySelectorAll('[data-close]')) { close.classList.remove('primary-btn'); close.classList.add('secondary-btn'); }
  environmentActions.append(apply);
  const rows = new Map();

  const deleteDialog = make('dialog', 'classroom-delete-dialog'); deleteDialog.id = 'classroomDeleteDialog';
  deleteDialog.setAttribute('role', 'alertdialog'); deleteDialog.setAttribute('aria-labelledby', 'classroomDeleteTitle');
  deleteDialog.setAttribute('aria-describedby', 'classroomDeleteDescription');
  const deleteTitle = make('h2'); deleteTitle.id = 'classroomDeleteTitle';
  const deleteDescription = make('p'); deleteDescription.id = 'classroomDeleteDescription';
  const deleteReplacement = make('p', 'classroom-delete-note', t('Một lớp trống mới sẽ được tạo sau khi xóa lớp cuối cùng này.'));
  deleteReplacement.id = 'classroomDeleteReplacement'; deleteReplacement.hidden = true;
  const deleteError = make('p', 'form-error'); deleteError.hidden = true; deleteError.setAttribute('role', 'alert');
  const deleteActions = make('div', 'dialog-actions');
  const keepButton = button('secondary-btn', t('Giữ lại')); keepButton.id = 'classroomDeleteCancel';
  const deleteButton = button('primary-btn classroom-delete-confirm', t('Xóa lớp')); deleteButton.id = 'classroomDeleteConfirm';
  deleteActions.append(keepButton, deleteButton); deleteDialog.append(deleteTitle, deleteDescription, deleteReplacement, deleteError, deleteActions);
  document.body.append(deleteDialog);

  function requestDelete(id, trigger) {
    const room = rooms().find(item => item.id === id);
    if (!room || disabled() || typeof onDelete !== 'function' || deleteDialog.open) return;
    deletion = { id, trigger }; deleteError.hidden = true;
    deleteTitle.textContent = t('Xóa lớp “{name}”?', { name: room.name });
    deleteDescription.textContent = t(room.cloud
      ? 'Lớp, hồ sơ học sinh và lịch sử điểm danh sẽ bị xóa trên đám mây và trình duyệt này. Mã lớp, QR và các link của lớp sẽ ngừng hoạt động. Không thể hoàn tác.'
      : 'Lớp, danh sách và lịch sử đã lưu trên trình duyệt này sẽ bị xóa. Không thể hoàn tác.');
    deleteReplacement.hidden = rooms().length !== 1;
    deleteDialog.setAttribute('aria-describedby', 'classroomDeleteDescription' + (deleteReplacement.hidden ? '' : ' classroomDeleteReplacement'));
    refresh(); deleteDialog.showModal(); keepButton.focus({ preventScroll: true });
  }
  function cancelDelete() { if (!deleting) deleteDialog.close(); }
  keepButton.addEventListener('click', cancelDelete);
  deleteDialog.addEventListener('cancel', event => { event.preventDefault(); });
  deleteDialog.addEventListener('close', () => {
    const trigger = deletion?.trigger; deletion = null;
    if (dialog.open) (trigger?.isConnected && !trigger.disabled ? trigger : classList.querySelector('button:not(:disabled)') || create).focus({ preventScroll: true });
  });
  deleteButton.addEventListener('click', async () => {
    if (!deletion || disabled() || typeof onDelete !== 'function') return;
    const id = deletion.id;
    if (!rooms().some(room => room.id === id)) { cancelDelete(); return; }
    deleting = true; deleteError.hidden = true; refresh();
    try {
      await onDelete(id);
      deleting = false; refresh(); deleteDialog.close();
    } catch (problem) {
      deleteError.textContent = problem?.message || t('Chưa xóa được lớp. Hãy thử lại.'); deleteError.hidden = false;
    } finally { deleting = false; refresh(); }
  });

  function showTab(key = 'name') {
    if (!panels[key]) key = 'name'; activeTab = key;
    for (const [name, tab] of tabs) {
      const selected = name === key; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
      tab.classList.toggle('active', selected); panels[name].hidden = !selected;
    }
    onTab?.(key);
  }
  function refresh() {
    const choices = rooms(), activeId = getActiveId(), blocked = disabled(), seen = new Set();
    classroomTitle.textContent = choices.find(room => room.id === activeId)?.name || t('Lớp học');
    create.disabled = blocked; back.disabled = blocked; apply.disabled = blocked; confirm.disabled = blocked;
    if (edit) edit.disabled = blocked || !choices.some(room => room.id === activeId);
    keepButton.disabled = deleting; deleteButton.disabled = blocked;
    deleteButton.textContent = t(deleting ? 'Đang xóa lớp…' : 'Xóa lớp');
    deleteDialog.setAttribute('aria-busy', String(deleting));
    for (const tab of tabs.values()) tab.disabled = blocked;
    let position = 0;
    for (const room of choices) {
      if (seen.has(room.id)) continue; seen.add(room.id);
      let row = rows.get(room.id);
      if (!row) {
        const wrapper = make('div', 'classroom-settings-class-row');
        const item = button('classroom-settings-class', ''), content = make('span', 'classroom-settings-class-content');
        const name = make('strong'), meta = make('span', 'classroom-settings-class-meta'); content.append(name, meta);
        const current = make('span', 'classroom-settings-active', t('Lớp đang dùng'));
        const chevron = make('span', 'classroom-settings-class-arrow', '›'); chevron.setAttribute('aria-hidden', 'true');
        item.append(content, current, chevron); item.setAttribute('data-classroom-id', room.id);
        const remove = button('classroom-settings-delete', '');
        remove.setAttribute('data-delete-classroom', room.id); remove.setAttribute('aria-haspopup', 'dialog');
        remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg>';
        remove.addEventListener('click', () => requestDelete(room.id, remove));
        wrapper.append(item, remove);
        item.addEventListener('click', async () => {
          if (disabled() || !rooms().some(candidate => candidate.id === room.id)) return;
          const selectionIntent = ++intent;
          selecting = true; error.hidden = true; refresh();
          try {
            const accepted = room.id === getActiveId() ? true : await onSelect(room.id);
            selecting = false;
            if (accepted !== false && dialog.open && selectionIntent === intent) openDetails('name');
          } catch (problem) { error.textContent = problem?.message || t('Chưa mở được lớp. Hãy thử lại.'); error.hidden = false; }
          finally { selecting = false; refresh(); }
        });
        row = { wrapper, item, remove, name, meta, current }; rows.set(room.id, row);
      }
      row.name.textContent = room.name; row.meta.textContent = t('{count} bạn', { count: room.state?.students?.length || 0 })+(getAccountStatus?' · '+getAccountStatus(room).label:'');
      row.current.hidden = room.id !== activeId; row.item.disabled = blocked;
      row.remove.hidden = typeof onDelete !== 'function'; row.remove.disabled = blocked;
      row.remove.setAttribute('aria-label', t('Xóa lớp {name}', { name: room.name })); row.remove.title = t('Xóa lớp');
      row.item.setAttribute('aria-current', String(room.id === activeId));
      if (classList.children[position] !== row.wrapper) classList.insertBefore(row.wrapper, classList.children[position] || null);
      position++;
    }
    for (const [id, row] of rows) if (!seen.has(id)) { row.wrapper.remove(); rows.delete(id); }
    empty.hidden = choices.length !== 0;
    if (deleteDialog.open && deletion && !deleting && !choices.some(room => room.id === deletion.id)) deleteDialog.close();
  }
  function openList() {
    intent++; view = 'list'; listView.hidden = false; details.hidden = true; refresh();
    if (!dialog.open) dialog.showModal();
    (classList.querySelector('button:not(:disabled)') || create).focus({ preventScroll: true });
  }
  function openDetails(tab = 'name') {
    intent++; view = 'details'; listView.hidden = true; details.hidden = false; refresh(); showTab(tab);
    if (!dialog.open) dialog.showModal();
    tabs.get(activeTab).focus({ preventScroll: true });
  }
  back.addEventListener('click', () => { if (!disabled()) openList(); });
  create.addEventListener('click', () => { if (!disabled()) onCreate(); });
  dialog.addEventListener('close', () => { intent++; error.hidden = true; if (!deleting) deleteDialog.close(); onClose(); });
  refresh();
  return { openList, openDetails, refresh, showTab, isBusy: () => selecting || deleting, get view() { return view; }, get activeTab() { return activeTab; } };
}
