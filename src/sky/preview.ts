import type {SkyFrame} from './model';
import type {SkyPlot} from './renderer';

export function previewSky() {
  const canvas=document.getElementById('sky-preview') as HTMLCanvasElement;
  const button=canvas.parentElement!;
  const caption=document.getElementById('sky-preview-time')!;
  const labels=document.createElement('div');
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let frame:SkyFrame|undefined, plot:SkyPlot|undefined, shown=false, pending=false, failed=false;
  let x=0,y=0,ticket=0;
  function draw() {
    ticket=0;
    if (!frame||!shown||!plot||document.hidden) return;
    const core=frame.subjects[0];
    const aim=core.alt>8?core:(frame.target.alt>8?frame.target:frame.subjects.reduce((a,b)=>a.alt>b.alt?a:b));
    plot.draw(frame,{az:aim.az+x,alt:Math.min(86,Math.max(5,aim.alt+y)),focal:15,figures:true,galaxy:true});
  }
  function schedule() {
    if(!ticket&&shown&&frame&&!document.hidden) ticket=requestAnimationFrame(draw);
  }
  async function prepare() {
    if (!frame||!shown||pending||plot||failed) return;
    pending=true;
    try {
      const {createSkyPlot}=await import('./renderer');
      if (!frame||!shown) return;
      plot=createSkyPlot(canvas,labels,()=>{button.dataset.render='fallback';},()=>{button.dataset.render='ready';schedule();},schedule);
      button.dataset.render='ready';schedule();
    } catch { failed=true;button.dataset.render='fallback'; }
    finally {pending=false;}
  }
  new IntersectionObserver(([entry])=>{shown=entry.isIntersecting;if(shown){void prepare();schedule();}}).observe(button);
  new ResizeObserver(schedule).observe(button);
  document.addEventListener('visibilitychange',schedule);
  button.addEventListener('pointermove',event=>{
    if(motion.matches||event.pointerType!=='mouse')return;
    const box=button.getBoundingClientRect();
    x=((event.clientX-box.left)/box.width-.5)*14;y=(.5-(event.clientY-box.top)/box.height)*8;schedule();
  });
  button.addEventListener('pointerleave',()=>{x=0;y=0;schedule();});
  return {
    update(next:SkyFrame){frame=next;caption.textContent=next.clock+' MYT';void prepare();schedule();},
    clear(){frame=undefined;plot?.dispose();plot=undefined;if(ticket)cancelAnimationFrame(ticket);ticket=0;failed=false;x=y=0;delete button.dataset.render;}
  };
}
