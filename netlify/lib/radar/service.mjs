import {randomUUID} from 'node:crypto';
import {GOOGLE_FEED,PINTEREST_ENDPOINT,POLICY_VERSION,parseGoogleRSS,parsePinterest,validateEvidence,buildResearch,easternDay,nextSchedule,digest,plain} from './core.mjs';

const reversed=at=>String(9999999999999-Date.parse(at)).padStart(13,'0');
const orderedKey=(prefix,at,id)=>`${prefix}/${reversed(at)}-${id}.json`;
async function readMany(store,prefix,limit){const keys=await store.list(prefix,limit);return (await Promise.all(keys.map(key=>store.get(key)))).filter(Boolean);}
async function textBody(response,max=1_500_000){
 if(Number(response.headers.get('content-length')||0)>max)throw new Error('Source response is too large.');
 const reader=response.body?.getReader();if(!reader)throw new Error('Source response has no body.');const chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new Error('Source response is too large.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.length;}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export function createRadarService({store,fetcher=fetch,env=()=>undefined,clock=()=>new Date()}){
 const configured=()=>Boolean(env('PINTEREST_ACCESS_TOKEN'));
 async function sources(now){
  const at=now.toISOString();
  const google=(async()=>{try{const response=await fetcher(GOOGLE_FEED,{headers:{Accept:'application/rss+xml, application/xml, text/xml'},redirect:'error',signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error('Google RSS returned HTTP '+response.status+'.');const observations=parseGoogleRSS(await textBody(response),at);return {provider:'google',state:'connected',checkedAt:at,count:observations.length,message:'Official US Trending Now RSS. News-driven, not an Etsy demand forecast.',observations};}catch{return {provider:'google',state:'unavailable',checkedAt:at,count:0,message:'Google RSS could not be read. No current search claim was invented.',observations:[]};}})();
  const pinterest=(async()=>{if(!configured())return {provider:'pinterest',state:'not-connected',checkedAt:null,count:0,message:'Optional authorized Pinterest Trends access is not connected.',observations:[]};try{const response=await fetcher(PINTEREST_ENDPOINT,{headers:{Authorization:'Bearer '+env('PINTEREST_ACCESS_TOKEN'),Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error('Pinterest returned HTTP '+response.status+'.');const observations=parsePinterest(JSON.parse(await textBody(response)),at);return {provider:'pinterest',state:'connected',checkedAt:at,count:observations.length,message:'Official growing-keyword API. Search growth is not a sales forecast.',observations};}catch{return {provider:'pinterest',state:'unavailable',checkedAt:at,count:0,message:'Pinterest access was rejected, expired or temporarily unavailable. No token or provider response is exposed.',observations:[]};}})();
  return Promise.all([google,pinterest]);
 }
 async function load(){
  const [runs,imports,decisions,events]=await Promise.all([readMany(store,'runs/',14),readMany(store,'evidence/',100),readMany(store,'decisions/',Infinity),readMany(store,'events/',100)]);
  runs.sort((a,b)=>b.startedAt.localeCompare(a.startedAt));decisions.sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id));events.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
  return {runs,imports,decisions,events};
 }
 function currentImports(data){const removed=new Set();for(const d of data.decisions)if(d.kind==='remove-evidence')removed.add(d.evidenceId);return data.imports.filter(e=>!removed.has(e.id));}
 async function snapshot({fresh=false}={}){
  const now=clock(),enabled=configured();
  if(!fresh){const cache=await store.get('cache/view.json');if(cache&&cache.day===easternDay(now)&&+now-Date.parse(cache.builtAt)<60000&&cache.pinterestConfigured===enabled)return cache.value;}
  const data=await load(),latest=data.runs[0]||null,imports=currentImports(data);
  const statuses=[],observations=[];
  for(const provider of ['google','pinterest']){
   const last=latest?.sources.find(s=>s.provider===provider),successful=data.runs.map(run=>({run,source:run.sources.find(s=>s.provider===provider&&s.state==='connected')})).find(x=>x.source);
   const source=last||{provider,state:provider==='pinterest'&&!enabled?'not-connected':'ready',checkedAt:null,count:0,message:provider==='google'?'Ready to read the official Google Trends RSS feed.':'Authorized Pinterest access is needed; manual evidence is supported.'};
   if(provider==='pinterest'&&!enabled){statuses.push({...source,state:'not-connected',count:0,message:'Pinterest is not connected. Add an authorized token later, or enter dated evidence.'});continue;}
   if(successful)observations.push(...successful.source.observations);
   statuses.push({provider,state:source.state,checkedAt:source.checkedAt,count:source.count,message:source.message,lastSuccessAt:successful?.source.checkedAt||null});
  }
  const research=buildResearch(observations,imports,now),ids=new Set(research.briefs.map(b=>b.id));
  const suppressed=new Set(data.decisions.flatMap(d=>d.supersedes||[]));
  const latestSelections=new Map();for(const d of data.decisions.filter(d=>d.kind==='shortlist'&&!suppressed.has(d.id)))if(!latestSelections.has(d.briefId))latestSelections.set(d.briefId,d);
  const shortlist=[...latestSelections.values()].filter(d=>d.selected).map(d=>({...d.brief,selectedAt:d.at,stillEligible:ids.has(d.briefId)}));
  const safeStatuses=statuses.map(({observations,...s})=>s);
  const value={phase:2,scope:store.scope||'local-test',asOf:now.toISOString(),policyVersion:POLICY_VERSION,...research,sources:[...safeStatuses,{provider:'etsy',state:'manual',count:imports.filter(i=>i.provider==='etsy').length,message:'Dated owner research only. No scraping or competitor-private statistics.'},{provider:'calendar',state:'available',count:research.calendar.length,message:'Computed US seasonal dates and clearly labeled planning anchors.'}],lastRun:latest?{id:latest.id,kind:latest.kind,at:latest.startedAt,finishedAt:latest.finishedAt}:null,nextRun:nextSchedule(now),imports:imports.map(({context,assessment,...e})=>({...e,assessment:e.assessment})),shortlist,events:data.events.slice(-60),history:data.runs.slice(0,8).map(r=>({id:r.id,kind:r.kind,at:r.startedAt,finishedAt:r.finishedAt,eligible:r.eligible,held:r.held,sourceStates:r.sources.map(s=>({provider:s.provider,state:s.state,count:s.count}))})),capabilities:{automaticGoogleRSS:true,automaticPinterest:enabled,etsyManual:true,designGeneration:false,publishing:false},schedule:'Monday 8 AM ET + Wednesday 8 AM ET'};
  // Disposable read cache only. Research, runs, evidence and decisions above are
  // immutable objects. Last-write-wins here never changes the source records.
  await store.put('cache/view.json',{builtAt:now.toISOString(),day:easternDay(now),pinterestConfigured:enabled,value});return value;
 }
 async function event(e){await store.put(orderedKey('events',e.at,e.id),e,true);return e;}
 async function persistBriefs(briefs,at){
  const created=[];
  for(const brief of briefs){
   const key='observations/'+brief.id+'.json',write=await store.put(key,{at,brief},true),record=write.modified?{at,brief}:await store.get(key);
   const e={id:'radar-found-'+brief.id,type:'trend.found',robot:'radar',at:record.at,text:'Radar recorded “'+brief.name+'” · '+(brief.kind==='seasonal'?'seasonal timing':'dated research')+' · priority '+brief.score+'. Final designs still need approval.',data:{scope:'radar-research',briefId:brief.id,kind:brief.kind,source:brief.source}};
   const saved=await store.put(orderedKey('events',e.at,e.id),e,true);if(saved.modified)created.push(e);
  }
  return created;
 }
 async function run({kind='manual',requestId=randomUUID()}={}){
  const now=clock(),at=now.toISOString();
  const id=kind==='scheduled'?'scheduled-'+easternDay(now):plain(requestId,80);
  if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id))throw new Error('Invalid research request identifier.');
  const receipt=await store.get('requests/'+id+'.json');if(receipt)return snapshot({fresh:true});
  const results=await sources(now),existing=await load(),imports=currentImports(existing);
  // Keep a recent successful observation if a provider is temporarily unavailable.
  const observations=results.flatMap(s=>s.provider==='pinterest'&&!configured()?[]:s.state==='connected'?s.observations:(existing.runs.map(r=>r.sources.find(x=>x.provider===s.provider&&x.state==='connected')).find(Boolean)?.observations||[]));
  const research=buildResearch(observations,imports,now);
  const record={id,kind,startedAt:at,finishedAt:clock().toISOString(),sources:results,eligible:research.briefs.length,held:research.held.length,policyVersion:POLICY_VERSION};
  await store.put(orderedKey('runs',at,id),record,true);
  await persistBriefs(research.briefs,at);
  await event({id:'radar-run-'+id,type:'radar.completed',robot:'radar',at:record.finishedAt,text:'Radar research finished: '+research.briefs.filter(b=>b.kind==='rising').length+' eligible source-led briefs, '+research.briefs.filter(b=>b.kind==='seasonal').length+' seasonal opportunities, '+research.held.length+' topics held or blocked.',data:{scope:'radar-research',runId:id}});
  await store.put('requests/'+id+'.json',{runId:id,finishedAt:record.finishedAt},true);
  return snapshot({fresh:true});
 }
 async function addEvidence(input){
  const now=clock(),evidence=validateEvidence(input,now);
  if((await load()).decisions.some(d=>d.kind==='remove-evidence'&&d.evidenceId===evidence.id))throw new Error('Use an updated observation date or notes: this evidence was already withdrawn.');
  const key=orderedKey('evidence',evidence.at,evidence.id),result=await store.put(key,evidence,true);
  if(result.modified)await event({id:'evidence-'+evidence.id,type:'radar.evidence_saved',robot:'radar',at:now.toISOString(),text:'Owner saved dated '+evidence.provider+' evidence for “'+evidence.title+'”. '+(evidence.assessment.state==='candidate'?'Generic topic recognized; final design checks are still required.':'It remains held / blocked and will not become a design brief.'),data:{scope:'radar-research',evidenceId:evidence.id}});
  const fresh=await snapshot({fresh:true});await persistBriefs(fresh.briefs,now.toISOString());return snapshot({fresh:true});
 }
 async function removeEvidence(id){
  if(!/^[a-f0-9]{24}$/.test(id))throw new Error('Invalid evidence identifier.');
  const data=await load();if(!data.imports.some(e=>e.id===id))throw new Error('That evidence record was not found.');const now=clock(),record={id:randomUUID(),kind:'remove-evidence',evidenceId:id,at:now.toISOString()};await store.put(orderedKey('decisions',record.at,record.id),record,true);await event({id:'withdraw-'+record.id,type:'radar.evidence_removed',robot:'radar',at:record.at,text:'Owner withdrew an evidence item from current research. Its audit record is retained.',data:{scope:'radar-research',evidenceId:id}});return snapshot({fresh:true});
 }
 async function selectBrief(id,selected){
  const view=await snapshot({fresh:true}),brief=view.briefs.find(b=>b.id===id)||view.shortlist.find(b=>b.id===id);
  if(!brief)throw new Error('That brief is no longer available. Refresh Radar first.');
  if(selected&&!view.briefs.some(b=>b.id===id))throw new Error('Refresh this evidence before selecting the brief.');
  // Explicit causal links make Undo win even when two decisions share a timestamp.
  // Concurrent independent choices use the stable time / ID tie-break in load().
  const prior=(await load()).decisions.filter(d=>d.kind==='shortlist'&&d.briefId===id);
  const record={id:randomUUID(),kind:'shortlist',briefId:id,selected:Boolean(selected),brief,at:clock().toISOString(),supersedes:prior.map(d=>d.id)};await store.put(orderedKey('decisions',record.at,record.id),record,true);
  await event({id:'shortlist-'+record.id,type:selected?'trend.shortlisted':'trend.unselected',robot:'radar',at:record.at,text:selected?'Owner saved “'+brief.name+'” for Pixel. No artwork or product has been generated.':'Owner undid the Pixel selection for “'+brief.name+'”.',data:{scope:'radar-research',briefId:id}});return snapshot({fresh:true});
 }
 return {snapshot,run,addEvidence,removeEvidence,selectBrief};
}
