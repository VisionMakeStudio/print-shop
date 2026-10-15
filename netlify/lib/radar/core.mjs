import {createHash} from 'node:crypto';
import {XMLParser,XMLValidator} from 'fast-xml-parser';

export const POLICY_VERSION='radar-1.0';
export const GOOGLE_FEED='https://trends.google.com/trending/rss?geo=US';
export const PINTEREST_ENDPOINT='https://api.pinterest.com/v5/trends/keywords/US/top/growing?limit=50';
export const SOURCES={google:'Google Trends RSS',pinterest:'Pinterest Trends',etsy:'Etsy research'};
export const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex').slice(0,24);
export const plain=(value,max=500)=>String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').trim().slice(0,max);
export const normalize=value=>plain(value,300).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
export const easternDay=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export const addDays=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export const daysBetween=(from,to)=>Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000);
export function weekStart(day){const date=new Date(day+'T12:00:00Z');return addDays(day,-((date.getUTCDay()+6)%7));}
function nthWeekday(year,month,weekday,n){const first=new Date(Date.UTC(year,month-1,1));const day=1+(weekday-first.getUTCDay()+7)%7+7*(n-1);return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
function holidayRows(year){return [
 ['valentine','Valentine’s Day',`${year}-02-14`,'Hearts, friendship and small acts of affection.','Simple hearts or handwritten shapes created for this shop; no quoted lyrics.'],
 ['mother','Mother’s Day',nthWeekday(year,5,0,2),'Everyday appreciation for mothers and mother figures.','Fresh flower, gardening or family-humor concepts without brand references.'],
 ['graduation','Graduation season',`${year}-05-15`,'A planning anchor for the spring graduation period.','Fresh milestone and new-chapter illustrations; no school logos.'],
 ['father','Father’s Day',nthWeekday(year,6,0,3),'Hobby-led gifts for fathers and father figures.','Generic fishing, gardening or barbecue motifs; no team marks.'],
 ['summer','Summer planning',`${year}-06-21`,'A planning anchor for summer travel and outdoor hobbies.','Fresh sunlight, beach or camping illustrations.'],
 ['school','Back to school',`${year}-08-15`,'A planning anchor; school opening dates differ by district.','Generic pencils, reading and school-day humor; no school branding.'],
 ['sports','Fall sports planning',`${year}-09-01`,'A planning anchor; actual season dates vary.','Generic practice, sideline or sports-parent ideas; no leagues, teams or players.'],
 ['halloween','Halloween',`${year}-10-31`,'Early planning for an autumn collection.','Fresh pumpkins, leaves or friendly ghosts; no existing characters.'],
 ['thanksgiving','Thanksgiving',nthWeekday(year,11,4,4),'Early planning for autumn gatherings and gratitude.','Fresh harvest, food or gathering motifs; no copied sayings.'],
 ['christmas','Christmas',`${year}-12-25`,'Early planning for holiday gifting and winter gatherings.','Fresh bows, trees or winter motifs; no famous characters or lyrics.']
 ].map(([key,name,at,why,direction])=>({key:`${key}-${year}`,name,at,why,direction,anchor:['graduation','summer','school','sports'].includes(key)}));}
export function seasonalCalendar(now=new Date()){
 const day=easternDay(now),year=Number(day.slice(0,4));
 return [...holidayRows(year),...holidayRows(year+1)].filter(h=>daysBetween(day,h.at)>=0&&daysBetween(day,h.at)<=390).map(h=>{
  const start=addDays(h.at,-56),end=addDays(h.at,-42),away=daysBetween(day,h.at);
  const phase=day<start?'upcoming':day<=end?'design-window':'late';
  return {...h,designStart:start,designEnd:end,daysAway:away,phase,targetLaunch:start>day?start:phase==='design-window'?day:null};
 }).sort((a,b)=>a.at.localeCompare(b.at));
}
// Conservative text rules are an initial filter, NOT trademark/likeness clearance.
// The exact generic-topic match below holds every unknown name or phrase. Adding
// a new generic topic requires a reviewed policy change, rather than guessing.
const BLOCKED=[
 /\b(nike|adidas|disney|pixar|marvel|netflix|pokemon|nintendo|barbie|lego|star wars|harry potter|taylor swift|beyonce|drake|sam altman|mike tyson|tommy edman|miguel rojas|will smith|trump|biden|elon musk|kardashian|snoopy|hello kitty|spongebob|mickey|minnie)\b/,
 /\b(nfl|nba|nhl|mlb|ncaa|ufc|fifa|lakers|dodgers|yankees|mets|eagles|cowboys|chiefs|warriors|boston celtics|world cup|super bowl|olympics)\b/,
 /\b(cast|celebrity|actor|actress|lyrics|song|album|movie|film|tv show|episode|season [0-9]|concert|roster|versus|vs|injury|assassination|shooting|earthquake victims|death toll|terror|election|president|senator|war victims|hurricane victims)\b/
];
const TOPICS=[
 {key:'coffee',pattern:/^(?:(?:iced|hot|cold brew|slow|morning|cozy|winter|fall|autumn) )?(?:coffee|coffee rituals|coffee lovers|coffee aesthetic|coffee time)(?: aesthetic| trend| trends| gifts| shirt| shirts| tee| tees)?$/,name:'Unhurried coffee rituals',direction:'Fresh mugs, steam shapes and slow-morning layouts. Write new wording; do not copy a listing slogan.'},
 {key:'garden',pattern:/^(?:(?:cottage|night|moon|flower|spring|summer|autumn|fall|winter|cozy) )?(?:garden|gardens|gardening|garden aesthetic|botanical art|wildflowers|flowers)(?: aesthetic| trend| trends| gifts| shirt| shirts| tee| tees)?$/,name:'Garden daydreams',direction:'Fresh botanical silhouettes and garden tools. Explore the color mood; do not trace or reproduce reference art.'},
 {key:'reading',pattern:/^(?:(?:cozy|autumn|fall|winter|slow|quiet) )?(?:reading|reading aesthetic|book lovers|books|book club|library)(?: aesthetic| trend| trends| gifts| shirt| shirts| tee| tees)?$/,name:'Quiet reading moments',direction:'Fresh books, page shapes and cozy layouts. No book covers, character art, quotations or existing slogans.'},
 {key:'sky',pattern:/^(?:(?:orionid|perseid|geminid|leonid) )?(?:meteor shower|meteor showers|northern lights|aurora borealis|stargazing|moon and stars|celestial art)(?: tonight| october| november| december| 2026| 2027| aesthetic| trend| trends| shirt| shirts)?$/,name:'A little night-sky wonder',direction:'Fresh stars, moons or abstract sky maps. Do not use named entertainment properties or copied celestial artwork.'},
 {key:'outdoors',pattern:/^(?:(?:autumn|fall|winter|spring|summer|weekend|cozy) )?(?:camping|hiking|mountains|camping aesthetic|hiking aesthetic|road trips|nature walks|outdoors)(?: aesthetic| trend| trends| gifts| shirt| shirts| tee| tees)?$/,name:'Offline outdoor weekends',direction:'Fresh trails, tents or landscape shapes with new wording. No park-service, travel-brand or team logos.'},
 {key:'cats',pattern:/^(?:cats|cat lovers|cat person|cat aesthetic|black cats|cozy cats)(?: aesthetic| trend| trends| gifts| shirt| shirts| tee| tees)?$/,name:'Everyday cat-person energy',direction:'Fresh generic cat silhouettes and behavior-based humor. No famous pet names or existing cartoon characters.'},
 {key:'dogs',pattern:/^(?:dogs|dog lovers|dog person|dog aesthetic|cozy dogs)(?: aesthetic| trend| trends| gifts| shirt| shirts| tee| tees)?$/,name:'Everyday dog-person energy',direction:'Fresh generic dog shapes and daily-life humor. No famous animals, team mascots or copied sayings.'},
 {key:'craft',pattern:/^(?:(?:cozy|slow|autumn|fall|winter) )?(?:knitting|crochet|pottery|sewing|embroidery|crafting)(?: aesthetic| trend| trends| gifts| shirt| shirts| tee| tees)?$/,name:'Slow-made hobby time',direction:'Fresh craft tools, stitches and tactile shapes. Study a general craft mood without copying someone’s pattern or artwork.'},
 {key:'holiday',pattern:/^(?:(?:cozy|retro|vintage|pink|blue|pastel|minimal) )?(?:christmas|halloween|valentines day|thanksgiving|holiday bows|holiday hosting|holiday baking|pumpkins)(?: aesthetic| decor| trend| trends| gifts| shirt| shirts| tee| tees)?$/,name:'A fresh seasonal mood',direction:'Fresh seasonal shapes and a new palette. No recognizable copyrighted characters, protected slogans or lyrics.'},
 {key:'food',pattern:/^(?:(?:cozy|slow|weekend) )?(?:baking|bread baking|sourdough|barbecue|picnic|farmers market|cherries|strawberries|mushrooms)(?: aesthetic| trend| trends| gifts| shirt| shirts| tee| tees)?$/,name:'Small kitchen and market joys',direction:'Fresh food illustrations and everyday ritual ideas. No brand packaging, famous product marks or copied recipes as design text.'}
];
export function assessTopic(title,context=''){
 const term=normalize(title),all=normalize(title+' '+context);
 if(!term||term.length>160)return {state:'held',reason:'Missing or overlong topic.'};
 if(BLOCKED.some(rule=>rule.test(all)))return {state:'blocked',reason:'Protected-topic or sensitive-news signal. Do not turn it into a design.'};
 const topic=TOPICS.find(t=>t.pattern.test(term));
 if(!topic)return {state:'held',reason:'Unrecognized name or phrase. General-topic safety is uncertain; no design brief is generated.'};
 return {state:'candidate',topicKey:topic.key,name:topic.name,direction:topic.direction,reason:'Recognized generic subject. Badge must still check the final wording and artwork.'};
}
export function parseTraffic(text){const match=plain(text,30).replace(/,/g,'').match(/^(\d+(?:\.\d+)?)\s*([KMB])?\+?$/i);if(!match)return null;return Math.round(Number(match[1])*({K:1e3,M:1e6,B:1e9}[match[2]?.toUpperCase()]||1));}
export function parseGoogleRSS(xml,retrievedAt=new Date().toISOString()){
 if(typeof xml!=='string'||xml.length>1_500_000)throw new Error('Google returned an oversized or invalid feed.');
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Unsupported XML declaration in the trend feed.');
 if(XMLValidator.validate(xml)!==true)throw new Error('Google returned malformed RSS.');
 const parser=new XMLParser({ignoreAttributes:true,parseTagValue:false,trimValues:true,processEntities:true,htmlEntities:true,isArray:name=>name==='item'||name==='ht:news_item'});
 const parsed=parser.parse(xml),items=parsed?.rss?.channel?.item;
 if(!Array.isArray(items))throw new Error('Google did not return its expected RSS item list.');
 return items.slice(0,100).map(item=>{
  const title=plain(item.title,160),date=new Date(String(item.pubDate||''));
  return {id:digest(['google',title,item.pubDate]),provider:'google',title,at:Number.isNaN(+date)?null:date.toISOString(),retrievedAt,url:GOOGLE_FEED,traffic:parseTraffic(item['ht:approx_traffic']),growth:null,context:plain((item['ht:news_item']||[]).map(n=>n['ht:news_item_title']).join(' '),900),origin:'official-rss'};
 }).filter(row=>row.title);
}
export function parsePinterest(data,retrievedAt=new Date().toISOString()){
 if(!data||!Array.isArray(data.trends))throw new Error('Pinterest did not return the documented trends array.');
 return data.trends.slice(0,50).map(item=>({id:digest(['pinterest',item.keyword,retrievedAt.slice(0,10),item.pct_growth_wow]),provider:'pinterest',title:plain(item.keyword,160),at:retrievedAt,retrievedAt,url:'https://trends.pinterest.com/',traffic:null,growth:Number.isFinite(item.pct_growth_wow)?item.pct_growth_wow:null,context:'',origin:'official-api'})).filter(x=>x.title);
}
const HOSTS={pinterest:['trends.pinterest.com','www.pinterest.com','pinterest.com','business.pinterest.com'],google:['trends.google.com'],etsy:['etsy.com','www.etsy.com']};
export function validateEvidence(input,now=new Date()){
 if(!input||typeof input!=='object')throw new Error('Enter a dated research observation.');
 const provider=plain(input.provider,20),title=plain(input.title,160),note=plain(input.note,1200),day=plain(input.day,10);
 if(!Object.hasOwn(HOSTS,provider))throw new Error('Choose Pinterest, Google Trends or Etsy.');
 if(title.length<2||title.length>120)throw new Error('Use a topic between 2 and 120 characters.');
 if(note.length<10)throw new Error('Describe what you observed in at least 10 characters.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day+'T12:00:00Z'))||new Date(day+'T12:00:00Z').toISOString().slice(0,10)!==day)throw new Error('Enter a valid evidence date.');
 if(day>easternDay(now))throw new Error('The evidence date cannot be in the future.');
 if(daysBetween(day,easternDay(now))>30)throw new Error('Use research observed within the last 30 days.');
 let url;try{url=new URL(String(input.url));}catch{throw new Error('Enter the source’s full HTTPS URL.');}
 if(url.protocol!=='https:'||url.username||url.password||!HOSTS[provider].includes(url.hostname.toLowerCase())||url.port)throw new Error('Use an HTTPS link on the selected source’s official domain.');
 url.hash='';
 const growth=input.growth===''||input.growth===null||input.growth===undefined?null:Number(input.growth);
 if(growth!==null&&(!Number.isFinite(growth)||growth< -10000||growth>10001))throw new Error('Growth must be an observed percentage between −10000 and 10001, or left blank.');
 const at=day+'T12:00:00Z',id=digest(['manual',provider,normalize(title),day,url.href,note,growth]);
 return {id,provider,title,note,context:'',at,day,retrievedAt:now.toISOString(),url:url.href,traffic:null,growth,origin:'owner-entered',assessment:assessTopic(title,note)};
}
export function priorityScore(row,now=new Date()){
 // Transparent heuristic, NOT search volume, conversion probability, rights
 // clearance, or evidence of a winning shirt. Missing metrics add zero points.
 const hours=row.at?Math.max(0,(+now-Date.parse(row.at))/3600000):Infinity;
 const freshness=hours<=24?25:hours<=72?20:hours<=168?12:hours<=720?5:0;
 const provenance=row.origin==='official-api'?25:row.origin==='official-rss'?20:15;
 const signal=row.growth!==null&&row.growth!==undefined?Math.min(30,Math.max(0,Math.round(row.growth/5))):row.traffic!==null&&row.traffic!==undefined?Math.min(30,Math.max(0,Math.round(Math.log10(Math.max(1,row.traffic))*5))):0;
 const subject=20;
 return {total:Math.min(100,freshness+provenance+signal+subject),parts:{freshness,provenance,signal,subject},metric:row.growth!==null&&row.growth!==undefined?'Observed weekly growth':row.traffic!==null&&row.traffic!==undefined?'Approximate recent searches':'No numeric signal supplied'};
}
export function buildResearch(observations=[],imports=[],now=new Date()){
 const candidates=[],held=[];
 for(const row of [...observations,...imports]){
  const age=row.at?(+now-Date.parse(row.at))/3600000:Infinity;
  const stale=!Number.isFinite(age)||age>(row.origin==='owner-entered'?720:72)||age< -2;
  const assessment=row.assessment||assessTopic(row.title,row.context||'');
  if(stale||assessment.state!=='candidate'){
   held.push({id:row.id,title:row.title,provider:row.provider,url:row.url,at:row.at,origin:row.origin,reason:stale?'Evidence is missing a valid current date, too old, or ahead of the local clock.':assessment.reason,state:stale?'stale':assessment.state});continue;
  }
  const score=priorityScore(row,now),id='research-'+digest([row.id,assessment.topicKey]);
  candidates.push({id,kind:'rising',name:assessment.name,topic:row.title,topicKey:assessment.topicKey,why:row.origin==='official-rss'?`Google included this generic topic in its recent Trending Now feed${row.traffic!==null?' with approximately '+row.traffic.toLocaleString('en-US')+'+ recent searches':''}. This is a news-driven signal, not proven shirt demand.`:row.origin==='official-api'?`Pinterest reported this growing keyword${row.growth!==null?' with '+row.growth+'% week-over-week growth':''}. This is search interest, not a sales forecast.`:'Owner-entered observation: '+row.note,source:SOURCES[row.provider],provider:row.provider,sourceUrl:row.url,evidenceAt:row.at,retrievedAt:row.retrievedAt,origin:row.origin,growth:row.growth,traffic:row.traffic,score:score.total,breakdown:score.parts,signal:score.metric,direction:assessment.direction,rights:'Research only. Badge must inspect all final wording and artwork.',targetLaunch:null,season:'Evergreen / source-led',requiresDesignApproval:true});
 }
 // One highest-priority observation per generic topic; keep alternatives as
 // corroborating evidence without producing near-duplicate briefs.
 const grouped=new Map();
 for(const c of candidates.sort((a,b)=>b.score-a.score)){const existing=grouped.get(c.topicKey);if(existing){existing.corroborating=(existing.corroborating||0)+1;continue;}grouped.set(c.topicKey,c);}
 const calendar=seasonalCalendar(now),seasonal=calendar.filter(h=>h.phase==='design-window').map(h=>({id:'seasonal-'+h.key+'-'+weekStart(easternDay(now)),kind:'seasonal',name:h.name+' collection',topic:h.name,topicKey:h.key,why:`${h.name} is ${h.daysAway} days away. Its 6–8-week design window is ${h.designStart} through ${h.designEnd}. ${h.why} Calendar timing is not evidence of rising searches.`,source:'Seasonal calendar',provider:'calendar',sourceUrl:null,evidenceAt:easternDay(now)+'T12:00:00Z',retrievedAt:now.toISOString(),origin:'calendar-rule',growth:null,traffic:null,score:Math.min(90,70+(56-h.daysAway)),breakdown:{timing:Math.min(90,70+(56-h.daysAway))},signal:'Calendar priority, not a popularity score',direction:h.direction,rights:'General seasonal ideas created for this shop. Badge checks the final design.',targetLaunch:h.targetLaunch,season:h.name,requiresDesignApproval:true}));
 return {briefs:[...grouped.values(),...seasonal].sort((a,b)=>b.score-a.score).slice(0,24),held:held.slice(0,100),calendar,scoredAt:now.toISOString(),policyVersion:POLICY_VERSION};
}
export function shouldSchedule(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'numeric',hourCycle:'h23'}).formatToParts(now);
 return ['Mon','Wed'].includes(parts.find(p=>p.type==='weekday').value)&&parts.find(p=>p.type==='hour').value==='08';
}
export function nextSchedule(now=new Date()){
 const day=easternDay(now);
 for(let n=0;n<9;n++){
  const key=addDays(day,n),date=new Date(key+'T12:00:00Z'),wd=date.getUTCDay();if(wd!==1&&wd!==3)continue;
  const part=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'shortOffset'}).formatToParts(date).find(p=>p.type==='timeZoneName').value;
  const offset=Number((part.match(/GMT([+-]\d+)/)||[])[1]||0),at=new Date(Date.parse(key+'T08:00:00Z')-offset*3600000).toISOString();if(Date.parse(at)>+now)return at;
 }
 return null;
}
