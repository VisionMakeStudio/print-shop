import {createHash} from 'node:crypto';

export const PIXEL_POLICY_VERSION='pixel-1.0';
export const WEEKLY_GENERATION_LIMIT=10;
export const SKIP_REASONS=['not funny','don’t like the look','off trend','too similar'];

const styles=[
  'bold two-color linocut illustration with chunky hand-cut shapes and strong negative space',
  'playful retro screen-print illustration with imperfect ink texture and a clear central silhouette',
  'clean geometric folk-art illustration with three flat ink colors and balanced symmetry'
];

export function plain(value,max=160){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
export function shortHash(value){return createHash('sha256').update(String(value)).digest('hex').slice(0,24);}

export function easternDay(date){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const read=type=>parts.find(part=>part.type===type)?.value;
  return `${read('year')}-${read('month')}-${read('day')}`;
}

export function easternWeek(date){
  const day=easternDay(date),anchor=new Date(`${day}T12:00:00Z`),weekday=anchor.getUTCDay();
  anchor.setUTCDate(anchor.getUTCDate()-((weekday+6)%7));
  return anchor.toISOString().slice(0,10);
}

export function validateJobInput(input){
  const requestId=plain(input?.requestId,80),briefId=plain(input?.briefId,120);
  if(!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId))throw new Error('Invalid design request identifier.');
  if(!/^[a-zA-Z0-9_-]{8,120}$/.test(briefId))throw new Error('Choose a current Radar brief.');
  return {requestId,briefId};
}

export function validateDecision(input){
  const draftId=plain(input?.draftId,80),action=plain(input?.action,20),reason=plain(input?.reason,40);
  if(!/^[a-f0-9-]{16,80}$/.test(draftId))throw new Error('Choose a Pixel draft.');
  if(!['approve','skip','undo'].includes(action))throw new Error('Choose Approve, Skip or Undo.');
  if(action==='skip'&&reason&&!SKIP_REASONS.includes(reason))throw new Error('Choose one of the listed skip reasons.');
  const shops={Etsy:input?.shops?.Etsy!==false,'TikTok Shop':Boolean(input?.shops?.['TikTok Shop'])};
  if(action==='approve'&&!Object.values(shops).some(Boolean))throw new Error('Choose at least one shop before approval.');
  return {draftId,action,reason:action==='skip'?reason:'',shops};
}

export function buildPrompt(brief,variant=0){
  const subject=plain(brief.topic||brief.name,100),direction=plain(brief.direction,240),style=styles[variant%styles.length];
  return `Create one apparel graphic about the general subject "${subject}". Direction: ${direction}. Use a ${style}. Center one cohesive design in a tall portrait composition. Use crisp, separated shapes, limited flat spot colors, strong contrast, and generous transparent space around the art. Make it readable when printed at chest size. Create the artwork for this shop and do not copy or closely imitate another design. No T-shirt, person, model, product mockup, background, border rectangle, words, letters, numbers, signature, watermark, logo, brand, celebrity, copyrighted character, movie, television reference, sports team, or recognizable existing artwork. Output only the isolated artwork on a fully transparent background.`;
}

export function isPng(bytes){
  const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  return view.length>8&&view[0]===137&&view[1]===80&&view[2]===78&&view[3]===71&&view[4]===13&&view[5]===10&&view[6]===26&&view[7]===10;
}
