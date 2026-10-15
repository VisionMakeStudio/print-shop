export const CLERK_POLICY_VERSION='clerk-1.2';

export const PRODUCT_TYPES=[
  {key:'tee',label:'T-shirt',price:2799,blueprint:[/garment-dyed t-shirt/i,/unisex.*t-shirt/i,/t-shirt/i],exclude:/youth|kids|infant|toddler|dress|v-neck|long sleeve/i,sizes:['S','M','L','XL','2XL','3XL'],colors:['White','Black','Navy','Dark Heather','Sand','Natural']},
  {key:'crewneck',label:'Crewneck sweatshirt',price:3999,blueprint:[/heavy blend.*crewneck/i,/crewneck sweatshirt/i,/sweatshirt/i],exclude:/youth|kids|infant|toddler|hood/i,sizes:['S','M','L','XL','2XL','3XL'],colors:['White','Black','Navy','Dark Heather','Sand']},
  {key:'hoodie',label:'Hoodie',price:4499,blueprint:[/heavy blend.*hooded/i,/hooded sweatshirt/i,/hoodie/i],exclude:/youth|kids|infant|toddler|zip/i,sizes:['S','M','L','XL','2XL','3XL'],colors:['White','Black','Navy','Dark Heather','Sand']},
  {key:'mug',label:'Ceramic mug',price:1999,blueprint:[/ceramic mug.*11.*15/i,/ceramic mug/i,/mug/i],exclude:/travel|enamel|acrylic|stainless|tumbler/i,sizes:['11oz','15oz','11 oz','15 oz'],colors:['White']}
];

