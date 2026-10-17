import {createTagzService} from './service.mjs';
import {openTagzStore} from './store.mjs';
import {createClerkService} from '../clerk/service.mjs';
import {openClerkStore} from '../clerk/store.mjs';
import {createPrintifyClient} from '../clerk/printify.mjs';
import {createBadgeService} from '../badge/service.mjs';
import {openBadgeStore} from '../badge/store.mjs';
import {createResendMailer} from '../badge/email.mjs';
import {createPixelService} from '../pixel/service.mjs';
import {openPixelStore} from '../pixel/store.mjs';
import {createRadarService} from '../radar/service.mjs';
import {openRadarStore} from '../radar/store.mjs';

export function createTagzFactory({copyClient}){
  const env=name=>globalThis.Netlify?.env?.get(name)??process.env[name];
  return context=>{
    const radarService=createRadarService({store:openRadarStore(context),env});
    const pixelService=createPixelService({store:openPixelStore(context),radarService,imageClient:()=>{throw new Error('Image generation is unavailable in Tagz.');},env});
    const badgeService=createBadgeService({store:openBadgeStore(context),pixelService,reviewClient:()=>{throw new Error('Inspection is unavailable in Tagz.');},mailer:createResendMailer({env,siteUrl:context.site?.url||''}),env});
    const clerkService=createClerkService({store:openClerkStore(context),badgeService,pixelService,clientFactory:()=>createPrintifyClient({token:env('PRINTIFY_API_TOKEN')}),env});
    return createTagzService({store:openTagzStore(context),clerkService,copyClient,env});
  };
}
