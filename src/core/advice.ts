/* Presentation-independent shooting advice for the Malaysian night planner.
 * Input windows are half-open [start, end) in Unix milliseconds. All returned
 * copy is plain text in [Simplified Chinese, British English] order.
 */
import type { Advice, AdviceOptions, Criteria, NightPlan, PlanHour, ShootingWindow, TextPair, WeatherState, WindowRange } from './types';

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MYT = 8 * HOUR;
const defaultCriteria: Readonly<Criteria> = {minMinutes:60, cloudMax:35, rainBelow:0.1, coreAlt:15};
type ValidHour = PlanHour & {cloud: number; rain: number};
type Evidence = {unknown: true} | {unknown: false; label: TextPair; reason: TextPair};

function clock(ms: number): string {
  return new Date(Math.round(ms / MINUTE) * MINUTE + MYT).toISOString().slice(11, 16);
}
function windowOf(start: number, end: number): ShootingWindow {
  return {start, end, label: clock(start) + '–' + clock(end), minutes: Math.round((end - start) / MINUTE)};
}
function intervals(windows: readonly WindowRange[], cutoff: number, minimum: number): ShootingWindow[] {
  return windows.map(w => windowOf(Math.max(w.start, cutoff), w.end))
    .filter(w => w.end - w.start >= minimum);
}
function rowsIn(plan: NightPlan, w: WindowRange) {
  return plan.hours.flatMap((hour, index) => {
    const next = plan.hours[index + 1];
    if (!next) return [];
    const from = Math.max(w.start, hour.ms), to = Math.min(w.end, next.ms);
    return to > from ? [{hour, index, from, to}] : [];
  });
}
function hasWeather(h: PlanHour): h is ValidHour {
  return h.weatherValid === true && h.cloud !== null && Number.isFinite(h.cloud) && h.cloud >= 0 && h.cloud <= 100 &&
    h.rain !== null && Number.isFinite(h.rain) && h.rain >= 0;
}
function enoughWeather(h: PlanHour, rule: Readonly<Criteria>): boolean {
  return hasWeather(h) && h.cloud <= rule.cloudMax && h.rain < rule.rainBelow;
}
function containsPeak(plan: NightPlan, w: WindowRange): boolean {
  return plan.target === 'galaxy' && plan.events.coreTransit !== null && Number.isFinite(plan.events.coreTransit) &&
    Number.isFinite(plan.peak.alt) && plan.peak.ms >= w.start && plan.peak.ms < w.end &&
    plan.events.coreTransit >= w.start && plan.events.coreTransit < w.end;
}
// Keep substantial setup time. Of slots within 30 min of the longest,
// choose lower duration-weighted cloud, then a Galactic Centre transit,
// longer duration and earlier start. No synthetic certainty score.
function strongest(plan: NightPlan, windows: ShootingWindow[], useWeather: boolean): ShootingWindow | null {
  if (!windows.length) return null;
  const longest = Math.max(...windows.map(w => w.end - w.start));
  const shortlist = windows.filter(w => w.end - w.start >= longest - 30 * MINUTE).map(w => {
    const cloud = useWeather ? rowsIn(plan, w).reduce((sum, s) =>
      sum + (s.hour.cloud ?? Infinity) * (s.to - s.from) / (w.end - w.start), 0) : 0;
    return {w, cloud, peak: containsPeak(plan, w)};
  });
  shortlist.sort((a,b) => a.cloud - b.cloud || Number(b.peak) - Number(a.peak) ||
    (b.w.end - b.w.start) - (a.w.end - a.w.start) || a.w.start - b.w.start);
  return shortlist[0]?.w ?? null;
}
function representative(plan: NightPlan, w: WindowRange, useWeather: boolean): number | null {
  const mid = (w.start + w.end) / 2;
  const points = plan.hours.map((h, index) => ({h, index})).filter(p => p.h.ms >= w.start && p.h.ms < w.end);
  if (!points.length) return rowsIn(plan, w)[0]?.index ?? null;
  if (containsPeak(plan, w)) points.sort((a,b) =>
    Math.abs(a.h.ms - plan.peak.ms) - Math.abs(b.h.ms - plan.peak.ms));
  else points.sort((a,b) => (useWeather ? (a.h.cloud ?? Infinity) - (b.h.cloud ?? Infinity) : 0) ||
    (plan.target === 'galaxy' ? b.h.coreAlt - a.h.coreAlt : 0) ||
    Math.abs(a.h.ms - mid) - Math.abs(b.h.ms - mid));
  return points[0]?.index ?? null;
}
function range(values: number[]): string {
  const low = Math.min(...values), high = Math.max(...values);
  return low === high ? String(low) : low + '–' + high;
}
function limitedByWeather(plan: NightPlan, astroWindows: ShootingWindow[], rule: Readonly<Criteria>): Evidence {
  const known: ValidHour[] = [];
  for (const w of astroWindows) {
    for (const s of rowsIn(plan, w)) {
      if (!hasWeather(s.hour)) return {unknown:true};
      known.push(s.hour);
    }
  }
  if (!known.length) return {unknown:true};
  const bad = known.filter(h => !enoughWeather(h, rule));
  const allCloud = bad.length && bad.every(h => h.cloud > rule.cloudMax);
  const allRain = bad.length && bad.every(h => h.rain >= rule.rainBelow);
  const cloud = range(known.map(h => h.cloud))+'%';
  const rain = range(known.map(h => h.rain))+' mm/h';
  const label: TextPair = allCloud && !allRain ? ['云太厚，不适合拍摄','Too cloudy to shoot'] :
    allRain && !allCloud ? ['有雨，不适合拍摄','Rain limits shooting'] : ['云雨不利于拍摄','Unfavourable weather'];
  return {
    unknown: false, label,
    reason: allCloud && !allRain ?
      ['暗夜时段预报云量为 '+cloud+'，没有连续一小时能降到 '+rule.cloudMax+'% 或以下。',
        'Forecast cloud cover during the dark hours is '+cloud+'. There is no full hour at or below '+rule.cloudMax+'%.'] :
      allRain && !allCloud ?
        ['暗夜时段预报降雨为 '+rain+'，没有连续一小时低于 '+rule.rainBelow+' mm/h。',
          'Forecast rainfall during the dark hours is '+rain+'. There is no full hour below '+rule.rainBelow+' mm/h.'] :
        ['在可用的暗夜时段内，云量和降雨未能同时连续一小时达标。',
          'Cloud cover and rainfall do not both meet the settings for an hour during astronomical darkness.']
  };
}
function shootingReason(plan: NightPlan, w: ShootingWindow, rule: Readonly<Criteria>, archive: boolean,
  partial: boolean, bright: boolean, ratio: number | null): TextPair {
  const zh: string[] = [], en: string[] = [];
  const clouds = rowsIn(plan, w).map(s => s.hour.cloud).filter((c): c is number => c !== null);
  const cloudRange = range(clouds)+'%';
  zh.push((archive ? '归档预报' : '预报') + '云量 ' + cloudRange + '。');
  en.push(archive ? 'The archive predicted ' + cloudRange + ' cloud cover.' : 'Forecast cloud cover is ' + cloudRange + '.');
  if (plan.target === 'galaxy' && containsPeak(plan, w)) {
    const when = clock(plan.peak.ms), altitude = Math.round(plan.peak.alt) + '°';
    const nextDay = Math.floor((plan.peak.ms + MYT) / DAY) > Math.floor((plan.start + MYT) / DAY);
    zh.push('银心在' + (nextDay ? '次日 ' : '') + when + ' 升至最高 ' + altitude + '。');
    en.push('The Galactic Centre peaks at ' + altitude + ' at ' + when + (nextDay ? ' the next day.' : '.'));
  } else if (plan.target === 'galaxy') {
    zh.push('银心仰角至少 ' + rule.coreAlt + '°。');
    en.push('The Galactic Centre stays at least ' + rule.coreAlt + '° above the horizon.');
  } else {
    zh.push('这段时间全程处于天文暗夜。');
    en.push('The sky is astronomically dark throughout.');
  }
  if (plan.noMoon) { zh.push('月亮全程在地平线下。'); en.push('The Moon is below the horizon.'); }
  else {
    const moon = plan.samples.find(s => s.ms >= w.start && s.ms < w.end && s.moonAlt > 0);
    if (moon) { zh.push('部分时段有月光。'); en.push('The Moon is above the horizon during the window.'); }
  }
  if (bright && ratio !== null) {
    const displayed = Number(ratio.toPrecision(2));
    zh.push('历史模型估算天顶总亮度约为自然天光的 ' + displayed + ' 倍，暗星的对比度会降低。');
    en.push('The atlas estimates '+displayed+'× natural sky brightness overhead, reducing contrast for faint stars.');
  } else if (ratio === null) {
    zh.push('此处缺少长期光污染估值。');
    en.push('The atlas has no local sky-brightness estimate.');
  }
  if (partial) { zh.push('其他部分时段缺少天气。'); en.push('Some other hours lack forecast data.'); }
  return [zh.join(''), en.join(' ')];
}
export function describe(plan: NightPlan, {isTonight = false, light = null, now = Date.now()}: AdviceOptions = {},
  rule: Readonly<Criteria> = defaultCriteria): Advice {
  const minimum = rule.minMinutes * MINUTE;
  const archive = plan.weatherState === 'demo' && plan.weather?.kind === 'archive';
  let wx = plan.weatherState;
  const expiresAt = plan.weather?.expiresAt;
  if ((wx === 'live' || wx === 'partial') && typeof expiresAt === 'number' && Number.isFinite(expiresAt) &&
      expiresAt <= now) wx = 'expired';
  const known = wx === 'live' || wx === 'partial' || archive;
  // Archive nights are intentionally viewed in full. The last part of a live
  // night can belong to yesterday's local date and must still be clipped.
  const current = !archive && (isTonight || wx === 'live' || wx === 'partial' || (now >= plan.start && now <= plan.end));
  const cutoff = current ? now : -Infinity;
  const astroWindows = intervals(plan.astroWindows, cutoff, minimum);
  const confirmed = known ? intervals(plan.windows, cutoff, minimum).filter(w => {
    const rows = rowsIn(plan, w);
    return rows.reduce((n,s) => n + s.to - s.from, 0) === w.end - w.start && rows.every(s => enoughWeather(s.hour, rule));
  }) : [];
  const best = strongest(plan, confirmed, true);
  const out = (status: Advice['status'], label: TextPair, reason: TextPair, candidate: ShootingWindow | null = null): Advice => {
    const selected = best ?? candidate;
    return {status, label, reason, best, astro: candidate, index: selected ? representative(plan, selected, !!best) : null};
  };
  if (best) {
    const ratio = light && Number.isFinite(light.totalRatio) && light.totalRatio >= 1 ? light.totalRatio : null;
    // App convention for a visibly bright background, not a Bortle class.
    const bright = ratio !== null && ratio >= 10;
    const conditional = bright || ratio === null || wx === 'partial';
    const label: TextPair = bright ? ['有拍摄窗口，背景较亮','Shooting window, bright sky'] :
      ratio === null ? ['有拍摄窗口，地点亮度待确认','Shooting window, sky brightness unknown'] :
      wx === 'partial' ? ['部分时段适合拍摄','Some hours look suitable'] :
      archive ? ['历史示例中有拍摄窗口','A shooting window in the archive'] :
      ['适合拍摄','Good shooting conditions'];
    if (archive && conditional) {
      label[0] = '历史示例 · ' + label[0];
      label[1] = 'Archive · ' + label[1].charAt(0).toLowerCase() + label[1].slice(1);
    }
    return out(conditional ? 'conditional' : 'good', label, shootingReason(plan,best,rule,archive,wx==='partial',bright,ratio));
  }
  if (current && plan.end - now < minimum) {
    return out('poor', ['本夜已无足够时段','Too little time remains'], now >= plan.end ?
      ['所选晚上的规划时段已结束。','The selected night has ended.'] :
      ['距离本次规划结束不足 60 分钟。','Less than an hour remains in this planning period.']);
  }
  if (!astroWindows.length) {
    if (plan.astroWindows.length) return out('poor',['本夜已无足够时段','Too little dark time remains'],
      ['今晚余下的时间里，天文条件已无法连续满足一小时。','Less than an hour of qualifying astronomical conditions remains.']);
    const target = plan.target === 'galaxy' ? '天文暗夜和银心高度' : '天文暗夜';
    const label: TextPair = archive ? ['历史示例无合适暗夜','No suitable darkness in the archive'] : ['没有合适的暗夜时段','No suitable dark-sky window'];
    const factors = plan.target === 'galaxy' ? 'darkness and Galactic Centre altitude' : 'astronomical darkness';
    return out('poor',label,[target+(plan.noMoon?'及无月要求':'')+'未能连续满足一小时。',
      'No full hour meets the requirements for '+factors+(plan.noMoon?' with the Moon below the horizon.':'.')]);
  }
  const candidate = strongest(plan,astroWindows,false);
  if (wx === 'loading') return out('loading',['正在核对天气','Checking the forecast'],
    ['天文条件已算出，正在查询云量和降雨。','The astronomical times are ready. Cloud and rain forecasts are loading.'],candidate);
  if (!known) {
    const missing: TextPair = ['缺少这个地点的云量和降雨预报，目前仅能确定天文时段。','Cloud and rain forecasts are unavailable here. Only the astronomical window is available.'];
    const notes: Partial<Record<WeatherState,TextPair>> = {
      expired: ['天气预报已过期。更新云量和降雨后才能判断是否适合拍摄。','The forecast has expired. A fresh cloud and rain forecast is needed to assess shooting conditions.'],
      'out-of-range': ['这个日期超出天气预报期，目前仅能确定天文时段。','This date is outside the forecast range. Only the astronomical window is available.'],
      missing
    };
    return out('unknown',['天气待确认','Weather unconfirmed'],notes[wx] ?? missing,candidate);
  }
  const assessment = limitedByWeather(plan,astroWindows,rule);
  if (assessment.unknown) {
    return out('unknown',['可用预报不足','Forecast incomplete'],
      ['可能适合拍摄的时段有天气缺数，无法确认连续一小时的窗口。','Potential shooting hours have missing weather data. No full hour can be confirmed.'],candidate);
  }
  const elapsed = current && (plan.windows.some(w => w.end - w.start >= minimum && w.end - Math.max(w.start,now) < minimum) ||
    plan.astroWindows.some(w => {
      if (w.start >= now) return false;
      const rows = rowsIn(plan,w);
      let duration = 0;
      for (const s of rows) {
        duration = enoughWeather(s.hour,rule) ? duration + s.to - s.from : 0;
        if (duration >= minimum && s.to - duration < now) return true;
      }
      return false;
    }));
  if (elapsed) return out('poor',['本夜已无足够窗口','No full window remains'],
    ['较早的可拍时段已过或余量不足一小时，随后没有其他合适的完整窗口。','An earlier window has passed or has less than an hour left. No later full window qualifies.']);
  return out('poor',archive ? ['历史预报不利于拍摄','Unfavourable archived forecast'] : assessment.label,assessment.reason);
}
