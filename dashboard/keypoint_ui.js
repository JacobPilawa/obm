import {bandFor,onCohortChange,loadCohort,cohortState} from './cohort_band.js';
import {FullBodyCharts} from './full_body_charts.js';
import {drawChart} from './floating_plot.js';
export {drawChart} from './floating_plot.js';
import {plotBounds,rangeControls} from './plot_range.js';
import * as THREE from 'three';
import {sample} from './biomechanics.js';
import {buildKeypointGroups} from './keypoint_data.js';
import {keypointEvents} from './chart_events.js';
import {movieCardState} from './keypoint_movie.js';

const $=id=>document.getElementById(id);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const display=(value,unit)=>Number.isFinite(value)?`${value.toLocaleString(undefined,{maximumFractionDigits:unit==='m'?3:unit==='m/s'?2:1})} ${unit}`:'No sample';
const classFor=metric=>metric.family.startsWith('Raw')?'raw':metric.family==='Calculated here'?'calculated':'published';

export class KeypointExplorer{
 constructor({onFocus,onScrub,onColorMap,onVisual}){
  onCohortChange(()=>{if(this.trial&&cohortState().enabled)loadCohort(this.trial);this.updateTime(this.playhead)});
  this.onFocus=onFocus;this.onScrub=onScrub;this.onColorMap=onColorMap;this.onVisual=onVisual;
  this.enabled=false;this.trial=null;this.groups=[];this.selected=null;this.metric=null;this.category='core';this.positions={};this.playhead=0;this.cardPlaced=false;
  this.button=$('keypointModeButton');this.layer=$('keypointLayer');this.hotspots=$('keypointHotspots');this.card=$('keypointCard');this.definition=$('keypointDefinition');this.plot=$('keypointPlot');
  const sizeControl=document.createElement('label');sizeControl.className='keypointSizeControl';sizeControl.innerHTML='Point size <input id="keypointSize" type="range" min="0" max="150" step="10" value="50" aria-label="Keypoint size, percent of original"><output for="keypointSize">50%</output>';
  this.layer.querySelector('.keypointToolbar').insertBefore(sizeControl,$('keypointCount'));
  this.layer.style.setProperty('--keypoint-scale','.5');
  const sizeSlider=sizeControl.querySelector('input'),sizeReadout=sizeControl.querySelector('output');
  sizeSlider.addEventListener('input',()=>{const size=Number(sizeSlider.value);this.layer.style.setProperty('--keypoint-scale',String(size/100));this.hotspots.hidden=size===0;sizeReadout.value=`${size}%`});
  const eventToggle=document.createElement('label');eventToggle.className='keypointEventsToggle';eventToggle.innerHTML='<input id="keypointMoreEvents" type="checkbox">Show more key moments';this.plot.before(eventToggle);this.range={};this.rangeElement=null;
  eventToggle.title='Show all released event times available for this recording: peak knee height, foot contact, foot plant, max ER, release and max IR (pitching), or foot contact, foot plant and contact (hitting).';
  $('keypointMoreEvents').addEventListener('change',()=>this.updateTime(this.playhead));
  this.card.querySelector('.keypointPlotHint').textContent='Drag title to move · corner to resize · chart to scrub';
  $('keypointMapButton').textContent='Show spatial color map';
  const header=this.card.querySelector('header'),resize=document.createElement('button');
  resize.type='button';resize.className='keypointResizeHandle';resize.setAttribute('aria-label','Resize plot window');resize.title='Drag to resize the plot window';this.card.append(resize);
  let moving=null;
  header.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;const rect=this.card.getBoundingClientRect(),stage=this.layer.getBoundingClientRect();moving={x:event.clientX,y:event.clientY,left:rect.left-stage.left,top:rect.top-stage.top};header.setPointerCapture(event.pointerId);event.preventDefault()});
  header.addEventListener('pointermove',event=>{if(!moving)return;const width=this.layer.clientWidth,height=this.layer.clientHeight;this.card.style.left=`${clamp(moving.left+event.clientX-moving.x,8,Math.max(8,width-this.card.offsetWidth-8))}px`;this.card.style.top=`${clamp(moving.top+event.clientY-moving.y,8,Math.max(8,height-this.card.offsetHeight-8))}px`});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])header.addEventListener(name,()=>moving=null);
  let sizing=null;
  resize.addEventListener('pointerdown',event=>{sizing={x:event.clientX,y:event.clientY,width:this.card.offsetWidth,height:this.card.offsetHeight};resize.setPointerCapture(event.pointerId);event.preventDefault();event.stopPropagation()});
  resize.addEventListener('pointermove',event=>{if(!sizing)return;this.resizeCard(sizing.width+event.clientX-sizing.x,sizing.height+event.clientY-sizing.y)});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])resize.addEventListener(name,()=>sizing=null);
  resize.addEventListener('keydown',event=>{if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(event.key))return;const step=event.shiftKey?32:12;this.resizeCard(this.card.offsetWidth+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),this.card.offsetHeight+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0));event.preventDefault()});
  new ResizeObserver(()=>this.resizePlot()).observe(this.plot);
  this.button.addEventListener('click',()=>this.setEnabled(!this.enabled));
  $('keypointCategory').addEventListener('change',event=>{this.category=event.target.value;this.clearSelection();this.renderHotspots()});
  $('keypointSearch').addEventListener('input',()=>this.renderHotspots());
  this.hotspots.addEventListener('click',event=>{const button=event.target.closest('[data-keypoint]');if(button)this.select(this.groups.find(group=>group.id===button.dataset.keypoint))});
  $('keypointSignal').addEventListener('change',event=>{this.setMetric(this.selected?.metrics.find(metric=>metric.id===event.target.value))});
  $('keypointCardClose').addEventListener('click',event=>{event.stopPropagation();this.clearSelection(false);this.onFocus('none')});
  $('keypointMapButton').addEventListener('click',()=>{if(this.metric?.mapMode)this.onColorMap(this.metric.mapMode);else if(this.metric?.visualAction)this.onVisual(this.metric.visualAction)});
  let dragging=false;
  const scrub=event=>{if(!dragging||!this.metric)return;const bounds=this.plot.getBoundingClientRect(),x=(event.clientX-bounds.left)/bounds.width*this.plot.width,fraction=clamp((x-74)/(this.plot.width-74-28),0,1);const range=plotBounds(this.metric,this.trial,this.range);this.onScrub(range.min+fraction*(range.max-range.min))};
  this.plot.addEventListener('pointerdown',event=>{dragging=true;this.plot.setPointerCapture(event.pointerId);scrub(event);event.stopPropagation()});
  this.plot.addEventListener('pointermove',scrub);
  this.plot.addEventListener('pointerup',()=>dragging=false);
  this.plot.addEventListener('pointercancel',()=>dragging=false);
 }
 resizePlot(){
  const rect=this.plot.getBoundingClientRect();if(!rect.width||!rect.height)return;
  const width=Math.max(320,Math.round(rect.width*2)),height=Math.max(180,Math.round(rect.height*2));
  if(this.plot.width!==width||this.plot.height!==height){this.plot.width=width;this.plot.height=height;if(this.enabled&&this.metric)this.updateTime(this.playhead)}
 }
 movieState(){
  return {fullBody:this.fullBody?.movieState()||[],range:{...this.range},showEvents:$('keypointMoreEvents').checked,enabled:this.enabled,category:this.category,size:Number($('keypointSize').value),search:$('keypointSearch').value,selected:this.selected?.id||null,metricId:this.metric?.id||null,view:this.enabled?movieCardState(this.card,$('stage')):null};
 }
 resizeCard(width,height){
  const left=parseFloat(this.card.style.left)||8,top=parseFloat(this.card.style.top)||8;
  const maxWidth=Math.max(275,this.layer.clientWidth-left-8),maxHeight=Math.max(290,this.layer.clientHeight-top-8);
  this.card.style.width=`${clamp(width,275,maxWidth)}px`;this.card.style.height=`${clamp(height,290,maxHeight)}px`;
  this.constrainCard();
 }
 constrainCard(){
  if(this.card.hidden)return;
  const width=this.layer.clientWidth,height=this.layer.clientHeight;
  this.card.style.left=`${clamp(parseFloat(this.card.style.left)||8,8,Math.max(8,width-this.card.offsetWidth-8))}px`;
  this.card.style.top=`${clamp(parseFloat(this.card.style.top)||8,8,Math.max(8,height-this.card.offsetHeight-8))}px`;
 }
 setTrial(trial,bat){
  this.fullBody?.destroy();this.fullBody=new FullBodyCharts(this.layer.parentElement,trial,t=>this.onScrub(t));this.layer.querySelector('.keypointToolbar').append(this.fullBody.menu);this.fullBody.setEnabled(this.enabled);this.trial=trial;this.range={};this.groups=buildKeypointGroups(trial,bat);this.clearSelection(false);
  if(this.category!=='full'&&!this.groups.some(group=>group.categories.includes(this.category)))this.category=this.groups.some(group=>group.categories.includes('core'))?'core':'raw';
  $('keypointCategory').value=this.category;
  this.button.disabled=!this.groups.length;this.renderHotspots();
  if(!this.groups.length)this.setEnabled(false);
 }
 setEnabled(enabled){
  this.enabled=!!enabled&&!!this.groups.length;this.layer.hidden=!this.enabled;this.fullBody?.setEnabled(this.enabled);this.button.setAttribute('aria-pressed',String(this.enabled));
  if(!this.enabled)this.clearSelection();else this.renderHotspots();
 }
 clearSelection(resetFocus=true){
  const hadSelection=!!this.selected;this.selected=null;this.metric=null;this.card.hidden=true;this.definition.hidden=true;
  this.hotspots.querySelectorAll('[data-keypoint]').forEach(button=>button.setAttribute('aria-pressed','false'));
  if(hadSelection&&resetFocus)this.onFocus('none');
 }
 renderHotspots(){
  if(this.fullBody)this.fullBody.menu.hidden=this.category!=='full';
  const raw=this.category==='raw',query=raw?$('keypointSearch').value.trim().toLowerCase():'';
  $('keypointSearch').hidden=!raw;
  const visible=this.groups.filter(group=>group.categories.includes(this.category)&&(!query||group.label.toLowerCase().includes(query)));
  $('keypointCount').textContent=`${visible.length} ${raw?'markers':'points'}`;
  this.hotspots.innerHTML=visible.map(group=>`<button type="button" class="keypointHotspot ${raw?'isRaw':''}" data-keypoint="${escapeHTML(group.id)}" aria-label="Explore ${escapeHTML(group.label)}" aria-pressed="${this.selected?.id===group.id}" title="${escapeHTML(group.label)}"><span></span></button>`).join('');
 }
 select(group){
  if(!group)return;
  this.selected=group;this.hotspots.querySelectorAll('[data-keypoint]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.keypoint===group.id)));
  this.card.hidden=false;$('keypointCardTitle').textContent=group.label;
  if(!this.cardPlaced){this.card.style.width='318px';this.card.style.height='330px';this.card.style.left=`${Math.max(8,this.layer.clientWidth-330)}px`;this.card.style.top='54px';this.cardPlaced=true}
  this.constrainCard();
  const families=[...new Set(group.metrics.map(metric=>metric.family))];
  $('keypointSignal').innerHTML=families.map(family=>`<optgroup label="${escapeHTML(family)}">${group.metrics.filter(metric=>metric.family===family).map(metric=>`<option value="${escapeHTML(metric.id)}">${escapeHTML(metric.label)}</option>`).join('')}</optgroup>`).join('');
  this.setMetric(group.metrics[0]);
 }
 setMetric(metric){
  if(!metric)return;this.metric=metric;this.rangeElement?.remove();this.rangeElement=rangeControls(this.trial,metric,this.range,()=>this.updateTime(this.playhead));this.plot.before(this.rangeElement);$('keypointSignal').value=metric.id;
  $('keypointSource').textContent=metric.family+' · '+metric.source;
  $('keypointMapButton').hidden=!metric.mapMode&&!metric.visualAction;
  $('keypointMapButton').textContent=({com:'Show center of mass',axis:'Show trunk-axis guide',braking:'Show lead-leg force',knee:'Show knee extension'})[metric.visualAction]|| (metric.visualAction==='armSweep'?'Show elbow-moment sweep':metric.visualAction==='batSweep'?'Show bat-speed sweep':metric.visualAction==='plateArrows'?'Show force plate arrows':'Show spatial color map');
  this.definition.hidden=false;
  this.definition.innerHTML=`<h3>${escapeHTML(metric.label)}</h3><p class="keypointDefinitionValue" id="keypointDefinitionValue"></p><div class="keypointSourceKind ${classFor(metric)}">${escapeHTML(metric.family)}</div><p>${escapeHTML(metric.definition)}</p><dl><div><dt>Source</dt><dd>${escapeHTML(metric.source)}</dd></div><div><dt>Unit</dt><dd>${escapeHTML(metric.unit)}</dd></div><div><dt>3D location</dt><dd>${escapeHTML(this.selected.label)} display anchor</dd></div></dl>${metric.focus?'<p class="keypointGuideNote">The colored 3D geometry is a pose guide. The chart and numeric value use the published model signal.</p>':''}`;
  this.onFocus(metric.focus||'none');this.updateTime(this.playhead);
 }
 updateTime(time){
  this.playhead=time;this.fullBody?.update(time);if(!this.enabled||!this.metric)return;
  const value=sample(this.metric,time),shown=display(value,this.metric.unit);
  $('keypointValue').textContent=shown;$('keypointDefinitionValue').textContent=shown;
  drawChart(this.plot,this.metric,time,keypointEvents(this.trial,$('keypointMoreEvents').checked),'#176b93',plotBounds(this.metric,this.trial,this.range),{bands:[bandFor(this.trial,`key:${this.metric.id}`)]});
 }
 updatePose(modelPoints,rawPoints){this.positions={modelPoints,rawPoints}}
 position(camera,width,height){
  if(!this.enabled||!camera||!width||!height)return;
  camera.updateMatrixWorld();
  for(const button of this.hotspots.querySelectorAll('[data-keypoint]')){
   const group=this.groups.find(item=>item.id===button.dataset.keypoint),point=group?.fixedPoint||(group?.categories.includes('raw')?this.positions.rawPoints?.[group.anchor]:this.positions.modelPoints?.[group.anchor]);
   if(!point?.every(Number.isFinite)){button.hidden=true;continue}
   const world=new THREE.Vector3(...point),direction=world.clone().sub(camera.position),forward=new THREE.Vector3();camera.getWorldDirection(forward);
   if(direction.dot(forward)<=0){button.hidden=true;continue}
   const projected=world.project(camera);if(projected.z< -1||projected.z>1||Math.abs(projected.x)>1.02||Math.abs(projected.y)>1.02){button.hidden=true;continue}
   const x=(projected.x+1)*width/2,y=(1-projected.y)*height/2;
   button.hidden=false;button.style.left=`${x}px`;button.style.top=`${y}px`;
  }
  this.fullBody?.layout();if(this.selected&&!this.card.hidden)this.constrainCard();
 }
}
