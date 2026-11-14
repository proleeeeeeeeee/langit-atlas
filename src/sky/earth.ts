import {
  BackSide, BufferGeometry, Color, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments,
  Mesh, MeshBasicMaterial, PerspectiveCamera, Points, PointsMaterial, RingGeometry, Scene,
  Raycaster, ShaderMaterial, SphereGeometry, Texture, TextureLoader, Vector2, Vector3, Vector4, WebGLRenderer
} from 'three';
import stars from './bright-stars.json';
import nightImage from './earth-night.webp';
import galaxyImage from './milkyway.jpg';
import {deg} from './model';
import type {SkyFrame} from './model';

function surface(lat:number, lon:number, radius=1) {
  const a=lat*deg, b=lon*deg;
  return new Vector3(radius*Math.cos(a)*Math.cos(b),radius*Math.sin(a),-radius*Math.cos(a)*Math.sin(b));
}

export function earthScene(renderer:WebGLRenderer, markerLabel:HTMLElement, redraw:()=>void) {
  const scene=new Scene(), camera=new PerspectiveCamera(33,1,.05,50);
  scene.background=new Color(0x06090c);
  const globe=new Group();
  scene.add(globe);
  const photo=new TextureLoader().load(nightImage,redraw);
  const material=new ShaderMaterial({
    uniforms:{world:{value:photo},red:{value:false},showAtlas:{value:false},atlas:{value:photo},bounds:{value:new Vector4()}},
    vertexShader:`
      varying vec2 tex; varying vec3 normalView; varying vec3 eye;
      void main(){
        tex=uv; vec4 v=modelViewMatrix*vec4(position,1.);
        normalView=normalMatrix*normal; eye=-v.xyz; gl_Position=projectionMatrix*v;
      }`,
    fragmentShader:`
      uniform sampler2D world; uniform bool red;
      uniform sampler2D atlas; uniform bool showAtlas; uniform vec4 bounds;
      varying vec2 tex; varying vec3 normalView; varying vec3 eye;
      void main(){
        vec3 n=normalize(normalView);
        float edge=pow(1.-max(0.,dot(n,normalize(eye))),3.);
        float grazing=clamp(.55+.45*dot(n,normalize(vec3(-.7,.6,.6))),0.,1.);
        vec3 albedo=texture2D(world,tex).rgb;
        vec3 c=pow(albedo,vec3(.76))*1.24 + vec3(.018,.032,.044);
        if(showAtlas){
          float lon=(tex.x-.5)*360.;
          float lat=clamp((tex.y-.5)*3.14159265,-1.47,1.47);
          float merc=log(tan(.78539816+lat*.5));
          vec2 here=(vec2(lon,merc)-bounds.xy)/(bounds.zw-bounds.xy);
          if(all(greaterThanEqual(here,vec2(0.)))&&all(lessThanEqual(here,vec2(1.)))){
            vec4 glow=texture2D(atlas,here);
            c=mix(c,glow.rgb,glow.a);
          }
        }
        c=c*(.65+.35*grazing)+vec3(.24,.48,.62)*edge*grazing;
        if(red)c=dot(c,vec3(.3,.59,.11))*vec3(1.,.51,.36);
        gl_FragColor=vec4(c,1.);
      }`
  });
  const planet=new Mesh(new SphereGeometry(1,112,64),material);
  globe.add(planet);
  const galaxyInk=new MeshBasicMaterial({map:new TextureLoader().load(galaxyImage,redraw),side:BackSide,transparent:true,opacity:.18,depthWrite:false});
  const backdrop=new Mesh(new SphereGeometry(24,48,24),galaxyInk);
  backdrop.rotation.set(.75,.3,-.45);
  backdrop.renderOrder=-10;
  scene.add(backdrop);
  const grid:number[]=[];
  function segment(a:Vector3,b:Vector3){grid.push(...a.toArray(),...b.toArray());}
  for(let lat=-75;lat<=75;lat+=15)for(let lon=-180;lon<180;lon+=2)
    segment(surface(lat,lon,1.0006),surface(lat,lon+2,1.0006));
  for(let lon=-180;lon<180;lon+=15)for(let lat=-90;lat<90;lat+=2)
    segment(surface(lat,lon,1.0006),surface(lat+2,lon,1.0006));
  const gridGeometry=new BufferGeometry();
  gridGeometry.setAttribute('position',new Float32BufferAttribute(grid,3));
  const gridInk=new LineBasicMaterial({color:0x899da5,transparent:true,opacity:.16,depthWrite:false});
  globe.add(new LineSegments(gridGeometry,gridInk));
  const pin=new Group(),ink=new MeshBasicMaterial({color:0xffcd94});
  pin.add(new Mesh(new RingGeometry(.014,.018,40),ink),new Mesh(new SphereGeometry(.006,12,8),ink));
  globe.add(pin);
  const positions:number[]=[];
  for(const [ra,dec] of stars) positions.push(...surface(dec,ra,16).toArray());
  const catalogue=new BufferGeometry();
  catalogue.setAttribute('position',new Float32BufferAttribute(positions,3));
  const starInk=new PointsMaterial({color:0xc3c9d4,size:1.45,sizeAttenuation:false});
  scene.add(new Points(catalogue,starInk));
  const centre=new Vector3(),projected=new Vector3();
  const atlasTextures=new Map<string,Texture|null>();
  const mercator=(lat:number)=>Math.log(Math.tan(Math.PI/4+lat*deg/2));
  function draw(width:number,height:number,lat:number,lon:number,lookLat:number,lookLon:number,range:number,offset:number,red:boolean,region?:SkyFrame['atlasRegion']){
    camera.aspect=width/height;
    camera.position.copy(surface(lookLat,lookLon,range));
    camera.lookAt(centre);
    camera.updateMatrixWorld();
    // An asymmetric projection leaves space for the location search on wide covers.
    camera.setViewOffset(width,height,-offset*width,0,width,height);
    pin.position.copy(surface(lat,lon,1.004));
    pin.lookAt(pin.position.clone().multiplyScalar(2));
    material.uniforms.red.value=red;
    material.uniforms.showAtlas.value=false;
    if(region){
      const key=region.image;
      if(!atlasTextures.has(key)){
        atlasTextures.set(key,null);
        new TextureLoader().load('/assets/'+key,texture=>{atlasTextures.set(key,texture);redraw();});
      }
      const texture=atlasTextures.get(key);
      if(texture){
        material.uniforms.atlas.value=texture;material.uniforms.showAtlas.value=true;
        material.uniforms.bounds.value.set(region.west,mercator(region.south),region.east,mercator(region.north));
      }
    }
    galaxyInk.color.setHex(red?0xa0563a:0xabbac8);
    gridInk.color.setHex(red?0xc48a6a:0x899da5);
    starInk.color.setHex(red?0x956951:0xc3c9d4);
    scene.background=(scene.background as Color).setHex(red?0x100806:0x06090c);
    projected.copy(pin.position).project(camera);
    markerLabel.hidden=pin.position.dot(camera.position)<=1.01 || Math.abs(projected.x)>.9 || Math.abs(projected.y)>.9;
    markerLabel.style.left=(50+50*projected.x)+'%';
    markerLabel.style.top=(50-50*projected.y)+'%';
    renderer.render(scene,camera);
  }
  const ray=new Raycaster();
  function pick(x:number,y:number){
    ray.setFromCamera(new Vector2(x,y),camera);
    const hit=ray.intersectObject(planet,false)[0];
    if(!hit)return;
    const point=hit.point.normalize();
    return {lat:Math.asin(point.y)/deg,lon:Math.atan2(-point.z,point.x)/deg};
  }
  return {draw,pick};
}
