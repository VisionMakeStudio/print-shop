import OpenAI from 'openai';
import {createReelBackgroundHandler} from '../lib/reel/http.mjs';
import {createReelFactory} from '../lib/reel/factory.mjs';
export default createReelBackgroundHandler(createReelFactory({creativeClient:()=>new OpenAI()}));
export const config={path:'/api/reel/generate',background:true,method:'POST'};
