/** Sparse birdsong pauses with conversation; returning never catches up old calls. */
export function createAmbientBirds({audio,isAllowed=()=>false,random=Math.random,now=()=>performance.now(),setTimer=(fn,delay)=>globalThis.setTimeout(fn,delay),clearTimer=id=>globalThis.clearTimeout(id)}={}){
  const jitter=()=>Math.min(1,Math.max(0,Number(random())||0));
  let timer=null,dueAt=0,remaining=15000+jitter()*10000,disposed=false,epoch=0;
  const allowed=()=>{try{return !disposed&&isAllowed()===true;}catch{return false;}};
  function pause(){
    epoch++;
    if(timer!==null){clearTimer(timer);timer=null;remaining=Math.max(2000,dueAt-now());}
    audio?.stopBirds();
  }
  function sync(){
    if(!allowed()){pause();return;}
    if(timer!==null)return;
    const delay=Math.max(2000,remaining),token=++epoch;dueAt=now()+delay;
    timer=setTimer(()=>{
      if(token!==epoch)return;
      timer=null;
      if(!allowed()){remaining=2000;audio?.stopBirds();return;}
      let played=false;try{played=audio?.bird()===true;}catch{}
      remaining=played?35000+jitter()*25000:5000;
      sync();
    },delay);
  }
  return {sync,destroy(){disposed=true;pause();}};
}
