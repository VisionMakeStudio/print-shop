const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const preferredWording=value=>String(value??'').replace(/\boriginal\b/gi,'').replace(/\s*·\s*·\s*/g,' · ').replace(/^\s*·\s*|\s*·\s*$/g,'').replace(/\s+/g,' ').trim();
const label=status=>status==='pass'?'Ready for your decision':status==='hold'?'Held by Badge':'Needs a closer review';
const color=status=>status==='pass'?'#15803D':status==='hold'?'#B91C1C':'#B45309';

export function buildBadgeEmail({inspection,draft,siteUrl}){
  const brief=draft.brief||{},statusLabel=label(inspection.status),dashboard=`${String(siteUrl||'').replace(/\/$/,'')}/?badge=${encodeURIComponent(inspection.id)}#approvals`;
  const briefName=preferredWording(brief.name)||'New design draft';
  const issues=[...(inspection.holdReasons||[]),...(inspection.reviewReasons||[])];
  const checks=[
    ['Artwork file','Transparent PNG stored privately'],
    ['Protected-topic screen',inspection.status==='pass'?'No obvious protected reference detected':issues[0]||'Additional review required'],
    ['Visible wording',inspection.modelReview?.visibleText?.length?inspection.modelReview.visibleText.join(' · '):'No visible wording detected'],
    ['Edge cleanup',inspection.modelReview?.edgeQuality==='pass'?'Crisp contours and clean transparency passed':inspection.modelReview?.edgeQuality==='fail'?'Blocked for blur, halos or background leakage':'Needs a closer edge review'],
    ['Disclosure','Etsy AI-use and Printify production-partner notes prepared'],
    ['Publishing','Blocked until your final approval and later Clerk checks']
  ];
  const rows=checks.map(([name,value])=>`<tr><td style="padding:11px 0;border-bottom:1px solid #E5E7EB;color:#6B7280;font-size:13px;vertical-align:top;width:36%">${esc(name)}</td><td style="padding:11px 0;border-bottom:1px solid #E5E7EB;color:#111827;font-size:13px;vertical-align:top">${esc(value)}</td></tr>`).join('');
  const issueHtml=issues.length?`<div style="margin:20px 0;padding:14px 16px;border-left:4px solid ${color(inspection.status)};background:#FFF7ED;border-radius:6px"><strong style="display:block;color:#111827;margin-bottom:5px">What needs attention</strong>${issues.map(item=>`<div style="color:#4B5563;font-size:13px;line-height:1.55">• ${esc(item)}</div>`).join('')}</div>`:'';
  const html=`<!doctype html><html><body style="margin:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;color:#111827"><div style="display:none;max-height:0;overflow:hidden">Badge finished reviewing a new VisionMakeStudio design.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F4F6"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:14px;overflow:hidden"><tr><td style="background:#0B132B;padding:25px 28px;border-bottom:5px solid #F59E0B"><div style="color:#F59E0B;font-size:12px;font-weight:700;letter-spacing:1.6px">VISIONMAKESTUDIO · PRINT SHOP</div><h1 style="margin:8px 0 0;color:#FFFFFF;font-size:25px;line-height:1.25">A design is ready for review</h1></td></tr><tr><td style="padding:28px"><div style="display:inline-block;padding:7px 10px;border-radius:999px;background:${color(inspection.status)}18;color:${color(inspection.status)};font-size:12px;font-weight:700">${esc(statusLabel)}</div><h2 style="margin:14px 0 6px;font-size:22px;line-height:1.3">${esc(briefName)}</h2><p style="margin:0 0 20px;color:#6B7280;font-size:14px;line-height:1.6">Badge reviewed the artwork Pixel made from Radar’s ${esc(brief.kind==='seasonal'?'seasonal timing brief':'dated research brief')}.</p><div style="background:#101936;border-radius:12px;text-align:center;padding:22px"><img src="cid:design-art" width="260" alt="Design artwork awaiting review" style="display:block;max-width:100%;height:auto;margin:0 auto"></div>${issueHtml}<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table><div style="text-align:center;margin:26px 0 10px"><a href="${esc(dashboard)}" style="display:inline-block;background:#F59E0B;color:#0B132B;text-decoration:none;font-size:15px;font-weight:700;padding:14px 22px;border-radius:8px">Open the private approval desk</a></div><p style="margin:15px 0 0;color:#6B7280;font-size:12px;line-height:1.6;text-align:center">The button opens your private dashboard. It does not approve, publish or charge anything.</p></td></tr><tr><td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:18px 28px;color:#6B7280;font-size:11px;line-height:1.55">Badge provides a conservative automated screen, not legal clearance. Final Printify sizing, product creation and publishing happen in later phases and still require your approval.</td></tr></table></td></tr></table></body></html>`;
  const text=`VisionMakeStudio Print Shop\n\nA design is ready for review\n\n${briefName}\nBadge status: ${statusLabel}\n${issues.length?'Needs attention: '+issues.join(' | ')+'\n':''}\nOpen the private approval desk: ${dashboard}\n\nOpening the dashboard does not approve or publish anything. Badge is a conservative automated screen, not legal clearance.`;
  return {subject:`Badge review · ${briefName} · ${statusLabel}`,html,text,dashboard};
}

export function createResendMailer({env,fetcher=fetch,siteUrl=''}){
  const configured=()=>Boolean(env('RESEND_API_KEY')&&env('ALERT_EMAIL')&&env('RESEND_FROM_EMAIL'));
  async function send({inspection,draft,artBytes}){
    if(!configured())return {status:'not-configured',at:new Date().toISOString(),message:'Add the three Resend variables to enable approval email.'};
    const template=buildBadgeEmail({inspection,draft,siteUrl:env('DASHBOARD_URL')||siteUrl});
    const fromValue=env('RESEND_FROM_EMAIL'),from=fromValue.includes('<')?fromValue:`VisionMakeStudio Print Shop <${fromValue}>`;
    const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env('RESEND_API_KEY')}`,'Content-Type':'application/json','Idempotency-Key':`badge-${inspection.id}`},body:JSON.stringify({from,to:[env('ALERT_EMAIL')],subject:template.subject,html:template.html,text:template.text,attachments:[{content:Buffer.from(artBytes).toString('base64'),filename:`visionmake-${draft.id}.png`,content_id:'design-art',content_type:'image/png'}],tags:[{name:'workflow',value:'badge-review'}]}),signal:AbortSignal.timeout(20000)});
    const value=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error('Resend rejected the approval email.'),{status:response.status,code:value?.name||value?.error?.name||'resend-error'});
    return {status:'sent',id:value.id||'',at:new Date().toISOString()};
  }
  return {configured,send};
}
