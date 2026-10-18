import {createReelHandler} from '../lib/reel/http.mjs';
import {createReelFactory} from '../lib/reel/factory.mjs';
export default createReelHandler(createReelFactory({creativeClient:()=>{throw new Error('Video planning runs only in Reel’s background function.');}}));
export const config={path:['/api/reel','/api/reel/jobs','/api/reel/decision']};
