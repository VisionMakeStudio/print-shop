import test from 'node:test';
import assert from 'node:assert/strict';
import {pinPrompt,validatePlan as validatePins} from '../netlify/lib/pinny/core.mjs';
import {createPinnyService} from '../netlify/lib/pinny/service.mjs';
import {createPinnyHandler} from '../netlify/lib/pinny/http.mjs';
import {reelPrompt,validatePlan as validateReel} from '../netlify/lib/reel/core.mjs';
import {createReelService} from '../netlify/lib/reel/service.mjs';
import {createReelHandler} from '../netlify/lib/reel/http.mjs';

const tagzJobId='11111111-1111-4111-8111-111111111111',draftId='22222222-2222-4222-8222-222222222222';
const copy={title:'Thanksgiving Turkey Shirt and Warm Autumn Gathering Gift',description:'A warm turkey illustration framed by pumpkins, corn and autumn leaves for seasonal gatherings. Review the current product, size, color, care and shipping details before ordering.',tags:['turkey shirt','autumn gathering'],materials:['cotton blend'],audience:'Adults',occasion:'Thanksgiving',notes:[]};
const source={tagzJobId,draftId,designName:'Thanksgiving collection',artUrl:'https://assets.test/art.png',products:[{label:'T-shirt'},{label:'Hoodie'}],approvedCopy:copy,job:{id:tagzJobId}};
const tagzService={snapshot:async()=>({cards:[{...source,state:'approved'}]})};
function memoryStore(){const records=new Map();return {scope:'test',get:async key=>records.get(key)||null,put:async(key,value,onlyIfNew=false)=>{if(onlyIfNew&&records.has(key))return {modified:false};records.set(key,structuredClone(value));return {modified:true};},list:async(prefix,limit=100)=>[...records.keys()].filter(key=>key.startsWith(prefix)).sort().slice(0,limit)};}
const pins=()=>({pins:[
  {headline:'Gather with gratitude',title:'Warm Thanksgiving Turkey Shirt for Family Gatherings',description:'A warm seasonal shirt idea featuring a turkey, pumpkins, corn and autumn leaves for family meals and fall celebrations.',altText:'Autumn turkey artwork with pumpkins, corn and leaves shown on a seasonal shirt.',board:'Thanksgiving Style'},
  {headline:'Cozy fall gathering',title:'Autumn Turkey Graphic Tee and Hoodie Gift Idea',description:'See the approved autumn turkey artwork across the available shirt and hoodie choices for a cozy seasonal gift.',altText:'Detailed turkey illustration surrounded by orange pumpkins, corn and autumn leaves.',board:'Cozy Fall Outfits'},
  {headline:'Turkey day details',title:'Thanksgiving Outfit Detail with Turkey and Pumpkins',description:'Take a closer look at the warm brown and orange details in this turkey, pumpkin, corn and leaf illustration.',altText:'Close detail of brown turkey and orange pumpkin artwork with leaves and corn.',board:'Thanksgiving Gift Ideas'}
]});
const reel=()=>({title:'Thanksgiving product reveal',duration:12,hook:'A closer look at your fall favorite',caption:'See the turkey, pumpkin, corn and autumn leaf details across the available shirt, crewneck and hoodie choices.',hashtags:['#ThanksgivingShirt','#FallStyle','#TurkeyDesign'],audioNote:'Keep silent unless the owner supplies music they own or have licensed.',scenes:[{visual:'Reveal the approved artwork','onScreenText':'A fall favorite',motion:'Slow zoom in'},{visual:'Show the product front','onScreenText':'Pick your style',motion:'Gentle pan'},{visual:'Show artwork details','onScreenText':'Warm autumn details',motion:'Close crop'},{visual:'Show product choices','onScreenText':'Choose your favorite',motion:'Pull back'}],platforms:{tiktok:true,instagram:true,youtube:true},handoff:'owner'});

test('Pinny creates three distinct, editable drafts and keeps publishing disabled',async()=>{
  assert.doesNotMatch(pinPrompt({...source,designName:'Original Thanksgiving collection'}).split('\n').find(line=>line.startsWith('DESIGN:')),/original/i);
  assert.equal(validatePins(pins()).pins.length,3);
  assert.throws(()=>validatePins({pins:pins().pins.slice(0,2)}),/exactly three/);
  const service=createPinnyService({store:memoryStore(),tagzService,creativeClient:()=>({responses:{create:async()=>({output_text:JSON.stringify(pins())})}}),env:key=>key==='OPENAI_API_KEY'?'set':undefined,clock:()=>new Date('2026-10-17T14:00:00.000Z')});
  const started=await service.start({tagzJobId,requestId:'33333333-3333-4333-8333-333333333333'});await service.run({jobId:started.job.id});let view=await service.snapshot();assert.equal(view.cards[0].job.plan.pins.length,3);view=await service.decide({jobId:started.job.id,action:'approve',plan:pins()});assert.equal(view.cards[0].state,'approved');assert.equal(view.boundaries.publishing,false);assert.equal(view.boundaries.pinterestWrite,false);assert.equal(view.pacing.dailyMax,10);
});

test('Reel creates a four-scene owner-reviewed plan and keeps every video platform read-only',async()=>{
  assert.doesNotMatch(reelPrompt({...source,designName:'Original Thanksgiving collection'}).split('\n').find(line=>line.startsWith('DESIGN:')),/original/i);
  assert.equal(validateReel(reel()).scenes.length,4);
  assert.throws(()=>validateReel({...reel(),platforms:{tiktok:false,instagram:false,youtube:false}}),/one video platform/);
  const service=createReelService({store:memoryStore(),tagzService,creativeClient:()=>({responses:{create:async()=>({output_text:JSON.stringify(reel())})}}),env:key=>key==='OPENAI_API_KEY'?'set':undefined,clock:()=>new Date('2026-10-17T14:00:00.000Z')});
  const started=await service.start({tagzJobId,requestId:'44444444-4444-4444-8444-444444444444'});await service.run({jobId:started.job.id});let view=await service.snapshot();assert.equal(view.cards[0].job.plan.duration,12);view=await service.decide({jobId:started.job.id,action:'approve',plan:reel()});assert.equal(view.cards[0].state,'approved');assert.equal(view.boundaries.publishing,false);assert.equal(view.boundaries.tiktokWrite,false);assert.equal(view.boundaries.instagramWrite,false);assert.equal(view.boundaries.youtubeWrite,false);assert.deepEqual(view.boundaries.tiktokHandoff,['owner','approved-partner']);
});

test('marketing HTTP surfaces expose no publishing route',async()=>{
  for(const [robot,header,handler] of [['pinny','X-Pinny-Client',createPinnyHandler(()=>({snapshot:async()=>({}),start:async()=>({}),decide:async()=>({})}))],['reel','X-Reel-Client',createReelHandler(()=>({snapshot:async()=>({}),start:async()=>({}),decide:async()=>({})}))]]){
    const response=await handler(new Request(`https://shop.test/api/${robot}/publish`,{method:'POST',headers:{Origin:'https://shop.test','Content-Type':'application/json',[header]:'dashboard'},body:'{}'}),{});assert.equal(response.status,404);
  }
});
