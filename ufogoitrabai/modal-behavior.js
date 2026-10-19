// Dialogs keep drafts until an explicit button or completed action dismisses them.
// Capture also covers dialogs created later by profile, sharing and history UIs.
if (typeof document !== 'undefined') {
  // Block the native close request itself: repeated Escape can make a browser's
  // subsequent cancel event non-cancelable even if the first was prevented.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.querySelector('dialog[open]')) event.preventDefault();
  }, true);
  document.addEventListener('cancel', event => {
    if (event.target?.tagName === 'DIALOG') {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('click', event => {
    const dialog = event.target;
    if (dialog?.tagName !== 'DIALOG' || !dialog.open) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}
