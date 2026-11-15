(function(){
  'use strict';
  const A=window.AtlasGeo,node=window.AtlasCharts.node,$=id=>document.getElementById(id),rad=Math.PI/180;
  const t=(zh,en)=>window.AtlasLang?.pick(zh,en) ?? zh;
  const merc=lat=>Math.log(Math.tan(Math.PI/4+Math.max(-80,Math.min(80,lat))*rad/2))/rad;
  const y=lat=>-merc(lat);
  const inv=value=>(2*Math.atan(Math.exp(-value*rad))-Math.PI/2)/rad;
  const regions=A.regions,land=document.querySelector('.svg-defs');
  const overviewPlaces=new Set(['Kuala Lumpur','George Town','Ipoh','Johor Bahru','Kuantan','Kota Bharu','Mersing','Kuching','Kota Kinabalu','Sandakan','Tawau','Miri','Sibu','Bintulu','Labuan']);
  const labelPlaces=A.places.filter(p=>p.population>20000||p.name==='Labuan').slice()
    .sort((a,b)=>Number(overviewPlaces.has(b.name))-Number(overviewPlaces.has(a.name))||b.population-a.population);
  const labelMeasure=document.createElement('canvas').getContext('2d');
  const labelWidths=new Map();
  let labelFont='';
  let baseReady=false,choice,region=regions[0],view=null,svgState=null,apply,drag=null,frame=null;
  let lastStatus='',lastStatusPlace=null;
  let lightSurface,loadingSurface=false;
  function drawSurface(surface){
    if(lightSurface){lightSurface(surface);return;}
    if(loadingSurface)return;
    loadingSurface=true;
    import('./sky/map-light').then(({mapLight})=>{
      lightSurface=mapLight($('map-light'));queue();
    }).catch(()=>{delete $('map-view').dataset.surface;});
  }
  const coord=(lat,lon)=>Math.abs(lat).toFixed(3)+'° '+(lat<0?'S':'N')+'  ·  '+Math.abs(lon).toFixed(3)+'° '+(lon<0?'W':'E');
  const areaFor=(lat,lon)=>Number.isFinite(lat)&&Number.isFinite(lon)
    ?regions.find(r=>lat>=r.south&&lat<=r.north&&lon>=r.west&&lon<=r.east):undefined;
  const guessed=(lat,lon)=>({lat,lon,name:'Dropped pin',zh:'地图选点',state:'',stateZh:'',region:areaFor(lat,lon)?.id,custom:true});
  function devicePoint(lat,lon,accuracy){
    const p=guessed(lat,lon);
    // Use a nearby name as context only. The actual coordinates drive the plan.
    const lonScale=Math.cos(lat*rad);
    let closestKm=8,near=null;
    for(const place of A.places){
      if(place.region!==p.region)continue;
      const km=111.2*Math.hypot(place.lat-lat,(place.lon-lon)*lonScale);
      if(km<closestKm){closestKm=km;near=place;}
    }
    p.source='device';
    if(near){p.nearZh=near.zh||near.name;p.nearEn=near.name||near.zh;}
    if(Number.isFinite(accuracy)&&accuracy>0)p.accuracy=accuracy;
    return p;
  }
  function nameOf(pt){
    if(pt?.source==='google')return pt.name||pt.userLabel||t('已收藏的地点','Saved location');
    if(pt?.source==='device'){
      if(pt.nearZh&&pt.nearEn)return t(pt.nearZh+'附近','Near '+pt.nearEn);
      return t('定位点','Located point');
    }
    if(!pt||pt.custom||(!pt.name&&!pt.zh))return t('地图选点','Dropped pin');
    return t(pt.zh||pt.name,pt.name||pt.zh);
  }
  function stateOf(pt){
    if(!pt||pt.custom)return '';
    return t(pt.stateZh||pt.state||'',pt.state==='Pulau Pinang'?'Penang':pt.state||'');
  }
  const normalizeName=value=>String(value??'').normalize('NFKD').toLowerCase()
    .replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  function searchPlaces(value,limit=8){
    const query=String(value??'').normalize('NFKC').replace(/\u2212/g,'-').trim();
    const result=(status,places=[])=>({status,places:places.slice(0,limit),hasMore:places.length>limit});
    if(!query)return result('empty');
    // The atlas and all selected locations use latitude, longitude.
    const pair=query.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*°?\s*([NS]?)\s*(?:[,;、]|\s+)\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*°?\s*([EW]?)$/i);
    if(pair){
      function component(number,hemisphere){
        if(number.startsWith('-')&&hemisphere)return NaN;
        return Number(number)*(/[SW]/i.test(hemisphere)?-1:1);
      }
      const lat=component(pair[1],pair[2]),lon=component(pair[3],pair[4]);
      if(!Number.isFinite(lat)||!Number.isFinite(lon))return result('invalid');
      return areaFor(lat,lon)?result('matches',[guessed(lat,lon)]):result('outside');
    }
    if(/^[+-]?(?:\d|\.)/.test(query)&&/^[+\-\d.,;°NSEW\s、]+$/i.test(query))return result('invalid');
    const places=A.search(query,A.places.length);
    const norm=normalizeName(query);
    const exact=places.filter(p=>[p.name,p.zh,...p.aliases].some(name=>normalizeName(name)===norm));
    const matches=exact.length?exact:places;
    return result(matches.length?'matches':'none',matches);
  }
  function resultText(p){
    const main=nameOf(p);
    return t(main+(!p.custom&&p.zh&&p.name&&p.zh!==p.name?' · '+p.name:''),main);
  }
  function makePath(line,closed){
    return line.map(([lon,lat],i)=>(i?'L':'M')+lon.toFixed(4)+' '+y(lat).toFixed(4)).join('')+(closed?'Z':'');
  }
  function geometryPath(g){
    switch(g.type){
      case 'Polygon':return g.coordinates.map(r=>makePath(r,true)).join('');
      case 'MultiPolygon':return g.coordinates.flatMap(p=>p.map(r=>makePath(r,true))).join('');
      case 'LineString':return makePath(g.coordinates,false);
      case 'MultiLineString':return g.coordinates.map(r=>makePath(r,false)).join('');
      default:return '';
    }
  }
  function prepare(){
    if(baseReady||!A.map)return;
    const defs=node('defs',{},land);
    const groups={};
    for(const kind of ['land','border','river','road'])groups[kind]=node('g',{id:'geo-'+kind},defs);
    for(const f of A.map.features){
      const kind=f.properties.kind;
      const style=kind==='land'?{fill:'var(--land)',stroke:'var(--map-outline)','stroke-width':'.65','fill-rule':'evenodd'}:
        kind==='border'?{fill:'none',stroke:'var(--map-outline)','stroke-width':'.6','stroke-dasharray':'3 3'}:
        kind==='road'?{fill:'none',stroke:'var(--map-road)','stroke-width':'.6',opacity:'.64'}:
        {fill:'none',stroke:'var(--map-river)','stroke-width':'.65',opacity:'.74'};
      if(groups[kind])node('path',{d:geometryPath(f.geometry),'vector-effect':'non-scaling-stroke',...style},groups[kind]);
    }
    baseReady=true;
  }
  function fit(){
    view={cx:(region.west+region.east)/2,cy:(y(region.north)+y(region.south))/2,zoom:1};
    queue();
  }
  function getBox(pt,r,width,height){
    const unit=Math.max((r.east-r.west)*1.04/width,(y(r.south)-y(r.north))*1.04/height)/pt.zoom;
    return {l:pt.cx-unit*width/2,t:pt.cy-unit*height/2,unit,width,height};
  }
  function labelWidth(name){
    if(!labelWidths.has(name))labelWidths.set(name,Math.ceil(labelMeasure?.measureText(name).width??(name.length*13)));
    return labelWidths.get(name);
  }
  function drawPlaces(svg,box,pt,X,Y){
    const {width:w,height:h}=box;
    const font='500 13px '+getComputedStyle(svg).fontFamily;
    if(font!==labelFont){
      labelFont=font;labelWidths.clear();if(labelMeasure)labelMeasure.font=font;
    }
    const inset=6;
    const occupied=[
      {left:0,right:52,top:0,bottom:36},
      {left:w-63,right:w,top:h-113,bottom:h},
      {left:0,right:102,top:h-41,bottom:h}
    ];
    if(pt)occupied.push({left:X(pt.lon)-15,right:X(pt.lon)+15,top:Y(pt.lat)-15,bottom:Y(pt.lat)+15});
    const collides=(a,b)=>a.left<b.right+3&&b.left<a.right+3&&a.top<b.bottom+3&&b.top<a.bottom+3;
    const maxLabels=Math.max(4,Math.min(34,Math.floor(w*h/(view.zoom<1.5?15500:9200))));
    let count=0;
    for(const place of labelPlaces){
      if(place.region!==region.id||pt?.id===place.id)continue;
      if(view.zoom<1.5&&!overviewPlaces.has(place.name))continue;
      const x=X(place.lon),y=Y(place.lat);
      if(x<inset||x>w-inset||y<inset||y>h-inset)continue;
      if(pt&&Math.hypot(x-X(pt.lon),y-Y(pt.lat))<14)continue;
      const name=nameOf(place),width=labelWidth(name)+10;
      const offsets=[[7,-10],[-width-7,-10],[7,-24],[-width-7,-24],[7,3],[-width-7,3]];
      const anchor={left:x-2,right:x+2,top:y-2,bottom:y+2};
      if(occupied.some(rect=>collides(anchor,rect)))continue;
      for(const [dx,dy] of offsets){
        const left=Math.round(x+dx),top=Math.round(y+dy),rect={left,top,right:left+width,bottom:top+20};
        if(left<inset||top<inset||rect.right>w-inset||rect.bottom>h-inset||occupied.some(other=>collides(rect,other)))continue;
        const group=node('g',{class:'map-place','data-place-id':place.id},svg);
        node('circle',{cx:x,cy:y,r:2.3,class:'map-place-dot'},group);
        node('rect',{x:left,y:top,width,height:20,rx:2,class:'map-label-plate'},group);
        node('text',{x:left+5,y:top+14.5,class:'map-label'},group,name);
        occupied.push(rect,anchor);count++;break;
      }
      if(count>=maxLabels)break;
    }
  }
  function renderMap(svg,box,pt,small){
    prepare();svg.replaceChildren();
    const w=box.width,h=box.height,unit=box.unit;
    svg.setAttribute('viewBox','0 0 '+w+' '+h);
    const base=small?svg:$('map-base');
    if(!small){base.replaceChildren();base.setAttribute('viewBox','0 0 '+w+' '+h);}
    const transform='scale('+(1/unit)+') translate('+(-box.l)+' '+(-box.t)+')';
    const scene=node('g',{transform},base);
    const X=v=>(v-box.l)/unit,Y=v=>(y(v)-box.t)/unit;
    node('use',{href:'#geo-land'},scene);
    const r=pt&&areaFor(pt.lat,pt.lon);
    const overlays=small?[r].filter(Boolean):[region];
    for(const rg of overlays){
      node('image',{x:rg.west,y:y(rg.north),width:rg.east-rg.west,height:y(rg.south)-y(rg.north),href:(window.AtlasImages?.[rg.image]||'assets/'+rg.image),preserveAspectRatio:'none',class:'map-raster'},scene);
      if(!small)drawSurface({url:'assets/'+rg.image,left:X(rg.west),top:Y(rg.north),width:(rg.east-rg.west)/unit,height:Y(rg.south)-Y(rg.north),viewportWidth:w,viewportHeight:h});
    }
    const outlines=small?scene:node('g',{transform},svg);
    for(const kind of (small?['border','river']:['border','river','road']))node('use',{href:'#geo-'+kind},outlines);
    if(!small)drawPlaces(svg,box,pt,X,Y);
    if(pt){
      const px=X(pt.lon),py=Y(pt.lat);
      if(px>=0&&px<=w&&py>=0&&py<=h){
        const pin=node('g',{'data-selected-pin':''},svg);
        node('circle',{cx:px,cy:py,r:small?8:10,fill:'var(--map-halo)',stroke:'var(--map-dot)','stroke-width':1.8},pin);
        node('circle',{cx:px,cy:py,r:small?3:4,fill:'var(--map-dot)'},pin);
      }
    }
    if(!small){
      node('rect',{x:8,y:8,width:35,height:22,rx:2,class:'map-label-plate'},svg);
      node('path',{d:'M16 24v-11l-3 5m3-5 3 5',stroke:'var(--map-dot)',fill:'none','stroke-width':1.5},svg);
      node('text',{x:23,y:23,class:'map-key-label'},svg,t('北','N'));
      const desired=unit*75*110;
      const exponent=Math.pow(10,Math.floor(Math.log10(desired)));
      const barKm=(desired/exponent>=5?5:desired/exponent>=2?2:1)*exponent;
      const len=barKm/(Math.cos(inv(box.t+unit*h/2)*rad)*111.32*unit);
      const scaleText=t('约 '+barKm+' km','≈ '+barKm+' km');
      node('rect',{x:8,y:h-38,width:Math.max(len,labelWidth(scaleText))+10,height:30,rx:2,class:'map-label-plate'},svg);
      node('path',{d:'M13 '+(h-17)+'v3h'+len.toFixed(1)+'v-3',stroke:'var(--map-dot)',fill:'none'},svg);
      node('text',{x:13,y:h-21,class:'map-key-label'},svg,scaleText);
    }
  }
  function render(){
    if(!$('map-dialog').open||!view)return;
    const host=$('map-view'),w=Math.max(120,host.clientWidth),h=Math.max(100,host.clientHeight);
    svgState=getBox(view,region,w,h);
    renderMap($('map-svg'),svgState,choice,false);
    document.querySelectorAll('[data-region]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.region===region.id)));
    $('map-plus').disabled=view.zoom>=32;$('map-minus').disabled=view.zoom<=1;
  }
  function queue(){if(frame===null)frame=requestAnimationFrame(()=>{frame=null;render()})}
  function mini(pt){
    const box=$('mini-map');if(!box)return;
    if(!pt){box.replaceChildren();return;}
    const svg=node('svg',{'aria-hidden':'true',viewBox:'0 0 160 135'},null);
    const unit=.024,w=160,h=135;
    renderMap(svg,{l:pt.lon-w*unit/2,t:y(pt.lat)-h*unit/2,unit,width:w,height:h},pt,true);
    box.replaceChildren(svg);
  }
  function details(){
    $('use-point').disabled=!choice;
    if(!choice){
      $('choice-name').textContent=t('在地图上点选拍摄位置','Tap the map to pick a location');
      $('choice-coords').textContent='';$('choice-glow').textContent='';$('choice-glow').removeAttribute('title');
      return;
    }
    $('choice-name').textContent=nameOf(choice);
    const district=stateOf(choice);
    $('choice-coords').textContent=[district===nameOf(choice)?'':district,coord(choice.lat,choice.lon)].filter(Boolean).join(' · ');
    const glow=A.lookup(choice.lat,choice.lon);
    if(glow){
      const artificial=Number(glow.ratio.toPrecision(2)),total=Number(glow.totalRatio.toPrecision(2));
      const value=document.createElement('strong');value.textContent=t(artificial+' 倍',artificial+'×');
      $('choice-glow').replaceChildren(t('人工天光约为自然天光的 ','Artificial glow is about '),value,t('',' the natural sky brightness.'));
      $('choice-glow').title=t('含自然天光的总亮度约 '+total+' 倍。','Total brightness including the natural sky is about '+total+'×.');
    }else{
      $('choice-glow').removeAttribute('title');
      $('choice-glow').textContent=t('此点没有可用的光污染估值。','No light pollution estimate is available at this point.');
    }
  }
  function choose(pt,move){
    const r=areaFor(pt.lat,pt.lon);
    if(!r)return;
    if(r.id!==region.id){region=r;fit();}
    choice={...pt};details();
    if(move){
      view.cx=pt.lon;view.cy=y(pt.lat);view.zoom=Math.max(view.zoom,3);clampView();
    }
    queue();
  }
  function showStatus(kind='',pt=null){
    lastStatus=kind;lastStatusPlace=pt;
    let message='';
    if(kind==='bounds')message=t('坐标超出马来半岛和东马图幅。','These coordinates are outside the Peninsular Malaysia and East Malaysia map coverage.');
    if(kind==='invalid')message=t('请输入十进制度数，先纬度，再经度。','Enter decimal coordinates with latitude first, then longitude.');
    if(kind==='choose')message=t('有多个匹配地点，请选择其中一个。','Several locations match. Choose one from the list.');
    if(kind==='no-match')message=t('没有匹配地名。可粘贴经纬度，或点选地图。','No matching places. Paste latitude and longitude, or drop a pin on the map.');
    if(kind==='outside')message=t('此处在图幅之外，请选择图幅内的点。','This point is outside the map coverage. Choose a point within either mapped region.');
    if(kind==='selected'&&pt)message=t('已选中 '+nameOf(pt),'Selected '+nameOf(pt));
    $('search-status').textContent=message;
  }
  function search(){
    const q=$('place-search').value.trim(),host=$('place-results');host.replaceChildren();showStatus();
    if(!q)return;
    const found=searchPlaces(q,8),options=found.places;
    if(found.status==='outside'){showStatus('bounds');return;}
    if(found.status==='invalid'){showStatus('invalid');return;}
    if(!options.length){showStatus('no-match');return;}
    for(const p of options){
      const btn=document.createElement('button');btn.className='result-btn';btn.type='button';
      btn.dataset.place=String(p.id||p.lat+','+p.lon);
      const a=document.createElement('span');
      a.textContent=resultText(p);
      const b=document.createElement('small');b.textContent=p.custom?t('坐标','Coordinates'):stateOf(p);
      btn.append(a,b);
      btn.onclick=()=>{choose(p,true);host.replaceChildren();$('place-search').value='';showStatus('selected',p);};
      host.append(btn);
    }
  }
  function clampView(){
    view.cx=Math.max(region.west,Math.min(region.east,view.cx));
    view.cy=Math.max(y(region.north),Math.min(y(region.south),view.cy));
  }
  function zoom(f,mx,my){
    if(!svgState)return;
    const before=svgState;const val=Math.min(32,Math.max(1,view.zoom*f));
    if(val===view.zoom)return;
    const old=view.zoom;view.zoom=val;
    if(mx!==undefined){view.cx+=(mx-before.width/2)*before.unit*(1-old/val);view.cy+=(my-before.height/2)*before.unit*(1-old/val);}
    clampView();queue();
  }
  function pick(px,py){
    const lat=inv(svgState.t+py*svgState.unit),lon=svgState.l+px*svgState.unit;
    if(areaFor(lat,lon)!==region){showStatus('outside');return;}
    showStatus();$('place-results').replaceChildren();$('place-search').value='';
    choose(guessed(+lat.toFixed(5),+lon.toFixed(5)),false);
  }
  function relabel(){
    const dialog=$('map-dialog');
    if(!dialog)return;
    const legend=$('map-legend'),title=document.createElement('span'),ticks=document.createElement('div');
    title.textContent=t('人工天光 / 自然天光','Artificial / natural sky brightness');
    ticks.className='legend-ticks';legend.replaceChildren(title,ticks);
    for(const point of A.legend.filter(s=>[.1,1,10,100].includes(s.ratio))){
      const item=document.createElement('span'),chip=document.createElement('i');
      chip.setAttribute('aria-hidden','true');chip.style.background=point.color;chip.style.setProperty('--chip-opacity',point.alpha/255);
      item.append(chip,point.ratio+'×');ticks.append(item);
    }
    if(dialog.open){
      details();
      if($('place-search').value.trim()){
        const focusedId=document.activeElement?.dataset?.place;
        search();
        if(focusedId){
          const results=$('place-results').querySelectorAll('button');
          Array.from(results).find(b=>b.dataset.place===focusedId)?.focus({preventScroll:true});
        }
      }else showStatus(lastStatus,lastStatusPlace);
      render();
    }
  }
  function init(){
    const canvas=$('map-view');
    const layer=$('map-layer-toggle');
    layer.onclick=()=>{
      const visible=layer.getAttribute('aria-checked')!=='true';
      layer.setAttribute('aria-checked',String(visible));
      canvas.classList.toggle('basemap-only',!visible);
      $('map-legend').hidden=!visible;
    };
    $('map-plus').onclick=()=>zoom(1.7);$('map-minus').onclick=()=>zoom(1/1.7);$('map-fit').onclick=fit;
    document.querySelectorAll('[data-region]').forEach(btn=>btn.onclick=()=>{
      const next=regions.find(r=>r.id===btn.dataset.region);if(!next||next===region)return;
      region=next;choice=null;$('place-search').value='';$('place-results').replaceChildren();
      showStatus();details();fit();
    });
    $('place-search').oninput=search;
    $('place-search').onkeydown=e=>{
      if(e.isComposing||e.keyCode===229)return;
      const results=$('place-results').querySelectorAll('button');
      if(e.key==='Enter' && !results.length && searchPlaces($('place-search').value).status==='none'){
        e.preventDefault();document.querySelector('[data-place-lookup="place-search"]').click();return;
      }
      if(e.key==='Enter'&&results.length){
        e.preventDefault();
        if(results.length===1)results[0].click();else{showStatus('choose');results[0].focus();}
      }else if(e.key==='ArrowDown'&&results.length){e.preventDefault();results[0].focus();}
    };
    $('place-results').addEventListener('keydown',event=>{
      if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
      const buttons=Array.from($('place-results').querySelectorAll('button'));
      const index=buttons.indexOf(event.target);if(index<0)return;event.preventDefault();
      if(event.key==='ArrowUp'&&index===0)$('place-search').focus();
      else buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();
    });
    $('use-point').onclick=()=>{
      if(!choice||areaFor(choice.lat,choice.lon)!==region)return;
      const p={...choice};$('map-dialog').close();apply(p);
    };
    canvas.addEventListener('pointerdown',e=>{
      if(e.target.closest('button')||!svgState||e.button!==0||!e.isPrimary)return;
      drag={x:e.clientX,y:e.clientY,cx:view.cx,cy:view.cy,moved:false,placeId:e.target.closest('.map-place')?.dataset.placeId};
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{
      if(!drag||!e.isPrimary)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      if(Math.hypot(dx,dy)<5&&!drag.moved)return;drag.moved=true;
      view.cx=drag.cx-dx*svgState.unit;view.cy=drag.cy-dy*svgState.unit;clampView();queue();
    });
    canvas.addEventListener('pointerup',e=>{
      if(!drag||!e.isPrimary)return;
      const {moved,placeId}=drag;drag=null;
      if(moved)return;
      const place=placeId&&labelPlaces.find(p=>String(p.id)===placeId);
      if(place){
        $('place-search').value='';$('place-results').replaceChildren();showStatus();choose(place,false);
      }else{
        const r=canvas.getBoundingClientRect();pick(e.clientX-r.left,e.clientY-r.top);
      }
    });
    canvas.addEventListener('pointercancel',()=>{drag=null});
    canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(e.deltaY<0?1.35:1/1.35,e.clientX-r.left,e.clientY-r.top);},{passive:false});
    canvas.addEventListener('keydown',e=>{
      if(e.target!==canvas||!svgState)return;
      const d=svgState.unit*36,delta={ArrowLeft:[-d,0],ArrowRight:[d,0],ArrowUp:[0,-d],ArrowDown:[0,d]};
      if(delta[e.key]){e.preventDefault();view.cx+=delta[e.key][0];view.cy+=delta[e.key][1];clampView();queue();}
      if(e.key==='Enter'){e.preventDefault();pick(svgState.width/2,svgState.height/2);}
      if(e.key==='+'||e.key==='=')zoom(1.7);if(e.key==='-')zoom(1/1.7);
    });
    details();relabel();
    document.fonts.ready.then(()=>{labelWidths.clear();queue();});
    new ResizeObserver(queue).observe(canvas);
  }
  function open(pt,chooseCallback){
    apply=chooseCallback;
    const start=pt&&areaFor(pt.lat,pt.lon);
    choice=start?{...pt}:null;region=start||regions[0];drag=null;svgState=null;
    $('place-search').value='';$('place-results').replaceChildren();showStatus();
    $('map-dialog').showModal();fit();details();render();
    A.load().then(()=>{if($('map-dialog').open){details();render();}});
    if(window.innerWidth>650)$('place-search').focus({preventScroll:true});else $('map-title').focus({preventScroll:true});
  }
  window.AtlasMap={init,open,mini,coord,areaFor,guessed,devicePoint,nameOf,stateOf,relabel,searchPlaces,resultText};
})();
