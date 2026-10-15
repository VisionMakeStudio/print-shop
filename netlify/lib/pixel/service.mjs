import {randomUUID} from 'node:crypto';
import {PIXEL_POLICY_VERSION,SKIP_REASONS,WEEKLY_GENERATION_LIMIT,buildPrompt,easternWeek,isPng,plain,validateDecision,validateJobInput} from './core.mjs';

const reversed=at=>String(9999999999999-Date.parse(at)).padStart(13,'0');
const orderedKey=(prefix,at,id)=>`${prefix}/${reversed(at)}-${id}.json`;
async function readMany(store,prefix,limit=100){const keys=await store.list(prefix,limit);return (await Promise.all(keys.map(key=>store.get(key)))).filter(Boolean);}

export function createPixelService({store,radarService,imageClient,env=()=>undefined,clock=()=>new Date()}){
  async function load(){
    const [jobs,decisions,events]=await Promise.all([readMany(store,'jobs/',80),readMany(store,'decisions/',Infinity),readMany(store,'events/',100)]);
    jobs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    decisions.sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id));
    events.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
    return {jobs,decisions,events};
  }
  async function saveEvent(record){await store.put(orderedKey('events',record.at,record.id),record,true);}
  async function snapshot(){
    const now=clock(),week=easternWeek(now),data=await load(),radar=await radarService.snapshot({fresh:true});
    const suppressed=new Set(data.decisions.flatMap(decision=>decision.supersedes||[]));
    const current=new Map();
    for(const decision of data.decisions.filter(item=>!suppressed.has(item.id)))if(!current.has(decision.draftId))current.set(decision.draftId,decision);
    const claims=await store.list(`budget/${week}/`,WEEKLY_GENERATION_LIMIT+2);
    const drafts=data.jobs.filter(job=>job.status==='ready').map(job=>{
      const decision=current.get(job.id);
      return {...job,state:decision?.action==='approve'?'approved':decision?.action==='skip'?'skipped':'pending',reason:decision?.reason||'',shops:decision?.shops||{Etsy:true,'TikTok Shop':false},decisionAt:decision?.at||null,artUrl:`/api/pixel/art/${job.id}`};
    });
    return {
      phase:3,scope:store.scope||'local-test',asOf:now.toISOString(),policyVersion:PIXEL_POLICY_VERSION,
      configured:Boolean(env('OPENAI_API_KEY')),model:plain(env('PIXEL_IMAGE_MODEL')||'gpt-image-2.5-flare',80),
      size:'1024x1536',quality:'low',drafts,jobs:data.jobs.filter(job=>job.status!=='ready').slice(0,20),
      shortlist:radar.shortlist||[],events:data.events.slice(-60),skipReasons:SKIP_REASONS,
      weekly:{starts:week,limit:WEEKLY_GENERATION_LIMIT,used:claims.length,remaining:Math.max(0,WEEKLY_GENERATION_LIMIT-claims.length)},
      boundaries:{publishing:false,products:false,badgeInspection:false,printReady:false}
    };
  }
  async function claimWeeklySlot(jobId,requestId,now){
    const week=easternWeek(now);
    for(let slot=1;slot<=WEEKLY_GENERATION_LIMIT;slot++){
      const result=await store.put(`budget/${week}/${String(slot).padStart(2,'0')}.json`,{jobId,requestId,claimedAt:now.toISOString()},true);
      if(result.modified)return {week,slot};
    }
    throw new Error('This week’s 10-draft safety limit has been reached. Pixel will reset next Monday.');
  }
  async function startJob(input){
    const {requestId,briefId}=validateJobInput(input),requestKey=`requests/${requestId}.json`,existing=await store.get(requestKey);
    if(existing?.jobId){const data=await load();return {job:data.jobs.find(item=>item.id===existing.jobId)||null,snapshot:await snapshot()};}
    if(existing)throw new Error('That design request is already being prepared. Refresh Pixel before trying again.');
    const claimed=await store.put(requestKey,{state:'starting',at:clock().toISOString()},true);
    if(!claimed.modified)throw new Error('That design request is already being prepared. Refresh Pixel before trying again.');
    const radar=await radarService.snapshot({fresh:true}),brief=radar.shortlist.find(item=>item.id===briefId&&item.stillEligible);
    if(!brief){await store.put(requestKey,{state:'rejected',at:clock().toISOString()});throw new Error('That Radar brief needs a fresh review before Pixel can use it.');}
    const data=await load(),sameBrief=data.jobs.filter(job=>job.briefId===briefId).length;
    if(sameBrief>=3){await store.put(requestKey,{state:'rejected',at:clock().toISOString()});throw new Error('Pixel already made three variations for this brief. Review those before making more.');}
    const now=clock(),jobId=randomUUID(),budget=await claimWeeklySlot(jobId,requestId,now);
    const job={id:jobId,requestId,briefId,brief,variant:sameBrief,status:'queued',createdAt:now.toISOString(),budget,model:plain(env('PIXEL_IMAGE_MODEL')||'gpt-image-2.5-flare',80),size:'1024x1536',quality:'low',outputFormat:'png',background:'transparent'};
    await store.put(orderedKey('jobs',job.createdAt,job.id),job,true);
    await store.put(requestKey,{state:'created',jobId,at:job.createdAt});
    await saveEvent({id:`pixel-queued-${job.id}`,type:'design.queued',robot:'pixel',at:job.createdAt,text:`Owner asked Pixel for one “${brief.name}” draft. One weekly generation slot is reserved; nothing will publish.`,data:{scope:'pixel-live',jobId:job.id,briefId}});
    return {job,snapshot:await snapshot()};
  }
  async function findJob(jobId){const data=await load();return data.jobs.find(job=>job.id===jobId)||null;}
  async function replaceJob(job){
    // Each job has one immutable ordered key. Updating that key changes only the
    // status of this long-running object; weekly budget and audit events remain immutable.
    await store.put(orderedKey('jobs',job.createdAt,job.id),job);
  }
  async function runJob(input){
    const jobId=plain(input?.jobId,80);
    if(!/^[a-f0-9-]{16,80}$/.test(jobId))return;
    const lock=await store.put(`locks/${jobId}.json`,{at:clock().toISOString()},true);
    if(!lock.modified)return;
    const job=await findJob(jobId);
    if(!job||job.status!=='queued')return;
    const startedAt=clock().toISOString();await replaceJob({...job,status:'running',startedAt});
    try{
      const client=imageClient(),prompt=buildPrompt(job.brief,job.variant);
      const result=await client.images.generate({model:job.model,prompt,n:1,size:job.size,quality:job.quality,background:'transparent',output_format:'png',moderation:'auto'});
      const encoded=result?.data?.[0]?.b64_json;
      if(!encoded)throw new Error('empty_image');
      const bytes=Buffer.from(encoded,'base64');
      if(bytes.length>35_000_000||!isPng(bytes))throw new Error('invalid_image');
      const artKey=`art/${job.id}.png`;
      await store.putBinary(artKey,bytes,{onlyIfNew:true,metadata:{contentType:'image/png',draftId:job.id,briefId:job.briefId}});
      const finishedAt=clock().toISOString();
      await replaceJob({...job,status:'ready',startedAt,finishedAt,artKey,bytes:bytes.length,prompt,providerCreatedAt:result.created||null});
      await saveEvent({id:`pixel-ready-${job.id}`,type:'design.made',robot:'pixel',at:finishedAt,text:`Pixel finished one original “${job.brief.name}” artwork draft and carried it to the review desk. Badge inspection and owner approval are still required.`,data:{scope:'pixel-live',draftId:job.id,briefId:job.briefId}});
    }catch(error){
      const finishedAt=clock().toISOString(),code=error?.status===401?'key-rejected':error?.status===429?'rate-limited':String(error?.code||'generation-failed').slice(0,40);
      await replaceJob({...job,status:'failed',startedAt,finishedAt,errorCode:code});
      await saveEvent({id:`pixel-failed-${job.id}`,type:'design.failed',robot:'pixel',at:finishedAt,text:'Pixel could not finish this draft. Nothing was approved or published. Check the Functions log before trying a new generation.',data:{scope:'pixel-live',jobId:job.id,briefId:job.briefId,code}});
      console.error('Pixel generation failed:',error?.name||'Error',error?.status||'',error?.code||'');
    }
  }
  async function decide(input){
    const choice=validateDecision(input),job=await findJob(choice.draftId);
    if(!job||job.status!=='ready')throw new Error('That Pixel draft is not ready for review.');
    const data=await load(),prior=data.decisions.filter(item=>item.draftId===choice.draftId),now=clock();
    const record={id:randomUUID(),kind:'pixel-decision',draftId:choice.draftId,action:choice.action,reason:choice.reason,shops:choice.shops,at:now.toISOString(),supersedes:prior.map(item=>item.id)};
    await store.put(orderedKey('decisions',record.at,record.id),record,true);
    const selected=choice.action==='approve';
    await saveEvent({id:`pixel-decision-${record.id}`,type:selected?'design.selected':choice.action==='skip'?'design.skipped':'design.restored',robot:'pixel',at:record.at,text:selected?`Owner approved Pixel’s “${job.brief.name}” draft for Badge inspection. No product or listing was created.`:choice.action==='skip'?`Owner skipped Pixel’s “${job.brief.name}” draft${choice.reason?' · '+choice.reason:''}. It will not move forward.`:`Owner undid the Pixel decision for “${job.brief.name}”. The draft is back in review.`,data:{scope:'pixel-live',draftId:job.id,briefId:job.briefId,reason:choice.reason}});
    return snapshot();
  }
  async function art(draftId){
    if(!/^[a-f0-9-]{16,80}$/.test(draftId))return null;
    const job=await findJob(draftId);if(!job||job.status!=='ready'||!job.artKey)return null;
    return {bytes:await store.getBinary(job.artKey),job};
  }
  return {snapshot,startJob,runJob,decide,art};
}
