import {createReelService} from './service.mjs';
import {openReelStore} from './store.mjs';
import {createTagzFactory} from '../tagz/factory.mjs';
export function createReelFactory({creativeClient}){const env=name=>globalThis.Netlify?.env?.get(name)??process.env[name];return context=>createReelService({store:openReelStore(context),tagzService:createTagzFactory({copyClient:()=>{throw new Error('Tagz generation is unavailable in Reel.');}})(context),creativeClient,env});}
