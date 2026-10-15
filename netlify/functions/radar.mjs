import {openRadarStore} from '../lib/radar/store.mjs';
import {createRadarService} from '../lib/radar/service.mjs';
import {createRadarHandler} from '../lib/radar/http.mjs';

export default createRadarHandler(context=>createRadarService({store:openRadarStore(context),env:name=>Netlify.env.get(name)}));
export const config={path:['/api/radar','/api/radar/run','/api/radar/evidence','/api/radar/shortlist']};
