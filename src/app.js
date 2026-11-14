import * as astronomy from './ephemeris.js';
import { forecast } from './core/forecast';
import { describe } from './core/advice';
import { createFinder } from './sky/controller';

export function start(){
  const $=id=>document.getElementById(id);
  const N={...astronomy,forecast},G=window.AtlasGeo,C=window.AtlasCharts,M=window.AtlasMap,L=window.AtlasLang;
  const finder=createFinder(index=>hour(index));
  const t=(zh,en)=>L.pick(zh,en);
  const lunarPhases={'新月':'New moon','娥眉月':'Waxing crescent','上弦月':'First quarter','盈凸月':'Waxing gibbous','满月':'Full moon','亏凸月':'Waning gibbous','下弦月':'Last quarter','残月':'Waning crescent'};
  const compassPoints={'北':'N','东北':'NE','东':'E','东南':'SE','南':'S','西南':'SW','西':'W','西北':'NW'};
  const text=(id,v)=>{$(id).textContent=v;};
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=(key)=>'<svg aria-hidden="true" class="icon" viewBox="0 0 24 24">'+(window.AtlasIcons[key]||'')+'</svg>';
  const links=(url,label)=>'<a href="'+escape(url)+'" target="_blank" rel="noreferrer">'+escape(label)+'</a>';
  function icons(){document.querySelectorAll('i[data-i]').forEach(el=>{el.outerHTML=icon(el.dataset.i)});}
  function read(k,fallback){try{const raw=localStorage.getItem('la3-'+k);return raw?JSON.parse(raw):fallback;}catch{return fallback}}
  function write(k,value){try{localStorage.setItem('la3-'+k,JSON.stringify(value));return true;}catch{return false}}
  const validDate=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||s<'1901-01-01'||s>'2099-12-31')return false;const d=new Date(s+'T04:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;};
  const isDemoable=s=>s.date===N.example.date&&Math.abs(s.place.lat-N.example.lat)<.00005&&Math.abs(s.place.lon-N.example.lon)<.00005;
  // Each observing night runs from 18:00 MYT through 07:00 the next day.
  const tonight=(now=Date.now())=>N.dateMY(now-7*3600000);
  const freshPlan=()=>({place:null,date:tonight(),target:'stars',noMoon:true,index:null,demo:false});
  function fromURL(){
    const s=freshPlan(),q=new URLSearchParams(location.hash.startsWith('#plan?')?location.hash.slice(5):location.search);
    if(!q.has('lat')||!q.has('lon')||!q.get('lat')?.trim()||!q.get('lon')?.trim())return s;
    const lat=Number(q.get('lat')),lon=Number(q.get('lon')),date=q.get('date')||s.date;
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||!M.areaFor(lat,lon)||!validDate(date))return s;
    const p=G.places.find(p=>String(p.id)===q.get('place')&&Math.hypot(p.lat-lat,p.lon-lon)<.008);
    s.place=p?{...p,lat,lon}:q.get('point')==='device'?M.devicePoint(lat,lon):M.guessed(lat,lon);
    s.date=date;s.target=q.get('target')==='galaxy'?'galaxy':'stars';s.noMoon=q.get('moon')!=='allow';
    const h=q.get('h');if(h!==null&&/^\d{1,2}$/.test(h)&&+h<=13)s.index=Number(h);
    s.demo=q.get('archive')==='1'&&isDemoable(s);
    return s;
  }
  let state=fromURL(),weather=null,plan=null,advice=null,light=null,request=0,noticeTimer,forecastRefresh,currentView='',noticeLabels=null;
  let followWindow=state.index===null,viewRoute=null;
  let locationAttempt=0,deviceState='';
  const locationMessages={
    denied:['浏览器未获定位权限。可在地址栏的网站权限中允许定位，或手动选点。','Location access is off. Allow location in this site’s browser settings, or choose a place manually.'],
    unavailable:['设备暂时无法定位。可检查系统定位服务后重试，或在地图上选点。','Your device could not get a position. Check its location settings and retry, or choose a point on the map.'],
    timeout:['定位超时。可再试一次，也可以输入地名或坐标。','The location request timed out. Try again, or enter a place name or coordinates.'],
    unsupported:['此浏览器无法提供定位。可用手机浏览器打开网站，或手动选点。','This browser cannot provide a location. Open the site in a mobile browser, or choose a place manually.'],
    insecure:['请通过 HTTPS 打开网站以使用定位，或手动选择地点。','Open the site over HTTPS to use location, or choose a place manually.'],
    outside:['当前位置超出马来半岛和东马图幅。可搜索覆盖范围内的地点。','Your position is outside the Peninsular Malaysia and East Malaysia maps. Choose a place within their coverage.']
  };
  function renderLocationStatus(){
    const pending=deviceState==='pending',button=$('use-current');
    button.disabled=pending;button.setAttribute('aria-busy',String(pending));
    text('use-current-label',pending?t('正在定位…','Locating…'):t('使用当前位置','Use my location'));
    text('device-status',locationMessages[deviceState]?t(...locationMessages[deviceState]):'');
  }
  function clearDevice(){
    locationAttempt++;
    if(deviceState){deviceState='';renderLocationStatus();}
  }
  function locateDevice(){
    if(deviceState==='pending')return;
    const attempt=++locationAttempt;
    const finish=next=>{if(attempt===locationAttempt){deviceState=next;renderLocationStatus();}};
    if(!window.isSecureContext){finish('insecure');return;}
    if(!navigator.geolocation){finish('unsupported');return;}
    finish('pending');
    try{
      navigator.geolocation.getCurrentPosition(position=>{
        if(attempt!==locationAttempt||state.place)return;
        const {latitude:lat,longitude:lon,accuracy}=position.coords;
        if(!Number.isFinite(lat)||!Number.isFinite(lon)){finish('unavailable');return;}
        if(!M.areaFor(lat,lon)){finish('outside');return;}
        finish('');changePlace(M.devicePoint(lat,lon,accuracy));
      },err=>finish(({1:'denied',2:'unavailable',3:'timeout'})[err.code]||'unavailable'),
      {enableHighAccuracy:true,timeout:15000,maximumAge:60000});
    }catch(err){finish(err.name==='SecurityError'?'denied':'unavailable');}
  }
  function routeURL(includeHour){
    const url=new URL(location.href);url.search='';url.hash='';
    if(!state.place){if(url.protocol!=='file:')url.searchParams.set('lang',L.code);return url.toString();}
    const p=state.place,q=new URLSearchParams({lat:p.lat.toFixed(5),lon:p.lon.toFixed(5),date:state.date,target:state.target,moon:state.noMoon?'below':'allow',lang:L.code});
    if(includeHour&&Number.isInteger(state.index))q.set('h',String(state.index));
    if(p.id)q.set('place',p.id);
    if(p.source==='device')q.set('point','device');
    if(state.demo)q.set('archive','1');
    if(url.protocol==='file:')url.hash='plan?'+q;
    else url.search=q.toString();
    return url.toString();
  }
  const shareURL=()=>routeURL(true);
  function syncRoute(method='replaceState'){
    const url=routeURL(!followWindow);
    if(url!==location.href){
      try{history[method]({placeSelected:!!state.place},'',url);}
      catch{if(location.protocol==='file:')location.hash=new URL(url).hash;}
    }
    viewRoute=location.href;
  }
  const wxGood=()=>['demo','live','partial'].includes(plan?.weatherState);
  const wxState=()=>plan?.weatherState||'missing';
  const weatherLabels={
    demo:['历史预报示例','Archived forecast'],live:['近期天气预报','Current forecast'],
    partial:['部分时段有预报','Partial forecast'],loading:['正在查询预报','Loading forecast'],
    expired:['天气预报已过期','Forecast expired'],missing:['天气预报暂缺','Forecast unavailable'],
    'out-of-range':['天气超出预报期','Outside forecast range']
  };
  const weatherLabel=()=>t(...(weatherLabels[wxState()]||weatherLabels.missing));
  function displayDate(date){
    const dateObj=new Date(date+'T04:00:00Z');
    if(L.en)return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(dateObj);
    const fmt=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Kuala_Lumpur',month:'long',day:'numeric',weekday:'short'});
    return date.slice(0,4)+'年 '+fmt.format(dateObj).replace(/(日)(周|星期)/,'$1 $2');
  }
  const stamp=ms=>N.dateMY(ms)+' '+N.time(ms);
  const shortDate=ms=>{
    if(L.en)return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',day:'numeric',month:'short'}).format(ms);
    const d=N.dateMY(ms).split('-');return Number(d[1])+'月'+Number(d[2])+'日';
  };
  function notice(zh,en){
    clearTimeout(noticeTimer);noticeLabels=[zh,en];text('notice',t(zh,en));$('notice').classList.add('show');
    noticeTimer=setTimeout(()=>{noticeLabels=null;$('notice').classList.remove('show');text('notice','');},2800);
  }
  function bookmarks(){const list=read('places',[]);return Array.isArray(list)?list.filter(p=>p&&M.areaFor(p.lat,p.lon)):[];}
  const atSame=(a,b)=>Math.abs(a.lat-b.lat)<.00005&&Math.abs(a.lon-b.lon)<.00005;
  function syncSaved(){
    if(!state.place)return;
    const saved=bookmarks().some(p=>atSame(p,state.place));
    $('save-place').setAttribute('aria-pressed',String(saved));$('save-place').lastElementChild.textContent=saved?t('已收藏','Saved'):t('收藏','Save');
    $('save-place').title=saved?t('移除收藏','Remove from saved places'):t('收藏这个地点','Save this place');
  }
  function setNight(on,persist){document.documentElement.dataset.night=on?'red':'normal';$('night-toggle').setAttribute('aria-pressed',String(on));$('night-toggle').setAttribute('aria-label',on?t('关闭红光夜视','Turn off red night mode'):t('开启红光夜视','Turn on red night mode'));if(persist)write('red',on);}
  function fullUpdate(){
    const p=state.place;
    const alternate=!L.en&&!p.custom&&p.name&&p.zh&&p.name!==p.zh?p.name:'';
    text('place-zh',M.nameOf(p));text('place-en',alternate);$('place-en').hidden=!alternate;
    const area=p.region==='east'?t('东马','East Malaysia'):t('马来半岛','Peninsular Malaysia');
    text('region',[p.source==='device'?t('设备定位','Device location'):M.stateOf(p),area].filter(Boolean).join(' · '));
    const accuracy=p.source==='device'&&Number.isFinite(p.accuracy)?' · ±'+(p.accuracy>=1000?Number((p.accuracy/1000).toFixed(1))+' km':Math.ceil(p.accuracy)+' m'):'';
    text('entry-coords',M.coord(p.lat,p.lon)+accuracy);
    const input=$('night-date');input.value=state.date;text('date-display',displayDate(state.date));
    $('target').value=state.target;$('moon-toggle').setAttribute('aria-checked',String(state.noMoon));
    syncSaved();M.mini(p);
    const glow=light=G.lookup(p.lat,p.lon);
    if(['idle','loading'].includes(G.state)){
      text('glow-value',t('读取地图中…','Loading atlas…'));text('glow-note','');return;
    }
    if(glow){
      const brightness=Number(glow.artificialMcd.toPrecision(2));
      $('glow-value').innerHTML=String(Number(glow.totalRatio.toPrecision(2)))+' <small>'+t('倍自然暗空亮度','× natural sky brightness')+'</small>';
      text('glow-note',t('天顶人工亮度约 '+brightness+' mcd/m²。基于 2014 年夜光的模型估算。','Estimated artificial brightness overhead: '+brightness+' mcd/m². Modelled from 2014 night lights.'));
    }else{
      $('glow-value').innerHTML='<span class="word">'+t('缺少可用估值','No estimate available')+'</span>';
      text('glow-note',t('该格点缺少可解读的历史亮度。可继续按坐标查看天体位置。','The atlas has no usable sky-brightness estimate at this point. Star and Moon positions are still available.'));
    }
  }
  function timeRange(w){
    const next=N.dateMY(w.end)!==state.date,startsNext=N.dateMY(w.start)!==state.date;
    return (startsNext?'<small class="before-time">'+t('次日','Next day')+'</small> ':'')+'<span class="time-range">'+N.time(w.start)+'<span class="time-dash">–</span>'+N.time(w.end)+'</span>'+(next&&!startsNext?'<small>'+t('次日结束','ends next day')+'</small>':'');
  }
  function renderSummary(){
    const ws=wxState(),isTonight=!state.demo&&state.date===tonight();
    const first=plan.hours[0].ms,last=plan.hours[13].ms;
    const withinMonth=N.dateMY(first).slice(0,7)===N.dateMY(last).slice(0,7);
    const span=L.en?(withinMonth?Number(N.dateMY(first).slice(8))+'–'+shortDate(last):shortDate(first)+'–'+shortDate(last)):
      shortDate(first)+'晚至'+(withinMonth?Number(N.dateMY(last).slice(8))+'日':shortDate(last))+'晨';
    const dateLabel=L.en?span+' '+state.date.slice(0,4):state.date.slice(0,4)+'年'+span;
    const period=state.demo?t('历史预报','Archive'):isTonight?t('今晚','Tonight'):t('所选拍摄夜','Selected night');
    text('night-context',period+' · '+dateLabel+' · MYT');
    text('weather-mark',weatherLabel());
    $('tonight-toggle').hidden=isTonight;
    $('retry-summary').hidden=!['missing','expired','partial'].includes(ws);
    const verdict=$('night-verdict');verdict.dataset.status=advice.status;verdict.textContent=t(...advice.label);
    text('window-reason',t(...advice.reason));
    const window=advice.best||advice.astro;
    $('window-block').hidden=!window;
    const windowLabel=advice.best?t('建议拍摄时段','Best shooting window'):t('仅按天文条件','Astronomical window only');
    text('window-heading',window?windowLabel:'');
    $('window-answer').innerHTML=window?timeRange(window):'';
    const hours=window?Math.floor(window.minutes/60):0,mins=window?window.minutes%60:0;
    text('window-duration',[hours?hours+t(' 小时',' h'):'',mins?mins+t(' 分钟',' min'):''].filter(Boolean).join(' '));
    const cutoff=isTonight?Date.now():-Infinity;
    const other=advice.best?plan.windows.filter(w=>w.end!==advice.best.end)
      .map(w=>({start:Math.max(w.start,cutoff),end:w.end})).filter(w=>w.end-w.start>=3600000)
      .map(w=>(N.dateMY(w.start)!==state.date?t('次日 ','next day '):'')+N.time(w.start)+'–'+N.time(w.end)).join(t('、',', ')):'';
    $('other-windows').innerHTML=other?'<p class="more-windows">'+t('其他可拍时段 ','Other windows · ')+escape(other)+'</p>':'';
    $('dark-values').innerHTML='<span>'+N.time(plan.events.darkStart)+'</span><span class="event-sep">–</span><span>'+
      '<span class="qualifier">'+(Number.isFinite(plan.events.darkEnd)&&N.dateMY(plan.events.darkEnd)!==state.date?t('次日 ','+1d '):'')+'</span>'+N.time(plan.events.darkEnd)+'</span>';
  }

  function bearingRow(name,alt,az,cls){
    const direction=N.compass(az);
    return '<div class="bearing-row '+cls+'"><span>'+escape(name)+'</span><strong>'+
      (alt<0?t('地平线下','Below horizon'):t(direction,compassPoints[direction]||'—')+' '+Math.round(az)%360+'°')+
      '</strong><small>'+t(alt<0?'高度 ':'仰角 ','Altitude ')+Math.round(alt)+'°</small></div>';
  }
  function formatNumber(v,digits,suffix){return Number.isFinite(v)?v.toFixed(digits)+suffix:'—';}
  function renderHour(){
    if(!plan)return;
    const h=plan.hours[state.index],p=C.primary(plan,h),slot=C.fmt(h),el=$('hour-slider');
    text('bearing-time',slot);text('weather-time',slot);text('scrub-label',slot);el.value=state.index;el.setAttribute('aria-valuetext',slot);
    text('bearing-caption',t('真北朝上，外圈是地平线','True north up. The outer ring is the horizon.'));
    $('line-legend').innerHTML='<span class="key">'+escape(p.name)+'</span><span class="key lunar">'+t('月亮','Moon')+'</span>';
    text('plot-caption',(state.target==='stars'?t(p.name+'作广角构图参照',p.name+' as a framing reference'):t('天体高度与逐时云量','Altitude and hourly cloud cover'))+' · MYT');
    C.drawChart($('time-chart'),plan,state.index);C.drawCompass($('compass'),p,h);
    finder.update({lat:state.place.lat,lon:state.place.lon,place:M.nameOf(state.place),date:state.date,ms:h.ms,index:state.index,clock:slot,en:L.en,red:document.documentElement.dataset.night==='red',
      target:{name:p.name,alt:p.alt,az:p.az},moon:{name:t('月亮','Moon'),alt:h.moonAlt,az:h.moonAz}});
    $('bearing-rows').innerHTML=bearingRow(p.name,p.alt,p.az,'')+bearingRow(t('月亮','Moon'),h.moonAlt,h.moonAz,'lunar');
    const moon=[t(h.moonPhase,lunarPhases[h.moonPhase]||'Moon phase unavailable'),formatNumber(h.moonIllum,0,'%')+t(' 照明',' illuminated')].join(' · ');
    const moonEvent=[[plan.events.moonrise,t('月出','moonrise')],[plan.events.moonset,t('月落','moonset')]]
      .filter(([ms])=>Number.isFinite(ms)&&ms>=plan.hours[0].ms&&ms<=plan.hours[13].ms).sort((a,b)=>a[0]-b[0])
      .map(([ms,label])=>' · '+(L.en?label+' '+N.time(ms)+(N.dateMY(ms)!==state.date?' next day':''):(N.dateMY(ms)!==state.date?'次日 ':'')+N.time(ms)+' '+label)).join('');
    $('bearing-foot').innerHTML=icon('moon-star')+escape(moon+moonEvent);
    const good=wxGood(),w=plan.weather;
    const values=[[t('总云量','Cloud cover'),0,'%',h.cloud],[t('降雨','Rainfall'),1,' mm',h.rain],[t('湿度','Humidity'),0,'%',h.humidity],[t('露点差','Dew point spread'),1,'°C',Number.isFinite(h.temp)&&Number.isFinite(h.dew)?h.temp-h.dew:null]];
    $('weather-values').innerHTML=values.map(([label,d,s,v])=>'<div><span>'+label+'</span><b>'+formatNumber(good?v:null,d,s)+'</b></div>').join('');
    text('weather-source',wsSource(w));
    let detail;
    if(good){
      if(state.index===13)detail=t('已到本次规划的结束时刻。降雨按所示时刻起的下一小时累计。','The plan ends at this hour. Rainfall is the forecast total for the following hour.');
      else if(!h.weatherValid)detail=t('所选小时缺少云雨数据，无法判定该小时能否拍摄。','Cloud or rain data is missing for this hour, so its shooting conditions are unknown.');
      else if(Number.isFinite(h.dew)&&Number.isFinite(h.temp)){
        const temp=formatNumber(h.temp,1,'°C'),dew=formatNumber(h.dew,1,'°C');
        detail=t('气温 '+temp+'，露点 '+dew+'。两者越接近，镜头越容易结露。','Air temperature '+temp+', dew point '+dew+'. A smaller gap means more chance of dew on the lens.');
      }else detail=t('降雨为下一小时累计量。当地低云和阵雨可能与网格预报有差异。','Rainfall covers the next hour. Local low cloud and showers can vary within a forecast grid cell.');
    }else{
      const descriptions={
        'out-of-range':['当前可查今晚及随后 6 晚。其他日期仍可查看天文条件。','Weather forecasts cover tonight and the next six nights. Astronomical conditions are available for other dates.'],
        expired:['缓存已过期。联网后可重新获取天气。','The saved forecast has expired. Reconnect to fetch a new one.'],
        loading:['正在连接 Open-Meteo。','Connecting to Open-Meteo…'],
        missing:['暂时未取得天气数据。可重试，或继续查看天文条件。','Weather data is unavailable. You can retry or use the astronomical timings.']
      };
      detail=t(...(descriptions[wxState()]||['暂无该小时天气资料。','No forecast is available for this hour.']));
    }
    text('weather-detail',detail);
    if(['missing','expired','partial'].includes(wxState())){
      const retry=document.createElement('button');retry.className='text-button retry';retry.textContent=t('重试天气','Retry forecast');retry.onclick=()=>refresh(true);$('weather-detail').append(' ',retry);
    }
  }
  function wsSource(w){
    if(wxState()==='demo')return t('ECMWF IFS 历史预报 · '+N.time(w.modelRunAt)+' MYT 起报','ECMWF IFS archive · '+N.time(w.modelRunAt)+' MYT model run');
    if(w?.fetchedAt)return 'Open-Meteo · '+t(stamp(w.fetchedAt)+' MYT 获取','retrieved '+stamp(w.fetchedAt)+' MYT');
    return 'Open-Meteo · '+weatherLabel();
  }
  function compute(){
    plan=N.plan({lat:state.place.lat,lon:state.place.lon,date:state.date,target:state.target,noMoon:state.noMoon,weather});
    advice=describe(plan,{isTonight:state.date===tonight()&&!state.demo,light,now:Date.now()},N.criteria);
    const darkFrom=Math.max(plan.events.darkStart||plan.start,state.date===tonight()?Date.now():plan.start);
    const firstDark=plan.hours.findIndex(h=>h.ms>=darkFrom);
    const anchor=advice.index??Math.max(0,firstDark);
    if(followWindow||state.index===null)state.index=anchor;
    // Keep one reference star while the user scrubs across the night.
    if(plan.target==='stars')plan.referenceStar=plan.hours[anchor].stars.reduce((a,b)=>a.alt>b.alt?a:b).name;
    plan.astronomicalPreview=advice.astro;
    renderSummary();renderHour();
  }
  async function refresh(retry=false){
    if(!state.place)return;
    const id=++request;clearTimeout(forecastRefresh);
    const atlas=G.load();
    fullUpdate();
    if(state.demo&&isDemoable(state)){
      weather=N.demoWeather();compute();await atlas;
      if(id===request){fullUpdate();compute();}
      return;
    }
    state.demo=false;weather={state:'loading',rows:{}};compute();
    const forecast=N.forecast({lat:state.place.lat,lon:state.place.lon,date:state.date,retry}).catch(()=>({state:'missing',rows:{}}));
    const [data]=await Promise.all([forecast,atlas]);
    if(id!==request)return;weather=data;fullUpdate();compute();
    if(['live','partial'].includes(data.state)&&data.expiresAt){
      forecastRefresh=setTimeout(()=>{if(id===request)refresh();},Math.max(1000,data.expiresAt-Date.now()+100));
    }
  }
  function recentPlaces(){
    const list=read('recent',[]);
    return Array.isArray(list)?list.filter(p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&M.areaFor(p.lat,p.lon)).slice(0,3):[];
  }
  function renderRecent(){
    const list=recentPlaces(),host=$('recent-buttons');host.replaceChildren();
    $('recent-places').hidden=!list.length;
    for(const place of list){
      const b=document.createElement('button');b.type='button';b.className='recent-choice';
      const name=document.createElement('span');name.textContent=M.nameOf(place);
      const area=document.createElement('small');area.textContent=M.stateOf(place)||M.coord(place.lat,place.lon);
      b.append(name,area);b.onclick=()=>changePlace(place);host.append(b);
    }
  }
  function showRoute(moveFocus=false){
    finder.close();
    clearDevice();
    const hasPlace=!!state.place;
    $('place-home').hidden=hasPlace;$('plan-view').hidden=!hasPlace;
    if(hasPlace){
      refresh();
      if(moveFocus)$('location-title').focus({preventScroll:true});
    }else{
      request++;clearTimeout(forecastRefresh);weather=null;plan=null;advice=null;light=null;
      window.PlacePicker.reset();renderRecent();
      if(moveFocus)$('location-search').focus({preventScroll:true});
    }
    if(moveFocus)window.scrollTo({top:0,behavior:'instant'});
  }
  function goHome(){
    if(!state.place){clearDevice();$('location-search').focus();return;}
    state=freshPlan();followWindow=true;syncRoute('pushState');showRoute(true);
  }
  function changePlace(p){
    state={...freshPlan(),place:p};followWindow=true;
    write('recent',[p,...recentPlaces().filter(x=>!atSame(x,p))].slice(0,3));
    syncRoute('pushState');showRoute(true);
  }
  function hour(i){
    const next=Math.min(13,Math.max(0,Math.round(i)));
    if(next!==state.index){followWindow=false;state.index=next;renderHour();syncRoute();}
  }
  function restoreRoute(){
    if(viewRoute===location.href)return;
    viewRoute=location.href;state=fromURL();followWindow=state.index===null;
    const query=new URLSearchParams(location.hash.startsWith('#plan?')?location.hash.slice(5):location.search);
    const lang=query.get('lang');if(lang==='zh'||lang==='en')L.set(lang,false);
    for(const d of document.querySelectorAll('dialog[open]'))d.close();
    currentView='';M.relabel();window.PlacePicker.relabel();setNight(document.documentElement.dataset.night==='red',false);
    showRoute(true);
  }
  function xToHour(e){
    const chart=$('time-chart'),rect=chart.getBoundingClientRect(),l=+chart.dataset.left,r=+chart.dataset.right;
    hour((e.clientX-rect.left-l)/(rect.width-l-r)*13);
  }
  const photoLink='https://commons.wikimedia.org/wiki/File:Majestic_Milky_Way.jpg';
  const shareAlike='https://creativecommons.org/licenses/by-sa/4.0/';
  const noncommercial='https://creativecommons.org/licenses/by-nc/4.0/';
  function photoHTML(){
    return '<h3>'+t('柔佛丰盛港 Pulau Mawar','Pulau Mawar, Mersing, Johor')+'</h3><p>'+
      t('Chalizham 摄于 2020 年 6 月 20 日。Sony ILCE-7M2，18 mm，f/2.8，20 秒，ISO 2000。桌面和手机封面分别从原片裁切，保留原色。',
        'Photographed by Chalizham on 20 June 2020. Sony ILCE-7M2, 18 mm, f/2.8, 20 seconds, ISO 2000. The desktop and mobile covers use different crops of the original photograph in its original colours.')+
      '</p><p>'+links(photoLink,t('原始照片与作者','Original photograph and photographer'))+' · '+links(shareAlike,t('照片许可 CC BY-SA 4.0','Photograph licence · CC BY-SA 4.0'))+'</p>';
  }
  function guide(){
    const e=plan?.events,star=plan?.peak;
    const nextDay=star&&N.dateMY(star.ms)!==state.date;
    const eventsText=e?t('天文暮光结束 '+N.time(e.darkStart)+'，次日晨光开始 '+N.time(e.darkEnd)+'。',
      'Astronomical dusk is at '+N.time(e.darkStart)+' and astronomical dawn is at '+N.time(e.darkEnd)+' the following morning.')+
      (state.target==='galaxy'&&star.alt>0?t(' 当夜银心最高约 '+Math.round(star.alt)+'°，发生在 '+(nextDay?'次日 ':'')+star.time+'。',
        ' The Galactic Centre reaches about '+Math.round(star.alt)+'° at '+star.time+(nextDay?' the next day':'')+'.'):''):'';
    const dt=(name,body,open=false)=>'<details'+(open?' open':'')+'><summary>'+name+'</summary>'+body+'</details>';
    return dt(t('什么条件算可拍？','What makes a shooting window?'),
      t('<p>以马来西亚时间计算 18:00 到次日 07:00。太阳低于地平线 18°、总云量 ≤35%、下一小时降雨 &lt;0.1 mm，连续满足至少 60 分钟。银河目标另要求银心高度 ≥15°。开启无月筛选会排除月亮在地平线以上的时段。阈值是这个摄影工具的初始设定。</p><p>图中阴影标出可拍窗口。天气暂缺时，虚线标出的窗口仅符合天文条件。云量带越浅，预报云越多。斜纹表示缺数。</p>',
        '<p>The planner checks 18:00 to 07:00 the next day in Malaysia Time (MYT). A window needs at least 60 continuous minutes with the Sun 18° or more below the horizon, cloud cover of 35% or less, and less than 0.1 mm of forecast rain in the following hour. For the Milky Way, the Galactic Centre must also be at least 15° above the horizon. The moonless filter keeps only times when the Moon is below the horizon.</p><p>Shading marks a shooting window. When weather is unavailable, a dashed line marks times that meet only the astronomical criteria. A lighter cloud band means more forecast cloud. Hatching means missing data.</p>'),true)+
      dt(t('今晚的天文事件与朝向','Night sky and camera direction'),(eventsText?'<p>'+eventsText+'</p>':'')+
        t('<p>方位角从真北起顺时针计量，东为 90°，南为 180°。罗盘外缘对应地平线，圆心对应头顶。银河中心以人马座 A* 方向为参照。广角星空显示一颗参考亮星，山脊、建筑与树木遮挡需在现场判断。</p>',
          '<p>Bearings run clockwise from true north. East is 90° and south is 180°. The compass edge is the horizon and the centre is directly overhead. Sagittarius A* marks the direction of the Galactic Centre. Wide-field mode shows one bright reference star. Check the actual sightline for ridges, buildings and trees.</p>')+
        '<p>'+links(N.sources.astronomy,'Astronomy Engine · MIT')+' · '+links(N.sources.coordinates,t('银心参考坐标 · SIMBAD','Galactic Centre coordinates · SIMBAD'))+'</p>'+
        t('<p>取景器使用 David Nash（Astronexus）编制的 HYG 4.1 星表，从中筛选了 523 颗视星等不大于 4 的恒星。坐标以 J2000 为基准。按当前地点与所选时刻投影，天空亮度、云和地形未纳入渲染。焦距采用 36 × 24 mm 画幅。</p>',
          '<p>The viewfinder plots 523 stars of apparent magnitude 4 or brighter from HYG 4.1 by David Nash (Astronexus). J2000 positions are transformed for your place and time. Sky brightness, cloud and terrain are omitted. Focal lengths assume a 36 × 24 mm frame.</p>')+
        '<p>'+links('https://github.com/astronexus/HYG-Database/tree/main/hyg','HYG Stellar Database')+' · '+links(shareAlike,'CC BY-SA 4.0')+'</p>')+
      dt(t('光污染的数值怎么读？','How is sky brightness estimated?'),
        t('<p>显示晴朗夜晚天顶的长期亮度估值。倍数为自然天光与人工天光之和，除以参考天然天光 0.174 mcd/m²。例如 2 倍表示在模型里，人工天光相当于一份天然天光。地图颜色单独表示人工天光相对天然天光的比例。</p><p>Falchi 等人 2016 年发表的模型采用 2014 年夜光资料，原始网格 30 角秒，赤道附近约 0.93 公里。当地新灯、山体遮挡与特定方向的光晕需要现场核实。</p>',
          '<p>The estimate describes typical clear-night brightness directly overhead. The figure divides natural plus artificial sky brightness by a natural reference of 0.174 mcd/m². A value of 2× means artificial light adds as much sky brightness as the natural sky. Map colours show just the artificial contribution relative to that natural reference.</p><p>Falchi and colleagues published the atlas in 2016 using 2014 night-light data. Its 30-arcsecond grid is about 0.93 km wide near the equator. New lighting, terrain and the direction of a light dome can change what you see at the camera.</p>')+
        '<p>'+links(G.source.doi,t('GFZ 数据','GFZ dataset'))+' · '+links(G.source.paper,t('原始论文','Research paper'))+' · '+links(noncommercial,'CC BY-NC 4.0')+'</p>')+
      dt(t('天气的更新时间和单位','Forecast timing and units'),
        t('<p>选定地点后，网站从 Open-Meteo 获取逐小时预报，同一地点约每小时更新一次。「逐时天气」会标出获取时间。云量是天空被云遮住的比例，降雨是下一小时的累计毫米数。气温和露点越接近，镜头越容易结露。沿海阵雨和局地云带可能与预报有出入。</p>',
          '<p>After you choose a location, the planner fetches an hourly forecast from Open-Meteo and refreshes it about once an hour. The hourly weather section shows when it was retrieved. Cloud cover is the percentage of sky obscured. Rainfall is the total forecast for the following hour. When air temperature nears the dew point, your lens is more likely to fog. Coastal showers and local cloud bands can differ from the forecast.</p>')+
        '<p>'+links(N.sources.forecast,t('Open-Meteo 天气资料','Open-Meteo weather data'))+' · '+links(N.sources.terms,t('接口使用条款','API terms of use'))+' · '+links(N.sources.licence,t('天气数据 CC BY 4.0','Weather data · CC BY 4.0'))+(state.demo?' · '+links(N.sources.archive,t('该日期的归档预报','Archived forecast for this date')):'')+'</p>')+
      dt(t('底图、地名与照片署名','Map, place names and photo credits'),
        t('<p>马来西亚图幅经过裁切、量化与配色。地理轮廓、州界、道路和河流来自 Natural Earth，地点来自 GeoNames。</p>',
          '<p>The Malaysian map tiles have been cropped, quantised and colour-mapped. Natural Earth supplies the coastlines, state boundaries, roads and rivers. Place names come from GeoNames.</p>')+
        '<p>'+links('https://www.naturalearthdata.com/about/terms-of-use/',t('Natural Earth · 公有领域','Natural Earth · public domain'))+' · '+links('https://www.geonames.org/','GeoNames')+' · '+links('https://creativecommons.org/licenses/by/4.0/',t('地名 CC BY 4.0','Place names: CC BY 4.0'))+'</p>'+photoHTML());
  }
  function info(title,html){
    text('info-title',title);$('info-body').innerHTML=html;
    if(!$('info-dialog').open)$('info-dialog').showModal();
    $('info-dialog').scrollTop=0;
  }
  function showSaved(){
    const list=bookmarks();info(t('收藏地点','Saved places'),list.length?'':'<p>'+
      t('还没有收藏地点。选好机位后，点地名旁的书签就能存到这里。','No places saved yet. After choosing a location, use the bookmark beside its name to save it here.')+'</p><button class="text-button" data-open="map">'+t('选择地点','Choose a location')+' '+icon('arrow-right')+'</button>');
    for(const p of list){
      const row=document.createElement('div');row.className='saved-row';
      const b=document.createElement('button');b.className='saved-choice';
      b.innerHTML=escape(M.nameOf(p))+'<small>'+escape(M.coord(p.lat,p.lon))+'</small>';b.onclick=()=>{$('info-dialog').close();changePlace(p);};
      const remove=document.createElement('button');remove.className='ico';remove.setAttribute('aria-label',t('移除收藏 '+M.nameOf(p),'Remove '+M.nameOf(p)+' from saved places'));remove.innerHTML=icon('trash-2');
      remove.onclick=()=>{write('places',bookmarks().filter(pt=>!atSame(pt,p)));showSaved();syncSaved();};
      row.append(b,remove);$('info-body').append(row);
    }
  }
  function showShare(){
    currentView='share';
    const file=location.protocol==='file:';
    info(t('分享这份计划','Share this plan'),'<p>'+(file?
      t('本地预览可复制拍摄摘要，发送给同行。','This is a local preview. Copy the shooting summary below to send it to someone.'):
      t('复制链接即可在同一地点、日期和时刻打开。','Copy the link to open this plan with the same location, date, time and settings.'))+'</p>');
    const input=document.createElement('input');input.readOnly=true;input.className='share-input';
    input.setAttribute('aria-label',file?t('拍摄摘要','Shooting summary'):t('计划链接','Plan link'));
    const summary=$('window-answer').textContent.replace('次日结束','（次日结束）').replace('ends next day',' (ends next day)');
    input.value=file?[M.nameOf(state.place),M.coord(state.place.lat,state.place.lon),state.date+' MYT',
      state.target==='galaxy'?t('银河中心','Galactic Centre'):t('广角星空','Wide-field stars'),weatherLabel(),
      $('night-verdict').textContent,summary?$('window-heading').textContent+' '+summary:''].filter(Boolean).join(' · '):shareURL();
    $('info-body').append(input);input.focus();input.select();
  }
  function openView(view){
    if(!state.place)clearDevice();
    currentView=view;
    if(view==='finder'&&state.place){finder.open();return;}
    if(view==='map'){if($('info-dialog').open)$('info-dialog').close();M.open(state.place,changePlace);}
    if(view==='guide')info(t('读图指南','Reading the charts'),guide());
    if(view==='photo')info(t('照片与摄影署名','Photograph and credits'),photoHTML());
    if(view==='saved')showSaved();
    if(view==='share'&&state.place)showShare();
    if(view==='menu')info(t('导航','Menu'),'<button class="menu-btn" data-open="map">'+icon('map')+' '+t('光污染地图','Light pollution map')+'</button><button class="menu-btn" data-open="saved">'+icon('bookmark')+' '+t('收藏地点','Saved places')+'</button><button class="menu-btn" data-open="guide">'+icon('book-open')+' '+t('读图指南','Reading the charts')+'</button>');
  }
  function changeLanguage(){
    L.set(L.en?'zh':'en',true);
    setNight(document.documentElement.dataset.night==='red',false);
    if(state.place){fullUpdate();if(plan)compute();}
    else renderRecent();
    M.relabel();window.PlacePicker.relabel();renderLocationStatus();viewRoute=location.href;
    if($('info-dialog').open&&currentView&&currentView!=='map'){
      const openDetails=[...$('info-body').querySelectorAll('details')].map(el=>el.open);
      const scroll=$('info-dialog').scrollTop;
      openView(currentView);
      $('info-body').querySelectorAll('details').forEach((el,i)=>{if(i<openDetails.length)el.open=openDetails[i];});
      $('info-dialog').scrollTop=scroll;
    }
    if(noticeLabels)text('notice',t(...noticeLabels));
  }
  function init(){
    L.init();icons();M.init();window.PlacePicker.init(changePlace);setNight(read('red',false),false);
    document.querySelector('.skip').onclick=e=>{e.preventDefault();$(state.place?'location-title':'location-search').focus();};
    $('lang-toggle').onclick=changeLanguage;
    $('use-current').onclick=locateDevice;
    $('location-search').addEventListener('input',clearDevice);
    $('location-form').addEventListener('submit',clearDevice);
    $('night-toggle').onclick=()=>{setNight(document.documentElement.dataset.night!=='red',true);if(plan)renderHour();};
    $('night-date').min='1901-01-01';$('night-date').max='2099-12-31';
    function chooseDate(date){
      if(!validDate(date)){$('night-date').value=state.date;notice('请选择 1901 至 2099 年的有效日期','Choose a valid date between 1901 and 2099');return;}
      state.date=date;state.demo=false;state.index=null;followWindow=true;syncRoute();refresh();
    }
    $('night-date').onchange=e=>chooseDate(e.target.value);
    $('tonight-toggle').onclick=()=>chooseDate(tonight());
    $('target').onchange=e=>{state.target=e.target.value;followWindow=true;compute();syncRoute();};
    $('moon-toggle').onclick=()=>{state.noMoon=!state.noMoon;$('moon-toggle').setAttribute('aria-checked',String(state.noMoon));followWindow=true;compute();syncRoute();};
    $('retry-summary').onclick=()=>refresh(true);
    $('save-place').onclick=()=>{
      const l=bookmarks(),saved=l.some(p=>atSame(p,state.place));const ok=write('places',saved?l.filter(p=>!atSame(p,state.place)):[state.place,...l]);syncSaved();
      if(!ok)notice('当前浏览器无法保存收藏','This browser could not save the place');
      else if(saved)notice('已从收藏移除','Removed from saved places');
      else notice('已收藏在此浏览器','Place saved in this browser');
    };
    $('share').onclick=async()=>{
      const url=shareURL();
      if(location.protocol!=='file:'){try{await navigator.clipboard.writeText(url);notice('计划链接已复制','Plan link copied');return;}catch{}}
      showShare();
    };
    $('hour-slider').oninput=e=>hour(+e.target.value);
    const chart=$('time-chart');chart.onpointerdown=e=>{if(e.button!==0)return;xToHour(e);chart.setPointerCapture(e.pointerId);};chart.onpointermove=e=>{if(chart.hasPointerCapture(e.pointerId))xToHour(e);};
    document.addEventListener('click',e=>{
      if(e.target.closest('[data-action="home"]')){e.preventDefault();goHome();return;}
      const btn=e.target.closest('[data-open]');if(btn)openView(btn.dataset.open);
      const close=e.target.closest('button.close');if(close)close.closest('dialog').close();
    });
    for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close();});
    let lastWidth=0;new ResizeObserver(entries=>{const w=Math.round(entries[0].contentRect.width);if(plan&&w&&w!==lastWidth){lastWidth=w;C.drawChart(chart,plan,state.index);}}).observe(chart);
    for(const event of ['popstate','hashchange'])window.addEventListener(event,restoreRoute);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.place&&!state.demo&&weather?.expiresAt&&Date.now()>weather.expiresAt)refresh();});
    window.addEventListener('online',()=>{if(state.place&&!state.demo&&['missing','expired'].includes(wxState()))refresh(true);});
    viewRoute=location.href;showRoute(false);
  }
  init();
}
