import type {SkyFrame} from './model';
import type {SceneName,StageView} from './stage-renderer';

export function observatory(pickPlace:(lat:number,lon:number)=>void) {
  const el=(id:string)=>document.getElementById(id)!;
  const panel=el('observatory'), hit=el('stage-interaction'), canvas=el('stage-canvas') as HTMLCanvasElement;
  const labels=el('stage-labels'),pin=el('earth-label'),name=el('stage-name'),reading=el('stage-reading');
  const controls=Array.from(document.querySelectorAll<HTMLButtonElement>('[data-chapter]'));
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  let plan=false,frame:SkyFrame|undefined,visible=true,ready=false,failed=false;
  let draw:((view:StageView)=>void)|undefined,scene:SceneName='earth';
  let x=0,y=0,toX=0,toY=0,ticket=0,last=0;
  let enteredAt=-1000;
  let pick:((x:number,y:number)=>{lat:number;lon:number}|undefined)|undefined;
  let pointer:{id:number;x:number;y:number;startX:number;startY:number;moved:boolean}|null=null;
  const lang=()=>document.documentElement.lang==='en';
  const isEarth=()=>scene==='earth'||(scene==='conditions'&&!frame?.skyOnly);
  function describe(){
    const en=lang();
    if(failed){
      name.textContent=en?'Pulau Mawar, Johor':'柔佛 · Pulau Mawar';reading.textContent=en?'Photograph by Chalizham · 2020':'摄影 Chalizham · 2020';
    }else{
      name.textContent=scene==='earth'?(en?'Earth at night':'地球夜景'):scene==='conditions'?(frame?.place||''):
        scene==='ephemeris'?(en?'Camera direction':'镜头朝向'):(en?'Local sky':'当地星空');
      reading.textContent=isEarth()?(en?'NASA Black Marble · 2016':'NASA 黑色大理石 · 2016'):
        frame?[frame.place,frame.date,frame.clock+' MYT'].join('  /  '):'';
      if(scene==='conditions'&&frame&&!frame.skyOnly){
        const ratio=frame.glowRatio;
        reading.textContent=(en?'Skyglow model · 2014':'光污染模型 · 2014')+
          (ratio===undefined?'':'  /  '+Number(ratio.toPrecision(3))+'×');
      }
      pin.textContent=scene==='conditions'&&frame?frame.place:(en?'Malaysia':'马来西亚');
    }
    controls.forEach(b=>{if(b.dataset.chapter===scene)b.setAttribute('aria-current','location');else b.removeAttribute('aria-current');});
  }
  function detect(){
    if(!plan)return 'earth';
    const narrow=innerWidth<=780;
    const threshold=narrow?Math.min(innerHeight*.48,295):innerHeight*.45;
    const atBottom=scrollY>0 && scrollY+innerHeight>=document.documentElement.scrollHeight-4;
    if(el('conditions').getBoundingClientRect().top<=threshold||atBottom)return 'conditions';
    if(el('ephemeris').getBoundingClientRect().top<=threshold)return 'ephemeris';
    return 'forecast';
  }
  function paint(now:number){
    ticket=0;
    const next=detect();
    if(next!==scene){
      scene=next;panel.dataset.scene=scene;
      x=toX=y=toY=0;enteredAt=now;describe();
      if(ready&&!reduce.matches)canvas.animate([{opacity:.24},{opacity:1}],{duration:420,easing:'ease-out'});
    }
    if(!visible||document.hidden||document.querySelector('dialog[open]')||!ready||!draw)return;
    const k=reduce.matches?1:1-Math.exp(-Math.min(64,Math.max(12,now-last))/60);
    last=now;x+=(toX-x)*k;y+=(toY-y)*k;
    const progress=reduce.matches?0:Math.min(1,Math.max(0,scrollY/Math.max(1,innerHeight)));
    const arrival=reduce.matches?0:Math.pow(Math.max(0,1-(now-enteredAt)/700),3);
    const skyDrift=plan&&scene==='forecast'&&!reduce.matches?progress*13:0;
    draw({name:scene,frame,x,y,progress,arrival,skyDrift,red:document.documentElement.dataset.night==='red',cover:!plan});
    if(arrival>0||Math.abs(toX-x)+Math.abs(toY-y)>.025)schedule();
  }
  function schedule(){if(!ticket&&!document.hidden)ticket=requestAnimationFrame(paint);}
  function fallback(){
    ready=false;failed=true;panel.dataset.render='fallback';pin.hidden=true;labels.hidden=true;
    hit.removeAttribute('tabindex');el('stage-reset').hidden=true;describe();
  }
  async function load(){
    if(draw||failed)return;
    try{
      const {stageRenderer}=await import('./stage-renderer');
      const renderer=stageRenderer(canvas,labels,pin,schedule);
      draw=renderer.draw;pick=renderer.pick;
      if(!reduce.matches&&!plan){x=-11;y=3;}
      ready=true;panel.dataset.render='ready';schedule();
    }catch{fallback();}
  }
  function reset(){toX=toY=0;schedule();}
  hit.addEventListener('pointerdown',e=>{
    if(e.button!==0||!e.isPrimary||!ready)return;
    pointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};hit.setPointerCapture(e.pointerId);
  });
  hit.addEventListener('pointermove',e=>{
    if(pointer?.id!==e.pointerId)return;
    const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
    if(Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)>5)pointer.moved=true;
    toX+=dx*(isEarth()?-.20:-.14);toY=Math.min(70,Math.max(-70,toY+dy*.16));
    pointer.x=e.clientX;pointer.y=e.clientY;schedule();
  });
  hit.addEventListener('lostpointercapture',()=>{pointer=null;});
  hit.addEventListener('pointerup',e=>{
    if(!pointer||pointer.id!==e.pointerId||pointer.moved||!isEarth()||!pick)return;
    const rect=hit.getBoundingClientRect();
    const xy=pick(2*(e.clientX-rect.left)/rect.width-1,1-2*(e.clientY-rect.top)/rect.height);
    if(xy)pickPlace(xy.lat,xy.lon);
  });
  hit.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&isEarth())pickPlace(frame?.lat??3.14,frame?.lon??101.69);
    else if(e.key==='Home')reset();
    else if(e.key==='ArrowLeft')toX-=6;else if(e.key==='ArrowRight')toX+=6;
    else if(e.key==='ArrowUp')toY=Math.min(70,toY+5);else if(e.key==='ArrowDown')toY=Math.max(-70,toY-5);else return;
    e.preventDefault();schedule();
  });
  el('stage-reset').onclick=reset;
  controls.forEach(b=>b.onclick=()=>{
    const section=el(b.dataset.chapter!);
    section.scrollIntoView({block:'start',behavior:reduce.matches?'instant':'smooth'});
    const h=section.querySelector<HTMLElement>('h1,h2');
    if(h){h.tabIndex=-1;h.focus({preventScroll:true});}
  });
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback();});
  canvas.addEventListener('webglcontextrestored',()=>{
    failed=false;ready=true;panel.dataset.render='ready';hit.tabIndex=0;el('stage-reset').hidden=false;describe();schedule();
  });
  new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(visible)schedule();}).observe(panel);
  new ResizeObserver(schedule).observe(hit);
  new MutationObserver(()=>{describe();schedule();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-night','lang']});
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',schedule));
  document.addEventListener('visibilitychange',schedule);window.addEventListener('scroll',schedule,{passive:true});
  reduce.addEventListener('change',schedule);
  describe();void load();
  return {
    route(hasPlace:boolean){
      plan=hasPlace;if(!plan)frame=undefined;
      el(plan?'plan-visual':'home-visual').append(panel);
      scene=detect();panel.dataset.scene=scene;enteredAt=performance.now();reset();describe();
      if(ready&&!reduce.matches)canvas.animate([{opacity:.2},{opacity:1}],{duration:500,easing:'ease-out'});
    },
    update(next:SkyFrame){
      frame=next;el('sky-preview-time').textContent=next.clock+' MYT';describe();schedule();
    }
  };
}
