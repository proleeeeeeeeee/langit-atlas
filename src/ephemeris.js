import * as A from 'astronomy-engine';
/* Malaysian night-photography planner, local time MYT (UTC+08:00).
 * Astronomy Engine v2.1.19, Don Cross (MIT). See ASTRONOMY-LICENSE.txt.
 * Weather: Open-Meteo / ECMWF, CC BY 4.0. Archive and live data are separate.
 */
const HOUR = 3600000;
const MINUTE = 60000;
const MYT = 8 * HOUR;
const example = Object.freeze({ name: '丰盛港', lat: 2.43, lon: 103.84, date: '2026-06-13', target: 'galaxy', noMoon: true });
const criteria = Object.freeze({ solarAlt: -18, coreAlt: 15, cloudMax: 35, rainBelow: 0.1, minMinutes: 60 });
const fields = 'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high';
const archiveUrl = 'https://single-runs-api.open-meteo.com/v1/forecast?latitude=2.430&longitude=103.840&hourly=' + fields + '&models=ecmwf_ifs025&run=2026-06-13T06:00&forecast_days=2&timezone=GMT&timeformat=unixtime';
const sources = Object.freeze({
  forecast: 'https://open-meteo.com/en/docs', archive: archiveUrl, archiveDocs: 'https://open-meteo.com/en/docs/single-runs-api',
  terms: 'https://open-meteo.com/en/terms', licence: 'https://creativecommons.org/licenses/by/4.0/',
  astronomy: 'https://github.com/cosinekitty/astronomy', coordinates: 'https://simbad.u-strasbg.fr/simbad/sim-id?Ident=NAME+Sgr+A%2A'
});
// ICRS/J2000 positions. Sgr A* represents the Galactic Centre. The bright
// star positions are rounded to arcminute planning precision; distances in ly.
const catalogue = [
  ['Star1','银河中心','Sgr A*',266.4168166,-29.007825,26600],
  ['Star2','心宿二','Antares',247.3519,-26.4320,550],
  ['Star3','织女星','Vega',279.2347,38.7837,25.0],
  ['Star4','牛郎星','Altair',297.6958,8.8683,16.7],
  ['Star5','天津四','Deneb',310.3580,45.2803,2600],
  ['Star6','天狼星','Sirius',101.2872,-16.7161,8.6],
  ['Star7','老人星','Canopus',95.9879,-52.6957,310],
  ['Star8','大角星','Arcturus',213.9153,19.1824,36.7]
];
for (const [body, , , ra, dec, distance] of catalogue) A.DefineStar(body, ra / 15, dec, distance);

