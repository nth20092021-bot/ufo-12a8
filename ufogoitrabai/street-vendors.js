// Original canvas street-food illustration and native-time idle choreography.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const mix=(a,b,t)=>a+(b-a)*t;
export function vendorLayout(view){
  const scale=clamp(view.width/1280,.68,.92),y=529;
  return [{id:'vendor-xoi',kind:'xoi',gender:'female',x:view.left+view.width*.25,y,scale},
    {id:'vendor-banhmi',kind:'banhmi',gender:'male',x:view.left+view.width*.75,y,scale}];
}
export function createStreetVendors({random=Math.random}={}){
  let stalls=[],cart=null,encounter=null,solo=null,clock=0,serial=0,cartWait=35+random()*25,talkWait=14+random()*14,dialogues=[];
  const pauseActor=()=>{if(encounter?.person){encounter.person.walking=encounter.person.chatting=false;encounter.person.chatUntil=0;}encounter=null;};
  const api={
    get stalls(){return stalls;},get cart(){return cart;},get encounter(){return encounter;},get dialogues(){return dialogues;},
    get conversationActive(){return !!encounter||!!solo||dialogues.some(cue=>cue.kind==='hawker');},
    reset(){pauseActor();cart=null;solo=null;dialogues=[];cartWait=35+random()*25;talkWait=14+random()*14;},
    cancelInteraction(){pauseActor();solo=null;dialogues=[];talkWait=16+random()*12;},
    actorFor(id){return encounter?.person.id===id?encounter.pose:null;},
    update(delta,{allowed=true,visible=true,reduced=false,view,students=[]}={}){
      if(!view)return api;
      const nextStalls=vendorLayout(view);
      if(encounter&&stalls.length&&Math.abs(stalls[encounter.stallIndex].x-nextStalls[encounter.stallIndex].x)>.1)api.cancelInteraction();
      stalls=nextStalls;dialogues=[];
      if(!visible)return api;
      if(!allowed){if(encounter||solo)api.cancelInteraction();return api;}
      const dt=clamp(Number(delta)||0,0,1);clock+=dt;
      if(cart){
        cart.age+=dt;cart.time=clock;
        // Switching the preference never jumps a cart across the street.
        if(reduced&&!cart.reduced){cart.reduced=true;cart.softEnd=cart.age+5;}
        if(!cart.reduced)cart.x+=cart.direction*cart.speed*dt;
        cart.wheel=cart.reduced?0:(cart.x-cart.startX)/(9*cart.scale);
        const softEnd=cart.softEnd??8;
        cart.opacity=cart.reduced?Math.min(smooth(cart.age/.6),smooth((softEnd-cart.age)/.6)):1;
        const inside=cart.x>view.left+100*cart.scale&&cart.x<view.right-100*cart.scale;
        if(inside&&cart.callAt===null)cart.callAt=cart.age;
        if(cart.callAt!==null&&cart.age-cart.callAt<4.7)dialogues.push({id:cart.id,key:`${cart.id}:call`,kind:'hawker',gender:'male',x:cart.x-52*cart.scale*cart.direction,y:cart.y-122*cart.scale});
        if(cart.reduced?cart.age>=softEnd:cart.direction>0?cart.x>view.right+125:cart.x<view.left-125){cart=null;cartWait=45+random()*30;}
      }else{
        cartWait-=dt;
        if(cartWait<=0&&!encounter&&!solo){const direction=random()<.5?1:-1,scale=.76;
          const x=reduced?view.left+view.width*.52:direction>0?view.left-120:view.right+120;
          cart={id:`hawker-${++serial}`,kind:'hawker',gender:'male',x,startX:x,y:Math.min(view.bottom-58,668),scale,direction,speed:48+random()*7,age:0,time:clock,wheel:0,reduced,opacity:reduced?0:1,callAt:null};
        }
      }
      if(solo){
        solo.age+=dt;const stall=stalls[solo.stallIndex];
        if(solo.age<4.7)dialogues.push({id:stall.id,key:`vendor-call-${solo.id}`,kind:stall.kind,turn:'call',gender:stall.gender,x:stall.x-43*stall.scale,y:stall.y-134*stall.scale});
        else{solo=null;talkWait=16+random()*12;}
      }else if(encounter){
        const e=encounter,person=students.find(p=>p.id===e.person.id&&!p.removed);
        if(!person||person.recovery||person.waitingSeat){api.cancelInteraction();return api;}
        e.person=person;e.elapsed+=dt;
        if(reduced&&!e.reduced){e.reduced=true;e.origin={x:person.x,y:person.y};e.destination={...e.origin};}
        const approach=e.reduced?0:2.6,talkEnd=approach+16,returnEnd=talkEnd+(e.reduced?0:2.6);
        const returning=e.elapsed>talkEnd,travelling=e.elapsed<approach||returning;
        const q=smooth(returning?(e.elapsed-talkEnd)/2.6:approach?e.elapsed/approach:1);
        e.pose={x:mix(returning?e.destination.x:e.origin.x,returning?e.origin.x:e.destination.x,q),y:mix(returning?e.destination.y:e.origin.y,returning?e.origin.y:e.destination.y,q),direction:returning?-e.direction:e.direction,walking:travelling&&!e.reduced,chatting:!travelling};
        const local=e.elapsed-approach;
        const stage=local>=0&&local<4.6?0:local>=5.6&&local<10.2?1:local>=11.3&&local<15.9?2:-1;
        if(stage>=0){const pupil=stage===1,stall=stalls[e.stallIndex];
          dialogues.push({id:pupil?person.id:stall.id,key:`vendor-exchange-${e.id}:${stage}`,kind:pupil?'pupil':stall.kind,turn:stage===0?'greet':stage===1?'reply':'farewell',gender:pupil?(person.gender==='female'?'female':'male'):stall.gender,pupilId:pupil?person.id:null,x:stall.x-43*stall.scale,y:stall.y-134*stall.scale});
        }
        if(e.elapsed>=returnEnd){person.x=e.origin.x;person.y=e.origin.y;api.cancelInteraction();}
      }else if(!cart||cart.callAt!==null&&!dialogues.length){
        talkWait-=dt;
        if(talkWait<=0){
          const stallIndex=Math.floor(random()*stalls.length)%stalls.length,stall=stalls[stallIndex];
          const candidates=students.filter(p=>!p.removed&&!p.recovery&&!p.waitingSeat&&!p.chatting&&p.x>view.left+30&&p.x<view.right-30&&Math.abs(p.x-stall.x)<160&&p.y>=510&&p.y<view.bottom-18);
          const person=candidates.sort((a,b)=>Math.hypot(a.x-stall.x,a.y-stall.y)-Math.hypot(b.x-stall.x,b.y-stall.y))[0];
          if(person){const direction=person.x<stall.x?1:-1,origin={x:person.x,y:person.y};
            const destination=reduced?{...origin}:{x:person.x+clamp(stall.x-direction*70*stall.scale-person.x,-65,65),y:person.y+clamp(stall.y+22-person.y,-135,0)};
            person.chatUntil=0;encounter={id:++serial,person,stallIndex,direction,origin,destination,reduced,elapsed:0,pose:{...origin,direction,walking:!reduced,chatting:reduced}};
          }else solo={id:++serial,stallIndex,age:0};
        }
      }
      return api;
    },
  };return api;
}
function line(c,x1,y1,x2,y2,color,width=2){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.stroke();}
function box(c,x,y,w,h,color,r=2){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();}
function oval(c,x,y,rx,ry,color){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();}
function polygon(c,points,color){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();}
function label(c,value,x,y,size,color){c.font=`800 ${size}px "Be Vietnam Pro", Arial, sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillStyle=color;c.fillText(value,x,y);}
function baguette(c,x,y,angle=0){c.save();c.translate(x,y);c.rotate(angle);oval(c,0,0,17,4.7,'#b5763e');oval(c,0,-1,16,4,'#e8b867');for(let i=-9;i<=9;i+=6)line(c,i-1,-3,i+2,1,'#fff0ad',1.4);c.restore();}
function adult(c,{kind,time=0,walking=false,direction=1,talking=false,alert=false}){
  const gait=walking?Math.sin(time*7):0,hand=talking?Math.sin(time*4)*3:0,skin='#d9a171';
  line(c,-4,-28,-7+gait*7,-3,'#495f59',6);line(c,4,-28,8-gait*7,-3,'#495f59',6);
  line(c,-9+gait*7,-2,-3+gait*7,-2,'#3b514b',5);line(c,5-gait*7,-2,12-gait*7,-2,'#3b514b',5);
  box(c,-12,-64,24,37,kind==='xoi'?'#a76470':'#668f9a',7);polygon(c,[[-8,-57],[8,-57],[12,-25],[-11,-25]],kind==='xoi'?'#d8b56e':'#e2ccb0');
  line(c,-12,-57,-17,-41,skin,5);line(c,-17,-41,walking?13:-25,talking?-61+hand:-48,skin,4);
  line(c,12,-57,walking?24:18,-44,skin,5);line(c,walking?24:18,-44,walking?33:27,alert?-74:talking?-66-hand:-49,skin,4);
  oval(c,0,-77,11,13,skin);oval(c,0,-85,11,6,'#494942');
  if(kind==='xoi'){polygon(c,[[-22,-86],[0,-106],[22,-86]],'#d9c38a');line(c,-22,-86,22,-86,'#a48a5a',2);line(c,0,-103,-12,-87,'#eee0b1',1);}
  else{box(c,-12,-92,23,8,'#6c8373',4);line(c,-12,-86,17,-86,'#435d51',3);}
  oval(c,direction*3,-78,1.1,1.4,'#454b40');line(c,direction*2,-70,direction*6,-70+(talking?2:0),'#8a5847',1.1);
}
/** Returns planted support geometry as well as drawing the actual food stall. */
export function drawStreetVendor(c,vendor,{time=0,talking=false,alert=false}={}){
  const {x,y,scale:s,kind}=vendor,moving=kind==='hawker',direction=vendor.direction||1;
  c.save();c.globalAlpha*=vendor.opacity??1;c.translate(x,y);c.scale(s,s);
  oval(c,0,1,moving?84:68,6,'#3b504528');
  c.save();c.translate(moving?-65*direction:-43,0);if(moving)c.scale(direction,1);adult(c,{kind:moving?'banhmi':kind,time:vendor.time??time,walking:moving&&!vendor.reduced,direction:moving?1:1,talking,alert});c.restore();
  const wheelXs=moving?[-25,33]:[-25,35];
  for(const wx of wheelXs){oval(c,wx,-9,9,9,'#4b6059');oval(c,wx,-9,6,6,'#a8b7ab');c.save();c.translate(wx,-9);c.rotate(vendor.wheel||0);for(let i=0;i<3;i++){const a=i*Math.PI/3;line(c,Math.cos(a)*-5,Math.sin(a)*-5,Math.cos(a)*5,Math.sin(a)*5,'#718779',1);}c.restore();}
  if(moving)line(c,-46*direction,-45,-29*direction,-45,'#667f73',4);
  box(c,-36,-50,83,34,kind==='xoi'?'#a45e4d':'#779798',3);box(c,-40,-54,91,7,'#cbb890');
  if(kind==='xoi'){
    box(c,-22,-81,38,27,'#b6c2b4',4);oval(c,-3,-80,19,5,'#e0e0c9');oval(c,-3,-58,18,4,'#8a9e94');line(c,-26,-73,-23,-73,'#788c80',4);line(c,16,-73,21,-73,'#788c80',4);oval(c,-3,-84,15,3,'#d4d7c3');box(c,-6,-89,6,5,'#657e70',2);
    for(const [px,py] of [[25,-60],[37,-60],[31,-69]]){polygon(c,[[px-7,py],[px-3,py-9],[px+7,py-6],[px+7,py+1]],'#66895e');line(c,px,py-7,px+2,py,'#bbca8e',1);}
    c.strokeStyle='#fff9dd99';c.lineWidth=1.6;for(let i=0;i<3;i++){const sy=-95-(time*9+i*8)%23;c.beginPath();c.moveTo(-9+i*7,sy);c.quadraticCurveTo(-15+i*7,sy-7,-7+i*7,sy-13);c.stroke();}
    label(c,'XÔI NÓNG',5,-34,9,'#fff1cd');
  }else{
    box(c,-34,-91,79,37,'#d9ede2c9',2);line(c,-33,-91,44,-91,'#7b9381',3);for(const px of [-33,44])line(c,px,-91,px,-54,'#728f80',3);line(c,-32,-70,43,-70,'#9db4a2',1.5);
    for(const [bx,by,a] of [[-12,-81,-.12],[23,-80,.08],[-12,-61,.06],[23,-61,-.12]])baguette(c,bx,by,a);
    if(moving){
      box(c,-28,-107,28,15,'#aab9aa',3);oval(c,-14,-107,14,3,'#d4daca');box(c,-17,-113,6,4,'#667b6b',2);
      for(let i=0;i<3;i++){c.save();c.translate(14+i*8,-99-i%2*3);c.rotate(-.3+i*.15);oval(c,0,0,3.5,10,'#e7bf58');for(let j=-6;j<7;j+=3)line(c,-2,j,2,j,'#fff0a1',1);polygon(c,[[-4,8],[-5,-2],[0,7],[4,-4],[4,8]],'#7e9a59');c.restore();}
    }
    line(c,-31,-88,-18,-75,'#fffefa99',2);label(c,moving?'HÀNG RONG':'BÁNH MÌ',5,-34,moving?7.2:9,'#fff1cd');
  }
  if(!moving){for(const px of [-37,48])line(c,px,-54,px,-113,'#849179',2.5);polygon(c,[[-46,-113],[55,-113],[49,-127],[-39,-127]],kind==='xoi'?'#dbb36d':'#be7760');for(let i=0;i<5;i++)polygon(c,[[-44+i*20,-113],[-34+i*20,-113],[-31+i*18,-126],[-39+i*18,-126]],'#f2dfb0');box(c,-46,-113,101,5,kind==='xoi'?'#bb9458':'#a35f50',1);}
  c.restore();
  return {kind,x,y,scale:s,wheels:wheelXs.map(wx=>({x:x+wx*s,y:y-9*s,radius:9*s,bottom:y})),feet:[{x:x+(moving?-65*direction:-43)*s,y},{x:x+(moving?-65*direction:-43)*s,y}]};
}
