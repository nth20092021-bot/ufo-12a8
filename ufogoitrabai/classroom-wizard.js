import {t, translateStatic} from './i18n.js';
import {parseRoster} from './core.js';
import {drawQR} from './qr.js';
import {copyText} from './api-client.js';

/** A resumable setup flow. The adapter owns persistence and roster CAS writes. */
export function createClassroomWizard(adapter) {
  const dialog=document.createElement('dialog');dialog.id='classroomWizard';dialog.className='classroom-wizard';dialog.setAttribute('aria-labelledby','wizardTitle');
  dialog.innerHTML=`<form id="wizardForm" novalidate>
    <header class="wizard-heading"><div><p id="wizardProgress" class="eyebrow"></p><h2 id="wizardTitle">Tạo lớp mới</h2></div><button type="button" id="wizardClose" class="icon-btn" aria-label="Đóng">×</button></header>
    <ol class="wizard-steps" aria-hidden="true"><li>1</li><li>2</li><li>3</li></ol>
    <section data-wizard-step="1"><label for="wizardName">Tên lớp mới</label><p>Chọn tên để dễ tìm lại lớp.</p><input id="wizardName" type="text" maxlength="40" autocomplete="off" placeholder="Ví dụ: Lớp 7A" required></section>
    <section data-wizard-step="2" hidden><h3>Chọn bối cảnh</h3><p>Chọn nơi cả lớp gặp UFO.</p><div id="wizardEnvironments" class="wizard-environments"></div></section>
    <section data-wizard-step="3" hidden><h3>Danh sách và mã lớp</h3><p>Nhập tên hoặc mời học sinh tham gia bằng mã lớp.</p><div class="wizard-roster-grid"><div><label for="wizardRoster">Nhập danh sách lớp bằng tay</label><textarea id="wizardRoster" rows="8" spellcheck="false" placeholder="Nguyễn Minh Anh, nữ&#10;Trần Đức Huy"></textarea><div class="wizard-roster-meta"><span>Mỗi dòng một tên · Mặc định nam</span><strong id="wizardRosterCount"></strong></div></div><div class="wizard-invite"><h4>Mời học sinh bằng mã lớp</h4><p id="wizardInviteStatus" role="status"></p><div id="wizardInviteReady" hidden><canvas id="wizardQR" role="img"></canvas><strong id="wizardClassCode"></strong><button type="button" id="wizardCopyCode" class="secondary-btn">Sao chép mã lớp</button><a id="wizardJoinLink" target="_blank" rel="noopener noreferrer">Tham gia lớp</a></div><button type="button" id="wizardRetry" class="secondary-btn" hidden>Tạo mã lớp</button></div></div></section>
    <p id="wizardError" class="form-error" role="alert" hidden></p><button type="button" id="wizardReload" class="text-btn" hidden>Tải danh sách mới</button>
    <p id="wizardFinishHint" class="wizard-finish-hint" hidden>Sau này, bạn có thể sửa danh sách trong Cài đặt và mở lại mã hoặc QR bằng nút Mã lớp.</p>
    <footer class="wizard-actions"><button type="button" id="wizardBack" class="secondary-btn">Quay lại</button><button type="submit" id="wizardNext" class="primary-btn">Tiếp tục</button></footer>
  </form>`;
  translateStatic(dialog);document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id);
  let step=1,roomId=null,busy=false,finished=false,generation=0,returnFocus=null,qrUrl='',theme=adapter.getEnvironment(),draftText='';
  for(const [value,label] of [['street','Phố nhỏ'],['school','Sân trường'],['park','Công viên'],['seaside','Phố biển']]){
    const option=document.createElement('label');option.className='wizard-environment';
    const input=document.createElement('input');input.type='radio';input.name='wizardEnvironment';input.value=value;
    const art=document.createElement('span');art.className='environment-art environment-art-'+value;art.setAttribute('aria-hidden','true');art.innerHTML='<span class="environment-cloud"></span><span class="environment-building"></span><span class="environment-tree"></span>';
    const name=document.createElement('strong');name.textContent=t(label);option.append(input,art,name);$('wizardEnvironments').append(option);
    input.addEventListener('change',()=>{if(input.checked)theme=value;});
  }
  function error(message,conflict=false){$('wizardError').textContent=message;$('wizardError').hidden=!message;$('wizardReload').hidden=!conflict;}
  function paint(){
    $('wizardProgress').textContent=t('Bước {step} / 3',{step});
    for(const section of dialog.querySelectorAll('[data-wizard-step]'))section.hidden=Number(section.dataset.wizardStep)!==step;
    [...dialog.querySelectorAll('.wizard-steps li')].forEach((item,index)=>{item.classList.toggle('current',index+1===step);item.classList.toggle('done',index+1<step);});
    $('wizardBack').hidden=step===1;$('wizardNext').textContent=t(step===3?'Hoàn tất':'Tiếp tục');
    $('wizardFinishHint').hidden=step!==3;
    if(step===3)$('wizardNext').setAttribute('aria-describedby','wizardFinishHint');else $('wizardNext').removeAttribute('aria-describedby');
    for(const control of dialog.querySelectorAll('button,input,textarea'))control.disabled=busy;
    for(const input of dialog.querySelectorAll('[name="wizardEnvironment"]'))input.checked=input.value===theme;
    $('wizardRosterCount').textContent=t('{count} bạn',{count:parseRoster(draftText).students.length});
  }
  function refresh(){
    if(!dialog.open||!roomId)return;
    const room=adapter.getRoom(roomId);if(!room){close();return;}
    paint();if(step!==3)return;
    const snapshot=adapter.getSnapshot(roomId);if(!snapshot?.joinCode||!snapshot.inviteCode)return;
    $('wizardInviteStatus').textContent=t('{count} bạn',{count:snapshot.students.filter(s=>s.claimed===true&&s.status==='active').length});
    $('wizardClassCode').textContent=snapshot.joinCode;$('wizardInviteReady').hidden=false;$('wizardRetry').hidden=true;
    const url=new URL('./join',import.meta.url);url.searchParams.set('invite',snapshot.inviteCode);
    $('wizardJoinLink').href=url.href;$('wizardQR').setAttribute('aria-label',t('Mã QR tham gia lớp {name}',{name:room.name}));
    if(qrUrl!==url.href){qrUrl=url.href;const expected=qrUrl;void drawQR($('wizardQR'),qrUrl).catch(()=>{if(qrUrl===expected)error(t('Chưa mở được mã lớp. Hãy thử lại.'));});}
  }
  async function prepareInvite(){
    const id=roomId,version=generation;busy=true;error('');paint();$('wizardInviteStatus').textContent=t('Đang tạo mã lớp…');
    try{await adapter.ensureShared(id);if(id===roomId&&version===generation)refresh();}
    catch(cause){if(id===roomId&&version===generation){$('wizardInviteStatus').textContent=cause.message;$('wizardRetry').hidden=false;}}
    finally{if(version===generation){busy=false;paint();}}
  }
  async function next(event){
    event.preventDefault();if(busy)return;error('');busy=true;paint();const version=generation;
    try{
      if(step===1){
        const name=$('wizardName').value.trim();if(!name)throw new Error(t('Nhập tên lớp để dễ tìm lại nhé.'));
        if(roomId)await adapter.rename(roomId,name);else roomId=await adapter.create(name);
        if(version!==generation)return;step=2;
      }else if(step===2){await adapter.setEnvironment(roomId,theme);step=3;}
      else{
        const parsed=parseRoster(draftText);if(parsed.errors.length)throw new Error(parsed.errors.join('\n'));
        await adapter.save(roomId,draftText,parsed.students);if(version!==generation)return;finished=true;busy=false;dialog.close();adapter.onComplete?.();return;
      }
      busy=false;paint();if(step===3)await prepareInvite();else dialog.querySelector('[name="wizardEnvironment"]:checked')?.focus();
    }catch(cause){if(version===generation)error(cause.message,cause.status===409||cause.code==='STALE_DRAFT');}
    finally{if(version===generation){busy=false;paint();}}
  }
  $('wizardForm').addEventListener('submit',next);
  $('wizardRoster').addEventListener('input',()=>{draftText=$('wizardRoster').value;adapter.onDraft(roomId,draftText);error('');paint();});
  $('wizardBack').addEventListener('click',()=>{if(!busy){step=Math.max(1,step-1);error('');paint();if(step===1)$('wizardName').focus();}});
  $('wizardClose').addEventListener('click',close);$('wizardRetry').addEventListener('click',prepareInvite);
  $('wizardCopyCode').addEventListener('click',async()=>{try{await copyText($('wizardClassCode').textContent);adapter.notify(t('Đã sao chép mã lớp.'));}catch{error(t('Không sao chép được. Hãy chọn và sao chép link bên dưới.'));}});
  $('wizardReload').addEventListener('click',async()=>{if(busy)return;busy=true;paint();try{draftText=await adapter.reloadDraft(roomId);$('wizardRoster').value=draftText;error('');refresh();}catch(cause){error(cause.message);}finally{busy=false;paint();}});
  dialog.addEventListener('cancel',event=>{event.preventDefault();});
  dialog.addEventListener('close',()=>{generation++;if(finished)return;if(roomId)adapter.notify(t('Lớp đã lưu. Bạn có thể tiếp tục thiết lập sau.'));if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});});
  function close(){if(!busy)dialog.close();}
  return {
    open(){
      if(dialog.open)return;returnFocus=document.activeElement;
      if(finished||roomId&&!adapter.getRoom(roomId)){step=1;roomId=null;finished=false;draftText='';qrUrl='';$('wizardName').value='';$('wizardRoster').value='';$('wizardInviteReady').hidden=true;theme=adapter.getEnvironment();}
      if(roomId)adapter.activate(roomId);generation++;error('');paint();dialog.showModal();
      if(step===1)$('wizardName').focus();else if(step===3)void prepareInvite();else dialog.querySelector('[name="wizardEnvironment"]:checked')?.focus();
    },close,refresh,getDraft:()=>({roomId,name:$('wizardName').value,theme,roster:draftText,finished}),isOpen:()=>dialog.open,isBusy:()=>busy,destroy(){generation++;dialog.remove();}
  };
}
