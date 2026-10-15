import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseBlueprints,hydrateProduct,listFrom,preferredName,printifyTitle,productPayload,summarizeProvider,validatePlan} from '../netlify/lib/clerk/core.mjs';
import {createClerkHandler} from '../netlify/lib/clerk/http.mjs';
import {createPrintifyClient} from '../netlify/lib/clerk/printify.mjs';
import {createClerkService} from '../netlify/lib/clerk/service.mjs';

const catalog={products:[{key:'tee',label:'T-shirt',blueprintId:10,blueprintTitle:'Unisex T-Shirt',providerId:20,providerTitle:'US Printer',variantCount:2,minCost:900,maxCost:1100,variants:[{id:1,title:'Black / M',cost:900,placeholders:['front']},{id:2,title:'Black / L',cost:1100,placeholders:['front']}]}]};

test('Clerk selects distinct apparel and mug blueprints',()=>{
  const picked=chooseBlueprints([{id:1,title:'Unisex Garment-Dyed T-Shirt',tags:[]},{id:2,title:'Unisex Heavy Blend Crewneck Sweatshirt',tags:[]},{id:3,title:'Unisex Heavy Blend Hooded Sweatshirt',tags:[]},{id:4,title:'Ceramic Mug 11oz 15oz',tags:[]}]);
  assert.deepEqual(picked.map(x=>x.blueprint?.id),[1,2,3,4]);
});

test('Clerk keeps only available wanted variants and production costs',()=>{
  const product=summarizeProvider({type:{key:'tee',label:'T-shirt',sizes:['M','L'],colors:['Black']},blueprint:{id:10,title:'T-Shirt',brand:'Blank',model:'100',images:[]},provider:{id:20,title:'US Printer'},catalog:{options:[{type:'color',values:[{id:5,title:'Black'},{id:6,title:'Pink'}]},{type:'size',values:[{id:7,title:'M'},{id:8,title:'L'}]}],variants:[{id:1,cost:900,is_available:true,options:[5,7],placeholders:[{position:'front'}]},{id:2,cost:1100,is_available:true,options:[5,8],placeholders:[{position:'front'}]},{id:3,cost:800,is_available:true,options:[6,7]}]}});
  assert.equal(product.variantCount,2);assert.equal(product.maxCost,1100);assert.deepEqual(product.variants.map(v=>v.id),[1,2]);
});

test('Clerk accepts current Printify object options and wrapped lists',()=>{
  assert.deepEqual(listFrom({data:[{id:1}]},'data','variants'),[{id:1}]);
  const product=summarizeProvider({type:{key:'tee',label:'T-shirt',sizes:['M'],colors:['Black']},blueprint:{id:10,title:'T-Shirt',images:[]},provider:{id:20,title:'US Printer'},catalog:{data:[{id:1,cost:925,is_available:true,options:{color:'Black',size:'M'},placeholders:[{position:'front'}]},{id:2,cost:900,is_available:true,options:{color:'Pink',size:'M'}}]}});
  assert.equal(product.variantCount,1);assert.equal(product.maxCost,925);assert.deepEqual(product.variants.map(v=>v.id),[1]);
});

test('Clerk refreshes saved variants with current Printify decoration methods',()=>{
  const product=hydrateProduct(catalog.products[0],{variants:[{id:1,title:'Black / M',cost:950,is_available:true,placeholders:[{position:'front',decoration_method:'dtf'}]},{id:2,title:'Black / L',cost:1150,is_available:true,placeholders:[{position:'front',decoration_method:'dtf'}]}]});
  assert.equal(product.maxCost,1150);
  assert.deepEqual(product.variants[0].placeholders,[{position:'front',decorationMethod:'dtf'}]);
});

test('plan validation requires owner-selected products and sensible prices',()=>{
  const requestId='11111111-1111-4111-8111-111111111111',draftId='22222222-2222-4222-8222-222222222222';
  const plan=validatePlan({requestId,draftId,products:[{key:'tee',enabled:true,price:27.99}]},catalog);
  assert.equal(plan.products[0].price,2799);
  assert.throws(()=>validatePlan({requestId,draftId,products:[{key:'tee',enabled:true,price:10}]},catalog),/higher than/);
});

