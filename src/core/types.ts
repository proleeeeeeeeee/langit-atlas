export type TextPair = [zh: string, en: string];
export type Target = 'galaxy' | 'stars';
export type WeatherState = 'live' | 'partial' | 'missing' | 'expired' | 'out-of-range' | 'demo' | 'loading';

export interface PlaceNight {
  lat: number;
  lon: number;
  date: string;
}

export interface ForecastInput extends PlaceNight {
  retry?: boolean;
}

export interface WeatherRow {
  cloud: number | null;
  lowCloud: number | null;
  midCloud: number | null;
  highCloud: number | null;
  rain: number | null;
  temp: number | null;
  humidity: number | null;
  dew: number | null;
}

/** Sparsely keyed by the Unix millisecond at the start of an hour. */
export type WeatherRows = Partial<Record<number, WeatherRow>>;

/** Includes the lightweight fallback states produced by the planner UI. */
export interface WeatherData {
  state: WeatherState;
  rows: WeatherRows;
  kind?: 'forecast' | 'archive';
  source?: string;
  url?: string;
  date?: string;
  lat?: number;
  lon?: number;
  model?: string;
  modelRunAt?: number | null;
  updatedAt?: number;
  fetchedAt?: number;
  expiresAt?: number;
  gridLat?: number | null;
  gridLon?: number | null;
  detail?: string | null;
}

export interface Forecast extends WeatherData, PlaceNight {
  state: Exclude<WeatherState, 'demo' | 'loading'>;
  kind: 'forecast';
  source: string;
  url: string;
  modelRunAt: null;
  date: string;
  lat: number;
  lon: number;
  detail: string | null;
}

export interface Criteria {
  minMinutes: number;
  cloudMax: number;
  rainBelow: number;
  coreAlt: number;
}

export interface WindowRange { start: number; end: number }

export interface ShootingWindow extends WindowRange {
  label: string;
  minutes: number;
}

export interface SkySample {
  ms: number;
  sunAlt: number;
  moonAlt: number;
  moonAz: number;
  coreAlt: number;
  coreAz: number;
}

export interface StarPosition { name: string; en: string; alt: number; az: number }

export interface PlanHour extends SkySample, WeatherRow {
  time: string;
  label: string;
  nextDay: boolean;
  offset: number;
  moonIllum: number;
  moonPhase: string;
  stars: StarPosition[];
  weatherValid: boolean;
}

export interface NightPlan extends PlaceNight, WindowRange {
  target: Target;
  noMoon: boolean;
  hours: PlanHour[];
  samples: SkySample[];
  events: {
    moonrise: number | null; moonset: number | null;
    darkStart: number | null; darkEnd: number | null;
    coreRise: number | null; coreSet: number | null; coreTransit: number | null;
  };
  peak: { ms: number; time: string; alt: number; az: number; coreAlt: number; coreAz: number };
  windows: ShootingWindow[];
  astroWindows: ShootingWindow[];
  weatherState: WeatherState;
  weather: WeatherData;
  reason: 'window' | 'astronomy' | 'weather-unavailable' | 'weather-incomplete' | 'weather-conditions';
}

export interface AdviceOptions {
  isTonight?: boolean;
  light?: { totalRatio: number } | null;
  now?: number;
}

export interface Advice {
  status: 'good' | 'conditional' | 'poor' | 'unknown' | 'loading';
  label: TextPair;
  reason: TextPair;
  best: ShootingWindow | null;
  astro: ShootingWindow | null;
  index: number | null;
}
