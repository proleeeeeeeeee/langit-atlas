import {WebGLRenderer} from 'three';
import {earthScene} from './earth';
import {createSkyPlot} from './renderer';
import type {SkyFrame} from './model';

export type SceneName='earth'|'forecast'|'ephemeris'|'conditions';
export interface StageView {
  name:SceneName; frame?:SkyFrame; x:number; y:number; progress:number; arrival:number; skyDrift:number; red:boolean; cover:boolean;
}
const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));

export function stageRenderer(canvas:HTMLCanvasElement, labels:HTMLElement, pin:HTMLElement, redraw:()=>void) {
  const renderer=new WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));
  const earth=earthScene(renderer,pin,redraw);
  let sky:ReturnType<typeof createSkyPlot>|undefined, width=0,height=0;
  function draw(view:StageView){
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h||renderer.getContext().isContextLost())return;
    if(w!==width||h!==height){renderer.setSize(w,h,false);width=w;height=h;}
    const {name,frame,x,y,progress,red}=view;
    if(name==='earth'||name==='conditions'||!frame){
      labels.hidden=true;
      const home=name==='earth' || !frame;
      const lat=home?3.14:frame.lat,lon=home?101.69:frame.lon;
      const wide=view.cover&&w/h>1.28;
      const distance=home?(wide?3.92:4.22):1.74+1.55*view.arrival;
      earth.draw(w,h,lat,lon,clamp(lat+(home?13:2)+y,-75,75),lon+(home?8:1)+x,distance-.16*progress,wide?.248:0,red,home?undefined:frame.atlasRegion);
      return;
    }
    pin.hidden=true;labels.hidden=false;
    sky??=createSkyPlot(canvas,labels,()=>{},redraw,redraw,renderer);
    const highest=frame.subjects.reduce((a,b)=>a.alt>b.alt?a:b);
    const aim=name==='ephemeris'?frame.target:(frame.subjects[0].alt>8?frame.subjects[0]:highest);
    sky.draw(frame,{az:aim.az+x+10*view.arrival+view.skyDrift,alt:clamp(aim.alt+y+(name==='forecast'?-9:0),7,80),
      focal:name==='ephemeris'?12:10,figures:true,galaxy:true});
  }
  return {draw,pick:earth.pick};
}
