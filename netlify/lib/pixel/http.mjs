const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:JSON_HEADERS});
async function body(req){
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('Use a JSON request.');
  if(Number(req.headers.get('content-length')||0)>12000)throw new Error('Request is too large.');
  const text=await req.text();if(text.length>12000)throw new Error('Request is too large.');
  const input=JSON.parse(text);if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Use a JSON object.');return input;
}
function sameOrigin(req){
  try{return new URL(req.headers.get('origin')).origin===new URL(req.url).origin&&req.headers.get('x-pixel-client')==='dashboard';}catch{return false;}
}
export function createPixelHandler(serviceFactory){return async function(req,context={}){
  // Netlify Private protects both the dashboard and artwork routes. Writes also
  // require same-origin POSTs with this dashboard-only header. No CORS bypass.
  const url=new URL(req.url),path=url.pathname.replace(/\/$/,'');
  if(req.method==='OPTIONS')return json({error:'Cross-origin requests are not enabled.'},405);
  if(!['GET','POST'].includes(req.method))return json({error:'Method not allowed.'},405);
  if(req.method==='POST'&&!sameOrigin(req))return json({error:'Open Pixel from your private dashboard to make changes.'},403);
  try{
    const service=serviceFactory(context);
    if(req.method==='GET'&&path==='/api/pixel')return json(await service.snapshot());
    if(req.method==='POST'&&path==='/api/pixel/jobs')return json(await service.startJob(await body(req)),202);
    if(req.method==='POST'&&path==='/api/pixel/decision')return json(await service.decide(await body(req)));
    if(req.method==='GET'&&path.startsWith('/api/pixel/art/')){
      const value=await service.art(decodeURIComponent(path.slice('/api/pixel/art/'.length)));
      if(!value?.bytes)return json({error:'Artwork not found.'},404);
      return new Response(value.bytes,{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`inline; filename="pixel-${value.job.id}.png"`,'Vary':'Cookie'}});
    }
    return json({error:'Pixel route not found.'},404);
  }catch(error){
    const validation=/Choose |Invalid |already |needs a fresh|three variations|safety limit|not ready|JSON|too large/.test(error?.message||'');
    if(validation)return json({error:error.message},400);
    console.error('Pixel request failed:',error?.name||'Error');
    return json({error:'Pixel could not save or load its drafts. Check this project’s Functions logs; nothing was approved or published.'},503);
  }
};}

export function createPixelBackgroundHandler(serviceFactory){return async function(req,context={}){
  if(req.method!=='POST'||!sameOrigin(req))return;
  try{const service=serviceFactory(context);await service.runJob(await body(req));}
  catch(error){console.error('Pixel background request failed:',error?.name||'Error');}
};}
