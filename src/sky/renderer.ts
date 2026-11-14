import {
  BufferGeometry, Color, Float32BufferAttribute, Group, LineBasicMaterial,
  LineSegments, Matrix4, PerspectiveCamera, Points, PointsMaterial, Scene,
  SRGBColorSpace, Vector3, WebGLRenderer
} from 'three';
import { Observer, Rotation_EQJ_HOR } from 'astronomy-engine';
import brightStars from './bright-stars.json';
import { subjectTrail } from '../ephemeris.js';
import { deg, fieldOfView } from './model';
import type { CameraView, SkyFrame } from './model';

export interface SkyPlot {
  draw(frame: SkyFrame, view: CameraView): void;
  dispose(): void;
}

const horizontal = (az: number, alt: number) => {
  const a = az*deg, h = alt*deg, c = Math.cos(h);
  return new Vector3(c*Math.sin(a),Math.sin(h),-c*Math.cos(a));
};

function segments(points: number[], colour: number) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points,3));
  const material = new LineBasicMaterial({color:colour});
  return new LineSegments(geometry,material);
}

export function createSkyPlot(canvas: HTMLCanvasElement, labels: HTMLElement, lost: () => void, restored: () => void): SkyPlot {
  const renderer = new WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
  renderer.localClippingEnabled = false;
  const scene = new Scene(), camera = new PerspectiveCamera(50,1.5,.01,3);
  const stars = new Group(); stars.matrixAutoUpdate = false;
  scene.add(stars);
  const geometries: BufferGeometry[] = [], materials: (PointsMaterial | LineBasicMaterial)[] = [];
  const starMaterials: PointsMaterial[] = [];
  const buckets: number[][] = [[],[],[],[]];
  for (const [ra,dec,mag] of brightStars) {
    const r = ra*deg, d = dec*deg, c = Math.cos(d);
    buckets[mag<1?0:mag<2?1:mag<3?2:3].push(c*Math.cos(r),c*Math.sin(r),Math.sin(d));
  }
  for (const [i,coords] of buckets.entries()) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position',new Float32BufferAttribute(coords,3));
    const material = new PointsMaterial({size:[3.6,2.8,2.0,1.55][i],sizeAttenuation:false});
    // Clip the celestial sphere at the observer's local horizon in world coordinates.
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying float localAltitude;\n' + shader.vertexShader
        .replace('#include <project_vertex>', '#include <project_vertex>\nlocalAltitude = (modelMatrix * vec4(transformed, 1.0)).y;');
      shader.fragmentShader = 'varying float localAltitude;\n' + shader.fragmentShader
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (localAltitude < 0.0 || length(gl_PointCoord - vec2(0.5)) > 0.5) discard;');
    };
    geometries.push(geometry); materials.push(material); starMaterials.push(material);
    stars.add(new Points(geometry,material));
  }
  const horizon: number[] = [], grid: number[] = [];
  function appendArc(points: number[], from: Vector3, to: Vector3) { points.push(from.x,from.y,from.z,to.x,to.y,to.z); }
  for (let a=0;a<360;a+=2) {
    appendArc(horizon,horizontal(a,0),horizontal(a+2,0));
    for (const h of [30,60]) appendArc(grid,horizontal(a,h),horizontal(a+2,h));
  }
  for (let a=0;a<360;a+=30) {
    for (let h=0;h<90;h+=2) appendArc(grid,horizontal(a,h),horizontal(a,h+2));
    appendArc(horizon,horizontal(a,0),horizontal(a,1.0));
  }
  const gridLines = segments(grid,0x232b2d), horizonLine = segments(horizon,0x736b5b);
  const trail = new LineSegments(new BufferGeometry(),new LineBasicMaterial({color:0xdfab8d}));
  trail.frustumCulled = false;
  trail.material.depthTest = false;
  trail.renderOrder = 1;
  scene.add(gridLines,horizonLine,trail);
  geometries.push(gridLines.geometry,horizonLine.geometry,trail.geometry);
  materials.push(gridLines.material,horizonLine.material,trail.material);

  let trailEnd: {az:number; alt:number} | undefined;
  let trailKey = '';
  function updateTrail(frame: SkyFrame, key: string) {
    const nextKey = key + '|' + frame.subjectKey + '|' + frame.nightEnd;
    if (trailKey === nextKey) return;
    trailKey = nextKey;
    const points = frame.ms < frame.nightEnd ? subjectTrail(frame.lat,frame.lon,frame.ms,frame.subjectKey) : [];
    trailEnd = points.at(-1);
    const positions: number[] = [];
    // Alternating ephemeris intervals form dashes. Clip each dash at the horizon.
    for (let i=0; i+1<points.length; i+=2) {
      const a = horizontal(points[i].az,points[i].alt);
      const b = horizontal(points[i+1].az,points[i+1].alt);
      if (a.y<0 && b.y<0) continue;
      if ((a.y<0) !== (b.y<0)) {
        const edge = a.clone().lerp(b,a.y/(a.y-b.y));
        if (a.y<0) a.copy(edge); else b.copy(edge);
      }
      appendArc(positions,a,b);
    }
    trail.visible = positions.length > 0;
    if (!trail.visible) return;
    if (!trail.geometry.hasAttribute('position')) {
      const maxVertices = 2*Math.floor(points.length/2);
      trail.geometry.setAttribute('position',new Float32BufferAttribute(new Float32Array(maxVertices*3),3));
    }
    const attribute = trail.geometry.getAttribute('position');
    attribute.array.set(positions);
    attribute.needsUpdate = true;
    trail.geometry.setDrawRange(0,positions.length/3);
  }

  // Position labels in screen space with the very same camera projection as the star field.
  const anchors = ['target','moon','north','east','south','west','trail'].map(kind => {
    const el = document.createElement('span'); el.className = 'sky-label sky-'+kind;
    el.hidden=true; labels.append(el); return el;
  });
  const matrix=new Matrix4(),background=new Color(), scratch=new Vector3();
  let previousSky='', lastWidth=0,lastHeight=0,previousColour: boolean | undefined;
  function mark(index: number, name: string, az: number, alt: number) {
    const el = anchors[index];
    if (alt<0) { el.hidden=true; return; }
    scratch.copy(horizontal(az,alt)).project(camera);
    if (scratch.z< -1 || scratch.z>1 || Math.abs(scratch.x)>.94 || Math.abs(scratch.y)>.94) { el.hidden=true; return; }
    el.hidden=false; el.textContent=name;
    el.style.left=(50+scratch.x*50)+'%'; el.style.top=(50-scratch.y*50)+'%';
    el.classList.toggle('flip-x',scratch.x>.48);
    el.classList.toggle('flip-y',scratch.y>.67);
  }
  function draw(frame: SkyFrame, view: CameraView) {
    const width=canvas.clientWidth,height=canvas.clientHeight;
    if (!width||!height||renderer.getContext().isContextLost()) return;
    if (width!==lastWidth||height!==lastHeight) {
      renderer.setSize(width,height,false); lastWidth=width; lastHeight=height;
    }
    camera.aspect=width/height; camera.fov=fieldOfView(24,view.focal); camera.updateProjectionMatrix();
    camera.lookAt(horizontal(view.az,view.alt)); camera.updateMatrixWorld();
    const key=[frame.lat,frame.lon,frame.ms].join(',');
    updateTrail(frame,key);
    if (key!==previousSky) {
      const { rot:r }=Rotation_EQJ_HOR(new Date(frame.ms),new Observer(frame.lat,frame.lon,0));
      // Astronomy Engine HOR is north, west, up. Camera space here is east, up, south.
      matrix.set(-r[0][1],-r[1][1],-r[2][1],0, r[0][2],r[1][2],r[2][2],0,
        -r[0][0],-r[1][0],-r[2][0],0, 0,0,0,1);
      stars.matrix.copy(matrix); stars.matrixWorldNeedsUpdate=true; previousSky=key;
    }
    if (previousColour!==frame.red) {
      const colours=frame.red?[0xd69a7b,0xc38b72,0xb07766,0x966a5c]:[0xf3ead7,0xe4e2d9,0xb6c3c9,0x95a4ae];
      starMaterials.forEach((m,i)=>m.color.setHex(colours[i]));
      gridLines.material.color.setHex(frame.red?0x39241f:0x232c30);
      horizonLine.material.color.setHex(frame.red?0x96664f:0x897e62);
      trail.material.color.setHex(frame.red?0xc18970:0xdfab8d);
      scene.background=background.setHex(frame.red?0x160c0a:0x091016); previousColour=frame.red;
    }
    renderer.render(scene,camera);
    mark(0,frame.target.name,frame.target.az,frame.target.alt);
    mark(1,frame.moon.name,frame.moon.az,frame.moon.alt);
    const names=frame.en?['N','E','S','W']:['北','东','南','西'];
    for(let i=0;i<4;i++)mark(i+2,names[i],i*90,0);
    if (trailEnd) mark(6,frame.en?'+1 h':'+1 小时',trailEnd.az,trailEnd.alt); else anchors[6].hidden=true;
  }
  canvas.addEventListener('webglcontextlost',lost);
  canvas.addEventListener('webglcontextrestored',restored);
  return { draw, dispose() {
    canvas.removeEventListener('webglcontextlost',lost); canvas.removeEventListener('webglcontextrestored',restored);
    geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose()); renderer.dispose(); labels.replaceChildren();
  }};
}
