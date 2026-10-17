import test from 'node:test';
import assert from 'node:assert/strict';
import {listingPrompt,normalizeCopy,validateCopy} from '../netlify/lib/tagz/core.mjs';
import {createTagzService} from '../netlify/lib/tagz/service.mjs';
import {createTagzHandler} from '../netlify/lib/tagz/http.mjs';

const copy=()=>({
  title:'Thanksgiving Turkey Shirt, Autumn Harvest Tee and Cozy Fall Gift',
  description:'A warm Thanksgiving turkey illustration framed by pumpkins, corn and autumn leaves. Choose your preferred product, color and size using the current listing options. This item is made to order and printed by Printify, our disclosed production partner. The artwork was created with AI assistance and reviewed by the shop owner. Follow the care instructions shown with the selected garment and verify sizing before ordering.',
  tags:['thanksgiving shirt','turkey shirt','fall harvest tee','autumn shirt','thankful gift','family dinner tee','pumpkin shirt','fall graphic tee','hostess gift','november shirt','holiday gathering','cozy fall top','thanksgiving gift'],
  materials:['cotton blend','water based ink'],audience:'Adults who enjoy autumn gatherings',occasion:'Thanksgiving and fall hosting',notes:['Verify garment fiber details in Printify before publishing.']
});

test('Tagz cleans the disliked wording and enforces Etsy tag limits',()=>{
  const prompt=listingPrompt({designName:'Thanksgiving original collection',brief:{topic:'Thanksgiving'},products:[{label:'T-shirt'}]});
  assert.doesNotMatch(prompt,/DESIGN NAME:.*original/i);
  const normalized=normalizeCopy({...copy(),title:'Thanksgiving Original Collection Shirt'});
  assert.doesNotMatch(normalized.title,/original/i);
  assert.equal(validateCopy(normalized).tags.length,13);
  assert.throws(()=>validateCopy({...copy(),tags:copy().tags.slice(0,12)}),/exactly 13/);
});

test('Tagz queues copy, saves owner edits and exposes no publishing boundary',async()=>{
  const records=new Map(),store={scope:'test',get:async key=>records.get(key)||null,put:async(key,value,onlyIfNew=false)=>{if(onlyIfNew&&records.has(key))return {modified:false};records.set(key,structuredClone(value));return {modified:true};},list:async(prefix,limit=100)=>[...records.keys()].filter(key=>key.startsWith(prefix)).sort().slice(0,limit)};
  const clerkJobId='11111111-1111-4111-8111-111111111111',draftId='22222222-2222-4222-8222-222222222222',planId='33333333-3333-4333-8333-333333333333';
  const clerkService={snapshot:async()=>({plans:[{id:planId,draftId,designName:'Thanksgiving collection',products:[{label:'T-shirt'}]}],jobs:[{id:clerkJobId,planId,draftId,status:'ready',products:[{id:'printify-1',label:'T-shirt',title:'Draft Thanksgiving T-shirt'}]}]})};
  const client={responses:{create:async()=>({output_text:JSON.stringify(copy())})}},service=createTagzService({store,clerkService,copyClient:()=>client,env:key=>key==='OPENAI_API_KEY'?'set':undefined,clock:()=>new Date('2026-10-17T14:00:00.000Z')});
  const started=await service.start({clerkJobId,requestId:'44444444-4444-4444-8444-444444444444'});assert.equal(started.job.status,'queued');
  await service.run({jobId:started.job.id});let view=await service.snapshot();assert.equal(view.cards[0].job.status,'ready');assert.equal(view.cards[0].job.copy.tags.length,13);
  const edited={...copy(),title:'Thanksgiving Turkey Shirt and Warm Autumn Gathering Gift'};
  view=await service.decide({jobId:started.job.id,action:'approve',copy:edited});assert.equal(view.cards[0].state,'approved');assert.equal(view.cards[0].approvedCopy.title,edited.title);assert.equal(view.boundaries.publishing,false);assert.equal(view.boundaries.etsyWrite,false);
});

test('Tagz HTTP surface has no publishing route',async()=>{
  const handler=createTagzHandler(()=>({snapshot:async()=>({ok:true}),start:async()=>({}),decide:async()=>({})}));
  const request=new Request('https://shop.test/api/tagz/publish',{method:'POST',headers:{Origin:'https://shop.test','Content-Type':'application/json','X-Tagz-Client':'dashboard'},body:'{}'});
  const response=await handler(request,{});assert.equal(response.status,404);
});
