import {solveTwoBone} from './motion.js';

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const smooth=value=>{value=clamp(value);return value*value*(3-2*value);};
const TAU=Math.PI*2;
export const PET_VARIANTS=Object.freeze([
  Object.freeze({species:'dog',variant:'corgi',coat:'#c58b4e',patch:'#f6e7c9',length:23,hip:16,leg:9,head:11}),
  Object.freeze({species:'dog',variant:'dachshund',coat:'#986043',patch:'#c78b58',length:31,hip:14,leg:8.5,head:9}),
  Object.freeze({species:'dog',variant:'poodle',coat:'#e8d4b5',patch:'#bda17d',length:21,hip:28,leg:15,head:11}),
  Object.freeze({species:'cat',variant:'tabby',coat:'#cf9c5f',patch:'#926542',length:22,hip:21,leg:11,head:9}),
  Object.freeze({species:'cat',variant:'tuxedo',coat:'#465452',patch:'#f2ead6',length:21,hip:21,leg:11,head:9}),
  Object.freeze({species:'cat',variant:'siamese',coat:'#e3cfae',patch:'#67534b',length:23,hip:22,leg:11.5,head:9}),
]);

/** Decorative visitor timing is independent of classroom IDs and draw results. */
export function createPetPassers({random=Math.random}={}){
  const interval=()=>25+clamp(random())*20;
  let wait=interval(),active=null,sequence=0,lastVariant=-1;
  function reset(){active=null;wait=interval();}
  function update(delta,{allowed=true,visible=true,reduced=false,view}={}){
    if(!visible)return active;
    if(!allowed){if(active)reset();return null;}
    const dt=clamp(Number(delta)||0,0,.08);if(!active)wait-=dt;
    if(!active&&wait<=0&&view){
      let index=Math.min(PET_VARIANTS.length-1,Math.floor(clamp(random())*PET_VARIANTS.length));
      if(index===lastVariant)index=(index+1)%PET_VARIANTS.length;lastVariant=index;
      const direction=random()<.5?1:-1,scale=clamp(view.width/1280,.72,1),distance=view.width+140*scale;
      active={id:`pet-${++sequence}`,...PET_VARIANTS[index],direction,scale,age:0,travel:0,
        duration:reduced?5:distance/(54*scale),reduced,emitted:false,
        x:reduced?view.left+view.width*(direction===1?.22:.78):direction===1?view.left-70*scale:view.right+70*scale,
        y:view.bottom-19,view:{...view}};
    }
    if(!active)return null;
    if(reduced&&!active.reduced){active.reduced=true;active.age=0;active.duration=3;active.entered=true;}
    active.age+=dt;
    if(active.age>=active.duration){active=null;wait=interval();return null;}
    const v=active.view;
    if(!active.reduced){active.travel=active.age*54;active.x=active.direction===1?v.left-70*active.scale+active.travel*active.scale:v.right+70*active.scale-active.travel*active.scale;}
    active.opacity=active.reduced?(active.entered?1:smooth(active.age/.55))*(1-smooth((active.age-active.duration+.6)/.6)):1;
    return active;
  }
  function soundFor(id){
    if(!active||active.id!==id||active.emitted||active.age<(active.reduced?1:2))return null;
    const margin=(active.length+active.head+10)*active.scale;
    if(active.x-margin<active.view.left||active.x+margin>active.view.right||active.opacity<.9)return null;
    active.emitted=true;return {id:active.id,species:active.species,variant:active.variant};
  }
  return {update,soundFor,reset};
}

function ellipse(c,x,y,rx,ry,color){c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fillStyle=color;c.fill();}
function line(c,a,b,color,width){c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.stroke();}
function poly(c,points,color){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();}

