import { characterStyle, drawHead } from './character-art.js';

export function avatar(student,index=0){
  let hash=2166136261;for(const ch of student.id)hash=Math.imul(hash^ch.charCodeAt(0),16777619);
  const style=characterStyle({...student,seed:(hash>>>0)/4294967295});
  const span=document.createElement('span');span.className=`avatar avatar-${index%4}`;span.setAttribute('aria-hidden','true');
  const canvas=document.createElement('canvas');canvas.width=80;canvas.height=80;const c=canvas.getContext('2d');c.scale(2,2);
  c.fillStyle=style.shirt;c.beginPath();c.roundRect(8,26,24,23,10);c.fill();c.fillStyle=style.accent;c.beginPath();c.moveTo(17,28);c.lineTo(20,36);c.lineTo(23,28);c.fill();
  c.translate(20,16);drawHead(c,style,{time:1,lookUp:0,facing:1});span.append(canvas);return span;
}
