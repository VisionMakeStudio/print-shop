import {createBadgeHandler} from '../lib/badge/http.mjs';
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
  const pixelService=createPixelService({store:openPixelStore(context),radarService,imageClient:()=>{throw new Error('Image generation is unavailable in Badge.');},env});
  return createBadgeService({store:openBadgeStore(context),pixelService,reviewClient:()=>{throw new Error('Visual inspection runs only in Badge’s background function.');},mailer:createResendMailer({env,siteUrl:context.site?.url||''}),env});
};
export default createBadgeHandler(factory);
export const config={path:['/api/badge','/api/badge/jobs','/api/badge/decision','/api/badge/email']};
