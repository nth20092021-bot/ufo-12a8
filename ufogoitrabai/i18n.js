import liveMessages from './locales-live.js';
import downloadMessages from './locales-download.js';
import resultMessages from './locales-result.js';
import appMessages from './locales-app.js';
import sharingMessages from './locales-sharing.js';
import attendanceMessages from './locales-attendance.js';
import sceneMessages from './locales-scene.js';
import classroomMessages from './locales-classroom.js';
import accountMessages from './locales-account.js';
import accountTeacherMessages from './locales-account-teacher.js';

export const LANGUAGE_STORAGE_KEY='kroma.ufo.language.v1';
export const LANGUAGES=Object.freeze([
  {code:'vi',flag:'🇻🇳',locale:'vi-VN',label:'Tiếng Việt',short:'VI'},
  {code:'en',flag:'🇺🇸',locale:'en-US',label:'English',short:'EN'},
  {code:'zh',flag:'🇨🇳',locale:'zh-CN',label:'简体中文',short:'中文'},
  {code:'ja',flag:'🇯🇵',locale:'ja-JP',label:'日本語',short:'日本'},
  {code:'ko',flag:'🇰🇷',locale:'ko-KR',label:'한국어',short:'한국'},
  {code:'es',flag:'🇪🇸',locale:'es-ES',label:'Español',short:'ES'},
  {code:'fr',flag:'🇫🇷',locale:'fr-FR',label:'Français',short:'FR'},
  {code:'de',flag:'🇩🇪',locale:'de-DE',label:'Deutsch',short:'DE'},
  {code:'pt',flag:'🇧🇷',locale:'pt-BR',label:'Português',short:'PT'},
]);
export const messages=Object.freeze({...liveMessages,...appMessages,...sharingMessages,...attendanceMessages,...sceneMessages,...classroomMessages,...accountMessages,...accountTeacherMessages,...downloadMessages,...resultMessages});
export function normalizeLanguage(value){const code=String(value||'').toLowerCase().split(/[-_]/)[0];return LANGUAGES.some(item=>item.code===code)?code:null;}
export function resolveLanguage({query='',saved='',preferred=[]}={}){
  return normalizeLanguage(query)||normalizeLanguage(saved)||preferred.map(normalizeLanguage).find(Boolean)||'vi';
}
function browserLanguage(){
  if(typeof document==='undefined'||typeof window==='undefined'||typeof location==='undefined')return 'vi';
  let saved='';try{saved=localStorage.getItem(LANGUAGE_STORAGE_KEY)||'';}catch{}
  return resolveLanguage({query:new URLSearchParams(location.search).get('lang'),saved});
}
export const language=browserLanguage();
export const locale=LANGUAGES.find(item=>item.code===language).locale;
export function translator(code){
  const selected=normalizeLanguage(code)||'vi';
  return (source,values={})=>{
    const text=String(source),translated=selected==='vi'?text:(messages[text]?.[selected]??messages[text]?.en??text);
    return translated.replace(/\{([A-Za-z0-9_]+)\}/g,(match,key)=>Object.hasOwn(values,key)?String(values[key]):match);
  };
}
export const t=translator(language);
/** Translate only known static templates, before any user-provided data is inserted. */
export function translateStatic(root){
  if(!root)return;
  const doc=root.ownerDocument||root;
  const walker=doc.createTreeWalker(root,4);
  for(let node=walker.nextNode();node;node=walker.nextNode()){
    if(node.parentElement?.closest('script,style,svg,canvas,textarea,[data-i18n-ignore]'))continue;
    const value=node.textContent,trimmed=value.trim();
    if(Object.hasOwn(messages,trimmed))node.textContent=value.replace(trimmed,t(trimmed));
  }
  const elements=[...(root.nodeType===1?[root]:[]),...root.querySelectorAll('*')];
  for(const element of elements){
    if(element.closest('[data-i18n-ignore]'))continue;
    for(const attr of ['title','aria-label','placeholder','alt']){
      const value=element.getAttribute(attr);if(value&&Object.hasOwn(messages,value))element.setAttribute(attr,t(value));
    }
  }
}
export function initializeLanguageUI(host,{beforeChange=()=>true}={}){
  document.documentElement.lang=language;
  translateStatic(document);
  if(!host)return null;
  const wrapper=document.createElement('label');wrapper.className='language-picker';wrapper.title=t('Ngôn ngữ');
  const icon=document.createElement('span');icon.className='language-flag';icon.textContent=LANGUAGES.find(item=>item.code===language).flag;icon.setAttribute('aria-hidden','true');
  const short=document.createElement('span');short.textContent=LANGUAGES.find(item=>item.code===language).short;short.setAttribute('aria-hidden','true');
  const select=document.createElement('select');select.id='languageSelect';select.setAttribute('aria-label',t('Ngôn ngữ'));
  for(const item of LANGUAGES)select.add(new Option(`${item.flag} ${item.label}`,item.code));select.value=language;
  select.addEventListener('change',()=>{
    const next=normalizeLanguage(select.value);if(!next||beforeChange()===false){select.value=language;return;}
    try{localStorage.setItem(LANGUAGE_STORAGE_KEY,next);}catch{/* The URL also preserves the choice when storage is unavailable. */}
    const url=new URL(location.href);url.searchParams.set('lang',next);location.replace(url.href);
  });
  wrapper.append(icon,short,select);host.append(wrapper);return select;
}
