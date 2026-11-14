import {Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene, SRGBColorSpace, TextureLoader, WebGLRenderer} from 'three';
import type {Texture} from 'three';

interface Surface {
  url:string; left:number; top:number; width:number; height:number; viewportWidth:number; viewportHeight:number;
}
export function mapLight(canvas:HTMLCanvasElement) {
  const host=canvas.parentElement!;
  const renderer=new WebGLRenderer({canvas,alpha:true,antialias:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.6));
  renderer.setClearColor(0,0);
  const scene=new Scene(),camera=new OrthographicCamera(0,1,1,0,.1,5);
  camera.position.z=2;
  const material=new MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false});
  const plane=new Mesh(new PlaneGeometry(1,1),material);
  scene.add(plane);
  const textures=new Map<string,Texture|null>(),loader=new TextureLoader();
  let latest:Surface|undefined,w=0,h=0;
  function render(){
    if(!latest||renderer.getContext().isContextLost())return;
    const s=latest,texture=textures.get(s.url);
    if(!texture){delete host.dataset.surface;return;}
    if(w!==s.viewportWidth||h!==s.viewportHeight){
      w=s.viewportWidth;h=s.viewportHeight;
      renderer.setSize(w,h,false);camera.right=w;camera.top=h;camera.updateProjectionMatrix();
    }
    material.map=texture;
    plane.scale.set(s.width,s.height,1);
    plane.position.set(s.left+s.width/2,h-s.top-s.height/2,0);
    renderer.render(scene,camera);
    host.dataset.surface='ready';
  }
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();delete host.dataset.surface;});
  canvas.addEventListener('webglcontextrestored',()=>requestAnimationFrame(render));
  return (s:Surface)=>{
    latest=s;
    if(!textures.has(s.url)){
      textures.set(s.url,null);
      loader.load(s.url,texture=>{texture.colorSpace=SRGBColorSpace;textures.set(s.url,texture);material.needsUpdate=true;render();},undefined,()=>{delete host.dataset.surface;});
    }
    render();
  };
}
