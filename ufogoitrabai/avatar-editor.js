import {t, locale} from './i18n.js';
import { APPEARANCE_FIELDS, APPEARANCE_OPTIONS, sanitizeAppearance } from './appearance.js';
import { characterSeed, characterStyle } from './character-art.js';
import { drawCharacterPreview } from './scene.js';
import { cleanName } from './core.js';

let editorCount = 0;
const el = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

/** Mount inside the caller's form. Ownership and submission remain with the caller. */
export function createAvatarEditor(host, initialPerson = {}) {
  const prefix = `ufo-avatar-${++editorCount}`;
  const root = el('div', 'avatar-editor');
  const previewPane = el('div', 'avatar-editor-preview');
  const preview = el('canvas', 'avatar-editor-canvas');
  preview.width = 480; preview.height = 500;
  preview.setAttribute('role', 'img');
  const previewName = el('strong', 'avatar-editor-preview-name');
  const shuffle = el('button', 'avatar-editor-shuffle', t('🎲 Phối ngẫu nhiên'));
  shuffle.type = 'button';
  const hint = el('p', 'avatar-editor-hint', t('Đây là nhân vật của bạn. Bạn có thể đổi lại bất cứ lúc nào.'));
  previewPane.append(preview, previewName, shuffle, hint);
  const fields = el('div', 'avatar-editor-fields');
  const controls = new Map();
  const chips = new Map();
  const createField = (key, title, input) => {
    const wrapper = el('div', `avatar-editor-field avatar-editor-field-${key}`);
    const label = el('label', '', title);
    input.id = `${prefix}-${key}`;
    label.htmlFor = input.id;
    wrapper.append(label, input); fields.append(wrapper);
    return wrapper;
  };
  const name = el('input');
  name.type = 'text'; name.maxLength = 80; name.required = true;
  name.autocomplete = 'name'; name.placeholder = t('Họ và tên của bạn');
  createField('name', t('Họ và tên'), name);
  const gender = el('select');
  for (const [value, label] of [['male', t('Nam')], ['female', t('Nữ')], ['other', t('Khác')]]) {
    const option = el('option', '', label); option.value = value; gender.append(option);
  }
  createField('gender', t('Giới tính'), gender);
  for (const field of APPEARANCE_FIELDS) {
    const select = el('select');
    APPEARANCE_OPTIONS[field.key].forEach((value, index) => {
      const option = el('option', '', t(field.labels[index])); option.value = String(index); select.append(option);
    });
    const wrapper = createField(field.key, t(field.label), select);
    if (field.color) {
      const chip = el('canvas', 'avatar-editor-color'); chip.width = 24; chip.height = 24;
      chip.setAttribute('aria-hidden', 'true'); wrapper.append(chip); chips.set(field.key, chip);
    }
    controls.set(field.key, select);
  }
  root.append(previewPane, fields); host.append(root);
  let model = {}, destroyed = false;

  function paint() {
    if (destroyed) return;
    model.name = cleanName(name.value);
    model.gender = gender.value;
    model.appearance = {};
    for (const [key, select] of controls) {
      const value = APPEARANCE_OPTIONS[key][Number(select.value)];
      model.appearance[key] = value;
      const c = chips.get(key)?.getContext('2d');
      if (c) { c.clearRect(0, 0, 24, 24); c.fillStyle = value; c.fillRect(0, 0, 24, 24); }
    }
    previewName.textContent = model.name || t('Nhân vật của bạn');
    preview.setAttribute('aria-label', t('Xem trước nhân vật {name}', {name: model.name || t('của bạn')}));
    drawCharacterPreview(preview, model);
  }
  function setValue(person = {}) {
    if (destroyed) return;
    model = {
      id: typeof person.id === 'string' && person.id ? person.id : (model.id || crypto.randomUUID()),
      name: cleanName(person.name),
      gender: ['male', 'female', 'other'].includes(person.gender) ? person.gender : 'male',
      appearance: sanitizeAppearance(person.appearance),
    };
    const style = characterStyle({ ...model, seed: characterSeed(model.id) });
    name.value = model.name; gender.value = model.gender;
    for (const [key, select] of controls) select.value = String(APPEARANCE_OPTIONS[key].indexOf(style[key]));
    paint();
  }
  function randomize() {
    const values = new Uint32Array(controls.size); crypto.getRandomValues(values);
    let i = 0;
    for (const [key, select] of controls) select.value = String(values[i++] % APPEARANCE_OPTIONS[key].length);
    paint();
    // The enclosing profile form must track this just like a manual selection.
    root.dispatchEvent(new Event('input', { bubbles: true }));
  }
  root.addEventListener('input', paint);
  root.addEventListener('change', paint);
  shuffle.addEventListener('click', randomize);
  setValue(initialPerson);
  return {
    getValue() { return { name: cleanName(name.value), gender: gender.value, appearance: sanitizeAppearance(model.appearance) }; },
    setValue,
    destroy() {
      destroyed = true;
      root.removeEventListener('input', paint); root.removeEventListener('change', paint);
      shuffle.removeEventListener('click', randomize); root.remove();
    },
  };
}
