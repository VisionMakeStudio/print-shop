import {getDeployStore,getStore} from '@netlify/blobs';

export function openClerkStore(context={}){
  const production=context.deploy?.context==='production',store=production?getStore({name:'visionmake-clerk-v1',consistency:'strong'}):getDeployStore({name:'clerk-isolated-v1',consistency:'strong'});
  return {scope:production?'production':'isolated-preview',get:key=>store.get(key,{type:'json',consistency:'strong'}),put:(key,value,onlyIfNew=false)=>store.setJSON(key,value,{onlyIfNew}),async list(prefix,limit=100){const keys=[];for await(const page of store.list({prefix,paginate:true}))keys.push(...page.blobs.map(blob=>blob.key));return keys.sort().slice(0,limit);}};
}
