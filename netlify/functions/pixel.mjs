import {createPixelHandler} from '../lib/pixel/http.mjs';
import {createPixelService} from '../lib/pixel/service.mjs';
import {openPixelStore} from '../lib/pixel/store.mjs';
import {createRadarService} from '../lib/radar/service.mjs';
import {openRadarStore} from '../lib/radar/store.mjs';

const env=name=>globalThis.Netlify?.env?.get(name)??process.env[name];
const factory=context=>createPixelService({
  store:openPixelStore(context),
  radarService:createRadarService({store:openRadarStore(context),env}),
  imageClient:()=>{throw new Error('Image generation runs only in Pixel’s background function.');},
  env
});

export default createPixelHandler(factory);
export const config={path:['/api/pixel','/api/pixel/jobs','/api/pixel/decision','/api/pixel/art/:draftId']};
