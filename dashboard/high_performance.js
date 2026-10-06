// The high-performance release contains assessment summaries, not motion frames.
// This explorer uses its published values without synthesizing a force-time trace.
const $=id=>document.getElementById(id);
const html=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=value=>typeof value==='number'&&Number.isFinite(value);
const nf=(value,digits=1)=>number(value)?value.toLocaleString(undefined,{maximumFractionDigits:digits,minimumFractionDigits:digits}):'—';
const shortDate=value=>value?new Date(value+'T12:00:00').toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'—';
const METRICS=[
 {key:'jump_height_(imp-mom)_[cm]_mean_cmj',name:'CMJ jump height',unit:'cm',group:'Jump'},
 {key:'peak_power_/_bm_[w/kg]_mean_cmj',name:'CMJ power / body mass',unit:'W/kg',group:'Jump'},
 {key:'jump_height_(imp-mom)_[cm]_mean_sj',name:'Squat jump height',unit:'cm',group:'Jump'},
 {key:'net_peak_vertical_force_[n]_max_imtp',name:'IMTP net peak force',unit:'N',group:'Strength'},
 {key:'force_at_200ms_[n]_max_imtp',name:'IMTP force at 200 ms',unit:'N',group:'Strength'},
 {key:'best_rsi_(jump_height/contact_time)_[m/s]_mean_ht',name:'Hop reactive strength index',unit:'m/s',group:'Reactive'},
 {key:'best_jump_height_(flight_time)_[cm]_mean_ht',name:'Hop height',unit:'cm',group:'Reactive'},
 {key:'peak_takeoff_force_[n]_mean_pp',name:'Plyo pushup takeoff force',unit:'N',group:'Upper body'}
];
const TESTS=[['CMJ','jump_height_(imp-mom)_[cm]_mean_cmj'],['Squat jump','jump_height_(imp-mom)_[cm]_mean_sj'],['IMTP','peak_vertical_force_[n]_max_imtp'],['Hop','best_jump_height_(flight_time)_[cm]_mean_ht'],['Plyo pushup','peak_takeoff_force_[n]_mean_pp'],['Mobility','TSpineRomR']];
const pct=(values,value)=>values.length?100*values.filter(x=>x<=value).length/values.length:0;
const quantile=(values,p)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),at=(sorted.length-1)*p,lo=Math.floor(at),hi=Math.ceil(at);return sorted[lo]+(sorted[hi]-sorted[lo])*(at-lo)};
const pearson=points=>{const n=points.length;if(n<3)return null;let sx=0,sy=0,sxx=0,syy=0,sxy=0;for(const [x,y] of points){sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y}const d=Math.sqrt((n*sxx-sx*sx)*(n*syy-sy*sy));return d>0?(n*sxy-sx*sy)/d:null};
const fitLine=points=>{if(points.length<3)return null;const n=points.length,mx=points.reduce((sum,p)=>sum+p[0],0)/n,my=points.reduce((sum,p)=>sum+p[1],0)/n,sxx=points.reduce((sum,p)=>sum+(p[0]-mx)**2,0),sxy=points.reduce((sum,p)=>sum+(p[0]-mx)*(p[1]-my),0);return sxx>0?{slope:sxy/sxx,intercept:my-sxy/sxx*mx}:null};
const extent=values=>{const lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.08,Math.abs(hi)*.015,.1);return [lo-pad,hi+pad]};
const scale=(v,a,b,x,w)=>x+(v-a)/(b-a||1)*w;
const empty=message=>`<p class="hpEmpty">${html(message)}</p>`;
function latestRows(rows,keys,dateKey='test_date'){const byAthlete=new Map();for(const row of rows)if(keys.every(key=>number(row[key]))){const old=byAthlete.get(row.athlete_uid);if(!old||(row[dateKey]||row.test_date)>=(old[dateKey]||old.test_date))byAthlete.set(row.athlete_uid,row)}return [...byAthlete.values()]}
function axisText(x,y,label,anchor='middle'){return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="hpSvgLabel">${html(label)}</text>`}
function metricFromColumn(key){
 const suffix=key.match(/_(cmj|sj|imtp|ht|pp)$/)?.[1],group={cmj:'Countermovement jump',sj:'Squat jump',imtp:'Isometric mid-thigh pull',ht:'Hop test',pp:'Plyo pushup'}[suffix]||(['TSpineRomR','TSpineRomL','ShoulderERL','ShoulderERR','ShoulderIRL','ShoulderIRR'].includes(key)?'Mobility and shoulder':'Session context');
 const rawUnit=key.match(/\[([^\]]+)\]/)?.[1],units={n:'N','n/m':'N/m','n/s':'N/s',w:'W','w/kg':'W/kg',cm:'cm',ms:'ms','m/s':'m/s','%_l,r':'%',lbs:'lb'};
 const unit=units[rawUnit]||rawUnit||(key.endsWith('_mph')?'mph':'');
 const name=({pitch_speed_mph:'Pitch speed',bat_speed_mph:'Bat speed','body_weight_[lbs]':'Body weight'}[key])||key.replace(/_(mean|max)_(cmj|sj|imtp|ht|pp)$/,'').replace(/\[[^\]]+\]/g,'').replace(/_/g,' ').replace(/\s+/g,' ').trim();
 return {key,name,unit,group};
}

export class HighPerformanceExplorer{
 constructor(){this.rows=[];this.columns=[];this.athletes=new Map();this.flaggedAthletes=new Set();this.selected=null;this.metrics=[...METRICS];this.metric=METRICS[0];this.scatterMetric=METRICS[0];this.excluded=new Map();this.hoveredScatterRow=null;this.popupTimer=null;this.ready=false;this.loading=null;this.bind()}
 populateMetricOptions(){
  const groups=new Map();this.metrics.forEach((metric,index)=>{const name=index<METRICS.length?'Profile measures':metric.group;if(!groups.has(name))groups.set(name,[]);groups.get(name).push(`<option value="${index}" title="${html(metric.key)}">${html(metric.name)}${metric.unit?' · '+html(metric.unit):''}</option>`)});
  const options=[...groups].map(([name,choices])=>`<optgroup label="${html(name)}">${choices.join('')}</optgroup>`).join('');
  $('hpMetric').innerHTML=options;$('hpScatterMetric').innerHTML=options;
  $('hpMetric').value=String(this.metrics.indexOf(this.metric));
  $('hpScatterMetric').value=String(this.metrics.indexOf(this.scatterMetric));
 }
 populateFilterOptions(){
  $('hpFilterMetric').innerHTML='<option value="">Any measure</option>'+this.metrics.map(metric=>`<option value="${html(metric.key)}">${html(metric.name)}${metric.unit?' · '+html(metric.unit):''}</option>`).join('');
  $('hpSort').innerHTML='<option value="date">Latest assessment date</option><option value="athlete">Athlete ID</option><option value="assessments">Assessment count</option><optgroup label="Released measures">'+this.metrics.map(metric=>`<option value="metric:${html(metric.key)}">${html(metric.name)}${metric.unit?' · '+html(metric.unit):''}</option>`).join('')+'</optgroup>';
 }
 modality(){return $('hpModality').querySelector('.active')?.dataset.hpModality||'all'}
 filteredGroups(level=$('hpLevel').value){
  const mode=this.modality(),test=$('hpTestFilter').value,testKeys=test==='mobility'?['TSpineRomR','TSpineRomL','ShoulderERL','ShoulderERR','ShoulderIRL','ShoulderIRR']:this.columns.filter(key=>key.endsWith('_'+test)),key=$('hpFilterMetric').value,min=$('hpFilterMin').value===''?null:Number($('hpFilterMin').value),max=$('hpFilterMax').value===''?null:Number($('hpFilterMax').value);
  return [...this.athletes.entries()].filter(([id])=>!this.flaggedAthletes.has(id)).map(([id,all])=>[id,all.filter(row=>level==='all'||row.playing_level===level)]).filter(([,rows])=>{
   if(!rows.length)return false;
   if(mode==='pitching'&&!rows.some(row=>number(row.pitch_speed_mph)||row.pitching_session_date))return false;
   if(mode==='hitting'&&!rows.some(row=>number(row.bat_speed_mph)||row.hitting_session_date))return false;
   if(test!=='all'&&!rows.some(row=>testKeys.some(field=>number(row[field]))))return false;
   if(!key)return true;
   const value=rows.find(row=>number(row[key]))?.[key];
   return number(value)&&(min===null||value>=min)&&(max===null||value<=max);
  });
 }
 filteredRows(level=$('hpLevel').value){return this.filteredGroups(level).flatMap(([,rows])=>rows)}
 updateFilterBadge(){const count=Number(this.modality()!=='all')+Number($('hpTestFilter').value!=='all')+Number($('hpLevel').value!=='all')+Number($('hpSort').value!=='date')+Number($('hpSortOrder').value!=='desc')+Number(Boolean($('hpFilterMetric').value))+Number($('hpFilterMin').value!=='')+Number($('hpFilterMax').value!=='');$('hpFilterBadge').hidden=count===0;$('hpFilterBadge').textContent=String(count);$('hpFilterButton').classList.toggle('hasFilters',Boolean(count))}
 applyFilters(){
  if(!this.ready)return;
  const groups=this.filteredGroups(),current=groups.find(([id])=>id===this.selected?.athlete_uid);
  if(current&&!current[1].includes(this.selected))this.selected=current[1][0];
  else if(!current)this.selected=groups[0]?.[1][0]||null;
  this.alignSpeedToAthlete();
  this.updateFilterBadge();this.hideScatterPopup();this.render();
 }
 alignSpeedToAthlete(){if(!this.selected||this.modality()!=='all')return;const rows=this.athletes.get(this.selected.athlete_uid)||[],pitch=rows.some(row=>number(row.pitch_speed_mph)||row.pitching_session_date),hit=rows.some(row=>number(row.bat_speed_mph)||row.hitting_session_date);if(!pitch&&hit)$('hpSpeed').value='bat_speed_mph';else if(!hit&&pitch)$('hpSpeed').value='pitch_speed_mph'}
 selectAssessment(row,scroll=false){if(!row||this.flaggedAthletes.has(row.athlete_uid))return;this.selected=row;this.alignSpeedToAthlete();$('hpSearch').value='';this.hideScatterPopup();this.render();if(scroll)$('hpProfileTitle').scrollIntoView({block:'start',behavior:'smooth'})}
 assessmentRows(){const group=this.athletes.get(this.selected?.athlete_uid)||[],filter=$('hpLevel').value;return group.filter(row=>filter==='all'||row.playing_level===filter)}
 renderAssessmentSwitch(){const rows=this.assessmentRows(),index=rows.indexOf(this.selected);$('hpAssessment').innerHTML=rows.map(row=>{const sameDay=rows.filter(item=>item.test_date===row.test_date),suffix=sameDay.length>1?` · Record ${sameDay.indexOf(row)+1}/${sameDay.length}`:'';return `<option value="${row._index}">${html(shortDate(row.test_date))} · ${html(row.playing_level)}${suffix}</option>`}).join('');$('hpAssessment').value=this.selected?String(this.selected._index):'';$('hpAssessment').disabled=!rows.length;$('hpAssessmentPrev').disabled=index>=rows.length-1;$('hpAssessmentNext').disabled=index<=0}
 bind(){
  this.populateMetricOptions();
  $('hpMetric').addEventListener('change',event=>{this.metric=this.metrics[Number(event.target.value)];this.hideScatterPopup();this.renderVisuals();this.renderInspector()});
  $('hpScatterMetric').addEventListener('change',event=>{this.scatterMetric=this.metrics[Number(event.target.value)];this.renderScatter()});
  $('hpSpeed').addEventListener('change',()=>{this.renderSpeedCharts();this.renderScatter()});
  $('hpSearch').addEventListener('input',()=>this.renderAthletes());
  $('hpFilterButton').addEventListener('click',()=>{const panel=$('hpFilterPanel'),open=panel.hidden;panel.hidden=!open;$('hpFilterButton').setAttribute('aria-expanded',String(open))});
  $('hpModality').addEventListener('click',event=>{const button=event.target.closest('[data-hp-modality]');if(!button)return;for(const item of $('hpModality').querySelectorAll('button')){const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active))}if(button.dataset.hpModality==='pitching')$('hpSpeed').value='pitch_speed_mph';if(button.dataset.hpModality==='hitting')$('hpSpeed').value='bat_speed_mph';this.applyFilters()});
  $('hpLevel').addEventListener('change',()=>this.applyFilters());
  $('hpTestFilter').addEventListener('change',()=>this.applyFilters());
  $('hpSort').addEventListener('change',()=>{this.updateFilterBadge();this.renderAthletes()});
  $('hpSortOrder').addEventListener('change',()=>{this.updateFilterBadge();this.renderAthletes()});
  $('hpFilterMetric').addEventListener('change',()=>this.applyFilters());
  for(const id of ['hpFilterMin','hpFilterMax'])$(id).addEventListener('input',()=>{if(($('hpFilterMin').value||$('hpFilterMax').value)&&!$('hpFilterMetric').value)$('hpFilterMetric').value=this.modality()==='hitting'?'bat_speed_mph':'pitch_speed_mph';this.applyFilters()});
  $('hpClearFilters').addEventListener('click',()=>{$('hpLevel').value='all';$('hpTestFilter').value='all';$('hpSort').value='date';$('hpSortOrder').value='desc';$('hpFilterMetric').value='';$('hpFilterMin').value='';$('hpFilterMax').value='';$('hpModality').querySelector('[data-hp-modality="all"]').click()});
  $('hpAthletes').addEventListener('click',event=>{const button=event.target.closest('[data-hp-row]');if(button)this.selectAssessment(this.rows[Number(button.dataset.hpRow)])});
  $('hpAssessment').addEventListener('change',event=>this.selectAssessment(this.rows[Number(event.target.value)]));
  $('hpAssessmentPrev').addEventListener('click',()=>{const rows=this.assessmentRows(),index=rows.indexOf(this.selected);this.selectAssessment(rows[index+1])});
  $('hpAssessmentNext').addEventListener('click',()=>{const rows=this.assessmentRows(),index=rows.indexOf(this.selected);this.selectAssessment(rows[index-1])});
  $('hpProfile').addEventListener('click',event=>{const button=event.target.closest('[data-hp-metric]');if(!button)return;const index=Number(button.dataset.hpMetric);$('hpMetric').value=String(index);this.metric=this.metrics[index];this.renderVisuals();this.renderInspector();$('hpDistribution').scrollIntoView({block:'nearest',behavior:'smooth'})});
  $('hpInspector').addEventListener('click',event=>{const button=event.target.closest('[data-hp-metric]');if(!button)return;const index=Number(button.dataset.hpMetric);$('hpMetric').value=String(index);this.metric=this.metrics[index];this.renderVisuals();this.renderInspector()});
  $('hpFitLine').addEventListener('change',()=>this.renderScatter());
  $('hpRestorePoints').addEventListener('click',()=>{this.excluded.delete(this.scatterKey());this.hideScatterPopup();this.renderScatter()});
  $('hpScatter').addEventListener('pointerover',event=>{const circle=event.target.closest?.('[data-hp-scatter-row]');if(circle)this.showScatterPopup(circle,event)});
  $('hpScatter').addEventListener('pointermove',event=>{const circle=event.target.closest?.('[data-hp-scatter-row]');if(circle)this.showScatterPopup(circle,event)});
  $('hpScatter').addEventListener('pointerout',event=>{if(event.target.closest?.('[data-hp-scatter-row]'))this.scheduleScatterPopupHide()});
  $('hpScatterPopup').addEventListener('pointerenter',()=>clearTimeout(this.popupTimer));
  $('hpScatterPopup').addEventListener('pointerleave',()=>this.scheduleScatterPopupHide());
  $('hpPopupRemove').addEventListener('click',()=>{const row=this.hoveredScatterRow;if(!row)return;const key=this.scatterKey(),set=this.excluded.get(key)||new Set();set.add(row.athlete_uid);this.excluded.set(key,set);this.hideScatterPopup();this.renderScatter()});
 }
 scatterKey(){return `${this.scatterMetric.key}|${$('hpSpeed').value}|${this.level()}|${this.modality()}|${$('hpTestFilter').value}|${$('hpFilterMetric').value}|${$('hpFilterMin').value}|${$('hpFilterMax').value}`}
 showScatterPopup(circle,event){
  clearTimeout(this.popupTimer);const row=this.rows[Number(circle.dataset.hpScatterRow)];if(!row)return;
  this.hoveredScatterRow=row;const popup=$('hpScatterPopup'),rect=$('hpScatter').getBoundingClientRect(),x=Math.max(8,Math.min(rect.width-228,event.clientX-rect.left+11)),y=Math.max(8,event.clientY-rect.top-86),speed=$('hpSpeed').value;
  $('hpPopupName').textContent=`Athlete ${row.athlete_uid.slice(0,8)} · ${shortDate(row.test_date)}`;
  $('hpPopupValues').textContent=`${this.scatterMetric.name}: ${nf(row[this.scatterMetric.key])}${this.scatterMetric.unit?' '+this.scatterMetric.unit:''} · ${speed==='pitch_speed_mph'?'Pitch':'Bat'} speed: ${nf(row[speed])} mph`;
  popup.style.left=`${x}px`;popup.style.top=`${y}px`;popup.hidden=false;
 }
 scheduleScatterPopupHide(){clearTimeout(this.popupTimer);this.popupTimer=setTimeout(()=>this.hideScatterPopup(),180)}
 hideScatterPopup(){clearTimeout(this.popupTimer);$('hpScatterPopup').hidden=true;this.hoveredScatterRow=null}
 async load(){if(this.ready)return;if(this.loading)return this.loading;this.loading=(async()=>{const response=await fetch('/data/high_performance.json');if(!response.ok)throw Error('Could not load High Performance data');const data=await response.json();this.columns=data.columns;this.rows=data.rows.map((values,index)=>Object.fromEntries([...this.columns.map((key,i)=>[key,values[i]]),['_index',index]]));this.flaggedAthletes=new Set(this.rows.filter(row=>row.pitch_speed_mph===0).map(row=>row.athlete_uid));for(const row of this.rows){let group=this.athletes.get(row.athlete_uid);if(!group){group=[];this.athletes.set(row.athlete_uid,group)}group.push(row)}for(const group of this.athletes.values())group.sort((a,b)=>b.test_date.localeCompare(a.test_date));const validRows=this.rows.filter(row=>!this.flaggedAthletes.has(row.athlete_uid)),core=new Set(METRICS.map(metric=>metric.key));this.metrics=[...METRICS,...this.columns.filter(key=>!core.has(key)&&validRows.some(row=>number(row[key]))).map(metricFromColumn)];this.populateMetricOptions();this.populateFilterOptions();this.selected=[...validRows].reverse().find(row=>row.playing_level==='College'&&this.athletes.get(row.athlete_uid).length>1)||validRows[0]||null;this.ready=true;this.alignSpeedToAthlete();this.updateFilterBadge();this.render()})().catch(error=>{this.loading=null;$('hpProfile').innerHTML=empty(error.message);throw error});return this.loading}
 level(){return $('hpLevel').value==='all'?this.selected?.playing_level:$('hpLevel').value}
 render(){if(!this.ready)return;this.renderSummary();this.renderAthletes();this.renderAssessmentSwitch();this.renderAthleteHeader();if(!this.selected){for(const id of ['hpProfile','hpSpeedDistribution','hpSpeedTrend','hpDistribution','hpTrend','hpScatterPlot'])$(id).innerHTML=empty('No athletes match these filters.');$('hpInspector').innerHTML=empty('No matching athlete.');$('hpSpeedCurrent').textContent='';$('hpProfileTitle').textContent='Assessment profile';$('hpProfileNote').textContent='';return}this.renderVisuals();this.renderInspector()}
 renderSummary(){const groups=this.filteredGroups(),rows=groups.flatMap(([,items])=>items),repeated=groups.filter(([,items])=>items.length>1).length,level=this.level();$('hpSummary').innerHTML=`<div><strong>${rows.length.toLocaleString()}</strong><span>Assessments shown</span></div><div><strong>${groups.length.toLocaleString()}</strong><span>Athletes shown</span></div><div><strong>${repeated.toLocaleString()}</strong><span>With repeat assessments</span></div><div><strong>${html(level||'—')}</strong><span>Profile reference group</span></div>`}
 renderAthleteHeader(){
  const row=this.selected,node=$('hpAthleteHeader');if(!row){node.innerHTML=empty('No athlete selected.');return}
  const rows=this.athletes.get(row.athlete_uid)||[],weight=rows.find(item=>number(item['body_weight_[lbs]']))?.['body_weight_[lbs]'];
  const facts=[['Weight',number(weight)?`${nf(weight)} lb`:'—'],['Assessments',String(rows.length)],['Latest test',shortDate(rows[0]?.test_date)]];
  node.innerHTML=`<div class="hpAthleteIdentity"><strong>Athlete ${html(row.athlete_uid.slice(0,8))}</strong><span title="Full ID: ${html(row.athlete_uid)}">${html(row.playing_level)} · anonymized ID</span></div><div class="hpAthleteFacts">${facts.map(([label,value])=>`<div><span>${html(label)}</span><strong>${html(value)}</strong></div>`).join('')}</div>`;
 }
 renderAthletes(){
  const query=$('hpSearch').value.trim().toLowerCase(),sort=$('hpSort').value,order=$('hpSortOrder').value;
  const groups=this.filteredGroups().filter(([id])=>id.toLowerCase().includes(query));
  const level=$('hpLevel').value,mode=this.modality(),test=$('hpTestFilter').value,testKeys=test==='mobility'?['TSpineRomR','TSpineRomL','ShoulderERL','ShoulderERR','ShoulderIRL','ShoulderIRR']:this.columns.filter(key=>key.endsWith('_'+test)),flagged=[...this.athletes.entries()].filter(([id])=>this.flaggedAthletes.has(id)&&id.toLowerCase().includes(query)).map(([id,all])=>[id,all.filter(row=>level==='all'||row.playing_level===level)]).filter(([,rows])=>rows.length&&(mode==='all'||rows.some(row=>mode==='pitching'?number(row.pitch_speed_mph)||row.pitching_session_date:number(row.bat_speed_mph)||row.hitting_session_date))&&(test==='all'||rows.some(row=>testKeys.some(key=>number(row[key])))));
  const sortValue=([id,rows])=>sort==='date'?rows[0].test_date:sort==='athlete'?id:sort==='assessments'?rows.length:rows.find(row=>number(row[sort.slice(7)]))?.[sort.slice(7)];
  groups.sort((a,b)=>{const av=sortValue(a),bv=sortValue(b);if(av==null)return bv==null?a[0].localeCompare(b[0]):1;if(bv==null)return -1;const difference=typeof av==='number'?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true});return (order==='asc'?difference:-difference)||a[0].localeCompare(b[0])});
  $('hpResultCount').textContent=`${groups.length.toLocaleString()} athletes`;
  const validMarkup=groups.slice(0,250).map(([id,rows])=>`<div class="hpAthlete"><button type="button" class="hpAthleteHead ${this.selected?.athlete_uid===id?'selected':''}" data-hp-row="${rows[0]._index}"><span><strong>Athlete ${html(id.slice(0,8))}</strong><small>${html(rows[0].playing_level)} · ${rows.length} assessment${rows.length===1?'':'s'}</small></span><time>${html(shortDate(rows[0].test_date))}</time></button>${this.selected?.athlete_uid===id?`<div class="hpDates">${rows.map(row=>`<button type="button" data-hp-row="${row._index}" class="${this.selected===row?'selected':''}">${html(shortDate(row.test_date))}<span>${row===rows[0]?'Latest':''}</span></button>`).join('')}</div>`:''}</div>`).join('')+(groups.length>250?`<p class="hpListMore">Showing 250 athletes. Search by ID to narrow the list.</p>`:'');
  const flaggedMarkup=flagged.length?`<div class="hpFlaggedHeading">Excluded from analysis</div>${flagged.map(([id,rows])=>`<div class="hpAthlete"><div class="hpAthleteHead hpAthleteError" title="Released pitch speed includes 0 mph; this athlete is excluded from all analyses"><span><strong>Athlete ${html(id.slice(0,8))}</strong><small>${html(rows[0].playing_level)} · ${rows.length} assessment${rows.length===1?'':'s'}</small></span><span class="hpErrTag">ERR</span></div></div>`).join('')}`:'';
  $('hpAthletes').innerHTML=validMarkup+flaggedMarkup;
 }
 cohort(key,level=this.level(),dateKey='test_date'){return latestRows(this.filteredRows(level),[key],dateKey)}
 renderProfile(){
  const row=this.selected;if(!row)return;
  const moreOpen=$('hpMoreProfile')?.open||false;
  $('hpProfileTitle').textContent=`Assessment profile · ${shortDate(row.test_date)}`;
  $('hpProfileNote').textContent=`Athlete ${row.athlete_uid.slice(0,8)} · ${row.playing_level}. Percentile ranks use the filtered ${row.playing_level} cohort's latest available values; higher means a larger measurement.`;
  const profileRow=(metric,index)=>{const value=row[metric.key],cohort=this.cohort(metric.key,row.playing_level),values=cohort.map(item=>item[metric.key]);if(!number(value))return `<button type="button" class="hpProfileRow" data-hp-metric="${index}"><span>${html(metric.name)}</span><strong>—</strong><span class="hpMissing">No result</span></button>`;const rank=pct(values,value);return `<button type="button" class="hpProfileRow ${metric===this.metric?'active':''}" data-hp-metric="${index}" title="Compared with ${values.length} ${html(row.playing_level)} athletes"><span>${html(metric.name)}</span><strong>${html(nf(value))}${metric.unit?` <small>${html(metric.unit)}</small>`:''}</strong><span class="hpProfileBar"><i style="width:${rank.toFixed(1)}%"></i></span><em>${Math.round(rank)}th percentile</em></button>`};
  const extras=new Map();this.metrics.slice(METRICS.length).forEach((metric,offset)=>{if(!extras.has(metric.group))extras.set(metric.group,[]);extras.get(metric.group).push(profileRow(metric,offset+METRICS.length))});
  $('hpProfile').innerHTML=`<div class="hpProfileCore">${METRICS.map((metric,index)=>profileRow(metric,index)).join('')}</div><details id="hpMoreProfile" class="hpMoreProfile" ${moreOpen?'open':''}><summary>Other released measures <span>${this.metrics.length-METRICS.length} measures</span></summary><div>${[...extras].map(([group,items])=>`<section><h4>${html(group)}</h4><div class="hpProfileMoreGrid">${items.join('')}</div></section>`).join('')}</div></details>`;
 }
 renderVisuals(){if(!this.ready)return;this.renderProfile();this.renderSpeedCharts();this.renderDistribution();this.renderTrend();this.renderScatter()}
 speedMetric(){const key=$('hpSpeed').value;return {key,name:key==='pitch_speed_mph'?'Pitch speed':'Bat speed',unit:'mph',group:'Session context'}}
 renderSpeedCharts(){const metric=this.speedMetric(),dateKey=metric.key==='pitch_speed_mph'?'pitching_session_date':'hitting_session_date',rows=(this.athletes.get(this.selected?.athlete_uid)||[]).filter(row=>row.playing_level===this.level()),current=latestRows(rows,[metric.key],dateKey)[0]?.[metric.key];$('hpSpeedCurrent').textContent=number(current)?`${nf(current)} mph`:'No recorded speed';this.renderDistribution(metric,'hpSpeedDistribution','hpSpeedDistributionTitle',dateKey,current);this.renderTrend(metric,'hpSpeedTrend','hpSpeedTrendTitle',dateKey)}
 renderDistribution(metric=this.metric,targetId='hpDistribution',titleId='hpDistributionTitle',dateKey='test_date',currentValue=this.selected?.[metric.key]){
  const cohort=this.cohort(metric.key,this.level(),dateKey),values=cohort.map(item=>item[metric.key]),node=$(targetId);$(titleId).textContent=metric.name+' distribution';
  if(values.length<3){node.innerHTML=empty('Not enough assessments for this measure.');return}
  const [min,max]=extent(values),bins=16,counts=Array(bins).fill(0);for(const value of values)counts[Math.min(bins-1,Math.max(0,Math.floor((value-min)/(max-min)*bins)))]++;
  const left=48,right=724,top=20,bottom=205,h=bottom-top,maxCount=Math.max(...counts),barWidth=(right-left)/bins;
  const bars=counts.map((count,i)=>`<rect x="${left+i*barWidth+2}" y="${bottom-count/maxCount*h}" width="${barWidth-4}" height="${count/maxCount*h}" class="hpHistBar"/>`).join('');
  const digits=max-min<1?2:max-min<10?1:0,ticks=Array.from({length:5},(_,i)=>{const value=min+(max-min)*i/4,x=scale(value,min,max,left,right-left);return `<line x1="${x}" x2="${x}" y1="${bottom}" y2="${bottom+5}" class="hpTick"/>${axisText(x,bottom+21,nf(value,digits))}`}).join('');
  const markerX=number(currentValue)?Math.min(right,Math.max(left,scale(currentValue,min,max,left,right-left))):null,marker=markerX!=null?`<line x1="${markerX}" x2="${markerX}" y1="${top}" y2="${bottom}" class="hpSelectionLine"/>${axisText(Math.min(right-12,Math.max(left+12,markerX)),top-5,'Selected athlete')}`:'';
  node.innerHTML=`<svg viewBox="0 0 760 260" role="img" aria-label="Distribution of ${html(metric.name)} for ${values.length} athletes"><line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" class="hpAxis"/>${bars}${marker}${ticks}${axisText(386,250,metric.name+(metric.unit?' ('+metric.unit+')':''))}</svg><p class="hpChartCaption">${values.length} filtered ${html(this.level())} athletes · one latest available result per athlete${dateKey==='test_date'?'':' by session date'}</p>`;
 }
 renderTrend(metric=this.metric,targetId='hpTrend',titleId='hpTrendTitle',dateKey='test_date'){
  const level=this.selected?.playing_level,source=(this.athletes.get(this.selected?.athlete_uid)||[]).filter(row=>row.playing_level===level&&number(row[metric.key])&&row[dateKey]),node=$(targetId);$(titleId).textContent=dateKey==='test_date'?'Assessment history':metric.name+' history';
  const seen=new Set(),rows=source.filter(row=>{if(dateKey==='test_date')return true;const key=`${row[dateKey]}|${row[metric.key]}`;if(seen.has(key))return false;seen.add(key);return true}).sort((a,b)=>a[dateKey].localeCompare(b[dateKey]));
  if(!rows.length){node.innerHTML=empty(`This athlete has no ${dateKey==='test_date'?'assessment':'dated session'} result for this measure.`);return}
  const reference=this.cohort(metric.key,level,dateKey).map(row=>row[metric.key]),q25=quantile(reference,.25),q50=quantile(reference,.5),q75=quantile(reference,.75),guides=[q25,q50,q75].filter(number);
  const xs=rows.map(row=>Date.parse(row[dateKey]+'T12:00:00')),ys=rows.map(row=>row[metric.key]);let [lo,hi]=extent([...ys,...guides]);const x0=Math.min(...xs),x1=Math.max(...xs),left=55,right=716,top=33,bottom=201;
  const px=(x,i)=>xs.length===1?385:scale(x,x0,x1,left,right-left),py=y=>bottom-(y-lo)/(hi-lo)*(bottom-top);
  const points=rows.map((row,i)=>[px(xs[i],i),py(ys[i])]);
  const line=points.length>1?`<polyline points="${points.map(p=>p.join(',')).join(' ')}" class="hpTrendLine"/>`:'';
  const ticks=Array.from({length:5},(_,i)=>{const value=lo+(hi-lo)*i/4,y=py(value);return `<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" class="hpGridLine"/>${axisText(left-7,y+4,nf(value,hi-lo<10?1:0),'end')}`}).join('');
  const guideLines=guides.length===3?`<rect x="${left}" y="${py(q75)}" width="${right-left}" height="${Math.max(0,py(q25)-py(q75))}" class="hpPercentileBand"/>${[[q25,'hpPercentileLine'],[q50,'hpMedianLine'],[q75,'hpPercentileLine']].map(([value,cls])=>`<line x1="${left}" x2="${right}" y1="${py(value)}" y2="${py(value)}" class="${cls}"/>`).join('')}`:'';
  const guideLegend=guides.length===3?`<rect x="475" y="7" width="13" height="10" class="hpPercentileBand"/>${axisText(494,16,'Peers: 25th–75th','start')}<line x1="621" x2="638" y1="12" y2="12" class="hpMedianLine"/>${axisText(644,16,'Median','start')}`:'';
  const unit=metric.unit?' '+metric.unit:'';
  const eventName=dateKey==='test_date'?'assessment':'session',xLabel=dateKey==='test_date'?'Test date':'Session date';
  node.innerHTML=`<svg viewBox="0 0 760 260" role="img" aria-label="${html(metric.name)} over ${rows.length} ${eventName}s with 25th, 50th and 75th percentile reference lines">${ticks}${guideLines}${guideLegend}<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" class="hpAxis"/>${line}${points.map(([x,y],i)=>{const selected=rows[i]===this.selected||(dateKey!=='test_date'&&i===rows.length-1);return `<circle cx="${x}" cy="${y}" r="${selected?7:5}" class="${selected?'hpPointSelected':'hpPoint'}"><title>${html(rows[i][dateKey])}: ${html(nf(ys[i]))}${html(unit)}</title></circle>`}).join('')}${axisText(left,bottom+21,shortDate(rows[0][dateKey]),'start')}${axisText(right,bottom+21,shortDate(rows.at(-1)[dateKey]),'end')}${axisText(385,250,xLabel)}</svg><p class="hpChartCaption">${rows.length} ${html(level)} ${eventName}${rows.length===1?'':'s'}${rows.length===1?' · a trend needs repeat measurements':''}. Fixed peer reference (not date-matched): 25th ${html(nf(q25))}${html(unit)} · median ${html(nf(q50))}${html(unit)} · 75th ${html(nf(q75))}${html(unit)} across ${reference.length} athletes.</p>`;
 }
 renderScatter(){
  this.hideScatterPopup();const metric=this.scatterMetric,speed=$('hpSpeed').value,key=this.scatterKey(),excluded=this.excluded.get(key)||new Set(),node=$('hpScatterPlot');
  $('hpScatterTitle').textContent=`Assessment and ${speed==='pitch_speed_mph'?'pitch':'bat'} speed`;
  const restore=$('hpRestorePoints');restore.hidden=excluded.size===0;restore.textContent=`Restore removed (${excluded.size})`;
  if(metric.key===speed){node.innerHTML=empty('Choose a different measure to compare with this speed.');return}
  const cohort=latestRows(this.filteredRows(this.level()),[metric.key,speed]),points=cohort.filter(row=>!excluded.has(row.athlete_uid)).map(row=>[row[metric.key],row[speed],row]);
  if(points.length<3){node.innerHTML=empty('Fewer than three athletes remain with both measurements. Restore points or choose another measure.');return}
  const [minX,maxX]=extent(points.map(p=>p[0])),[minY,maxY]=extent(points.map(p=>p[1]));
  const left=65,right=730,top=36,bottom=248,px=x=>scale(x,minX,maxX,left,right-left),py=y=>bottom-(y-minY)/(maxY-minY)*(bottom-top),pairs=points.map(p=>p.slice(0,2)),r=pearson(pairs),fit=fitLine(pairs);
  const xDigits=maxX-minX<1?2:maxX-minX<10?1:0,yDigits=maxY-minY<10?1:0;
  const grid=Array.from({length:6},(_,i)=>{const xValue=minX+(maxX-minX)*i/5,yValue=minY+(maxY-minY)*i/5,x=px(xValue),y=py(yValue);return `<line x1="${x}" x2="${x}" y1="${top}" y2="${bottom}" class="hpGridLine"/><line x1="${left}" x2="${right}" y1="${y}" y2="${y}" class="hpGridLine"/><line x1="${x}" x2="${x}" y1="${bottom}" y2="${bottom+5}" class="hpTick"/><line x1="${left-5}" x2="${left}" y1="${y}" y2="${y}" class="hpTick"/>${axisText(x,bottom+20,nf(xValue,xDigits))}${axisText(left-9,y+4,nf(yValue,yDigits),'end')}`}).join('');
  const fitMarkup=$('hpFitLine').checked&&fit?`<line x1="${left}" y1="${py(fit.intercept+fit.slope*minX)}" x2="${right}" y2="${py(fit.intercept+fit.slope*maxX)}" class="hpFitLine" clip-path="url(#hpScatterClip)"/>`:'';
  const unit=metric.unit?` (${metric.unit})`:'';
  const selectedPoint=points.find(([, ,row])=>row.athlete_uid===this.selected?.athlete_uid),regular=points.filter(([, ,row])=>row.athlete_uid!==this.selected?.athlete_uid);
  const selectedMarkup=selectedPoint?(()=>{const [x,y,row]=selectedPoint;return `<circle data-hp-scatter-row="${row._index}" cx="${px(x)}" cy="${py(y)}" r="4.2" class="hpPointSelected" aria-label="Selected athlete ${html(row.athlete_uid.slice(0,8))}"/>`})():'';
  const stats=`<text x="${right-8}" y="${top+16}" text-anchor="end" class="hpScatterStats">r = ${number(r)?nf(r,2):'—'} · R² = ${number(r)?nf(r*r,2):'—'}</text>`;
  node.innerHTML=`<svg viewBox="0 0 770 310" role="img" aria-label="${html(metric.name)} versus ${speed==='pitch_speed_mph'?'pitch':'bat'} speed"><defs><clipPath id="hpScatterClip"><rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}"/></clipPath></defs>${grid}<line x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" class="hpAxis"/><line x1="${left}" x2="${left}" y1="${top}" y2="${bottom}" class="hpAxis"/>${fitMarkup}${regular.map(([x,y,row])=>`<circle data-hp-scatter-row="${row._index}" cx="${px(x)}" cy="${py(y)}" r="4.2" class="hpScatterPoint" aria-label="Athlete ${html(row.athlete_uid.slice(0,8))}, ${html(nf(x))}${html(metric.unit?' '+metric.unit:'')}, ${html(nf(y))} mph"/>`).join('')}${selectedMarkup}${stats}${axisText(390,296,metric.name+unit)}${axisText(3,18,(speed==='pitch_speed_mph'?'Pitch':'Bat')+' speed (mph)','start')}</svg><p class="hpChartCaption">${points.length} filtered ${html(this.level())} athletes${excluded.size?` · ${excluded.size} removed`:''}${!selectedPoint?' · selected athlete has no paired result in this plot':''}. One latest paired row per athlete. Session speed may have been recorded on a different date; association does not establish a cause.</p>`;
 }
 renderInspector(){
  const row=this.selected,node=$('hpInspector');if(!row){node.innerHTML=empty('Select an athlete.');return}
  const level=this.level(),sample=this.filteredRows(level),tests=TESTS.map(([name,key])=>[name,sample.filter(item=>number(item[key])).length]);
  const category=key=>key.endsWith('_cmj')?'Countermovement jump':key.endsWith('_sj')?'Squat jump':key.endsWith('_imtp')?'Isometric mid-thigh pull':key.endsWith('_ht')?'Hop test':key.endsWith('_pp')?'Plyo pushup':['TSpineRomR','TSpineRomL','ShoulderERL','ShoulderERR','ShoulderIRL','ShoulderIRR'].includes(key)?'Mobility and shoulder':'Other fields';
  const groups=new Map();for(const key of this.columns){if(['athlete_uid','test_date','playing_level'].includes(key))continue;const group=category(key);if(!groups.has(group))groups.set(group,[]);groups.get(group).push(key)}
  const coreBars=$('hpProfile').querySelector('.hpProfileCore')?.innerHTML||'';
  node.innerHTML=`<div class="hpInspectorHead"><strong>Athlete ${html(row.athlete_uid.slice(0,8))}</strong><span title="Full released athlete UID">${html(row.athlete_uid)}</span><p>${html(shortDate(row.test_date))} · ${html(row.playing_level)}</p></div><div class="hpInspectorBody"><h3>Session context</h3><div class="hpValues"><div><span>Pitch speed</span><strong>${number(row.pitch_speed_mph)?html(nf(row.pitch_speed_mph))+' mph':'—'}</strong></div><div><span>Bat speed</span><strong>${number(row.bat_speed_mph)?html(nf(row.bat_speed_mph))+' mph':'—'}</strong></div><div><span>Body weight</span><strong>${number(row['body_weight_[lbs]'])?html(nf(row['body_weight_[lbs]']))+' lb':'—'}</strong></div></div><h3>Assessment percentiles</h3><div class="hpProfileCore hpInspectorProfile">${coreBars}</div><h3>Test coverage · ${html(level)}</h3><div class="hpCoverage">${tests.map(([name,count])=>`<div><span>${html(name)}</span><i><b style="width:${100*count/sample.length}%"></b></i><small>${Math.round(100*count/sample.length)}%</small></div>`).join('')}</div><p class="hpInspectorNote">Coverage is the share of assessment rows with a result, not the share of athletes.</p><h3>Released fields</h3>${[...groups].map(([name,keys])=>`<details class="hpFieldGroup"><summary>${html(name)} <span>${keys.filter(key=>row[key]!=null).length}/${keys.length}</span></summary><div>${keys.map(key=>`<div class="hpField"><span title="${html(key)}">${html(key)}</span><strong>${row[key]==null?'—':html(number(row[key])?nf(row[key],2):row[key])}</strong></div>`).join('')}</div></details>`).join('')}<p class="hpInspectorNote">Raw field names and values are preserved. Some released fields have no published unit definition.</p></div>`;
 }
}