/** Four articulated legs with fixed ground contacts through each stance. */
export function drawPet(c,pet){
  const {x,y,scale,direction,coat,patch,length,hip,leg,head,variant,species}=pet;
  const phase=pet.reduced?0:pet.travel/28,bob=pet.reduced?0:Math.sin(phase*TAU*2)*.35;
  const feet=[],legs=[];
  for(let index=0;index<4;index++){
    const front=index%2===1,near=index>=2,root={x:(front?1:-1)*length*.67,y:-hip+bob};
    const q=(phase+[0,.5,.25,.75][index])%1,stance=pet.reduced||q<.62;
    const step=pet.reduced||stance?0:(q-.62)/.38;
    const foot={x:root.x+(pet.reduced?0:stance?8.68-q*28:-8.68+17.36*smooth(step)),y:-1.8-(stance?0:Math.sin(Math.PI*step)*5)};
    const solved=solveTwoBone(root,foot,leg,leg,front?-1:1);
    legs.push({root,joint:solved.joint,foot:solved.end,near,stance});
    feet.push({x:x+solved.end.x*scale*direction,y:y+solved.end.y*scale,planted:stance});
  }
  c.save();c.globalAlpha*=pet.opacity??1;
  ellipse(c,x,y+1,length*scale,3*scale,'#30493922');c.translate(x,y);c.scale(scale*direction,scale);
  const bodyY=-hip-6+bob,drawLeg=limb=>{
    const color=variant==='siamese'||variant==='tuxedo'?patch:coat;
    c.save();if(!limb.near)c.globalAlpha*=.72;
    line(c,limb.root,limb.joint,color,3.5);line(c,limb.joint,limb.foot,color,3.3);
    ellipse(c,limb.foot.x+1,limb.foot.y,3,1.8,color);c.restore();
  };
  legs.filter(limb=>!limb.near).forEach(drawLeg);
  // Cats carry a long upright curl; the three dogs have distinct tail shapes.
  c.beginPath();c.moveTo(-length+3,bodyY);
  if(species==='cat'){c.bezierCurveTo(-length-15,bodyY-6,-length-8,bodyY-32,-length-18,bodyY-27);c.strokeStyle=variant==='siamese'?patch:coat;c.lineWidth=4;}
  else if(variant==='corgi'){c.quadraticCurveTo(-length-10,bodyY-7,-length-4,bodyY-13);c.strokeStyle=coat;c.lineWidth=7;}
  else{c.quadraticCurveTo(-length-15,bodyY-4,-length-10,bodyY-18);c.strokeStyle=coat;c.lineWidth=variant==='poodle'?4:3;}
  c.lineCap='round';c.stroke();if(variant==='poodle')ellipse(c,-length-10,bodyY-18,5,5,coat);
  ellipse(c,0,bodyY,length,variant==='corgi'?11:species==='cat'?8:9,coat);
  if(variant==='tuxedo')ellipse(c,length*.5,bodyY+3,7,6,patch);
  if(variant==='corgi')ellipse(c,length*.55,bodyY+3,9,8,patch);
  if(variant==='tabby')for(const dx of[-12,-3,6])line(c,{x:dx,y:bodyY-6},{x:dx-3,y:bodyY+1},patch,2.5);
  if(variant==='poodle')for(const dx of[-length*.7,0,length*.7])ellipse(c,dx,bodyY,9,10,coat);
  legs.filter(limb=>limb.near).forEach(drawLeg);
  const hx=length-1,hy=bodyY-10;
  if(species==='cat'||variant==='corgi'){
    poly(c,[[hx-head+1,hy-3],[hx-head+2,hy-head-8],[hx-1,hy-head+1]],variant==='siamese'?patch:coat);
    poly(c,[[hx+1,hy-head+1],[hx+head-1,hy-head-8],[hx+head,hy-2]],variant==='siamese'?patch:coat);
    poly(c,[[hx-head+4,hy-5],[hx-head+4,hy-head-4],[hx-2,hy-head+2]],'#d29c8b');
  }
  ellipse(c,hx,hy,head,head,variant==='siamese'?patch:coat);
  if(variant==='dachshund')ellipse(c,hx-6,hy+4,4,11,'#774b3b');
  if(variant==='poodle'){
    ellipse(c,hx,hy-head+2,head+1,6,coat);ellipse(c,hx-8,hy+3,5,9,patch);
    for(const dx of[-6,0,6])ellipse(c,hx+dx,hy-head+2,5,5,coat);
  }
  const muzzle=species==='dog'?head*.8:head*.48;
  ellipse(c,hx+head*.65,hy+3,muzzle,species==='dog'?5:3.7,variant==='corgi'||variant==='tuxedo'?patch:coat);
  ellipse(c,hx+head*.32,hy-2,1.25,1.7,'#293c35');ellipse(c,hx+head+muzzle*.34,hy+1,2,1.6,'#394a40');
  if(species==='cat')for(const dy of[-1,3])line(c,{x:hx+head*.6,y:hy+dy+4},{x:hx+head+7,y:hy+dy+2},'#5a6251',.6);
  else line(c,{x:hx+5,y:hy+head},{x:hx-2,y:hy+head+3},'#749a8b',2.5);
  c.restore();return {feet,legs};
}
