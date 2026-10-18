import {createPinnyService} from './service.mjs';
import {openPinnyStore} from './store.mjs';
import {createTagzFactory} from '../tagz/factory.mjs';

export function createPinnyFactory({creativeClient}){const env=name=>globalThis.Netlify?.env?.get(name)??process.env[name];return context=>createPinnyService({store:openPinnyStore(context),tagzService:createTagzFactory({copyClient:()=>{throw new Error('Tagz generation is unavailable in Pinny.');}})(context),creativeClient,env});}
