import {apiRequest} from './api-client.js';
import {t, language} from './i18n.js';

export const FEEDBACK_MAX_LENGTH = 2000;

export function setupFeedback({document:doc=globalThis.document, request=apiRequest, makeId=()=>crypto.randomUUID(), setTimer=setTimeout, clearTimer=clearTimeout}={}) {
  const trigger=doc.getElementById('feedbackBtn'),dialog=doc.getElementById('feedbackDialog');
  if(!trigger||!dialog)return null;
  const form=doc.getElementById('feedbackForm'),field=doc.getElementById('feedbackMessage'),submit=doc.getElementById('feedbackSubmit');
  const close=doc.getElementById('feedbackClose'),error=doc.getElementById('feedbackError'),success=doc.getElementById('feedbackSuccess');
  let pending=false,attempt=null;
  const message=()=>field.value.trim();
  function render(){
    submit.disabled=pending||!message()||message().length>FEEDBACK_MAX_LENGTH;
    submit.textContent=t(pending?'Đang gửi góp ý…':'Gửi góp ý');
    field.readOnly=pending;form.setAttribute('aria-busy',String(pending));
  }
  function clearNotice(){error.hidden=success.hidden=true;field.removeAttribute('aria-invalid');}
  function showError(text){error.textContent=t(text);error.hidden=false;success.hidden=true;}
  trigger.addEventListener('click',()=>{
    if(dialog.open)return;
    const parent=doc.fullscreenElement||doc.body;
    if(dialog.parentNode!==parent)parent.append(dialog);
    dialog.showModal();field.focus({preventScroll:true});
  });
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{if(trigger.isConnected)trigger.focus({preventScroll:true});});
  dialog.addEventListener('cancel',event=>event.preventDefault());
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();return;
    }
    if(event.key==='Tab'){
      const controls=[...dialog.querySelectorAll('textarea:not(:disabled),button:not(:disabled)')].filter(control=>control.getClientRects().length);
      const first=controls[0],last=controls.at(-1),within=controls.includes(doc.activeElement);
      if(event.shiftKey&&(!within||doc.activeElement===first)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(!within||doc.activeElement===last)){event.preventDefault();first?.focus();}
    }
  });
  field.addEventListener('input',()=>{
    if(attempt&&attempt.message!==message())attempt=null;
    clearNotice();render();
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(pending)return;
    const text=message();
    if(!text||text.length>FEEDBACK_MAX_LENGTH){
      showError(!text?'Bạn chưa nhập góp ý.':'Góp ý tối đa 2.000 ký tự.');
      field.setAttribute('aria-invalid','true');field.focus();return;
    }
    clearNotice();pending=true;render();
    const controller=new AbortController();
    const timer=setTimer(()=>controller.abort(),20000);
    try{
      // Reuse the id after an uncertain response so retry cannot create a second entry.
      if(!attempt||attempt.message!==text)attempt={id:makeId(),message:text,language};
      await request('/feedback',{method:'POST',body:{...attempt},signal:controller.signal});
      field.value='';attempt=null;
      success.textContent=t('Đã gửi. Cảm ơn bạn đã góp ý!');success.hidden=false;
    }catch(cause){
      showError(cause?.status===429?'Bạn gửi hơi nhanh. Hãy thử lại sau một lúc.':'Chưa gửi được góp ý. Nội dung vẫn được giữ, bạn hãy thử lại.');
    }finally{clearTimer(timer);pending=false;render();}
  });
  render();
  return {isPending:()=>pending};
}