export function plain(value,max=180){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
export function money(cents){return Math.max(0,Math.round(Number(cents)||0));}
export function safeId(value){const id=plain(value,100);if(!/^[a-zA-Z0-9-]{16,100}$/.test(id))throw new Error('Choose an approved design.');return id;}
export function listFrom(value,...keys){
  if(Array.isArray(value))return value;
  for(const key of keys)if(Array.isArray(value?.[key]))return value[key];
  return [];
}

function rankBlueprint(blueprint,type){
  const title=`${blueprint.title||''} ${blueprint.brand||''} ${blueprint.model||''}`;
  if(type.exclude.test(title))return -1;
  const hit=type.blueprint.findIndex(pattern=>pattern.test(title));
  return hit<0?-1:100-hit*15+((blueprint.tags||[]).some(tag=>/bestseller|express/i.test(tag))?5:0);
}

export function chooseBlueprints(blueprints){
  return PRODUCT_TYPES.map(type=>{
    const candidates=(blueprints||[]).map(item=>({item,score:rankBlueprint(item,type)})).filter(x=>x.score>=0).sort((a,b)=>b.score-a.score||a.item.id-b.item.id);
    return {type,blueprint:candidates[0]?.item||null};
  });
}

function optionMap(catalog){
  const result=new Map();for(const option of listFrom(catalog?.options,'data','options'))for(const value of listFrom(option?.values,'data','values'))result.set(value.id,{type:option.type||option.name,title:value.title});return result;
}
function variantWords(variant,map){
  if(Array.isArray(variant?.options))return variant.options.map(id=>map.get(id)?.title||plain(id)).filter(Boolean);
  if(variant?.options&&typeof variant.options==='object')return Object.values(variant.options).map(value=>plain(value)).filter(Boolean);
  return plain(variant?.title).split('/').map(value=>plain(value)).filter(Boolean);
}
function wanted(words,wantedValues){return wantedValues.some(value=>words.some(word=>String(word).toLowerCase()===value.toLowerCase()));}

function placeholderRecord(value){
  if(typeof value==='string'){const position=plain(value,40);return position?{position}:null;}
  const position=plain(value?.position,40);if(!position)return null;
  const decorationMethod=plain(value?.decoration_method||value?.decorationMethod,60);
  return {position,...(decorationMethod?{decorationMethod}:{})};
}

function variantPlaceholders(variant){return (variant?.placeholders||[]).map(placeholderRecord).filter(Boolean);}

export function summarizeProvider({type,blueprint,provider,catalog}){
  const map=optionMap(catalog),available=listFrom(catalog,'data','variants').filter(v=>v.is_available!==false),selected=[];
  for(const variant of available){
    const words=variantWords(variant,map),hasSize=wanted(words,type.sizes),hasColor=type.key==='mug'||wanted(words,type.colors);
    if(hasSize&&hasColor)selected.push({...variant,optionTitles:words});
  }
  const fallback=selected.length?selected:available.slice(0,type.key==='mug'?2:18).map(v=>({...v,optionTitles:variantWords(v,map)}));
  const variants=fallback.slice(0,type.key==='mug'?2:30),costs=variants.map(v=>money(v.cost)).filter(Boolean);
  return {key:type.key,label:type.label,blueprintId:Number(blueprint.id),blueprintTitle:plain(blueprint.title),brand:plain(blueprint.brand),model:plain(blueprint.model),image:(blueprint.images||[])[0]||'',providerId:Number(provider.id),providerTitle:plain(provider.title),variantCount:variants.length,minCost:costs.length?Math.min(...costs):0,maxCost:costs.length?Math.max(...costs):0,variants:variants.map(v=>({id:Number(v.id),title:plain(v.title),cost:money(v.cost),placeholders:variantPlaceholders(v)}))};
}

export function chooseProvider(options){return (options||[]).filter(x=>x.variantCount).sort((a,b)=>b.variantCount-a.variantCount||a.maxCost-b.maxCost||a.providerTitle.localeCompare(b.providerTitle))[0]||null;}

export function validatePlan(input,catalog){
  const draftId=safeId(input?.draftId),requestId=safeId(input?.requestId),catalogByKey=new Map((catalog?.products||[]).map(item=>[item.key,item]));
  const rows=Array.isArray(input?.products)?input.products:[];const products=[];
  for(const type of PRODUCT_TYPES){const row=rows.find(item=>item?.key===type.key);if(!row?.enabled)continue;const chosen=catalogByKey.get(type.key);if(!chosen)throw new Error(`${type.label} is not available in the current Printify catalog check.`);const price=money(Number(row.price)*100);if(price<1000||price>10000)throw new Error(`${type.label} price must be between $10 and $100.`);if(price<=chosen.maxCost)throw new Error(`${type.label} price must be higher than its current production cost.`);products.push({...chosen,price});}
  if(!products.length)throw new Error('Choose at least one product.');
  return {draftId,requestId,products};
}

export function productCopy(draft,type){
  const name=plain(draft?.brief?.name||draft?.brief?.topic||'Original seasonal design',90),label=PRODUCT_TYPES.find(x=>x.key===type)?.label||'Product';
  const title=`[DRAFT] ${name} · ${label}`.slice(0,140);
  const description=`<p>Original ${name} artwork, reviewed by VisionMakeStudio before release.</p><p><strong>Made to order:</strong> This item is printed and shipped by our disclosed production partner, Printify.</p><p><strong>Design process:</strong> AI-assisted artwork was reviewed and approved by the shop owner. Product details, sizing, colors, care instructions and mockups must be checked in Printify before publishing.</p>`;
  return {title,description};
}

export function hydrateProduct(product,catalog){
  const current=listFrom(catalog,'data','variants').filter(variant=>variant?.is_available!==false),byId=new Map(current.map(variant=>[Number(variant.id),variant]));
  const variants=(product?.variants||[]).map(saved=>{const live=byId.get(Number(saved.id));if(!live)return null;const livePlaceholders=variantPlaceholders(live);return {...saved,id:Number(live.id),title:plain(live.title||saved.title),cost:money(live.cost||saved.cost),placeholders:livePlaceholders.length?livePlaceholders:variantPlaceholders(saved)};}).filter(Boolean);
  if(!variants.length)throw new Error(`${plain(product?.label||'Product')} has no available variants at its saved Printify provider. Refresh the live catalog and approve the product choices again.`);
  const costs=variants.map(variant=>money(variant.cost)).filter(Boolean);
  return {...product,variants,variantCount:variants.length,minCost:costs.length?Math.min(...costs):money(product?.minCost),maxCost:costs.length?Math.max(...costs):money(product?.maxCost)};
}

function preferredPlaceholder(variant){
  const placeholders=variantPlaceholders(variant);
  return placeholders.find(value=>/^front$/i.test(value.position))||placeholders.find(value=>/front/i.test(value.position))||placeholders[0]||{position:'front'};
}

export function productPayload({draft,product,imageId}){
  const copy=productCopy(draft,product.key),groups=new Map();
  for(const variant of product.variants){const placeholder=preferredPlaceholder(variant),key=`${placeholder.position}\u0000${placeholder.decorationMethod||''}`;if(!groups.has(key))groups.set(key,{placeholder,ids:[]});groups.get(key).ids.push(Number(variant.id));}
  const printAreas=[...groups.values()].map(({placeholder,ids})=>({variant_ids:ids,placeholders:[{position:placeholder.position,...(placeholder.decorationMethod?{decoration_method:placeholder.decorationMethod}:{}),images:[{id:imageId,x:.5,y:.5,scale:.82,angle:0}]}]}));
  // Creating a product does not publish it to Etsy. Printify's separate publish
  // endpoint is intentionally absent. `visible` is response-only and must not
  // be sent in a create request.
  return {title:copy.title,description:copy.description,blueprint_id:product.blueprintId,print_provider_id:product.providerId,variants:product.variants.map(v=>({id:Number(v.id),price:product.price,is_enabled:true})),print_areas:printAreas};
}
