import {t,messages} from './i18n.js';
import { sanitizeAppearance } from './appearance.js';
export const MAX_STUDENTS = 120;
export const STORAGE_KEY = 'kroma.ufo.classroom.v1';
// Files can be imported in a different language from the one used to export them.
// Normalize only metadata tokens; names retain their original spelling and script.
const rosterToken = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g,' ').trim();
const translatedTokens = source => [source,...Object.values(messages[source] || {}).filter(value=>typeof value==='string')];
const genderAliases = {
  male:['nam','male','m','boy','man','男性','男','남성','남자','masculino','hombre','homme','masculin','männlich','maennlich','mann','homem'],
  female:['nữ','nu','female','f','girl','woman','女性','女','여성','여자','femenino','mujer','femme','féminin','feminin','weiblich','frau','feminino','mulher'],
  other:['khác','khac','other','其他','其它','その他','기타','otro','otra','autre','divers','andere','anderes','outro','outra'],
};
const genders = new Map(Object.entries(genderAliases).flatMap(([gender,aliases])=>
  [...aliases,...translatedTokens({male:'Nam',female:'Nữ',other:'Khác'}[gender])].map(value=>[rosterToken(value),gender])));
const nameHeaders = new Set([
  ...['Họ và tên','Họ tên','Tên','Tên học sinh'].flatMap(translatedTokens),
  'ho va ten','ho ten','ten','name','full name','student name','pupil name',
  '姓名','名字','学生姓名','學生姓名','氏名','名前','生徒名','이름','성명','학생 이름',
  'nombre','nombre completo','nombre del alumno','nombre del estudiante','nom','nom complet','prénom et nom','prenom et nom',
  'schülername','schulername','vollständiger name','vollstaendiger name','nome','nome completo','nome do aluno',
].map(rosterToken));
const genderHeaders = new Set([
  ...translatedTokens('Giới tính'),'gioi tinh','gender','sex','性别','性別','성별',
  'sexo','género','genero','genre','sexe','geschlecht','gênero',
].map(rosterToken));
export const genderLabel = value => ({ male:t('Nam'), female:t('Nữ'), other:t('Khác') }[value] || t('Nam'));
export const cleanName = value => String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g,' ').trim().slice(0,80);
export function parseRoster(text) {
  const students = []; const errors = []; let firstContentRow = true;
  String(text).replace(/^\uFEFF/,'').split(/\r?\n/).forEach((line,index) => {
    line = line.trim(); if (!line) return;
    const parts = line.split(/[,;\t|]/).map(p => p.trim().replace(/^"|"$/g,''));
    const headerCandidate = firstContentRow; firstContentRow = false;
    if (headerCandidate && parts.length===2 && nameHeaders.has(rosterToken(parts[0])) && genderHeaders.has(rosterToken(parts[1]))) return;
    let gender = 'male';
    if (parts.length > 1) {
      const key = rosterToken(parts.pop());
      if (key && !genders.has(key)) { errors.push(t("Dòng {v0}: giới tính “{v1}” chưa hợp lệ. Dùng nam, nữ hoặc khác.",{v0:index+1,v1:key})); return; }
      gender = genders.get(key) || 'male';
    }
    const name = cleanName(parts.join(' '));
    if (!name) { errors.push(t("Dòng {v0}: thiếu tên.",{v0:index+1})); return; }
    students.push({name,gender});
  });
  if (students.length > MAX_STUDENTS) errors.push(t("Tối đa {v0} học sinh trong một danh sách.",{v0:MAX_STUDENTS}));
  return {students,errors};
}
export function randomIndex(length, cryptoSource = globalThis.crypto) {
  if (!Number.isInteger(length) || length < 1) throw new Error(t("Danh sách chọn phải có ít nhất một người."));
  const max = 0x100000000; const limit = max - (max % length); const value = new Uint32Array(1);
  do { cryptoSource.getRandomValues(value); } while(value[0] >= limit);
  return value[0] % length;
}
export function pickStudents(students,count,calledIds=[],noRepeat=true) {
  const called = new Set(calledIds); const pool = students.filter(s => !noRepeat || !called.has(s.id));
  const chosen = [];
  for(let i=0, n=Math.min(Math.max(0,Math.floor(count)),pool.length); i<n; i++) chosen.push(pool.splice(randomIndex(pool.length),1)[0]);
  return chosen;
}
export function restoreState(raw) {
  try {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.students) || !data.students.length || data.students.length>MAX_STUDENTS) return null;
    const ids = new Set();
    const students = data.students.map(s => {
      if(!s || typeof s.id !== 'string' || !s.id || ids.has(s.id) || !cleanName(s.name)) throw new Error('Invalid roster');
      ids.add(s.id); const appearance = sanitizeAppearance(s.appearance);
      return {id:s.id,name:cleanName(s.name),gender:['male','female','other'].includes(s.gender) ? s.gender:'male',...(Object.keys(appearance).length ? {appearance} : {})};
    });
    const history = (Array.isArray(data.history) ? data.history : []).slice(0,100).filter(h=>h && Array.isArray(h.ids)).map(h=>({ids:h.ids.filter(id=>ids.has(id)),time:Number(h.time)||Date.now()})).filter(h=>h.ids.length);
    return {students,history,called:Array.isArray(data.called) ? [...new Set(data.called.filter(id=>ids.has(id)))] : [...new Set(history.flatMap(h=>h.ids))],noRepeat:data.noRepeat!==false,count:Math.min(10,Math.max(1,Math.floor(Number(data.count)||1))),sound:data.sound!==false,isDemo:data.isDemo===true};
  } catch { return null; }
}
export function makeStudents(rows) { return rows.map(s=>{
  const appearance=sanitizeAppearance(s.appearance);
  return {id:crypto.randomUUID(),name:cleanName(s.name),gender:s.gender||'male',...(Object.keys(appearance).length?{appearance}:{})};
}); }
