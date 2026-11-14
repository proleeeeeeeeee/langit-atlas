(function(){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const t=(zh,en)=>window.AtlasLang?.pick(zh,en) ?? zh;
  const direction=(az)=>{
    if(!Number.isFinite(az))return '—';
    const index=((Math.round(az/45)%8)+8)%8;
    return t(['北','东北','东','东南','南','西南','西','西北'][index],
      ['N','NE','E','SE','S','SW','W','NW'][index]);
  };
  function node(tag,attrs,parent,value){
    const n=document.createElementNS(NS,tag);
    for(const [k,v] of Object.entries(attrs)) n.setAttribute(k,v);
    if(value!==undefined)n.textContent=value;
    if(parent)parent.append(n);
    return n;
  }
  const css=k=>'var(--'+k+')';
  function primary(plan,hour){
    if(plan.target==='galaxy')return {
      name:t('银河中心','Galactic Centre'),nameZh:'银河中心',en:'Galactic Centre',
      alt:hour.coreAlt,az:hour.coreAz
    };
    const star=hour.stars.find(s=>s.name===plan.referenceStar)||hour.stars.reduce((a,b)=>a.alt>b.alt?a:b);
    return {...star,nameZh:star.name,name:t(star.name,star.en)};
  }
  function linePath(points,alt,X,Y){
    return points.map((v,i)=>(i?'L':'M')+X(v.ms).toFixed(2)+' '+Y(alt(v)).toFixed(2)).join(' ');
  }
  function fmt(h){return h.nextDay?t('次日 '+h.time,h.time+' (+1 day)'):h.time}
  function position(name,alt,az){
    if(alt<0)return t(name+'在地平线下，高度 '+Math.round(alt)+'°',name+' below the horizon, altitude '+Math.round(alt)+'°');
    return t(name+'高度 '+Math.round(alt)+'°，方位角 '+Math.round(az)+'°',
      name+' altitude '+Math.round(alt)+'°, azimuth '+Math.round(az)+'°');
  }
  function drawChart(container,plan,ix){
    const width=Math.max(255,Math.round(container.clientWidth)), short=width<430;
    const w=width,H=short?186:203,left=short?27:33,right=short?12:16,top=22,horizon=short?107:118,band=short?143:153;
    const h=plan.hours[ix],p=primary(plan,h);
    const moon=t('月亮','Moon'),slot=fmt(h);
    const accessible=t('天体高度与逐时云量。'+slot+'，'+p.name+'高度 '+Math.round(p.alt)+'°，月亮高度 '+Math.round(h.moonAlt)+'°。',
      'Altitude and hourly cloud cover at '+slot+'. '+p.name+' altitude '+Math.round(p.alt)+'°, Moon altitude '+Math.round(h.moonAlt)+'°.');
    const svg=node('svg',{viewBox:'0 0 '+w+' '+H,role:'img','aria-label':accessible},null);
    node('title',{},svg,accessible);
    node('desc',{},svg,t('地平线为 0°。云量色带越浅，云层覆盖越多。斜线表示缺少天气资料。','The horizon is at 0°. Lighter bands indicate greater cloud cover. Hatching indicates unavailable weather data.'));
    const defs=node('defs',{},svg),clip=node('clipPath',{id:'height-clip'},defs);
    node('rect',{x:left,y:top,width:w-left-right,height:horizon-top+.1},clip);
    const hatch=node('pattern',{id:'cloud-missing',patternUnits:'userSpaceOnUse',width:5,height:5},defs);
    node('path',{d:'M-1 1L1 -1M0 5L5 0M4 6L6 4',stroke:css('line'),'stroke-width':1.4},hatch);
    const end=plan.hours[13].ms,start=plan.hours[0].ms;
    const X=ms=>left+(ms-start)/(end-start)*(w-left-right);
    const Y=alt=>horizon-alt/90*(horizon-top);
    const grid=node('g',{},svg),data=node('g',{'clip-path':'url(#height-clip)'},svg);
    const horizonWindows=plan.windows.length?plan.windows:(plan.astronomicalPreview?[plan.astronomicalPreview]:[]);
    if(horizonWindows.length){
      for(const win of horizonWindows){
        node('rect',{x:X(win.start),y:top,width:Math.max(0,X(win.end)-X(win.start)),height:horizon-top,fill:css('accent'),opacity:plan.windows.length ? .09 : .045},grid);
        node('path',{d:'M'+X(win.start)+' '+(top+1)+'H'+X(win.end),stroke:css('accent'),'stroke-width':2,opacity:.8,'stroke-dasharray':plan.windows.length?'none':'3 3'},grid);
        if(X(win.end)-X(win.start)>49)node('text',{x:X(win.start)+5,y:top+13,fill:css('accent'),'font-size':10,'font-family':'var(--sans)'},grid,plan.windows.length?t('可拍','Shooting'):t('天文','Sky only'));
      }
    }
    [0,30,60,90].forEach(d=>{
      node('line',{x1:left,x2:w-right,y1:Y(d),y2:Y(d),class:d?'axis-line':'horizon-line','stroke-dasharray':d?'3 4':'none'},grid);
      node('text',{x:left-6,y:Y(d)+3,'text-anchor':'end',class:'chart-tick'},svg,d+'°');
    });
    const midnight=X(plan.hours[6].ms);
    node('line',{x1:midnight,x2:midnight,y1:top,y2:band+18,stroke:css('line'),'stroke-dasharray':'3 4'},grid);
    const tickIndices=short?[0,3,6,9,13]:[0,2,4,6,8,10,13];
    tickIndices.forEach(i=>{
      const tick=plan.hours[i];
      node('text',{x:X(tick.ms),y:H-7,'text-anchor':i===0?'start':i===13?'end':'middle',class:'chart-tick'},svg,tick.time);
    });
    node('text',{x:midnight,y:H-21,'text-anchor':'middle',class:'chart-tick'},svg,t('次日','+1 day'));
    const primaryPoints=plan.target==='galaxy'?plan.samples:plan.hours;
    const getAlt=plan.target==='galaxy'?s=>s.coreAlt:s=>s.stars.find(st=>st.name===p.nameZh).alt;
    const targetLine=node('path',{class:'core-line',d:linePath(primaryPoints,getAlt,X,Y)},data);
    node('title',{},targetLine,t(p.name+'高度',p.name+' altitude'));
    const moonLine=node('path',{class:'moon-line',d:linePath(plan.samples,s=>s.moonAlt,X,Y)},data);
    node('title',{},moonLine,t('月亮高度',moon+' altitude'));
    const selectedCloud=h.cloud;
    const cloudKnown=['demo','live','partial'].includes(plan.weatherState)&&Number.isFinite(selectedCloud);
    node('text',{x:left,y:band-5,class:'chart-label'},svg,cloudKnown?t('云量 '+selectedCloud+'%','Cloud '+selectedCloud+'%'):t('云量 暂缺','Cloud unavailable'));
    node('text',{x:w-right,y:band-5,'text-anchor':'end',class:'chart-label'},svg,t('浅色 = 云多','Lighter = cloudier'));
    const step=(w-left-right)/13;
    const validState=['demo','live','partial'].includes(plan.weatherState);
    for(let i=0;i<13;i++){
      const h=plan.hours[i], known=validState&&Number.isFinite(h.cloud);
      const box=node('rect',{x:X(h.ms)+.6,y:band,width:Math.max(1,step-1.2),height:13,rx:1.5,fill:known?css('fog'):'url(#cloud-missing)','fill-opacity':known ? .16+.84*(h.cloud/100) : 1,stroke:css('line'),'stroke-width':.45},svg);
      node('title',{},box,fmt(h)+' · '+(known?t('云量 '+h.cloud+'%','Cloud cover '+h.cloud+'%'):t('暂无云量数据','Cloud cover unavailable')));
    }
    const activeX=X(h.ms);
    node('path',{class:'plot-cursor',d:'M'+activeX+' '+(top-3)+'V'+(band+15)},svg);
    if(p.alt>=0)node('circle',{cx:activeX,cy:Y(p.alt),r:4.4,class:'plot-dot'},svg);
    if(h.moonAlt>=0)node('circle',{cx:activeX,cy:Y(h.moonAlt),r:3.3,fill:css('moon'),stroke:css('base'),'stroke-width':1.5},svg);
    const cursorHalf=h.nextDay?39:18;
    const labelX=Math.max(left+cursorHalf,Math.min(w-right-cursorHalf,activeX));
    node('text',{x:labelX,y:11,'text-anchor':'middle',fill:css('accent'),'font-size':11,'font-family':'var(--sans)'},svg,slot);
    container.replaceChildren(svg);
    container.dataset.left=String(left);container.dataset.right=String(right);
  }
  function drawCompass(container,p,h){
    const accessible=t('天空方位，真北朝上。','Sky orientation, true north up. ')+
      [position(p.name,p.alt,p.az),position(t('月亮','Moon'),h.moonAlt,h.moonAz)].join(t('。','. '));
    const svg=node('svg',{viewBox:'0 0 180 180',role:'img','aria-label':accessible},null);
    node('title',{},svg,accessible);
    node('desc',{},svg,t('外圈是地平线。从外向内的圆圈表示高度 0°、30°、60°，圆心为 90°。','The outer ring is the horizon. Rings mark altitudes of 0°, 30° and 60° from outside in. The centre is 90°.'));
    const center=90,radius=66;
    for(const r of [22,44,66])node('circle',{cx:center,cy:center,r,class:'comp-circle','stroke-dasharray':r===66?'none':'2 4'},svg);
    node('path',{d:'M90 23V157 M24 90H156',class:'comp-circle','stroke-dasharray':'3 5'},svg);
    for(let az=0;az<360;az+=10){
      const a=az*Math.PI/180,r=az%30===0?62:64.5;
      node('line',{x1:center+r*Math.sin(a),y1:center-r*Math.cos(a),x2:center+radius*Math.sin(a),y2:center-radius*Math.cos(a),stroke:css('faint'),'stroke-width':.8},svg);
    }
    [[90,15,t('北 N','N')],[163,94,t('东','E')],[90,174,t('南','S')],[16,94,t('西','W')]].forEach(([x,y,label])=>node('text',{x,y,'text-anchor':'middle',class:'comp-label'},svg,label));
    node('circle',{cx:90,cy:90,r:2,fill:css('faint')},svg);
    function mark(alt,az,color,star){
      if(alt<0)return;
      const a=az*Math.PI/180,r=radius*(1-Math.min(90,alt)/90);
      const x=center+r*Math.sin(a),y=center-r*Math.cos(a);
      if(star){
        node('path',{d:'M90 90L'+x+' '+y,stroke:css(color),'stroke-width':1.6},svg);
        node('circle',{cx:x,cy:y,r:10,fill:css(color),opacity:.13},svg);
        node('path',{d:'M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8Z',transform:'translate('+x+' '+y+')',fill:css(color)},svg);
      }else node('circle',{cx:x,cy:y,r:4.5,fill:css(color),stroke:css('base'),'stroke-width':1},svg);
    }
    mark(h.moonAlt,h.moonAz,'moon',false);mark(p.alt,p.az,'accent',true);
    container.replaceChildren(svg);
  }
  window.AtlasCharts={drawChart,drawCompass,primary,fmt,node,direction};
})();
