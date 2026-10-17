import OpenAI from 'openai';
import {createTagzBackgroundHandler} from '../lib/tagz/http.mjs';
import {createTagzFactory} from '../lib/tagz/factory.mjs';

export default createTagzBackgroundHandler(createTagzFactory({copyClient:()=>new OpenAI()}));
export const config={path:'/api/tagz/generate',background:true,method:'POST'};
