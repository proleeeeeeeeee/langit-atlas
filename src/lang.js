(function(){
  'use strict';
  const labels={
    compareTitle:['未来三晚','The next three nights'],nightColumn:['拍摄夜','Night'],windowColumn:['建议时段','Shooting window'],cloudColumn:['时段云量','Window cloud'],
    localGlow:['此地光污染','Local skyglow'],glowScale:['人工天光与自然天光之比','Artificial light relative to natural sky brightness'],
    ratioColumn:['亮度比','Ratio'],meaningColumn:['怎么读','Reading the scale'],
    layers:['星图图层','Sky layers'],figures:['星座连线','Constellations'],milkyWay:['银河星带','Milky Way'],
    skyObject:['寻找天体','Find in the sky'],skyOnDate:['当晚星空','Explore the sky'],
    skip:['跳到主要内容','Skip to main content'],
    homeTitle:['选择拍摄地点','Choose your location'],
    homeIntro:['选一个马来西亚的地点，看看今晚几点适合拍星空。','Pick a spot in Malaysia to see when the sky will be dark and clear tonight.'],
    homeInput:['地名或经纬度','Place name or coordinates'],
    homePlaceholder:['输入地名或经纬度','Place name or coordinates'],
    checkTonight:['查看今晚','Check tonight'],
    openFinder:['打开星空取景器','Open sky viewfinder'],
    finderTitle:['星空取景器','Sky viewfinder'],
    finderHour:['取景时刻','Local time'],
    finderPlay:['固定机位预演','Play fixed-camera preview'],
    finderLens:['全画幅等效焦距','Full-frame equivalent'],
    finderDrag:['拖动或按方向键调整取景方向','Drag or use arrow keys to look around'],
    finderHint:['拖动或按方向键转向。虚线是拍摄目标未来一小时的轨迹。银河图层标示位置与轮廓，现场可见度取决于暮光、云量及光污染。','Drag or use arrow keys to look around. Dashes trace the shooting subject’s next hour. The Milky Way layer shows its shape and position. Twilight, cloud and skyglow affect visibility.'],
    finderAim:['对准拍摄目标','Centre on subject'],
    useCurrent:['使用当前位置','Use my location'],
    pickOnMap:['在地图上选点','Choose on the map'],
    matchPlaces:['匹配地点','Matching places'],
    recent:['最近查看','Recently viewed'],
    backTonight:['回到今晚','Back to tonight'],
    retryForecast:['重新获取预报','Retry forecast'],
    home:['星野手记首页','Langit Atlas home'],
    brand:['星野手记','Malaysia'],
    nav:['主导航','Main navigation'],
    planner:['拍摄规划','Night planner'],
    map:['光污染地图','Light pollution map'],
    guide:['读图指南','Field guide'],
    saved:['收藏地点','Saved places'],
    nightTitle:['红光夜视','Red night mode'],
    menu:['导航菜单','Navigation menu'],
    pick:['换地点','Change place'],
    mapPick:['选择拍摄地点','Choose a location'],
    photoAlt:['柔佛丰盛港 Pulau Mawar 的银河、海岸和水中的树影','The Milky Way above the coast and a tree in the water at Pulau Mawar, Mersing, Johor'],
    photoPlace:['Pulau Mawar，柔佛','Pulau Mawar, Johor'],
    photoBy:['摄影 Chalizham','Photograph by Chalizham'],
    saveTip:['收藏这个地点','Save this place'],
    settings:['调整拍摄计划','Shooting settings'],
    photoTitle:['照片、拍摄参数与署名','Photograph, exposure and credit'],
    date:['拍摄日期','Shoot date'],
    datePick:['选择拍摄日期','Choose a shoot date'],
    target:['拍摄目标','Subject'],
    core:['银河中心','Galactic centre'],
    stars:['广角星空','Wide-field stars'],
    noMoon:['只看无月时段','Moonless hours only'],
    astroNight:['天文暗夜','Astronomical night'],
    dusk:['暮光结束','Dusk ends'],
    dawn:['晨光开始','Dawn begins'],
    timeline:['整夜星历','Night timeline'],
    time:['查看时刻','Explore time'],
    bearing:['镜头朝向','Camera direction'],
    glow:['地点光污染','Local light pollution'],
    glowMap:['看光污染地图','Open light pollution map'],
    weather:['逐时天气','Hourly weather'],
    sources:['数据与方法','Sources & methods'],
    share:['分享这份计划','Share this plan'],
    timezone:['马来西亚时间 · MYT (UTC+8)','Malaysia time · MYT (UTC+8)'],
    mapIntro:['搜索地名或坐标，也可以直接点选地图。','Search places or coordinates, or tap the map.'],
    hideMap:['关闭地图','Close map'],
    search:['地名或坐标','Place or coordinates'],
    searchHint:['搜索地名或经纬度','Search places or coordinates'],
    selectedPlace:['地图选点','Selected place'],
    usePlace:['查看此地今晚','Check tonight here'],
    mapLayer:['光污染图层','Light pollution layer'],
    mapVintage:['2014 年模型','2014 model'],
    mapLegend:['光污染地图图例','Light pollution map legend'],
    mapRegions:['地图区域','Map region'],
    west:['马来半岛','Peninsular Malaysia'],
    east:['沙巴与砂拉越','Sabah & Sarawak'],
    mapFit:['显示全区','Fit region to view'],
    mapKeyboard:['光污染地图。方向键平移，加减号缩放，按 Enter 选择中心点。','Light pollution map. Arrow keys pan, plus and minus zoom, and Enter selects the centre.'],
    mapPlus:['放大地图','Zoom in'],
    mapMinus:['缩小地图','Zoom out'],
    close:['关闭','Close']
  };
  let code='zh';
  const pick=(zh,en)=>code==='en'?en:zh;
  const get=key=>{const pair=labels[key];return pair?pick(...pair):key;};
  function render(){
    document.documentElement.lang=code==='en'?'en':'zh-Hans';
    document.title=pick('星野手记 · Langit Atlas','Langit Atlas · Night sky planner');
    const meta=document.querySelector('meta[name=description]');
    meta.content=pick('选择马来西亚的地点和日期，查看光污染、银河、月光与云量，规划一晚的星空摄影。','Plan a night of astrophotography in Malaysia with local sky brightness, lunar and Galactic positions, and hourly weather.');
    for(const [data,attr] of [['l',null],['lAria','aria-label'],['lTitle','title'],['lPlaceholder','placeholder'],['lAlt','alt']]){
      const selector='[data-'+data.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+']';
      for(const el of document.querySelectorAll(selector)){
        const value=get(el.dataset[data]);
        if(attr)el.setAttribute(attr,value);else el.textContent=value;
      }
    }
    const button=document.getElementById('lang-toggle'),target=pick('切换到 English','Switch to 中文');
    button.setAttribute('aria-label',target);button.title=target;
  }
  function getQuery(){
    const url=new URL(location.href);
    return new URLSearchParams(url.hash.startsWith('#plan?')?url.hash.slice(5):url.search);
  }
  function set(next,persist=true){
    code=next==='en'?'en':'zh';
    if(persist){
      try{localStorage.setItem('la3-language',code);}catch{}
      // Retain existing shared-plan parameters when switching editions.
      if(location.protocol==='https:'||location.protocol==='http:'){
        try{const url=new URL(location.href);url.searchParams.set('lang',code);history.replaceState(history.state,'',url);}catch{}
      }else if(location.hash.startsWith('#plan?')){
        try{const q=getQuery();q.set('lang',code);history.replaceState(history.state,'','#plan?'+q);}catch{}
      }
    }
    render();
  }
  function init(){
    const requested=getQuery().get('lang');
    let saved;try{saved=localStorage.getItem('la3-language');}catch{}
    set(['zh','en'].includes(requested)?requested:saved,false);
  }
  window.AtlasLang=Object.freeze({get en(){return code==='en';},get code(){return code;},pick,set,init});
})();