function dateMY(ms = Date.now()) {
  return new Date(ms + MYT).toISOString().slice(0, 10);
}
function time(ms) {
  if (!Number.isFinite(ms)) return '—';
  return new Date(Math.round(ms / MINUTE) * MINUTE + MYT).toISOString().slice(11, 16);
}
function compass(az) {
  if (!Number.isFinite(az)) return '—';
  const points = ['北','东北','东','东南','南','西南','西','西北'];
  return points[(((Math.round(az / 45) % 8) + 8) % 8)];
}
function inputNight(input) {
  if (!input || !Number.isFinite(input.lat) || !Number.isFinite(input.lon) ||
      Math.abs(input.lat) > 90 || Math.abs(input.lon) > 180) throw new RangeError('坐标超出范围');
  const date = input.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('日期格式无效');
  const start = Date.parse(date + 'T18:00:00+08:00');
  if (!Number.isFinite(start) || dateMY(start) !== date) throw new RangeError('日期无效');
  return { lat: input.lat, lon: input.lon, date, start, end: start + 13 * HOUR };
}
function horizontal(body, ms, observer) {
  const at = new Date(ms);
  const equator = A.Equator(body, at, observer, true, true);
  return A.Horizon(at, observer, equator.ra, equator.dec);
}
function moonPhase(angle) {
  if (angle <= 3 || angle >= 357) return '新月';
  if (angle < 87) return '娥眉月';
  if (angle <= 93) return '上弦月';
  if (angle < 177) return '盈凸月';
  if (angle <= 183) return '满月';
  if (angle < 267) return '亏凸月';
  if (angle <= 273) return '下弦月';
  return '残月';
}
function skyAt(observer, ms, includeStars) {
  const sun = horizontal('Sun', ms, observer);
  const moon = horizontal('Moon', ms, observer);
  const core = horizontal('Star1', ms, observer);
  const snapshot = {
    ms, sunAlt: sun.altitude, moonAlt: moon.altitude, moonAz: moon.azimuth,
    coreAlt: core.altitude, coreAz: core.azimuth
  };
  if (includeStars) {
    const at = new Date(ms);
    snapshot.moonIllum = A.Illumination('Moon', at).phase_fraction * 100;
    snapshot.moonPhase = moonPhase(A.MoonPhase(at));
    snapshot.stars = catalogue.slice(1).map(([body, name, en]) => {
      const position = horizontal(body, ms, observer);
      return { name, en, alt: position.altitude, az: position.azimuth };
    }).sort((a, b) => b.alt - a.alt);
  }
  return snapshot;
}
function eventMs(event) {
  return event ? event.date.getTime() : null;
}
const astroCache = new Map();
function astronomy(night) {
  const key = [night.lat, night.lon, night.date].join('|');
  if (astroCache.has(key)) return astroCache.get(key);
  const { start, end } = night;
  const obs = new A.Observer(night.lat, night.lon, 0);
  // Display the lunar horizon crossings for local noon to the following
  // noon, so an afternoon moonset can explain an already moonless evening.
  const lunStart = new Date(start - 6 * HOUR);
  const events = {
    moonrise: eventMs(A.SearchRiseSet('Moon', obs, 1, lunStart, 1)),
    moonset: eventMs(A.SearchRiseSet('Moon', obs, -1, lunStart, 1)),
    darkStart: eventMs(A.SearchAltitude('Sun', obs, -1, new Date(start - 6 * HOUR), 1, criteria.solarAlt)),
    darkEnd: eventMs(A.SearchAltitude('Sun', obs, 1, new Date(start - 6 * HOUR), 1, criteria.solarAlt)),
    coreRise: eventMs(A.SearchAltitude('Star1', obs, 1, new Date(start), 13 / 24, criteria.coreAlt)),
    coreSet: eventMs(A.SearchAltitude('Star1', obs, -1, new Date(start), 13 / 24, criteria.coreAlt))
  };
  const transit = A.SearchHourAngle('Star1', obs, 0, new Date(start), 1);
  events.coreTransit = transit.time.date.getTime();
  if (events.coreTransit > end) events.coreTransit = null;
  const hours = [];
  const samples = [];
  for (let ms = start; ms <= end; ms += 15 * MINUTE) {
    const wholeHour = (ms - start) % HOUR === 0;
    const position = skyAt(obs, ms, wholeHour);
    samples.push(position);
    if (wholeHour) {
      const nextDay = dateMY(ms) !== night.date;
      hours.push({ ...position, time: time(ms), label: time(ms), nextDay, offset: (ms - start) / HOUR });
    }
  }
  const cut = new Set(hours.map(h => h.ms));
  for (const event of Object.values(events)) if (Number.isFinite(event) && event > start && event < end) cut.add(event);
  const edges = [...cut].sort((a,b) => a-b);
  const segments = [];
  // Evaluate astronomy once within each exact astronomical/hourly interval.
  // The horizon events use upper-limb rise/set with standard refraction.
  // Use their sequence to determine whether the upper lunar limb is visible.
  const crossings = [
    { at: events.moonrise, up: true }, { at: events.moonset, up: false }
  ].filter(e => Number.isFinite(e.at)).sort((a,b) => a.at-b.at);
  for (let i = 0; i < edges.length - 1; i++) {
    const from = edges[i], to = edges[i + 1], mid = (from + to) / 2;
    const sunAlt = horizontal('Sun', mid, obs).altitude;
    const coreAlt = horizontal('Star1', mid, obs).altitude;
    const recent = crossings.filter(e => e.at <= mid).pop();
    const moonUp = recent ? recent.up : (crossings.length ? !crossings[0].up : horizontal('Moon', mid, obs).altitude > -0.85);
    segments.push({ from, to, dark: sunAlt <= criteria.solarAlt, core: coreAlt >= criteria.coreAlt, moonUp });
  }
  const peakAt = events.coreTransit ?? (hours[0].coreAlt >= hours[hours.length-1].coreAlt ? start : end);
  const peakPos = horizontal('Star1', peakAt, obs);
  const result = { hours, samples, events, segments, peak: { ms: peakAt, time: time(peakAt), alt: peakPos.altitude, az: peakPos.azimuth, coreAlt: peakPos.altitude, coreAz: peakPos.azimuth } };
  if (astroCache.size >= 12) astroCache.delete(astroCache.keys().next().value);
  astroCache.set(key,result);
  return result;
}

