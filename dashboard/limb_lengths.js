// Audited session-level proxies, not direct anthropometric measurements.
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalizeID=value=>value!=null&&String(value).trim()!==''&&/^\d+$/.test(String(value).trim())?String(Number(value)):null;
let dataset=null;

export async function loadLimbLengths(){
 try{
  const response=await fetch('./data/limb_lengths.json',{cache:'no-store'});
  if(!response.ok)throw Error('Limb-length estimates unavailable');
  const payload=await response.json();
  if(payload.version!==1||!payload.profiles)throw Error('Unsupported limb-length data');
  dataset=payload;
 }catch(error){dataset=null;console.warn(error.message)}
}

export function limbProfile(data){
 const kind=data?.entry?.discipline,session=normalizeID(data?.entry?.session??data?.metadata?.session),athlete=normalizeID(data?.entry?.athlete??data?.metadata?.user);
 if(!session||!athlete)return null;
 const profile=dataset?.profiles?.[kind+':'+session];
 return profile&&normalizeID(profile.athlete)===athlete?profile:null;
}

function segment(profile,side,name){
 if(name==='arm'||name==='leg'){
  const parts=(name==='arm'?['upper_arm','forearm']:['thigh','shank']).map(part=>profile.segments?.[side+'_'+part]);
  if(parts.some(part=>!part||!Number.isFinite(part.median_m)))return null;
  return {median_m:parts.reduce((sum,part)=>sum+part.median_m,0),status:parts.some(part=>part.status==='variable')?'variable':'approximate',composite:true};
 }
 const result=profile.segments?.[side+'_'+name];
 return result&&Number.isFinite(result.median_m)&&result.median_m>0?result:null;
}

export function limbLengthsBody(data){
 const profile=limbProfile(data);
 if(!profile)return '<p class="limbNote">No audited joint-center estimates available for this session.</p>';
 const rows=[['upper_arm','Upper arm','Shoulder → elbow'],['forearm','Forearm','Elbow → wrist'],['thigh','Thigh','Hip → knee'],['shank','Shank','Knee → ankle'],['arm','Arm total','Upper arm + forearm; excludes hand'],['leg','Leg total','Thigh + shank; excludes foot']];
 const cells=(side,name)=>{
  const value=segment(profile,side,name);
  if(!value)return '<td><span>—</span><small>Unavailable</small></td>';
  if(value.status==='variable')return '<td class="limbVariable"><span>—</span><small>Too variable</small></td>';
  const m=value.median_m;
  return `<td data-limb-value="${side}_${name}"><span>~${(m*100).toFixed(1)} cm</span><small>${(m/.0254).toFixed(1)} in</small></td>`;
 };
 const quality=['upper_arm','forearm','thigh','shank'].map(name=>`<tr><th scope="row">${escapeHTML(rows.find(row=>row[0]===name)[1])}</th>${['left','right'].map(side=>{
  const v=segment(profile,side,name);
  if(!v)return '<td>—</td>';
  return `<td>${v.within_trial_span_pct.toFixed(1)}%<small>${v.trial_count<2?'Repeats not tested':v.between_trial_range_pct.toFixed(1)+'% between trials'}</small></td>`;
 }).join('')}</tr>`).join('');
 const attempts=data.entry.discipline==='pitching'?(profile.trial_count===1?'pitch':'pitches'):(profile.trial_count===1?'swing':'swings');
 return `<p class="limbNote">Approximate joint-center lengths · session median of ${profile.trial_count} ${attempts}.</p><table class="limbTable"><thead><tr><th scope="col">Segment</th><th scope="col">Left</th><th scope="col">Right</th></tr></thead><tbody>${rows.map(([name,label,definition])=>`<tr class="${name==='arm'||name==='leg'?'limbTotal':''}"><th scope="row">${escapeHTML(label)}<small>${escapeHTML(definition)}</small></th>${cells('left',name)}${cells('right',name)}</tr>`).join('')}</tbody></table><p class="limbNote">Model estimates, not measured bone lengths. Thigh length is less certain because it depends on the modeled hip center.</p><details class="limbMethod"><summary>Reliability & definitions</summary><p>Each segment is the XYZ distance between its joint centers. We take the median over frames for each recording, then the median across this session’s recordings, giving each recording equal weight.</p><table class="limbTable limbQuality"><caption>Within-recording variation (middle 90% span)</caption><thead><tr><th scope="col">Segment</th><th scope="col">Left</th><th scope="col">Right</th></tr></thead><tbody>${quality}</tbody></table><p>Values are withheld when typical within-recording variation exceeds 15%, or the range across recording medians exceeds 10%. These are exploratory display screens, not validated accuracy limits. Repeatability does not establish anatomical accuracy or prove a left/right difference is real.</p><p>Arm and leg totals sum segment lengths; they are not a straight-line reach, inseam, or full hand/foot length. No lengths are inferred from height.</p><a href="https://github.com/drivelineresearch/openbiomechanics/blob/main/baseball_${data.entry.discipline}/README.md" target="_blank" rel="noopener">Published landmark definitions</a></details>`;
}

export function limbLengthsDisclosure(data){
 return `<details class="compareRecordingInfo limbDisclosure"><summary>Limb lengths <span>Estimates</span></summary><div class="limbBody">${limbLengthsBody(data)}</div></details>`;
}
