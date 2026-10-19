import {t,locale,LANGUAGES} from './i18n.js';
import {createResultSpeech} from './result-speech.js';
import {renderResultImage,sharePreparedResult,downloadResultImage,copyResultText} from './result-share.js';

const PREFERENCE_KEY='kroma.ufo.result-speech.v1';
// The deployed image policy permits data: images; blob: stays limited to downloads.
function previewDataUrl(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(new Error('Invalid preview'));
    reader.onerror=()=>reject(reader.error||new Error('Preview failed'));
    reader.readAsDataURL(blob);
  });
}

export function setupResultActions({audio,toast=()=>{},onSpeaking=()=>{},allowAutomaticReading=true,waitForSpeech=()=>null}={}) {
  const $=id=>document.getElementById(id);
  const readButton=$('resultReadBtn'),shareButton=$('resultShareBtn'),preference=$('autoReadResult');
  const dialog=$('resultShareDialog'),preview=$('resultSharePreview'),status=$('resultShareStatus');
  const download=$('resultShareDownload'),copy=$('resultShareCopy');
  let data=null,blob=null,previewUrl=null,autoTimer=null,generation=0,imageFailed=false;
  let pendingRead=false,speechActive=false,reportedSpeaking=false,activityBatch=0,waitingForSpeech=false,readGeneration=0;
  function updateReadButton(){
    const active=speechActive||waitingForSpeech,label=t(active?'Dừng đọc':'Đọc tên');
    readButton.querySelector('.result-read-label').textContent=label;
    readButton.setAttribute('aria-label',label);readButton.title=label;
    readButton.setAttribute('aria-pressed',String(active));
  }
  function reportSpeaking(){
    const active=pendingRead||speechActive;
    if(activityBatch||active===reportedSpeaking)return;
    reportedSpeaking=active;try{onSpeaking(active);}catch{/* Host audio coordination cannot interrupt result actions. */}
  }
  let autoRead=false;
  try {autoRead=allowAutomaticReading&&localStorage.getItem(PREFERENCE_KEY)==='true';} catch {}
  const speech=createResultSpeech({locale,onStateChange:({speaking,error})=>{
    speechActive=!!speaking;
    updateReadButton();
    audio?.setSpeechDucking(speaking);
    reportSpeaking();
    if(error&&data&&!document.hidden)toast(error==='language-unavailable'
      ?t('Chưa dùng được giọng đọc {language}. Hãy thử lại hoặc kiểm tra cài đặt giọng đọc trên thiết bị.',{language:LANGUAGES.find(item=>item.locale===locale)?.label||locale})
      :t('Chưa đọc được tên. Hãy bấm Đọc tên để thử lại.'));
  }});
  if(preference){preference.checked=autoRead;preference.disabled=!speech.supported;}readButton.disabled=!speech.supported;
  if(!speech.supported){
    if($('resultSpeechHint'))$('resultSpeechHint').textContent=t('Thiết bị này chưa hỗ trợ đọc tên.');
    readButton.title=t('Thiết bị này chưa hỗ trợ đọc tên.');
  }
  function stopReading(){readGeneration++;clearTimeout(autoTimer);autoTimer=null;waitingForSpeech=false;pendingRead=false;speech.stop();updateReadButton();reportSpeaking();}
  function readNames(){
    if(!data||document.hidden)return false;
    clearTimeout(autoTimer);autoTimer=null;
    const request=++readGeneration,result=generation;
    // Reserve the next turn before draining the current character. Do not put
    // a result in the browser's global queue where cancel() could cut that voice.
    pendingRead=true;reportSpeaking();
    const current=()=>request===readGeneration&&result===generation&&data&&!document.hidden;
    const start=()=>{
      if(!current())return false;
      waitingForSpeech=false;
      try{return speech.read(data.names);}
      finally{pendingRead=false;updateReadButton();reportSpeaking();}
    };
    let wait;
    try{wait=waitForSpeech();}catch{stopReading();return false;}
    if(wait&&typeof wait.then==='function'){
      waitingForSpeech=true;updateReadButton();
      Promise.resolve(wait).then(start,()=>{if(current())stopReading();});
      return true;
    }
    return start();
  }
  function releasePreview(){
    preview.hidden=true;preview.removeAttribute('src');
    previewUrl=null;blob=null;
  }
  function updatePreview(){
    download.disabled=!blob;
    if(blob){
      preview.src=previewUrl;preview.hidden=false;status.textContent='';
    }else status.textContent=t(imageFailed?'Chưa tạo được ảnh. Bạn vẫn có thể sao chép nội dung.':'Đang chuẩn bị ảnh…');
  }
  function hide(){
    generation++;stopReading();data=null;shareButton.disabled=false;
    if(dialog.open)dialog.close();
    releasePreview();
  }
  preference?.addEventListener('change',()=>{
    autoRead=allowAutomaticReading&&preference.checked;
    try {localStorage.setItem(PREFERENCE_KEY,String(autoRead));} catch {}
    if(!autoRead)stopReading();
  });
  readButton.addEventListener('click',()=>{
    if(speech.speaking||waitingForSpeech)stopReading();else if(data)readNames();
  });
  shareButton.addEventListener('click',async()=>{
    if(!data)return;
    const token=generation;shareButton.disabled=true;
    // Call native share while this click still has transient user activation.
    const outcome=await sharePreparedResult({data,blob});
    if(token!==generation||!data)return;
    shareButton.disabled=false;
    if(outcome.status==='fallback'&&!document.hidden){
      updatePreview();if(!dialog.open)dialog.showModal();$('resultShareClose').focus();
    }
  });
  $('resultShareClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{if(data)shareButton.focus({preventScroll:true});});
  dialog.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const controls=[...dialog.querySelectorAll('button:not(:disabled)')].filter(button=>button.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
  download.addEventListener('click',()=>{
    if(!downloadResultImage(blob))status.textContent=t('Chưa tải được ảnh. Hãy thử lại.');
  });
  copy.addEventListener('click',async()=>{
    if(!data)return;
    const token=generation;const copied=await copyResultText(data);
    if(token===generation&&data)status.textContent=t(copied?'Đã sao chép kết quả.':'Chưa sao chép được. Hãy thử lại.');
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopReading();});
  // A back/forward-cache restore keeps the visible result and its actions usable.
  window.addEventListener('pagehide',()=>{stopReading();shareButton.disabled=false;});
  return {
    show(result){
      activityBatch++;
      try{
      hide();data={title:t('Kết quả gọi UFO'),className:result.className,names:[...result.names],url:location.href};
      const token=generation;imageFailed=false;download.disabled=true;
      renderResultImage(data).then(async image=>{
        const url=await previewDataUrl(image);
        if(token!==generation||!data)return;
        blob=image;previewUrl=url;if(dialog.open)updatePreview();
      }).catch(()=>{
        if(token!==generation||!data)return;
        imageFailed=true;if(dialog.open)updatePreview();
      });
      if(autoRead&&speech.supported&&!document.hidden){
        pendingRead=true;autoTimer=setTimeout(()=>{
          autoTimer=null;if(token===generation&&data&&!document.hidden)readNames();
          else{pendingRead=false;reportSpeaking();}
        },600);
      }
      }finally{activityBatch--;reportSpeaking();}
    },
    hide,
  };
}
