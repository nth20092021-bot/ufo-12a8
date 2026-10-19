import { t } from './i18n.js';

/** Classroom choices share the app's action-menu controller and native actions. */
export function createClassroomSwitcher({
  button, panel, list, createButton, getClassrooms, getActiveId, onSelect, onCreate, onEdit, onCode,
  isDisabled = () => false, canCreate = () => true,
}) {
  if (!button || !panel || !list || !createButton) throw new TypeError('Classroom switcher elements are required');
  const document = button.ownerDocument;
  const label = button.querySelector('#activeClassroomName');
  if (!label) throw new TypeError('The current classroom label is required');
  const rows = new Map(); let destroyed = false;
  const initialLabel = label.textContent, initialTitle = button.getAttribute('title'), initialAria = button.getAttribute('aria-label');
  const initialListRole = list.getAttribute('role'), initialListLabel = list.getAttribute('aria-label');
  const restore = (element, key, value) => value === null ? element.removeAttribute(key) : element.setAttribute(key, value);
  const rooms = () => (getClassrooms() || []).filter(room => room && typeof room.id === 'string' && typeof room.name === 'string');
  const blocked = () => destroyed || Boolean(isDisabled()) || button.disabled || button.inert || Boolean(button.closest('[inert]'));
  list.setAttribute('role', 'group'); list.setAttribute('aria-label', t('Lớp học'));

  function makeRow(room) {
    const container = document.createElement('div'); container.className = 'classroom-choice-row'; container.setAttribute('role', 'none');
    const item = document.createElement('button'); item.type = 'button';
    item.className = 'action-menu-item classroom-choice'; item.setAttribute('role', 'menuitemradio');
    item.setAttribute('data-classroom-id', room.id); item.setAttribute('tabindex', '-1');
    const name = document.createElement('span'); name.className = 'classroom-choice-name';
    const check = document.createElement('span'); check.className = 'classroom-choice-check'; check.textContent = '✓'; check.setAttribute('aria-hidden', 'true');
    item.append(name, check);
    const code = document.createElement('button'); code.type = 'button'; code.className = 'action-menu-item classroom-choice-code';
    code.setAttribute('role', 'menuitem'); code.setAttribute('tabindex', '-1'); code.setAttribute('aria-haspopup', 'dialog'); code.setAttribute('data-code-classroom-id', room.id);
    const codeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); codeIcon.setAttribute('class', 'icon'); codeIcon.setAttribute('aria-hidden', 'true');
    const codeUse = document.createElementNS('http://www.w3.org/2000/svg', 'use'); codeUse.setAttribute('href', '#i-qr'); codeIcon.append(codeUse); code.append(codeIcon);
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'action-menu-item classroom-choice-edit';
    edit.setAttribute('role', 'menuitem'); edit.setAttribute('tabindex', '-1'); edit.setAttribute('aria-haspopup', 'dialog'); edit.setAttribute('data-edit-classroom-id', room.id);
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('class', 'icon'); icon.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#i-edit'); icon.append(use); edit.append(icon);
    container.append(item, code, edit);
    const activate = () => {
      // Recheck live state even for a queued/programmatic click. A menu opened
      // before a draw or async write must not switch the room underneath it.
      if (blocked() || item.disabled || room.id === getActiveId() || !rooms().some(candidate => candidate.id === room.id)) return;
      onSelect(room.id); refresh();
    };
    const editRoom = () => {
      if (blocked() || edit.disabled || !rooms().some(candidate => candidate.id === room.id)) return;
      onEdit?.(room.id); refresh();
    };
    const showCode = () => {
      if (blocked() || code.disabled || !rooms().some(candidate => candidate.id === room.id)) return;
      onCode?.(room.id); refresh();
    };
    item.addEventListener('click', activate);
    edit.addEventListener('click', editRoom);
    code.addEventListener('click', showCode);
    return { container, item, name, edit, code, activate, editRoom, showCode };
  }
  function refresh() {
    if (destroyed) return;
    const choices = rooms(), activeId = getActiveId(), active = choices.find(room => room.id === activeId);
    const disabled = Boolean(isDisabled()); button.disabled = disabled;
    const name = active?.name || t('Lớp học');
    label.textContent = name; button.setAttribute('title', name); button.setAttribute('aria-label', t('Đang dùng {name}.', { name }));
    createButton.disabled = disabled || !canCreate();
    const seen = new Set(); let position = 0;
    for (const room of choices) {
      if (seen.has(room.id)) continue;
      seen.add(room.id);
      const row = rows.get(room.id) || makeRow(room); rows.set(room.id, row);
      row.name.textContent = room.name; row.item.disabled = disabled;
      row.edit.disabled = disabled || typeof onEdit !== 'function';
      row.code.disabled = disabled || typeof onCode !== 'function';
      const editLabel = `${t('Chỉnh sửa lớp')}: ${room.name}`;
      row.edit.setAttribute('aria-label', editLabel); row.edit.setAttribute('title', editLabel);
      const codeLabel = `${t('Mã lớp')}: ${room.name}`;
      row.code.setAttribute('aria-label', codeLabel); row.code.setAttribute('title', codeLabel);
      row.item.setAttribute('aria-checked', String(room.id === activeId));
      if (list.children[position] !== row.container) list.insertBefore(row.container, list.children[position] || null);
      position++;
    }
    for (const [id, row] of rows) if (!seen.has(id)) {
      row.item.removeEventListener('click', row.activate); row.edit.removeEventListener('click', row.editRoom); row.code.removeEventListener('click', row.showCode); row.container.remove(); rows.delete(id);
    }
  }
  function create() {
    if (blocked() || createButton.disabled || !canCreate()) return;
    onCreate();
  }
  createButton.addEventListener('click', create);
  refresh();
  return {
    refresh,
    destroy() {
      if (destroyed) return; destroyed = true;
      createButton.removeEventListener('click', create);
      for (const row of rows.values()) { row.item.removeEventListener('click', row.activate); row.edit.removeEventListener('click', row.editRoom); row.code.removeEventListener('click', row.showCode); row.container.remove(); }
      rows.clear(); label.textContent = initialLabel;
      restore(button, 'title', initialTitle); restore(button, 'aria-label', initialAria);
      restore(list, 'role', initialListRole); restore(list, 'aria-label', initialListLabel);
    },
  };
}
