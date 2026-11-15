const t=(zh,en)=>window.AtlasLang.pick(zh,en);
const el=id=>document.getElementById(id);
export const isGoogle=p=>p?.source==='google' && typeof p.googleId==='string' && /^[A-Za-z0-9_-]{6,255}$/.test(p.googleId);
export const storedPlace=p=>isGoogle(p)?{source:'google',googleId:p.googleId,userLabel:p.userLabel}:p;

async function call(body,signal){
  const response=await fetch('/api/places',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...body,lang:window.AtlasLang.code}),cache:'no-store',signal});
  if(!response.ok)throw new Error(response.status===422?'outside':'unavailable');
  return response.json();
}

export async function resolvePlace(ref,session,signal) {
  const {lat,lon,credits,address}=await call({id:ref.googleId,session},signal);
  const region=window.AtlasMap.areaFor(lat,lon);
  if(!region)throw new Error('outside');
  return {...ref,lat,lon,region:region.id,name:ref.name||ref.userLabel||address,credits};
}

export function googleLookup(onSelect){
  const dialog=el('lookup-dialog'),input=el('lookup-input'),list=el('lookup-options'),status=el('lookup-status');
  let timer,request,session,selectionBusy=false;
  function cancel(){
    clearTimeout(timer);request?.abort();request=undefined;selectionBusy=false;
  }
  function resetSession(){session=crypto.randomUUID();}
  function showLocal(q,msg){
    list.replaceChildren();status.textContent=msg;
    const local=window.AtlasMap.searchPlaces(q);
    if(local.places.length)status.textContent+=' '+t('可用本地地名：','Available local places:');
    for(const p of local.places)row(window.AtlasMap.nameOf(p),window.AtlasMap.stateOf(p),()=>select(p));
  }
  function row(title,area,action){
    const b=document.createElement('button'),name=document.createElement('span'),detail=document.createElement('small');
    b.type='button';b.className='result-btn';name.textContent=title;detail.textContent=area;
    b.append(name,detail);b.onclick=action;list.append(b);
  }
  function select(p){
    dialog.close();const map=el('map-dialog');if(map.open)map.close();onSelect(p);
  }
  async function choose(item,q) {
    if(selectionBusy)return;
    cancel();selectionBusy=true;
    const controller=request=new AbortController(),token=session;
    resetSession();
    status.textContent=t('正在读取坐标…','Finding coordinates…');
    try {
      const p=await resolvePlace({source:'google',googleId:item.id,name:item.name,userLabel:q},token,controller.signal);
      if(!controller.signal.aborted&&dialog.open)select(p);
    }catch(error){
      if(!controller.signal.aborted)showLocal(q,error.message==='outside'?t('所选地点超出覆盖范围。','Place outside coverage.'):t('暂时无法取得 Google 地点坐标。','Google coordinates are unavailable.'));
    }finally{if(request===controller)selectionBusy=false;}
  }
  function refresh(immediate=false) {
    cancel();list.replaceChildren();
    const q=input.value.trim();
    if(q.length<2){status.textContent=t('输入至少两个字符。','Enter at least two characters.');return;}
    const local=window.AtlasMap.searchPlaces(q);
    if(local.status==='invalid'||local.status==='outside'||local.places[0]?.custom){
      if(local.places.length){
        status.textContent=t('使用输入的坐标。','Use the entered coordinates.');
        const p=local.places[0];row(window.AtlasMap.coord(p.lat,p.lon),'',()=>select(p));
      }else status.textContent=t('请检查坐标及覆盖范围。','Check the coordinates and coverage.');
      return;
    }
    status.textContent=t('正在搜索…','Searching…');
    const controller=request=new AbortController();
    async function search(){
      try{
        const data=await call({q,session},controller.signal);
        if(controller.signal.aborted||!dialog.open)return;
        if(!data.suggestions.length){showLocal(q,t('Google 未找到匹配地点。','No Google matches.'));return;}
        status.textContent=t('请选择地点。','Select a place.');
        for(const item of data.suggestions)row(item.name,item.area,()=>choose(item,q));
      }catch{
        if(!controller.signal.aborted)showLocal(q,t('Google 地点服务暂时无法连接。','Google place search is unavailable.'));
      }
    }
    if(immediate)void search();else timer=setTimeout(search,400);
  }
  input.addEventListener('input',e=>{if(e.isComposing){cancel();list.replaceChildren();}else refresh();});
  input.addEventListener('compositionend',()=>refresh());
  input.addEventListener('keydown',e=>{
    if(e.isComposing||e.keyCode===229)return;
    if(e.key==='ArrowDown'){e.preventDefault();list.querySelector('button')?.focus();}
    if(e.key==='Enter'){e.preventDefault();if(list.firstElementChild)list.firstElementChild.focus();else refresh(true);}
  });
  list.addEventListener('keydown',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(e.key==='ArrowDown'){e.preventDefault();b.nextElementSibling?.focus();}
    if(e.key==='ArrowUp'){e.preventDefault();(b.previousElementSibling||input).focus();}
  });
  dialog.addEventListener('close',cancel);
  return q=>{
    cancel();resetSession();input.value=(q||'').slice(0,130);
    if(!dialog.open)dialog.showModal();input.focus();refresh(true);
  };
}
