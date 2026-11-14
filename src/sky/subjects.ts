import {Observer, Rotation_EQJ_HOR} from 'astronomy-engine';
import figures from './figures.json';
import {deg, wrap} from './model';

export const equatorial = ([ra,dec]: number[]) => {
  const r=ra*deg,d=dec*deg,c=Math.cos(d);
  return [c*Math.cos(r),c*Math.sin(r),Math.sin(d)];
};

// Photographing a figure uses the centre of its connected stars as an aiming point.
const subjects = figures.map(figure=>{
  const unique = new Map(figure.lines.flat().map(point=>[point.join(','),point]));
  const sum = [0,0,0];
  for (const point of unique.values()) equatorial(point).forEach((v,i)=>sum[i]+=v);
  const length=Math.hypot(...sum);
  return {id:figure.id,names:figure.names,vector:sum.map(v=>v/length)};
});
subjects.unshift({id:'galaxy',names:['银河中心','Galactic Centre'],vector:equatorial([266.4168166,-29.007825])});

export function skySubjects(lat:number,lon:number,ms:number) {
  const {rot}=Rotation_EQJ_HOR(new Date(ms),new Observer(lat,lon,0));
  return subjects.map(({id,names,vector:[x,y,z]})=>{
    const [north,west,up]=[0,1,2].map(i=>x*rot[0][i]+y*rot[1][i]+z*rot[2][i]);
    return {id,names,az:wrap(Math.atan2(-west,north)/deg),alt:Math.asin(Math.max(-1,Math.min(1,up)))/deg};
  });
}
