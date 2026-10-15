import OpenAI from 'openai';
import {createPixelBackgroundHandler} from '../lib/pixel/http.mjs';
import {createPixelService} from '../lib/pixel/service.mjs';
import {openPixelStore} from '../lib/pixel/store.mjs';
import {createRadarService} from '../lib/radar/service.mjs';
import {openRadarStore} from '../lib/radar/store.mjs';

const env=name=>globalThis.Netlify?.env?.get(name)??process.env[name];
const factory=context=>createPixelService({
  store:openPixelStore(context),
  radarService:createRadarService({store:openRadarStore(context),env}),
  // The official SDK reads OPENAI_API_KEY and an optional OPENAI_BASE_URL from
  // Netlify's Functions runtime. The key is never sent to the browser.
  imageClient:()=>new OpenAI(),
  env
});

export default createPixelBackgroundHandler(factory);
export const config={path:'/api/pixel/generate',background:true,method:'POST'};
