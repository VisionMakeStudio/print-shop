import {createPinnyHandler} from '../lib/pinny/http.mjs';
import {createPinnyFactory} from '../lib/pinny/factory.mjs';
export default createPinnyHandler(createPinnyFactory({creativeClient:()=>{throw new Error('Pin generation runs only in Pinny’s background function.');}}));
export const config={path:['/api/pinny','/api/pinny/jobs','/api/pinny/decision']};
