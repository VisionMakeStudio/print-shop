import {openRadarStore} from '../lib/radar/store.mjs';
import {createRadarService} from '../lib/radar/service.mjs';
import {shouldSchedule} from '../lib/radar/core.mjs';

export default async function(_request,context){
  const now=new Date();
  if(!shouldSchedule(now))return new Response('Outside the 8 AM Eastern research slot.');
  if(context.deploy?.context!=='production')return new Response('Automatic research runs only on production.');
  const radar=createRadarService({store:openRadarStore(context),env:name=>Netlify.env.get(name)});
  await radar.run({kind:'scheduled'});
  return new Response('Radar research saved. No publishing actions were performed.');
}
// 8 AM ET is 12:00 UTC in daylight time and 13:00 UTC in standard time.
// Both hours fire Monday / Wednesday; shouldSchedule selects the correct local
// hour, including DST. Native schedules have no public invocation URL.
export const config={schedule:'0 12,13 * * 1,3'};