const wxFields = ['cloud','lowCloud','midCloud','highCloud','rain','temp','humidity','dew'];
const blankWx = Object.freeze(Object.fromEntries(wxFields.map(k => [k, null])));
// Reproducible snapshot from the 06 UTC ECMWF IFS 0.25° model run. Columns
// are Unix seconds, total/low/mid/high cloud %, NEXT hour precipitation mm,
// °C air, relative humidity %, °C dewpoint. Full source URL above.
const archiveRows = [
  [1781344800,100,9,17,100,0,29.2,75,24.3],
  [1781348400,100,10,23,100,0,28.2,80,24.4],
  [1781352000,92,11,28,100,0,27.5,83,24.3],
  [1781355600,70,13,33,80,0,27.2,84,24.2],
  [1781359200,41,14,38,52,0,27.1,84,24.2],
  [1781362800,19,15,41,35,0,26.9,85,24.2],
  [1781366400,9,13,43,36,0,26.5,87,24.1],
  [1781370000,6,10,44,47,0,25.9,90,24.1],
  [1781373600,10,9,43,60,0,25.4,92,24],
  [1781377200,26,11,40,76,0,25.1,93,23.8],
  [1781380800,49,14,36,94,0,24.8,94,23.7],
  [1781384400,67,16,32,100,0.7,24.6,95,23.8],
  [1781388000,72,16,30,79,0.7,24.5,97,24],
  [1781391600,72,14,28,46,0.7,24.5,98,24.1]
];
function demoWeather() {
  const rows = {};
  for (const [seconds,...values] of archiveRows) rows[seconds*1000] = Object.fromEntries(wxFields.map((k,i) => [k,values[i]]));
  return { state: 'demo', kind: 'archive', source: 'ECMWF IFS · Open-Meteo', url: archiveUrl,
    lat: example.lat, lon: example.lon, date: example.date, model: 'ECMWF IFS 0.25°',
    modelRunAt: Date.parse('2026-06-13T06:00:00Z'), updatedAt: Date.parse('2026-06-13T06:00:00Z'), rows };
}
function makeWindows(segments) {
  const result = [];
  for (const seg of segments) {
    const last = result[result.length - 1];
    if (last && last.end === seg.from) last.end = seg.to;
    else result.push({ start: seg.from, end: seg.to });
  }
  return result.filter(w => w.end - w.start >= criteria.minMinutes * MINUTE)
    .map(w => ({ ...w, label: time(w.start) + '–' + time(w.end), minutes: Math.round((w.end-w.start)/MINUTE) }));
}
function usable(record) {
  return !!record && Number.isFinite(record.cloud) && Number.isFinite(record.rain);
}
function positive(record) {
  return usable(record) && record.cloud <= criteria.cloudMax && record.rain < criteria.rainBelow;
}
function dataForNight(night, supplied) {
  if (!supplied) return { state: 'missing', rows: {} };
  const matches = Math.abs(supplied.lat-night.lat) <= 0.000051 && Math.abs(supplied.lon-night.lon) <= 0.000051;
  if (supplied.date && supplied.date !== night.date || Number.isFinite(supplied.lat) && !matches) return {state:'missing',rows:{}};
  if (supplied.state === 'demo' && (!matches || supplied.date !== example.date || night.date !== example.date ||
      Math.abs(night.lat-example.lat)>0.000051 || Math.abs(night.lon-example.lon)>0.000051)) return {state:'missing',rows:{}};
  if (['live','partial'].includes(supplied.state) && supplied.expiresAt && Date.now() >= supplied.expiresAt) return {...supplied,state:'expired'};
  return supplied;
}
function plan(input) {
  const night = inputNight(input);
  const base = astronomy(night);
  const wx = dataForNight(night,input.weather);
  let weatherState = wx.state;
  const wxRows = wx.rows || {};
  if (weatherState === 'live') {
    const complete = base.hours.slice(0,-1).filter(h => usable(wxRows[h.ms])).length;
    if (!complete) weatherState = 'missing';
    else if (complete < 13) weatherState = 'partial';
  }
  const considerWeather = ['live','demo','partial'].includes(weatherState);
  const noMoon = input.noMoon !== false;
  const needCore = input.target !== 'stars';
  const hours = base.hours.map(hour => {
    const row = wxRows[hour.ms];
    return { ...hour,...blankWx,...row,weatherValid: considerWeather && usable(row) };
  });
  const validSegments = base.segments.filter(s => s.dark && (!needCore || s.core) && (!noMoon || !s.moonUp));
  const astroWindows = makeWindows(validSegments);
  const cutoff = weatherState === 'live' || weatherState === 'partial' ? Date.now() : -Infinity;
  const qualified = validSegments.filter(s => s.to > cutoff && positive(wxRows[Math.floor(s.from/HOUR)*HOUR]))
    .map(s => ({ ...s, from: Math.max(s.from, cutoff) }));
  const windows = considerWeather ? makeWindows(qualified) : [];
  let reason = 'window';
  if (!astroWindows.length) reason = 'astronomy';
  else if (!considerWeather) reason = 'weather-unavailable';
  else if (!windows.length) reason = weatherState === 'partial' ? 'weather-incomplete' : 'weather-conditions';
  return { ...night, target: needCore ? 'galaxy' : 'stars', noMoon, hours, samples: base.samples,
    events: base.events, peak: base.peak, windows, astroWindows, reason, weatherState, weather: wx };
}


export { example, criteria, sources, dateMY, time, compass, plan, demoWeather };
