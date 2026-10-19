let menuSerial = 0;

/** Native action buttons/links keep their own listeners and default activation. */
export function setupActionMenus(pairs = []) {
  if (!pairs.length) return {closeAll() {}, refresh() {}, destroy() {}};
  const document = pairs[0].trigger.ownerDocument, window = document.defaultView;
  const removers = [], entries = [], itemAttributes = new Map();
  let active = null, destroyed = false, movingPanels = false;
  const remember = (node, names) => names.map(name => [name, node.getAttribute(name)]);
  const restore = (node, attributes) => attributes.forEach(([name, value]) => value === null ? node.removeAttribute(name) : node.setAttribute(name, value));
  const listen = (node, type, callback, options) => {
    node.addEventListener(type, callback, options);
    removers.push(() => node.removeEventListener(type, callback, options));
  };
  function unavailable(node) {
    if (!node?.isConnected || node.disabled || node.hidden || node.inert || node.getAttribute('aria-disabled') === 'true') return true;
    if (node.closest('[hidden], [inert]') || node.matches(':disabled')) return true;
    const style = window.getComputedStyle(node);
    return style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || !node.getClientRects().length;
  }
  function syncItems(entry) {
    const items = [...entry.panel.querySelectorAll('button, a[href]')];
    for (const item of items) {
      if (!itemAttributes.has(item)) itemAttributes.set(item, remember(item, ['role', 'tabindex']));
      if (!['menuitemradio', 'menuitemcheckbox'].includes(item.getAttribute('role'))) item.setAttribute('role', 'menuitem');
      item.setAttribute('tabindex', '-1');
    }
    return items;
  }
  const enabledItems = entry => syncItems(entry).filter(item => !unavailable(item));
  function portal() {
    const parent = document.fullscreenElement || document.body, focused = document.activeElement;
    movingPanels = true;
    try { for (const entry of entries) if (entry.panel.parentNode !== parent) parent.append(entry.panel); }
    finally { movingPanels = false; }
    if (active?.panel.contains(focused) && !unavailable(focused)) focused.focus({preventScroll: true});
  }
  function closeAll({restoreFocus = false} = {}) {
    if (destroyed) return;
    const previous = active; active = null;
    for (const entry of entries) { entry.panel.hidden = true; entry.trigger.setAttribute('aria-expanded', 'false'); }
    if (restoreFocus && previous && !unavailable(previous.trigger)) previous.trigger.focus({preventScroll: true});
  }
  function place() {
    if (!active || destroyed) return;
    if (unavailable(active.trigger)) { closeAll(); return; }
    const {trigger, panel} = active, viewport = window.visualViewport;
    const padding = 8, gap = 7, leftEdge = (viewport?.offsetLeft || 0) + padding, topEdge = (viewport?.offsetTop || 0) + padding;
    const rightEdge = (viewport?.offsetLeft || 0) + (viewport?.width || window.innerWidth) - padding;
    const bottomEdge = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight) - padding;
    const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)));
    panel.style.maxWidth = `${Math.max(0, rightEdge - leftEdge)}px`;
    panel.style.maxHeight = `${Math.max(0, bottomEdge - topEdge)}px`;
    const bounds = trigger.getBoundingClientRect(), wanted = panel.getBoundingClientRect();
    const below = Math.max(0, bottomEdge - bounds.bottom - gap), above = Math.max(0, bounds.top - topEdge - gap);
    const openBelow = below >= wanted.height || below >= above;
    panel.style.maxHeight = `${Math.max(0, Math.min(openBelow ? below : above, bottomEdge - topEdge))}px`;
    const size = panel.getBoundingClientRect();
    panel.style.left = `${clamp(bounds.right - size.width, leftEdge, rightEdge - size.width)}px`;
    panel.style.top = `${clamp(openBelow ? bounds.bottom + gap : bounds.top - gap - size.height, topEdge, bottomEdge - size.height)}px`;
  }
  function focusItem(entry, where = 'first') {
    const items = enabledItems(entry);
    (where === 'last' ? items.at(-1) : items[0])?.focus({preventScroll: true});
    if (!items.length) entry.panel.focus({preventScroll: true});
  }
  function open(entry, where = 'first') {
    if (destroyed || unavailable(entry.trigger)) return;
    closeAll(); active = entry;
    syncItems(entry); entry.panel.hidden = false; entry.trigger.setAttribute('aria-expanded', 'true');
    place();
    if (active === entry) focusItem(entry, where);
  }
  function keys(entry, event, fromTrigger = false) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (fromTrigger && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault(); open(entry, event.key === 'ArrowUp' ? 'last' : 'first'); return;
    }
    if (active !== entry) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeAll({restoreFocus: true}); return; }
    // Restore the trigger synchronously, then let native Tab move to the next
    // (or previous) control in its original document order, outside the portal.
    if (event.key === 'Tab') { closeAll({restoreFocus: true}); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = enabledItems(entry); if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (index + 1) % items.length : (index < 0 ? items.length - 1 : (index + items.length - 1) % items.length);
    items[next].focus({preventScroll: true});
  }
  for (const {trigger, panel} of pairs) {
    if (!trigger || !panel || trigger.ownerDocument !== document || panel.ownerDocument !== document) throw new Error('Các menu cần thuộc cùng một trang.');
    const entry = {trigger, panel, parent: panel.parentNode, next: panel.nextSibling,
      triggerAttributes: remember(trigger, ['aria-haspopup', 'aria-expanded', 'aria-controls']),
      panelAttributes: remember(panel, ['id', 'role', 'tabindex', 'style', 'hidden'])};
    entries.push(entry);
    if (!panel.id) panel.id = `actionMenu${++menuSerial}`;
    trigger.setAttribute('aria-haspopup', 'menu'); trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', panel.id);
    panel.setAttribute('role', 'menu'); panel.setAttribute('tabindex', '-1'); panel.hidden = true;
    panel.style.position = 'fixed'; panel.style.overflowY = 'auto';
    (document.fullscreenElement || document.body).append(panel); syncItems(entry);
    listen(trigger, 'click', event => { event.preventDefault(); if (active === entry) closeAll({restoreFocus: true}); else open(entry); });
    listen(trigger, 'keydown', event => keys(entry, event, true));
    listen(panel, 'keydown', event => keys(entry, event));
  }
  listen(document, 'pointerdown', event => {
    if (active && !active.panel.contains(event.target) && !active.trigger.contains(event.target)) closeAll();
  }, {capture: true, passive: true});
  // Document capture runs before the original item listener can open a modal.
  // Leave Enter/Space, modified link clicks, and native link targets untouched.
  listen(document, 'click', event => {
    if (!active || !active.panel.contains(event.target)) return;
    const item = event.target?.closest?.('button, a[href]');
    if (!item || !active.panel.contains(item)) return;
    if (unavailable(item)) { event.preventDefault(); event.stopPropagation(); return; }
    closeAll({restoreFocus: true});
  }, true);
  listen(document, 'focusin', event => {
    if (!movingPanels && active && !active.panel.contains(event.target) && !active.trigger.contains(event.target)) closeAll();
  });
  listen(document, 'fullscreenchange', () => { portal(); place(); });
  listen(window, 'resize', place, {passive: true});
  listen(window, 'scroll', place, {capture: true, passive: true});
  if (window.visualViewport) {
    listen(window.visualViewport, 'resize', place, {passive: true});
    listen(window.visualViewport, 'scroll', place, {passive: true});
  }
  function refresh() {
    if (destroyed) return;
    portal();
    entries.forEach(syncItems);
    if (!active) return;
    if (unavailable(active.trigger)) { closeAll(); return; }
    const focused = document.activeElement;
    if (active.panel.contains(focused) && focused !== active.panel && unavailable(focused)) focusItem(active);
    place();
  }
  return {
    closeAll, refresh,
    destroy() {
      if (destroyed) return;
      closeAll(); destroyed = true; removers.forEach(remove => remove());
      for (const [item, attributes] of itemAttributes) restore(item, attributes);
      for (const entry of entries) {
        restore(entry.trigger, entry.triggerAttributes); restore(entry.panel, entry.panelAttributes);
        if (entry.parent?.isConnected) entry.parent.insertBefore(entry.panel, entry.next?.parentNode === entry.parent ? entry.next : null);
      }
      itemAttributes.clear();
    },
  };
}
