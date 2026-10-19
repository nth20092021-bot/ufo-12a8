import {apiRequest} from './api-client.js';
import {t, language} from './i18n.js';
import './modal-behavior.js';

let googleScript;
function loadGoogleIdentity() {
  if (globalThis.google?.accounts?.id) return Promise.resolve(globalThis.google.accounts.id);
  if (!googleScript) googleScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client'; script.referrerPolicy='origin';script.async = true; script.defer = true;
    script.onload = () => globalThis.google?.accounts?.id ? resolve(globalThis.google.accounts.id) : reject(new Error(t('Chưa tải được nút Google. Hãy thử lại.')));
    script.onerror = () => { script.remove(); googleScript = null; reject(new Error(t('Chưa tải được nút Google. Hãy thử lại.'))); };
    document.head.append(script);
  });
  return googleScript;
}
function element(tag, className, text) {
  const node = document.createElement(tag); if (className) node.className = className;
  if (text !== undefined) node.textContent = text; return node;
}

/** Identity is held only in memory; the server owns the HttpOnly session cookie. */
export function createAccountController(adapter = {}) {
  let account = null, busy = false, renderGeneration = 0, contentRenderer = adapter.renderContent, sessionError = '';
  const subscribers = new Set(), prompts = new Set();
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ufo-account-session') : null;
  let sessionRefresh, lastSessionCheck=0,identityEpoch=0,sessionVerified=false, pendingEntry=null;
  const dialog = element('dialog', 'account-dialog'); dialog.id = 'accountDialog'; dialog.setAttribute('closedby', 'none'); dialog.setAttribute('aria-labelledby', 'accountTitle');
  const header = element('div', 'account-header'), title = element('h2', '', t('Tài khoản')); title.id = 'accountTitle';
  const closeButton = element('button', 'icon-btn', '×'); closeButton.type = 'button'; closeButton.setAttribute('aria-label', t('Đóng'));
  header.append(title, closeButton);
  const body = element('div', 'account-body'), status = element('p', 'account-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const privacy=element('a','account-privacy',t('Thông tin lưu dữ liệu'));privacy.href='./privacy.html';privacy.target='_blank';privacy.rel='noopener noreferrer';
  dialog.append(header, body, status, privacy); document.body.append(dialog);
  const setStatus = (message = '', error = false) => { status.textContent = message; status.dataset.error = String(error); };
  closeButton.addEventListener('click', () => { if (!busy) close(); });
  dialog.addEventListener('cancel', event => event.preventDefault());
  function updatePrompts() {
    for (const {host, options} of prompts) {
      host.replaceChildren(); host.classList.add('account-save-prompt');
      host.hidden=!!account;
      if(account)continue;
      const copy = element('p', '', t((typeof options.message==='function'?options.message(account):options.message) || (options.role === 'teacher' ? 'Lưu lớp để mở lại trên thiết bị khác.' : 'Lưu nhân vật để lần sau dùng lại.')));
      const button = element('button', 'secondary-btn account-prompt-button', t(options.actionLabel || 'Đăng nhập bằng Google')); button.type = 'button';
      button.addEventListener('click', () => options.onAction ? options.onAction(controller) : open());
      host.append(copy, button);
    }
  }
  async function publish(next) {
    const previous = account; identityEpoch++;sessionVerified=true;account = next || null; updatePrompts();
    await adapter.onChange?.(account, previous);
    for (const callback of subscribers) await callback(account, previous);
  }
  function setBusy(value) { busy = value; closeButton.disabled = value; const skip=body.querySelector('.account-skip');if(skip)skip.disabled=value;dialog.setAttribute('aria-busy', String(value)); }
  async function render() {
    const generation = ++renderGeneration; body.replaceChildren(); setStatus();updatePrompts();
    dialog.classList.toggle('account-entry-dialog',!!pendingEntry);
    title.textContent=t(pendingEntry?(pendingEntry.intent==='create'?'Tạo lớp mới':'Tham gia lớp'):'Tài khoản');
    if (account) {
      const identity = element('div', 'account-identity'); identity.append(element('strong', '', account.name || t('Tài khoản Google')), element('span', '', account.email || ''));
      body.append(identity);
      if (contentRenderer) {
        const content = element('div', 'account-content'); body.append(content);
        try { await contentRenderer(content, {account, refresh: render}); }
        catch (error) { if (generation === renderGeneration) setStatus(error.message, true); }
      }
      if (generation !== renderGeneration) return;
      const logout = element('button', 'text-btn account-logout', t('Đăng xuất')); logout.type = 'button'; logout.addEventListener('click', signOut); body.append(logout);
      return;
    }
    body.append(element('p', 'account-description', t(pendingEntry
      ? (pendingEntry.intent==='create'?'Chọn cách tiếp tục. Google giúp bạn lưu lớp và mở lại trên thiết bị khác.':'Chọn cách tiếp tục. Google giúp bạn lưu nhân vật và dùng lại khi vào lớp.')
      : 'Dùng Google để lưu và mở lại dữ liệu trên thiết bị khác. Bạn vẫn có thể tiếp tục không đăng nhập.')));
    const googleHost = element('div', 'account-google-button'); body.append(googleHost);
    const retry = element('button', 'secondary-btn account-retry', t('Thử lại')); retry.type = 'button'; retry.hidden = true; retry.addEventListener('click', render); body.append(retry);
    const skip = element('button', `${pendingEntry?'secondary-btn':'text-btn'} account-skip`, t('Tiếp tục mà không cần đăng nhập')); skip.type = 'button'; skip.addEventListener('click', () => close(pendingEntry?'guest':null)); body.append(skip);
    setStatus(t('Đang chuẩn bị đăng nhập Google…'));
    try {
      const config = await apiRequest('/auth/config');
      if (generation !== renderGeneration || !dialog.open) return;
      if (!config.enabled || !config.clientId) { setStatus(t('Đăng nhập Google đang được thiết lập. Bạn có thể tiếp tục không đăng nhập; dữ liệu hiện có vẫn được giữ.')); return; }
      const [google, challenge] = await Promise.all([loadGoogleIdentity(), apiRequest('/auth/challenge', {method: 'POST', body: {}})]);
      if (generation !== renderGeneration || !dialog.open) return;
      google.initialize({client_id: config.clientId, nonce: challenge.nonce, auto_select: false, cancel_on_tap_outside: false, use_fedcm_for_prompt: false,
        callback: async response => {
          if (busy || generation !== renderGeneration || !dialog.open || !response?.credential) return;
          try {
            if (await adapter.onBeforeLogin?.() === false) return;
            setBusy(true);identityEpoch++;setStatus(t('Đang lưu phiên đăng nhập…'));
            const result = await apiRequest('/auth/google', {method: 'POST', body: {credential: response.credential}});
            await publish(result.account); channel?.postMessage({type:'changed',accountId:account?.id||null});
            if(pendingEntry&&account){setBusy(false);close('account');}else await render();
          } catch (error) { setStatus(error.message || t('Chưa đăng nhập được. Dữ liệu đang nhập vẫn được giữ.'), true); retry.hidden = false; }
          finally { setBusy(false); }
        }});
      const width = Math.max(200, Math.min(340, Math.floor(body.getBoundingClientRect().width)));
      google.renderButton(googleHost, {type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width, locale: language});
      setStatus(sessionError); sessionError = '';
    } catch (error) { if (generation === renderGeneration) { setStatus(error.message, true); retry.hidden = false; } }
  }
  async function open() {
    await ready; if (await adapter.onBeforeLogin?.() === false) return;
    if(pendingEntry)close();
    if (!dialog.open) dialog.showModal(); await render();
  }
  /** Resolve the requested entry once: account, guest, or null when explicitly closed. */
  async function chooseEntry({intent='join'}={}) {
    await ready;
    if(account)return 'account';
    if(pendingEntry)return pendingEntry.promise;
    if(await adapter.onBeforeLogin?.()===false)return null;
    if(account)return 'account';
    if(pendingEntry)return pendingEntry.promise;
    let resolve;const promise=new Promise(done=>{resolve=done;});
    pendingEntry={intent:intent==='create'?'create':'join',resolve,promise};
    if(!dialog.open)dialog.showModal();
    render();return promise;
  }
  function close(result=null) {
    if (busy) return;renderGeneration++;globalThis.google?.accounts?.id?.cancel?.();
    const entry=pendingEntry;pendingEntry=null;
    if(dialog.open)dialog.close();
    entry?.resolve(result==='account'||result==='guest'?result:null);
  }
  async function signOut() {
    if (busy) return;
    try {
      if (await adapter.onBeforeLogout?.() === false) return;
      setBusy(true);identityEpoch++;setStatus(t('Đang đăng xuất…'));
      await apiRequest('/auth/logout', {method: 'POST', body: {}});
      globalThis.google?.accounts?.id?.disableAutoSelect?.();
      await publish(null); channel?.postMessage({type:'changed',accountId:account?.id||null}); await render();
    } catch (error) { setStatus(error.message, true); }
    finally { setBusy(false); }
  }
  async function refreshSession({initial=false,force=false}={}) {
    if(force){identityEpoch++;sessionVerified=false;}
    else if(sessionRefresh)return sessionRefresh;
    const version=identityEpoch;
    const pending=(async()=>{
      try{
        const result=await apiRequest('/auth/session');if(version!==identityEpoch)return account;
        sessionVerified=true;
        if(initial||result.account?.id!==account?.id){await publish(result.account);if(pendingEntry&&account)close('account');else if(dialog.open)await render();}
        sessionError='';return account;
      }catch(error){
        if(version!==identityEpoch)return account;
        sessionError=error.message;
        if(error.status===401){await publish(null);if(dialog.open)await render();}
        else sessionVerified=false;
        return account;
      }
    })();
    sessionRefresh=pending;
    try{return await pending;}finally{if(sessionRefresh===pending){sessionRefresh=null;lastSessionCheck=Date.now();}}
  }
  async function invalidateSession({clear=false}={}) {
    // An authoritative 401 or another tab's identity change invalidates any
    // earlier session response before that response can restore private data.
    identityEpoch++;sessionVerified=false;
    if(clear)await publish(null);
    return refreshSession({force:true});
  }
  const ready = refreshSession({initial:true});
  const checkSession=()=>{if(!document.hidden&&Date.now()-lastSessionCheck>1000)refreshSession();};
  window.addEventListener('focus',checkSession);window.addEventListener('pageshow',checkSession);
  document.addEventListener('visibilitychange',checkSession);
  window.addEventListener('ufo-account-session-expired',()=>invalidateSession({clear:true}));
  if(channel)channel.onmessage=event=>invalidateSession({clear:event.data&&typeof event.data==='object'&&Object.hasOwn(event.data,'accountId')&&event.data.accountId!==(account?.id||null)});
  const controller = {
    ready, getAccount: () => account, isSessionVerified:()=>sessionVerified,getSessionStatus:()=>sessionVerified?'verified':'unknown',getIdentityVersion:()=>identityEpoch, subscribe(callback) { subscribers.add(callback); return () => subscribers.delete(callback); }, open, chooseEntry, close, signOut,
    refresh: render, refreshPrompts:updatePrompts, refreshSession, setContentRenderer(renderer) { contentRenderer = renderer; if (dialog.open) return render(); },
    mountPrompt(host, options = {}) { const entry = {host, options}; prompts.add(entry); updatePrompts(); return () => { prompts.delete(entry); host.replaceChildren(); }; },
  };
  return controller;
}
