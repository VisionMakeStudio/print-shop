import {randomUUID} from 'node:crypto';
import {BADGE_MODEL_DEFAULT,BADGE_POLICY_VERSION,BADGE_SCHEMA,BADGE_SKIP_REASONS,decideInspection,inspectionPrompt,normalizeModelReview,plain,pngInfo,safeId,validateDecision,validateStart} from './core.mjs';

const reversed=at=>String(9999999999999-Date.parse(at)).padStart(13,'0');
const orderedKey=(prefix,at,id)=>`${prefix}/${reversed(at)}-${id}.json`;
async function readMany(store,prefix,limit=100){const keys=await store.list(prefix,limit);return (await Promise.all(keys.map(key=>store.get(key)))).filter(Boolean);}

export function createBadgeService({store,pixelService,reviewClient,mailer,env=()=>undefined,clock=()=>new Date()}){
  async function load(){
    const [inspections,decisions,emails,events]=await Promise.all([readMany(store,'inspections/',100),readMany(store,'decisions/',Infinity),readMany(store,'emails/',100),readMany(store,'events/',120)]);
    inspections.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));decisions.sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id));emails.sort((a,b)=>b.at.localeCompare(a.at));events.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
    return {inspections,decisions,emails,events};
  }
  async function saveEvent(record){await store.put(orderedKey('events',record.at,record.id),record,true);}
  async function replaceInspection(record){await store.put(orderedKey('inspections',record.createdAt,record.id),record);}
  async function findInspection(id){return (await load()).inspections.find(item=>item.id===id)||null;}
  async function selectedDraft(draftId){const pixel=await pixelService.snapshot(),draft=pixel.drafts.find(item=>item.id===draftId&&item.state==='approved');return {pixel,draft};}

  async function snapshot(){
    const now=clock(),data=await load(),pixel=await pixelService.snapshot(),suppressed=new Set(data.decisions.flatMap(item=>item.supersedes||[])),current=new Map();
    for(const decision of data.decisions.filter(item=>!suppressed.has(item.id)))if(!current.has(decision.inspectionId))current.set(decision.inspectionId,decision);
    const latestEmail=new Map();for(const item of data.emails)if(!latestEmail.has(item.inspectionId))latestEmail.set(item.inspectionId,item);
    const cards=pixel.drafts.filter(draft=>draft.state==='approved').map(draft=>{
      const inspection=data.inspections.find(item=>item.draftId===draft.id&&item.pixelDecisionAt===draft.decisionAt)||null,decision=inspection?current.get(inspection.id):null;
      return {draft,inspection,finalState:decision?.action==='approve'?'approved':decision?.action==='skip'?'skipped':'pending',reason:decision?.reason||'',shops:decision?.shops||draft.shops,email:inspection?latestEmail.get(inspection.id)||null:null};
    });
    return {phase:4,scope:store.scope||'local-test',asOf:now.toISOString(),policyVersion:BADGE_POLICY_VERSION,model:plain(env('BADGE_MODEL')||BADGE_MODEL_DEFAULT,80),configured:{ai:Boolean(env('OPENAI_API_KEY')),email:Boolean(mailer?.configured?.())},cards,events:data.events.slice(-80),skipReasons:BADGE_SKIP_REASONS,boundaries:{publishing:false,products:false,legalClearance:false,printReady:false,emailAction:false}};
  }

  async function startInspection(input){
    const {draftId,requestId}=validateStart(input),requestKey=`requests/${requestId}.json`,existing=await store.get(requestKey);
    if(existing?.inspectionId)return {inspection:await findInspection(existing.inspectionId),snapshot:await snapshot()};
    const claimed=await store.put(requestKey,{state:'starting',at:clock().toISOString()},true);if(!claimed.modified)throw new Error('That inspection request is already being prepared. Refresh Badge before trying again.');
    const {draft}=await selectedDraft(draftId);if(!draft){await store.put(requestKey,{state:'rejected',at:clock().toISOString()});throw new Error('Approve this Pixel draft for Badge before inspection.');}
    const data=await load(),prior=data.inspections.find(item=>item.draftId===draft.id&&item.pixelDecisionAt===draft.decisionAt);
    if(prior&&!['failed','cancelled'].includes(prior.status)){await store.put(requestKey,{state:'existing',inspectionId:prior.id,at:clock().toISOString()});return {inspection:prior,snapshot:await snapshot()};}
    const now=clock(),inspection={id:randomUUID(),requestId,draftId:draft.id,pixelDecisionAt:draft.decisionAt,status:'queued',createdAt:now.toISOString(),model:plain(env('BADGE_MODEL')||BADGE_MODEL_DEFAULT,80),policyVersion:BADGE_POLICY_VERSION};
    await store.put(orderedKey('inspections',inspection.createdAt,inspection.id),inspection,true);await store.put(requestKey,{state:'created',inspectionId:inspection.id,at:inspection.createdAt});
    await saveEvent({id:`badge-queued-${inspection.id}`,type:'inspection.queued',robot:'badge',at:inspection.createdAt,text:`Badge received Pixel’s “${draft.brief.name}” draft for a conservative visual inspection. No product or listing was created.`,data:{scope:'badge-live',inspectionId:inspection.id,draftId:draft.id}});
    return {inspection,snapshot:await snapshot()};
  }

  async function deliverEmail(inspection,draft,artBytes){
    let record;
    try{const result=await mailer.send({inspection,draft,artBytes});record={id:randomUUID(),inspectionId:inspection.id,status:result.status,providerId:result.id||'',message:result.message||'',at:clock().toISOString()};}
    catch(error){record={id:randomUUID(),inspectionId:inspection.id,status:'failed',providerId:'',message:'Approval email could not be sent. Check the Badge function log, then retry from the dashboard.',code:plain(error?.code||error?.status||'email-failed',60),at:clock().toISOString()};console.error('Badge email failed:',error?.name||'Error',error?.status||'',error?.code||'');}
    await store.put(orderedKey('emails',record.at,record.id),record,true);
    await saveEvent({id:`badge-email-${record.id}`,type:record.status==='sent'?'email.sent':record.status==='failed'?'email.failed':'email.not_configured',robot:'badge',at:record.at,text:record.status==='sent'?`Badge sent the private approval email for “${draft.brief.name}”. The email link opens review; it cannot approve or publish.`:record.message,data:{scope:'badge-live',inspectionId:inspection.id,status:record.status}});
    return record;
  }

  async function runInspection(input){
    const inspectionId=safeId(input?.inspectionId),lock=await store.put(`locks/${inspectionId}.json`,{at:clock().toISOString()},true);if(!lock.modified)return;
    const inspection=await findInspection(inspectionId);if(!inspection||inspection.status!=='queued')return;
    const {draft}=await selectedDraft(inspection.draftId);if(!draft){await replaceInspection({...inspection,status:'cancelled',finishedAt:clock().toISOString(),errorCode:'pixel-selection-undone'});return;}
    const startedAt=clock().toISOString();await replaceInspection({...inspection,status:'running',startedAt});
    try{
      const art=await pixelService.art(draft.id);if(!art?.bytes)throw new Error('artwork_unavailable');
      const image=pngInfo(art.bytes),data=await load(),exactDuplicate=data.inspections.some(item=>item.id!==inspection.id&&item.fingerprint&&item.fingerprint===image.fingerprint);
      const response=await reviewClient().responses.create({model:inspection.model,store:false,reasoning:{effort:'low'},input:[{role:'user',content:[{type:'input_text',text:inspectionPrompt(draft)},{type:'input_image',image_url:`data:image/png;base64,${Buffer.from(art.bytes).toString('base64')}`,detail:'high'}]}],text:{format:{type:'json_schema',name:'badge_artwork_inspection',strict:true,schema:BADGE_SCHEMA},verbosity:'low'},max_output_tokens:1400,safety_identifier:`badge-${draft.id}`});
      const modelReview=normalizeModelReview(JSON.parse(response.output_text||'{}')),outcome=decideInspection({modelReview,image,exactDuplicate}),finishedAt=clock().toISOString();
      const complete={...inspection,status:outcome.status,startedAt,finishedAt,image:{png:image.png,width:image.width,height:image.height,bytes:image.bytes},fingerprint:image.fingerprint,exactDuplicate,modelReview,...outcome,disclosures:{etsyAIUse:'Created with AI-assisted image generation and reviewed by the shop owner before publication.',productionPartner:'Printed and shipped to order by Printify, the disclosed production partner.'},legalClearance:false,printReady:false};
      await replaceInspection(complete);
      await saveEvent({id:`badge-finished-${inspection.id}`,type:complete.status==='pass'?'inspection.passed':complete.status==='hold'?'inspection.held':'design.needs_review',robot:'badge',at:finishedAt,text:complete.status==='pass'?`Badge found no obvious protected reference in “${draft.brief.name}”. Final owner approval is still required.`:complete.status==='hold'?`Badge held “${draft.brief.name}” for a protected-topic or print concern. It cannot be approved.`:`Badge needs your closer review of “${draft.brief.name}”. It remains blocked from approval.`,data:{scope:'badge-live',inspectionId:inspection.id,draftId:draft.id,status:complete.status}});
      await deliverEmail(complete,draft,art.bytes);
    }catch(error){
      const finishedAt=clock().toISOString(),code=error?.status===401?'key-rejected':error?.status===429?'rate-limited':plain(error?.code||error?.message||'inspection-failed',60);
      await replaceInspection({...inspection,status:'failed',startedAt,finishedAt,errorCode:code});
      await saveEvent({id:`badge-failed-${inspection.id}`,type:'inspection.failed',robot:'badge',at:finishedAt,text:'Badge could not finish this inspection. The design remains held and nothing was published.',data:{scope:'badge-live',inspectionId:inspection.id,draftId:draft.id,code}});
      console.error('Badge inspection failed:',error?.name||'Error',error?.status||'',error?.code||'');
    }
  }

  async function decide(input){
    const choice=validateDecision(input),inspection=await findInspection(choice.inspectionId);if(!inspection||!['pass','hold','needs_review'].includes(inspection.status))throw new Error('That Badge inspection is not ready for a decision.');
    if(choice.action==='approve'&&inspection.status!=='pass')throw new Error('Badge has this design held. Resolve or skip it before approval.');
    if(choice.action==='approve'&&inspection.modelReview?.edgeQuality!=='pass')throw new Error('Edge cleanup must pass before final approval. Generate and inspect a new clean-edge draft.');
    const {draft}=await selectedDraft(inspection.draftId);if(!draft)throw new Error('The Pixel selection was undone. Send the draft to Badge again before approval.');
    const data=await load(),prior=data.decisions.filter(item=>item.inspectionId===inspection.id),now=clock(),record={id:randomUUID(),kind:'badge-decision',inspectionId:inspection.id,draftId:draft.id,action:choice.action,reason:choice.reason,shops:choice.shops,at:now.toISOString(),supersedes:prior.map(item=>item.id)};
    await store.put(orderedKey('decisions',record.at,record.id),record,true);
    await saveEvent({id:`badge-decision-${record.id}`,type:choice.action==='approve'?'design.approved':choice.action==='skip'?'design.skipped':'design.restored',robot:'badge',at:record.at,text:choice.action==='approve'?`Owner gave final design approval to “${draft.brief.name}” for ${Object.keys(choice.shops).filter(key=>choice.shops[key]).join(' + ')}. Clerk is not connected, so no product or listing was created.`:choice.action==='skip'?`Owner skipped “${draft.brief.name}” after Badge inspection${choice.reason?' · '+choice.reason:''}. It will not move forward.`:`Owner undid the final Badge decision on “${draft.brief.name}”. It is back at the approval desk.`,data:{scope:'badge-live',inspectionId:inspection.id,draftId:draft.id,reason:choice.reason}});
    return snapshot();
  }

  async function resend(input){
    const inspection=await findInspection(safeId(input?.inspectionId));if(!inspection||!['pass','hold','needs_review'].includes(inspection.status))throw new Error('That Badge inspection is not ready for email.');
    const data=await load(),sent=data.emails.find(item=>item.inspectionId===inspection.id&&item.status==='sent');if(sent)return snapshot();
    const {draft}=await selectedDraft(inspection.draftId),art=await pixelService.art(inspection.draftId);if(!draft||!art?.bytes)throw new Error('The approved draft is unavailable for email.');
    await deliverEmail(inspection,draft,art.bytes);return snapshot();
  }
  return {snapshot,startInspection,runInspection,decide,resend};
}
