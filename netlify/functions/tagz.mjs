import {createTagzHandler} from '../lib/tagz/http.mjs';
import {createTagzFactory} from '../lib/tagz/factory.mjs';

export default createTagzHandler(createTagzFactory({copyClient:()=>{throw new Error('Copy generation runs only in Tagz’s background function.');}}));
export const config={path:['/api/tagz','/api/tagz/jobs','/api/tagz/decision']};
