const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:HEADERS});
async function body(req){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('Use a JSON request.');
 if(Number(req.headers.get('content-length')||0)>12000)throw new Error('Request is too large.');
 const text=await req.text();if(text.length>12000)throw new Error('Request is too large.');const input=JSON.parse(text);if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Use a JSON object.');return input;
}
export function createRadarHandler(serviceFactory){return async function(req,context={}){
 // Netlify Private project visibility is the site-load authentication layer for
 // both this dashboard and /api/radar*. Keep production and previews Private.
 // Do not add a public function-domain bypass or CORS. All writes also require
 // a same-origin browser request and a custom header to reject cross-site forms.
 const url=new URL(req.url),path=url.pathname.replace(/\/$/,'');
 if(req.method==='OPTIONS')return json({error:'Cross-origin requests are not enabled.'},405);
 if(!['GET','POST','DELETE'].includes(req.method))return json({error:'Method not allowed.'},405);
 if(req.method!=='GET'){
  let origin;try{origin=new URL(req.headers.get('origin')).origin;}catch{return json({error:'Open Radar from your private dashboard to make changes.'},403);}
  if(origin!==url.origin||req.headers.get('x-radar-client')!=='dashboard')return json({error:'This action requires your same-origin private dashboard.'},403);
 }
 try{
  const service=serviceFactory(context);
  if(req.method==='GET'&&path==='/api/radar')return json(await service.snapshot());
  if(req.method==='POST'&&path==='/api/radar/run'){const input=await body(req);return json(await service.run({kind:'manual',requestId:input.requestId}));}
  if(req.method==='POST'&&path==='/api/radar/evidence')return json(await service.addEvidence(await body(req)));
  if(req.method==='DELETE'&&path==='/api/radar/evidence'){const input=await body(req);return json(await service.removeEvidence(input.id));}
  if(req.method==='POST'&&path==='/api/radar/shortlist'){const input=await body(req);if(typeof input.selected!=='boolean')return json({error:'Choose save or undo.'},400);return json(await service.selectBrief(input.id,input.selected));}
  return json({error:'Radar route not found.'},404);
 }catch(error){
  const validation=/Enter |Use |Choose |Growth |evidence date|topic between|Describe |Invalid |Request is too large|no longer available|Refresh |was not found|JSON/.test(error.message||'');
  // Never return raw provider payloads, tokens, SDK errors or stack traces.
  if(validation)return json({error:error.message},400);
  console.error('Radar request failed:',error.name||'Error');
  return json({error:'Radar could not save or load its research. Check this project’s Functions logs and keep its data marked unavailable until the connection recovers.'},503);
 }
};}
