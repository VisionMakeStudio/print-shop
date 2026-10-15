import {createClerkBackgroundHandler} from '../lib/clerk/http.mjs';
import {createClerkService} from '../lib/clerk/service.mjs';
import {openClerkStore} from '../lib/clerk/store.mjs';
import {createPrintifyClient} from '../lib/clerk/printify.mjs';
import {createBadgeService} from '../lib/badge/service.mjs';
import {openBadgeStore} from '../lib/badge/store.mjs';
import {createResendMailer} from '../lib/badge/email.mjs';
import {createPixelService} from '../lib/pixel/service.mjs';
import {openPixelStore} from '../lib/pixel/store.mjs';
import {createRadarService} from '../lib/radar/service.mjs';
import {openRadarStore} from '../lib/radar/store.mjs';

const env=name=>globalThis.Netlify?.env?.get(name)??process.env[name];
const factory=context=>{
  const radarService=createRadarService({store:openRadarStore(context),env});
  const pixelService=createPixelService({store:openPixelStore(context),radarService,imageClient:()=>{throw new Error('Image generation is unavailable in Clerk.');},env});
  const badgeService=createBadgeService({store:openBadgeStore(context),pixelService,reviewClient:()=>{throw new Error('Inspection is unavailable in Clerk.');},mailer:createResendMailer({env,siteUrl:context.site?.url||''}),env});
  return createClerkService({store:openClerkStore(context),badgeService,pixelService,clientFactory:()=>createPrintifyClient({token:env('PRINTIFY_API_TOKEN')}),env});
};
export default createClerkBackgroundHandler(factory);
export const config={path:'/api/clerk/prepare',background:true,method:'POST'};
