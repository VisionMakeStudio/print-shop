import {getStore,getDeployStore} from '@netlify/blobs';

export function openRadarStore(context={}){
  // Native Netlify credentials are injected; no PAT or manual Blobs key is needed.
  // Production research persists across deploys. Previews are isolated by deploy.
  const production=context.deploy?.context==='production';
  const store=production?getStore({name:'visionmake-radar-v1',consistency:'strong'}):getDeployStore({name:'radar-isolated-v1',consistency:'strong'});
  return {
    scope:production?'production':'isolated-preview',
    get:key=>store.get(key,{type:'json',consistency:'strong'}),
    put:(key,value,onlyIfNew=false)=>store.setJSON(key,value,{onlyIfNew}),
    async list(prefix,limit=80){
      const keys=[];
      for await(const page of store.list({prefix,paginate:true})){
        keys.push(...page.blobs.map(b=>b.key));
      }
      // Scan all key pages before choosing the latest reversed-time keys; the
      // storage API does not promise an ordering for each returned page.
      return keys.sort().slice(0,limit);
    }
  };
}
