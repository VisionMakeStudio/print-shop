import {getDeployStore,getStore} from '@netlify/blobs';

export function openPixelStore(context={}){
  // Production artwork persists across deploys. Deploy previews use isolated
  // storage so a test cannot spend from or rewrite the live Pixel workflow.
  const production=context.deploy?.context==='production';
  const store=production
    ?getStore({name:'visionmake-pixel-v1',consistency:'strong'})
    :getDeployStore({name:'pixel-isolated-v1',consistency:'strong'});
  return {
    scope:production?'production':'isolated-preview',
    get:key=>store.get(key,{type:'json',consistency:'strong'}),
    getBinary:key=>store.get(key,{type:'arrayBuffer',consistency:'strong'}),
    put:(key,value,onlyIfNew=false)=>store.setJSON(key,value,{onlyIfNew}),
    putBinary:(key,value,{onlyIfNew=false,metadata}={})=>store.set(key,value,{onlyIfNew,metadata}),
    async list(prefix,limit=100){
      const keys=[];
      for await(const page of store.list({prefix,paginate:true}))keys.push(...page.blobs.map(blob=>blob.key));
      return keys.sort().slice(0,limit);
    }
  };
}
