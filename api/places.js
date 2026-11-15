// Keep the Places key on the server and limit the public surface to Malaysian place lookups.
const root='https://places.googleapis.com/v1/places';
const uuid=/^[a-z0-9_-]{16,36}$/i;
const placeId=/^[a-z0-9_-]{6,255}$/i;
const buckets=new Map();
function admit(client){
  const now=Date.now(),entry=buckets.get(client);
  if(entry?.until>now){entry.hits++;return entry.hits<=45;}
  if(buckets.size>=2000)for(const [id,b] of buckets){if(b.until<=now)buckets.delete(id);}
  if(buckets.size>=2000)return false;
  buckets.set(client,{until:now+60000,hits:1});return true;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).end();}
  if(req.headers['sec-fetch-site']==='cross-site')return res.status(403).end();
  if(!req.headers['content-type']?.startsWith('application/json'))return res.status(415).end();
  const body=req.body??{},id=body.id,query=typeof body.q==='string'?body.q.trim():'';
  const lang=body.lang==='en'?'en':'zh-CN',token=body.session;
  if(token!==undefined&&(typeof token!=='string'||!uuid.test(token)))return res.status(400).end();
  if(id!==undefined?(typeof id!=='string'||!placeId.test(id)):(query.length<2||query.length>130||!token))return res.status(400).end();
  const key=process.env.GOOGLE_PLACES_API_KEY?.trim();
  if(!key)return res.status(503).json({error:'unavailable'});
  if(!admit(req.headers['x-vercel-forwarded-for']?.split(',')[0]||req.socket?.remoteAddress||'unknown'))return res.status(429).json({error:'busy'});
  try{
    const headers={'X-Goog-Api-Key':key};
    let response;
    if(id){
      const params=new URLSearchParams({languageCode:lang});
      if(token)params.set('sessionToken',token);
      headers['X-Goog-FieldMask']='location,formattedAddress,addressComponents,attributions';
      response=await fetch(root+'/'+encodeURIComponent(id)+'?'+params,{headers,signal:AbortSignal.timeout(6500)});
    }else{
      headers['Content-Type']='application/json';
      headers['X-Goog-FieldMask']='suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat';
      response=await fetch(root+':autocomplete',{method:'POST',headers,body:JSON.stringify({
        input:query,languageCode:lang,includedRegionCodes:['my'],regionCode:'MY',sessionToken:token
      }),signal:AbortSignal.timeout(6500)});
    }
    if(!response.ok){
      console.warn('Places upstream',id?'details':'autocomplete',response.status);
      return res.status(response.status===429?429:503).json({error:'unavailable'});
    }
    const data=await response.json();
    if(!id){
      const suggestions=(data.suggestions??[]).map(s=>s.placePrediction).filter(p=>p?.placeId&&p.structuredFormat?.mainText?.text)
        .map(p=>({id:p.placeId,name:p.structuredFormat.mainText.text,area:p.structuredFormat.secondaryText?.text??''}));
      return res.json({suggestions});
    }
    const country=data.addressComponents?.find(c=>c.types.includes('country'))?.shortText;
    if(country!=='MY'||!Number.isFinite(data.location?.latitude)||!Number.isFinite(data.location?.longitude))return res.status(422).json({error:'outside'});
    return res.json({lat:data.location.latitude,lon:data.location.longitude,address:data.formattedAddress,credits:(data.attributions??[]).map(a=>({name:a.provider,uri:a.providerUri}))});
  }catch{
    return res.status(503).json({error:'unavailable'});
  }
}
