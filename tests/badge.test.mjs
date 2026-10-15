import test from 'node:test';
import assert from 'node:assert/strict';
import {decideInspection,normalizeModelReview,pngInfo} from '../netlify/lib/badge/core.mjs';
import {buildBadgeEmail} from '../netlify/lib/badge/email.mjs';
import {createBadgeService} from '../netlify/lib/badge/service.mjs';

const safeReview=()=>normalizeModelReview({summary:'An original autumn turkey framed by leaves and pumpkins.',visible_text:[],brand_or_logo:'none',recognizable_person:'none',character_or_franchise:'none',sports_or_entertainment:'none',lyric_or_slogan_risk:'none',protected_reference_notes:[],originality_risk:'low',policy_risk:'none',print_readiness:'pass',print_notes:['Centered with clear transparent margins.'],composition_notes:['Limited autumn palette.'],confidence:'high'});
const png=()=>{const b=Buffer.alloc(32);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(1024,16);b.writeUInt32BE(1536,20);return b;};

test('Badge passes a generic original image and holds likely protected references',()=>{
  const image=pngInfo(png()),pass=decideInspection({modelReview:safeReview(),image});
  assert.equal(pass.status,'pass');assert.equal(image.width,1024);assert.equal(image.height,1536);
  const risky={...safeReview(),brandOrLogo:'likely'};
  assert.equal(decideInspection({modelReview:risky,image}).status,'hold');
});

test('visible wording and uncertain references require closer review',()=>{
  const review={...safeReview(),visibleText:['FALL CLUB'],lyricOrSloganRisk:'uncertain'};
  const result=decideInspection({modelReview:review,image:pngInfo(png())});
  assert.equal(result.status,'needs_review');assert.match(result.reviewReasons.join(' '),/Visible text/);
});

test('approval email is branded, escaped and never performs approval',()=>{
  const inspection={id:'11111111-1111-4111-8111-111111111111',status:'pass',holdReasons:[],reviewReasons:[],modelReview:safeReview()};
  const draft={id:'22222222-2222-4222-8222-222222222222',brief:{name:'Autumn <Gathering>',kind:'seasonal'}};
  const mail=buildBadgeEmail({inspection,draft,siteUrl:'https://vms-print.netlify.app'});
  assert.match(mail.html,/VISIONMAKESTUDIO/);assert.match(mail.html,/cid:design-art/);assert.match(mail.html,/Autumn &lt;Gathering&gt;/);assert.doesNotMatch(mail.dashboard,/approve/i);assert.match(mail.text,/does not approve or publish/);
});

test('live service stores one inspection, sends one email and records final approval',async()=>{
  const records=new Map(),store={scope:'test',get:async key=>records.get(key)||null,put:async(key,value,onlyIfNew=false)=>{if(onlyIfNew&&records.has(key))return {modified:false};records.set(key,structuredClone(value));return {modified:true};},list:async(prefix,limit=100)=>[...records.keys()].filter(key=>key.startsWith(prefix)).sort().slice(0,limit)};
  const draft={id:'22222222-2222-4222-8222-222222222222',decisionAt:'2026-10-14T23:00:00.000Z',state:'approved',shops:{Etsy:true,'TikTok Shop':false},variant:0,brief:{name:'Thanksgiving original collection',topic:'Thanksgiving',direction:'Original harvest motifs',kind:'seasonal',score:83}};
  const pixelService={snapshot:async()=>({drafts:[draft]}),art:async()=>({bytes:png(),job:{id:draft.id}})};
  const client={responses:{create:async()=>({output_text:JSON.stringify({summary:'Original autumn turkey.',visible_text:[],brand_or_logo:'none',recognizable_person:'none',character_or_franchise:'none',sports_or_entertainment:'none',lyric_or_slogan_risk:'none',protected_reference_notes:[],originality_risk:'low',policy_risk:'none',print_readiness:'pass',print_notes:[],composition_notes:[],confidence:'high'})})}};
  let sent=0;const mailer={configured:()=>true,send:async()=>{sent++;return {status:'sent',id:'email-1',at:'2026-10-14T23:01:00.000Z'};}};
  const times=['2026-10-14T23:00:10.000Z','2026-10-14T23:00:20.000Z','2026-10-14T23:00:30.000Z','2026-10-14T23:00:40.000Z'];let n=0;
  const service=createBadgeService({store,pixelService,reviewClient:()=>client,mailer,env:key=>key==='OPENAI_API_KEY'?'set':undefined,clock:()=>new Date(times[Math.min(n++,times.length-1)])});
  const start=await service.startInspection({draftId:draft.id,requestId:'33333333-3333-4333-8333-333333333333'});assert.equal(start.inspection.status,'queued');
  await service.runInspection({inspectionId:start.inspection.id});const checked=await service.snapshot();assert.equal(checked.cards[0].inspection.status,'pass');assert.equal(checked.cards[0].email.status,'sent');assert.equal(sent,1);
  const decided=await service.decide({inspectionId:start.inspection.id,action:'approve',reason:'',shops:{Etsy:true,'TikTok Shop':false}});assert.equal(decided.cards[0].finalState,'approved');assert.equal(decided.boundaries.publishing,false);
});
