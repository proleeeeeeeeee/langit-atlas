import type { Forecast, ForecastInput, PlaceNight, WeatherRow, WeatherRows } from './types';

const HOUR = 3600000;
const DAY = HOUR * 24;
const MINUTE = 60000;
const MYT = 8 * HOUR;
const cacheKey = 'my-night-forecast.v1';
const fields = 'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high';

interface CacheEntry {
  rows: WeatherRows;
  fetchedAt: number;
  expiresAt: number;
  gridLat: number | null;
  gridLon: number | null;
}

const forecastCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CacheEntry>>();
const retryAt = new Map<string, { until: number; provider: boolean }>();
let restored = false;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function array(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function numberOrNull(value: unknown): number | null {
  return finite(value) ? value : null;
}

function dateMY(ms: number): string {
  return new Date(ms + MYT).toISOString().slice(0, 10);
}

function evening(input: ForecastInput): { start: number; end: number } {
  if (!input || !finite(input.lat) || !finite(input.lon) || Math.abs(input.lat) > 90 || Math.abs(input.lon) > 180)
    throw new RangeError('坐标超出范围');
  if (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new RangeError('日期格式无效');
  const start = Date.parse(input.date + 'T18:00:00+08:00');
  if (!finite(start) || dateMY(start) !== input.date) throw new RangeError('日期无效');
  return {start, end: start + 13 * HOUR};
}

// Treat persisted values and the network response as untrusted. Previously
// saved v1 entries use the same key, field names, and millisecond time base.
function cachedRow(value: unknown): WeatherRow | null {
  if (!record(value)) return null;
  return {
    cloud: numberOrNull(value.cloud), lowCloud: numberOrNull(value.lowCloud),
    midCloud: numberOrNull(value.midCloud), highCloud: numberOrNull(value.highCloud),
    rain: numberOrNull(value.rain), temp: numberOrNull(value.temp),
    humidity: numberOrNull(value.humidity), dew: numberOrNull(value.dew)
  };
}

function restore(): void {
  if (restored) return;
  restored = true;
  try {
    const entries: unknown = JSON.parse(globalThis.localStorage.getItem(cacheKey) || '[]');
    if (!array(entries)) return;
    const earliest = Date.now() - DAY;
    for (const pair of entries) {
      if (!array(pair)) continue;
      const [key, data] = pair;
      if (typeof key !== 'string' || !record(data) || !finite(data.fetchedAt) || data.fetchedAt <= earliest ||
        !finite(data.expiresAt) || !record(data.rows)) continue;
      const rows: WeatherRows = {};
      for (const [ms, item] of Object.entries(data.rows)) {
        const row = cachedRow(item);
        if (row && Number.isFinite(Number(ms))) rows[Number(ms)] = row;
      }
      forecastCache.set(key, {rows, fetchedAt: data.fetchedAt, expiresAt: data.expiresAt,
        gridLat: numberOrNull(data.gridLat), gridLon: numberOrNull(data.gridLon)});
    }
  } catch { /* Local file and private browser contexts can disable storage. */ }
}

function save(key: string, cached: CacheEntry): void {
  forecastCache.delete(key);
  forecastCache.set(key, cached);
  const earliest = Date.now() - DAY;
  for (const [k,v] of forecastCache) if (v.fetchedAt < earliest) forecastCache.delete(k);
  for (const k of forecastCache.keys()) {
    if (forecastCache.size <= 5) break;
    forecastCache.delete(k);
  }
  try { globalThis.localStorage.setItem(cacheKey, JSON.stringify([...forecastCache])); }
  catch { /* The memory cache still works. */ }
}

/** Translate Open-Meteo UTC Unix seconds and preceding-hour precipitation into
 * millisecond records with precipitation for the hour beginning at each key. */
export function normalize(raw: unknown): WeatherRows {
  const hourly = record(raw) ? raw.hourly : null;
  if (!record(hourly) || !array(hourly.time) || !hourly.time.length ||
    !array(hourly.cloud_cover) || !array(hourly.precipitation)) throw new Error('invalid-response');
  const times = hourly.time;
  const get = (name: string, index: number): number | null => {
    const values = hourly[name];
    return array(values) ? numberOrNull(values[index]) : null;
  };
  const rows: WeatherRows = {};
  for (let index = 0; index < times.length; index++) {
    const seconds = times[index];
    if (!finite(seconds)) continue;
    const nextHour = times[index + 1] === seconds + 3600;
    rows[seconds * 1000] = {
      cloud: get('cloud_cover', index), lowCloud: get('cloud_cover_low', index),
      midCloud: get('cloud_cover_mid', index), highCloud: get('cloud_cover_high', index),
      rain: nextHour ? get('precipitation', index + 1) : null, temp: get('temperature_2m', index),
      humidity: get('relative_humidity_2m', index), dew: get('dew_point_2m', index)
    };
  }
  return rows;
}

async function retrieve(input: PlaceNight, key: string): Promise<CacheEntry> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500);
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: input.lat.toFixed(4), longitude: input.lon.toFixed(4), hourly: fields,
      timezone: 'Asia/Kuala_Lumpur', timeformat: 'unixtime', past_days: '1', forecast_days: '8'
    }).toString();
    const response = await globalThis.fetch(url.href, {signal: controller.signal, credentials: 'omit'});
    if (!response.ok) {
      const header = response.headers.get('Retry-After');
      const delay = header ? (/^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 0;
      const provider = response.status === 429 || delay > 0;
      const hold = delay > 0 ? delay : (response.status === 429 ? 15 * MINUTE : MINUTE);
      retryAt.set(key, {until: Date.now() + hold, provider});
      throw new Error('http-' + response.status);
    }
    const raw: unknown = await response.json();
    const rows = normalize(raw);
    const fetchedAt = Date.now();
    const cached = {rows, fetchedAt, expiresAt: fetchedAt + HOUR,
      gridLat: record(raw) ? numberOrNull(raw.latitude) : null,
      gridLon: record(raw) ? numberOrNull(raw.longitude) : null};
    save(key, cached);
    retryAt.delete(key);
    return cached;
  } finally {
    clearTimeout(timer);
  }
}