test('Printify payload is private and contains no publish instruction',()=>{
  const product={...catalog.products[0],price:2799,variants:[{id:1,title:'Black / M',cost:900,placeholders:[{position:'front',decorationMethod:'dtf'}]},{id:2,title:'Black / L',cost:1100,placeholders:[{position:'front',decorationMethod:'dtf'}]}]},payload=productPayload({draft:{brief:{name:'Thanksgiving · original collection · variation 3'}},product,imageId:'image-123'});
  assert.equal(payload.title,'Draft Thanksgiving collection variation 3 T-shirt');assert.equal(payload.description.includes('Original'),false);assert.equal(Object.hasOwn(payload,'visible'),false);assert.equal(payload.print_areas[0].placeholders[0].position,'front');assert.equal(payload.print_areas[0].placeholders[0].decoration_method,'dtf');assert.deepEqual(payload.print_areas[0].variant_ids,[1,2]);assert.equal(payload.variants.every(v=>v.price===2799),true);assert.equal(Object.hasOwn(payload,'publish'),false);
});

test('Printify titles strip unsupported symbols and accents',()=>{
  assert.equal(printifyTitle('[DRAFT] Café ☕ · Father’s Day — T-shirt'),'DRAFT Cafe Father s Day T-shirt');
  assert.match(printifyTitle('Safe title 123'),/^[a-zA-Z0-9 -]+$/);
});

test('Clerk follows the owner wording preference in product copy',()=>{
  assert.equal(preferredName('Thanksgiving · original collection'),'Thanksgiving collection');
});

test('Printify errors retain a safe validation detail',async()=>{
  const client=createPrintifyClient({token:'test-token',fetchImpl:async()=>new Response(JSON.stringify({message:'Validation failed',code:8250,errors:{variants:['Variant is invalid']}}),{status:400,headers:{'Content-Type':'application/json'}})});
  await assert.rejects(()=>client.createProduct(1,{}),error=>error.status===400&&error.detail.includes('Validation failed')&&error.detail.includes('Variant is invalid'));
});

test('Clerk updates existing private draft wording without publishing',async()=>{
  const records=new Map(),store={scope:'production',get:async key=>records.get(key)||null,put:async(key,value,onlyIfNew=false)=>{if(onlyIfNew&&records.has(key))return {modified:false};records.set(key,structuredClone(value));return {modified:true};},list:async(prefix,limit=100)=>[...records.keys()].filter(key=>key.startsWith(prefix)).sort().slice(0,limit)};
  const createdAt='2026-10-15T12:00:00.000Z',planId='11111111-1111-4111-8111-111111111111',jobId='22222222-2222-4222-8222-222222222222',reverse=String(9999999999999-Date.parse(createdAt)).padStart(13,'0');
  records.set(`plans/${reverse}-${planId}.json`,{id:planId,draftId:'33333333-3333-4333-8333-333333333333',designName:'Thanksgiving original collection',shop:{id:7,title:'Shop'},products:[{key:'tee',label:'T-shirt'}],createdAt});
  records.set(`jobs/${reverse}-${jobId}.json`,{id:jobId,planId,status:'ready',createdAt,products:[{key:'tee',label:'T-shirt',id:'abc123abc123abc123abc123',title:'Draft Thanksgiving original collection T-shirt',price:2799}]});
  const updates=[],service=createClerkService({store,badgeService:{snapshot:async()=>({cards:[]})},pixelService:{},clientFactory:()=>({updateProduct:async(shopId,productId,payload)=>{updates.push({shopId,productId,payload});return {};}}),env:()=> 'set',clock:()=>new Date('2026-10-15T13:00:00.000Z')});
  const view=await service.renameProducts({jobId});
  assert.equal(updates.length,1);assert.equal(updates[0].payload.title,'Draft Thanksgiving collection T-shirt');assert.equal(updates[0].payload.description.includes('Original'),false);assert.equal(view.jobs.find(item=>item.id===jobId).renamedAt,'2026-10-15T13:00:00.000Z');
});

test('Clerk HTTP surface exposes no publishing route',async()=>{
  const service={snapshot:async()=>({ok:true}),refreshCatalog:async()=>({}),makePlan:async()=>({}),start:async()=>({}),renameProducts:async()=>({renamed:true})},handler=createClerkHandler(()=>service);
  const request=new Request('https://example.test/api/clerk/publish',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json','X-Clerk-Client':'dashboard'},body:'{}'});
  const response=await handler(request,{});assert.equal(response.status,404);assert.match(await response.text(),/route not found/);
});
