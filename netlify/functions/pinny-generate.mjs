import OpenAI from 'openai';
import {createPinnyBackgroundHandler} from '../lib/pinny/http.mjs';
import {createPinnyFactory} from '../lib/pinny/factory.mjs';
export default createPinnyBackgroundHandler(createPinnyFactory({creativeClient:()=>new OpenAI()}));
export const config={path:'/api/pinny/generate',background:true,method:'POST'};