/** Free noncommercial preview API. Each point shares one eight-day request for
 * current night plus six future evening dates, including tomorrow's dawn. */
export async function forecast(input: ForecastInput): Promise<Forecast> {
  const {start, end} = evening(input);
  const at = Date.now();
  const meta = {kind: 'forecast' as const, source: 'Open-Meteo', url: 'https://open-meteo.com/en/docs',
    lat: input.lat, lon: input.lon, date: input.date, modelRunAt: null};
  if (end <= at || input.date > dateMY(at + 6 * DAY))
    return {...meta, state: 'out-of-range', rows: {}, detail: 'date'};
  restore();
  const key = [input.lat.toFixed(4), input.lon.toFixed(4)].join(',');
  let cached = forecastCache.get(key);
  const covers = (data: CacheEntry | undefined): data is CacheEntry =>
    !!data && !!(data.rows[start] || data.rows[end]);
  if (!covers(cached) || at >= cached.expiresAt || input.retry === true) {
    try {
      const hold = retryAt.get(key);
      if (hold && hold.until > at && (hold.provider || !input.retry)) throw new Error('retry-later');
      let pending = inFlight.get(key);
      if (!pending) {
        pending = retrieve(input, key).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      cached = await pending;
    } catch (error: unknown) {
      if ((retryAt.get(key)?.until ?? 0) <= at) retryAt.set(key, {until: Date.now() + MINUTE, provider: false});
      const detail = error instanceof Error ? error.message : String(error);
      if (!covers(cached)) return {...meta, state: 'missing', rows: {}, detail};
      if (at >= cached.expiresAt) return {...meta, ...cached, state: 'expired', detail};
      // A failed manual retry can still have a current, partial cache to show.
    }
  }
  const rows: WeatherRows = {};
  let usableCount = 0;
  for (let ms = start; ms <= end; ms += HOUR) {
    const row = cached.rows[ms];
    if (!row) continue;
    rows[ms] = row;
    if (ms < end && finite(row.cloud) && finite(row.rain)) usableCount++;
  }
  return {...meta, ...cached, rows, state: usableCount === 13 ? 'live' : (usableCount ? 'partial' : 'missing'),
    detail: usableCount === 13 ? null : 'coverage'};
}
