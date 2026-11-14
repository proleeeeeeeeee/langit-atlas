export interface BodyPosition {
  name: string;
  alt: number;
  az: number;
}

export interface SkyFrame {
  lat: number;
  lon: number;
  place: string;
  date: string;
  ms: number;
  index: number;
  clock: string;
  subjectKey: string;
  nightEnd: number;
  en: boolean;
  red: boolean;
  atlasRegion?: {west:number;east:number;north:number;south:number;image:string};
  glowRatio?: number;
  target: BodyPosition;
  moon: BodyPosition;
  subjects: {id:string;names:string[];az:number;alt:number}[];
}

export interface CameraView {
  az: number;
  alt: number;
  focal: number;
  figures: boolean;
  galaxy: boolean;
}

export const deg = Math.PI / 180;
export const wrap = (az: number) => (az % 360 + 360) % 360;
export const clampTilt = (alt: number) => Math.max(-65, Math.min(88, alt));
export const fieldOfView = (dimension: number, focal: number) => 2 * Math.atan(dimension / (2 * focal)) / deg;

export function cardinal(az: number, en: boolean) {
  const points = en ? ['N','NE','E','SE','S','SW','W','NW'] : ['北','东北','东','东南','南','西南','西','西北'];
  return points[Math.round(wrap(az) / 45) % 8];
}
