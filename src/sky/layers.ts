import {BackSide, BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Mesh, Plane, RepeatWrapping, ShaderMaterial, SphereGeometry, TextureLoader, Vector3} from 'three';
import figures from './figures.json';
import milkyWayUrl from './milkyway.jpg';
import {equatorial} from './subjects';

export function skyLayers(parent:Group, redraw:()=>void) {
  const positions:number[]=[];
  for (const figure of figures) for (const line of figure.lines) {
    for (let i=1;i<line.length;i++) positions.push(...equatorial(line[i-1]),...equatorial(line[i]));
  }
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  const lineMaterial=new LineBasicMaterial({color:0x99b9be,transparent:true,opacity:.65,depthWrite:false,
    clippingPlanes:[new Plane(new Vector3(0,1,0),0)]});
  const lines=new LineSegments(geometry,lineMaterial);
  const sphere=new SphereGeometry(1.5,64,32);
  let disposed=false, loaded=false;
  const image=new TextureLoader().load(milkyWayUrl,()=>{if(!disposed){loaded=true;redraw();}});
  image.wrapS=RepeatWrapping;
  const material=new ShaderMaterial({
    side:BackSide,depthWrite:false,uniforms:{skyImage:{value:image},redMode:{value:false}},
    vertexShader:`
      varying vec3 direction;
      varying float altitude;
      void main(){
        direction=position;
        altitude=(modelMatrix*vec4(position,1.)).y;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader:`
      uniform sampler2D skyImage;
      uniform bool redMode;
      varying vec3 direction;
      varying float altitude;
      const float PI=3.14159265;
      void main(){
        if(altitude<0.) discard;
        vec3 p=normalize(direction);
        // The SVS map centres RA 0h, increasing to the left, north at the top.
        vec2 uv=vec2(.5-atan(p.y,p.x)/(2.*PI),.5+asin(clamp(p.z,-1.,1.))/PI);
        vec3 sky=texture2D(skyImage,uv).rgb;
        float fade=smoothstep(0.,.12,altitude);
        vec3 base=redMode?vec3(.086,.047,.039):vec3(.035,.063,.086);
        if(redMode) sky=dot(sky,vec3(.30,.59,.11))*vec3(.82,.36,.24);
        gl_FragColor=vec4(base+sky*.9*fade,1.);
      }`
  });
  const galaxy=new Mesh(sphere,material);
  galaxy.renderOrder=-10;
  parent.add(galaxy,lines);
  return {
    update(showFigures:boolean,showGalaxy:boolean,red:boolean) {
      lines.visible=showFigures;galaxy.visible=showGalaxy && loaded;
      lineMaterial.color.setHex(red?0xb98068:0x99b9be);
      material.uniforms.redMode.value=red;
    },
    dispose(){disposed=true;geometry.dispose();lineMaterial.dispose();sphere.dispose();image.dispose();material.dispose();}
  };
}
