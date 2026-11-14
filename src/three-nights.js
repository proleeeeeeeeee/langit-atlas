import {plan, criteria, dateMY, time} from './ephemeris.js';
import {describe} from './core/advice';
import {forecast} from './core/forecast';

const DAY = 86400000;
const HOUR = 3600000;
const nightNames = [['今晚','Tonight'],['明晚','Tomorrow night'],['后晚','Third night']];
const t = (zh,en) => window.AtlasLang.pick(zh,en);
const at = id => document.getElementById(id);

export function compareNights(onSelect) {
  let rows = [], request = 0;
  let selection;
  const body = at('compare-rows');
  body.addEventListener('click', event => {
    const button = event.target.closest('button[data-date]');
    if (button) onSelect(button.dataset.date);
  });
  function reset() { ++request; rows = []; }
  function load(place, first, retry) {
    const token = ++request;
    const start = Date.parse(first+'T12:00:00+08:00');
    const dates = [0,1,2].map(i => dateMY(start + i*DAY));
    const same = rows.length && rows[0].date === first && rows[0].lat === place.lat && rows[0].lon === place.lon;
    if (!same || retry) rows = dates.map(date => ({date,lat:place.lat,lon:place.lon,weather:{state:'loading',rows:{}}}));
    Promise.all(dates.map(date => forecast({lat:place.lat,lon:place.lon,date,retry}).catch(() => ({state:'missing',rows:{}}))))
      .then(values => {
        if (token !== request) return;
        rows.forEach((row,i) => { row.weather = values[i]; });
        render();
      });
  }
  function update(state,light) {
    selection = {date:state.date,target:state.target,noMoon:state.noMoon,light};
    render();
  }
  function render() {
    if (!selection || !rows.length) return;
    const now = Date.now();
    const nights = rows.map(({date,lat,lon,weather},i) => {
      const p = plan({date,lat,lon,weather,target:selection.target,noMoon:selection.noMoon});
      const a = describe(p,{isTonight:i===0,light:selection.light,now},criteria);
      const win = a.best;
      let weighted = 0;
      if (win) for (const h of p.hours) {
        const overlap = Math.max(0,Math.min(win.end,h.ms+HOUR)-Math.max(win.start,h.ms));
        if (overlap) weighted += h.cloud * overlap/(win.end-win.start);
      }
      const prefix = ms => dateMY(ms)!==date ? t('次日 ','+1d ') : '';
      const timing = win ? prefix(win.start)+time(win.start)+'–'+(dateMY(win.start)===dateMY(win.end)?'':prefix(win.end))+time(win.end) : '';
      return {date,i,win,timing,cloud:weighted,a,partial:p.weatherState==='partial'};
    });
    const candidates = nights.filter(n => n.win);
    const longest = Math.max(0,...candidates.map(n => n.win.minutes));
    const best = candidates.filter(n => n.win.minutes>=longest-30).sort((a,b) => a.cloud-b.cloud || b.win.minutes-a.win.minutes || a.i-b.i)[0];
    const loading = nights.some(n=>n.a.status==='loading');
    const gaps = nights.some(n=>n.a.status==='unknown'||n.partial);
    at('compare-lead').textContent = best ? (gaps?t('已有预报中首选 ','Best available · '):t('首选 ','Best window · '))+t(...nightNames[best.i])+'  '+best.timing :
      loading?t('正在对比三晚的云雨与星历…','Checking all three nights…'):
      gaps?t('预报不足，暂未找到可确认的时段','No confirmed window in the available forecast'):
      t('这三晚暂时没有合适时段','No suitable window over these three nights');
    const nodes = nights.map(n => {
      const row = document.createElement('tr');
      row.classList.toggle('rank-first',n===best);
      const day = document.createElement('th'); day.scope='row';
      const button = document.createElement('button');button.type='button';button.dataset.date=n.date;
      button.setAttribute('aria-pressed',String(n.date===selection.date));
      button.textContent=t(...nightNames[n.i]);
      const date = document.createElement('small');date.textContent=new Intl.DateTimeFormat(window.AtlasLang.en?'en-GB':'zh-CN',{day:'numeric',month:'short',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(n.date+'T12:00:00+08:00'));
      button.append(date);day.append(button);
      const slot = document.createElement('td');slot.textContent=n.timing||t(...n.a.label);
      const skyOnly=n.a.astro;
      if (!n.win && skyOnly && n.a.status==='unknown') {
        const astro = document.createElement('small');
        const fromDay=dateMY(skyOnly.start),toDay=dateMY(skyOnly.end);
        astro.textContent=t('仅天文 ','Sky only · ')+(fromDay===n.date?'':t('次日 ','+1d '))+time(skyOnly.start)+'–'+
          (toDay===fromDay?'':t('次日 ','+1d '))+time(skyOnly.end);
        slot.append(astro);
      }
      if(n===best){const tag=document.createElement('small');tag.textContent=t('首选','Best window');slot.append(tag);}
      const cloud = document.createElement('td');cloud.textContent=n.win?Math.round(n.cloud)+'%':'—';
      row.append(day,slot,cloud);return row;
    });
    const focused = body.contains(document.activeElement)?document.activeElement.dataset.date:null;
    body.replaceChildren(...nodes);
    if (focused) body.querySelector('[data-date="'+focused+'"]')?.focus({preventScroll:true});
    at('compare-note').textContent=t('点日期查看当晚。优先选较长的可拍时段，时长相差半小时以内时选平均云量较低的一晚。','Select a night for details. Longer windows come first. Within 30 minutes of the longest, clearer skies win.');
  }
  return {load,update,reset};
}

const bands = [
  {limit:.1,range:'< 0.1×',label:['人工增亮少于一成','Artificial glow adds under 10%']},
  {limit:1,range:'0.1–<1×',label:['人工天光弱于自然天光','Natural sky contributes more light']},
  {limit:10,range:'1–<10×',label:['人工天光占一半或更多','Artificial light supplies at least half the total']},
  {limit:Infinity,range:'≥ 10×',label:['天空背景很亮，暗星对比度低','Bright background, low contrast for faint stars']}
];
export function showGlow(glow,loading) {
  const value=glow?new Intl.NumberFormat(window.AtlasLang.en?'en-GB':'zh-CN',{maximumSignificantDigits:3}).format(glow.ratio)+'×':'—';
  at('glow-short').textContent=loading?'…':value;
  at('glow-value').textContent=loading?'…':value;
  const current=glow?bands.find(b=>glow.ratio<b.limit):null;
  at('glow-note').textContent=loading?t('正在读取历史图集…','Reading the atlas…'):glow?
    t('人工天光 / 自然天光。含自然天光的总亮度约为 '+Number(glow.totalRatio.toPrecision(3))+' 倍。来自 2014 年夜光模型。','Artificial / natural sky brightness. Total sky brightness is about '+Number(glow.totalRatio.toPrecision(3))+'× natural. Modelled from 2014 night lights.'):
    t('此点缺少历史模型估值。','No model estimate at this point.');
  at('glow-scale').replaceChildren(...bands.map(b=>{
    const row=document.createElement('tr'),th=document.createElement('th'),td=document.createElement('td');
    th.scope='row';th.textContent=b.range;td.textContent=t(...b.label);
    if(b===current){row.className='current-band';const here=document.createElement('small');here.textContent=t('此地','Here');th.append(here);}
    row.append(th,td);return row;
  }));
}
