import {randomUUID} from 'node:crypto';
import {TAGZ_MODEL_DEFAULT,TAGZ_POLICY_VERSION,TAGZ_SCHEMA,TAGZ_SKIP_REASONS,listingPrompt,plain,safeId,validateCopy,validateDecision,validateStart} from './core.mjs';

const reversed=at=>String(9999999999999-Date.parse(at)).padStart(13,'0');
const orderedKey=(prefix,at,id)=>`${prefix}/${reversed(at)}-${id}.json`;
async function readMany(store,prefix,limit=100){const keys=await store.list(prefix,limit);return (await Promise.all(keys.map(key=>store.get(key)))).filter(Boolean);}

export function createTagzService({store,clerkService,copyClient,env=()=>undefined,clock=()=>new Date()}){
  async function load(){
    const [jobs,decisions,events]=await Promise.all([readMany(store,'jobs/',100),readMany(store,'decisions/',Infinity),readMany(store,'events/',120)]);
    jobs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));decisions.sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id));events.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
    return {jobs,decisions,events};
  }
  async function saveEvent(record){await store.put(orderedKey('events',record.at,record.id),record,true);}
  async function replaceJob(record){await store.put(orderedKey('jobs',record.createdAt,record.id),record);}
  async function findJob(id){return (await load()).jobs.find(item=>item.id===id)||null;}
  async function readySets(){
    const clerk=await clerkService.snapshot(),plans=new Map((clerk.plans||[]).map(plan=>[plan.id,plan]));
    return (clerk.jobs||[]).filter(job=>job.status==='ready'&&job.products?.length).map(job=>{const plan=plans.get(job.planId);return plan?{clerkJobId:job.id,draftId:job.draftId,designName:plan.designName,products:job.products,plan}:null;}).filter(Boolean);
  }
  async function snapshot(){
    const now=clock(),data=await load(),sets=await readySets(),suppressed=new Set(data.decisions.flatMap(item=>item.supersedes||[])),current=new Map();
    for(const decision of data.decisions.filter(item=>!suppressed.has(item.id)))if(!current.has(decision.jobId))current.set(decision.jobId,decision);
    const cards=sets.map(set=>{const job=data.jobs.find(item=>item.clerkJobId===set.clerkJobId)||null,decision=job?current.get(job.id):null;return {...set,job,state:decision?.action==='approve'?'approved':decision?.action==='skip'?'skipped':'pending',reason:decision?.reason||'',approvedCopy:decision?.copy||null};});
    return {phase:6,scope:store.scope||'local-test',asOf:now.toISOString(),policyVersion:TAGZ_POLICY_VERSION,model:plain(env('TAGZ_MODEL')||TAGZ_MODEL_DEFAULT,80),configured:Boolean(env('OPENAI_API_KEY')),cards,events:data.events.slice(-80),skipReasons:TAGZ_SKIP_REASONS,boundaries:{publishing:false,etsyWrite:false,printifyWrite:false,searchVolume:false,ownerApproval:true}};
  }
  async function start(input){
    const {clerkJobId,requestId}=validateStart(input),requestKey=`requests/${requestId}.json`,existing=await store.get(requestKey);
    if(existing?.jobId)return {job:await findJob(existing.jobId),snapshot:await snapshot()};
    const claimed=await store.put(requestKey,{state:'starting',at:clock().toISOString()},true);if(!claimed.modified)throw new Error('That Tagz request is already being prepared. Refresh the page.');
    const set=(await readySets()).find(item=>item.clerkJobId===clerkJobId);if(!set)throw new Error('Clerk must finish the private Printify drafts before Tagz writes the listing copy.');
    const data=await load(),prior=data.jobs.find(item=>item.clerkJobId===clerkJobId&&!['failed','cancelled'].includes(item.status));
    if(prior){await store.put(requestKey,{state:'existing',jobId:prior.id,at:clock().toISOString()});return {job:prior,snapshot:await snapshot()};}
    const createdAt=clock().toISOString(),job={id:randomUUID(),requestId,clerkJobId,draftId:set.draftId,designName:set.designName,products:set.products.map(({id,label,title})=>({id,label,title})),brief:{topic:set.plan.designName,direction:'Use only the supplied visual subject and truthful product details.',season:''},status:'queued',createdAt,model:plain(env('TAGZ_MODEL')||TAGZ_MODEL_DEFAULT,80),policyVersion:TAGZ_POLICY_VERSION};
    await store.put(orderedKey('jobs',createdAt,job.id),job,true);await store.put(requestKey,{state:'created',jobId:job.id,at:createdAt});
    await saveEvent({id:`tagz-queued-${job.id}`,type:'tags.queued',robot:'tagz',at:createdAt,text:`Tagz started private Etsy copy for “${set.designName}”. Nothing will publish.`,data:{scope:'tagz-live',jobId:job.id,clerkJobId}});
    return {job,snapshot:await snapshot()};
  }
  async function run(input){
    const jobId=safeId(input?.jobId),lock=await store.put(`locks/${jobId}.json`,{at:clock().toISOString()},true);if(!lock.modified)return;const job=await findJob(jobId);if(!job||job.status!=='queued')return;
    const startedAt=clock().toISOString();await replaceJob({...job,status:'running',startedAt});
    try{
      const response=await copyClient().responses.create({model:job.model,store:false,reasoning:{effort:'low'},input:[{role:'user',content:[{type:'input_text',text:listingPrompt(job)}]}],text:{format:{type:'json_schema',name:'tagz_listing_copy',strict:true,schema:TAGZ_SCHEMA},verbosity:'low'},max_output_tokens:1800,safety_identifier:`tagz-${job.draftId}`});
      const copy=validateCopy(JSON.parse(response.output_text||'{}'));const finishedAt=clock().toISOString(),complete={...job,status:'ready',startedAt,finishedAt,copy};await replaceJob(complete);
      await saveEvent({id:`tagz-ready-${job.id}`,type:'tags.drafted',robot:'tagz',at:finishedAt,text:`Tagz finished private Etsy title, description and tags for “${job.designName}”. Your approval is required; nothing was published.`,data:{scope:'tagz-live',jobId:job.id,draftId:job.draftId}});
    }catch(error){const finishedAt=clock().toISOString(),code=error?.status===401?'key-rejected':error?.status===429?'rate-limited':plain(error?.code||error?.message||'copy-failed',60);await replaceJob({...job,status:'failed',startedAt,finishedAt,errorCode:code});await saveEvent({id:`tagz-failed-${job.id}`,type:'tags.failed',robot:'tagz',at:finishedAt,text:'Tagz could not finish the listing copy. Nothing was approved or published.',data:{scope:'tagz-live',jobId:job.id,code}});console.error('Tagz copy generation failed:',error?.name||'Error',error?.status||'',error?.code||'');}
  }
  async function decide(input){
    const choice=validateDecision(input),job=await findJob(choice.jobId);if(!job||job.status!=='ready')throw new Error('That Tagz draft is not ready for a decision.');const data=await load(),prior=data.decisions.filter(item=>item.jobId===job.id),at=clock().toISOString(),record={id:randomUUID(),jobId:job.id,clerkJobId:job.clerkJobId,draftId:job.draftId,action:choice.action,reason:choice.reason,copy:choice.copy,at,supersedes:prior.map(item=>item.id)};
    await store.put(orderedKey('decisions',at,record.id),record,true);await saveEvent({id:`tagz-decision-${record.id}`,type:choice.action==='approve'?'tags.approved':choice.action==='skip'?'tags.skipped':'tags.restored',robot:'tagz',at,text:choice.action==='approve'?`Owner approved the private Etsy copy for “${job.designName}”. Publishing remains disabled.`:choice.action==='skip'?`Owner skipped the Tagz copy for “${job.designName}”${choice.reason?' · '+choice.reason:''}. Nothing will publish.`:`Owner undid the Tagz decision for “${job.designName}”. The copy is back in review.`,data:{scope:'tagz-live',jobId:job.id,draftId:job.draftId,reason:choice.reason}});return snapshot();
  }
  return {snapshot,start,run,decide};
}
