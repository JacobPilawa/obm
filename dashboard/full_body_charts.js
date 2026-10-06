import {sample} from './biomechanics.js';
import {buildQuantities} from './quantities.js';
import {drawChart} from './floating_plot.js';
import {plotBounds,rangeControls} from './plot_range.js';
import {keypointEvents} from './chart_events.js';
import {movieCardState} from './keypoint_movie.js';
import {bandFor,cohortKey,onCohortChange,loadCohort} from './cohort_band.js';
export function legendValue(series,time,unit){const value=sample(series,time),suffix=({'deg':'°','deg/s':'°/s'})[unit]||unit;return `${Number.isFinite(value)?value.toFixed(unit==='m'||unit==='m/s'?2:1):'—'} ${suffix}`}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function fullBodySpecs(trial){const ids=trial.entry.discipline==='pitching'?['report_arm_positions','report_lower_positions','report_sequence','report_velocity_chain','com_velocity']:['axial_angles','knee_flexion','hitting_sequence','upper_chain_speed','com_velocity'];return buildQuantities(trial,{includePublished:false}).filter(x=>ids.includes(x.id))}
export class FullBodyCharts{
 constructor(host,trial,onSeek,bounds){this.host=host;this.trial=trial;this.onSeek=onSeek;this.bounds=bounds||(()=>({x:0,y:0,width:host.clientWidth,height:host.clientHeight}));this.specs=fullBodySpecs(trial);this.windows=new Map();this.time=0;this.enabled=false;this.stopBands=onCohortChange(()=>{if(this.enabled){loadCohort(this.trial);this.update(this.time)}});
  this.root=document.createElement('div');this.root.className='fullBodyLayer';this.root.hidden=true;host.append(this.root);
  this.menu=document.createElement('details');this.menu.className='fullBodyMenu';this.menu.open=true;const summary=document.createElement('summary');summary.textContent='Full body charts';this.menu.append(summary);const panel=document.createElement('div');panel.className='fullBodyChoices';this.menu.append(panel);
  for(const spec of this.specs){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.fullBodyChart=spec.id;label.append(input,spec.title);panel.append(label);input.addEventListener('change',()=>input.checked?this.open(spec):this.close(spec.id))}
  if(!this.specs.length)panel.textContent='Requires processed kinematics.';
 }
 setEnabled(enabled){this.enabled=!!enabled;this.root.hidden=!this.enabled;this.layout()}
 open(spec){if(this.windows.has(spec.id))return;const card=document.createElement('article');card.className='fullBodyCard';card.innerHTML=`<header><strong>${esc(this.trial.entry.processed_key||this.trial.entry.id)} · ${esc(spec.title)}</strong><button type="button" aria-label="Close ${esc(spec.title)}">×</button></header><label class="keypointEventsToggle"><input type="checkbox" checked>Show more key moments</label><div class="fullBodyLegend" aria-label="Toggle chart signals"></div><canvas aria-label="${esc(spec.title)}; drag to scrub" tabindex="0"></canvas><details class="fullBodyDefinition"><summary>Source & definition</summary><p>${esc(spec.source)} · ${esc(spec.unit)}</p><p>${esc(spec.note||'Released signals, unchanged from the time-series chart.')}</p></details><button type="button" class="fullBodyResize" aria-label="Resize chart window" title="Drag to resize; arrow keys adjust size">◢</button>`;
  const range=spec.plotWindow?{start:spec.plotWindow.start,end:spec.plotWindow.end}:{},canvas=card.querySelector('canvas'),window={card,canvas,spec,range,hidden:new Set(),showEvents:true,x:18+this.windows.size*24,y:60+this.windows.size*28};
  const update=()=>this.update(this.time);card.querySelector('.keypointEventsToggle input').addEventListener('change',event=>{window.showEvents=event.target.checked;update()});canvas.before(rangeControls(this.trial,spec,range,update));card.querySelector('header button').addEventListener('click',()=>this.close(spec.id));
  this.windows.set(spec.id,window);this.root.append(card);card.addEventListener('pointerdown',()=>{this.root.style.zIndex=String(++FullBodyCharts.front);card.style.zIndex=String(++FullBodyCharts.front)});card.style.width='440px';card.style.height='440px';
  let moving=null;const header=card.querySelector('header');header.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;moving={x:event.clientX,y:event.clientY,left:window.x,top:window.y};header.setPointerCapture(event.pointerId);event.preventDefault()});header.addEventListener('pointermove',event=>{if(!moving)return;window.x=moving.left+event.clientX-moving.x;window.y=moving.top+event.clientY-moving.y;this.layout()});for(const event of ['pointerup','pointercancel','lostpointercapture'])header.addEventListener(event,()=>moving=null);
  let dragging=false;const seek=event=>{if(!dragging)return;const rect=canvas.getBoundingClientRect(),fraction=Math.max(0,Math.min(1,((event.clientX-rect.left)/rect.width*canvas.width-74)/(canvas.width-102))),range=plotBounds(spec,this.trial,window.range);this.onSeek(range.min+fraction*(range.max-range.min))};canvas.addEventListener('pointerdown',event=>{dragging=true;canvas.setPointerCapture(event.pointerId);seek(event);event.stopPropagation()});canvas.addEventListener('pointermove',seek);for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>dragging=false);
  canvas.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const r=plotBounds(spec,this.trial,range);this.onSeek(event.key==='Home'?r.min:event.key==='End'?r.max:Math.max(r.min,Math.min(r.max,this.time+(event.key==='ArrowRight'?1:-1)/360)))});
  const legend=card.querySelector('.fullBodyLegend');legend.innerHTML=spec.series.map((s,i)=>`<button type="button" data-line="${i}" style="--line:${s.color}" aria-pressed="true"><span class="fullBodyLegendLabel">${esc(s.label)}</span><b class="fullBodyLegendValue" data-live-value="${i}">—</b></button>`).join('');legend.addEventListener('click',event=>{const button=event.target.closest('[data-line]');if(!button)return;const i=Number(button.dataset.line);window.hidden.has(i)?window.hidden.delete(i):window.hidden.add(i);button.setAttribute('aria-pressed',String(!window.hidden.has(i)));update()});
  const handle=card.querySelector('.fullBodyResize');let sizing=null;const size=(width,height)=>{const b=this.bounds();card.style.width=Math.max(220,Math.min(b.width-16,width))+'px';card.style.height=Math.max(240,Math.min(b.height-16,height))+'px';this.layout();update()};handle.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();sizing={id:event.pointerId,x:event.clientX,y:event.clientY,width:card.offsetWidth,height:card.offsetHeight};handle.setPointerCapture(event.pointerId)});handle.addEventListener('pointermove',event=>{if(sizing&&sizing.id===event.pointerId)size(sizing.width+event.clientX-sizing.x,sizing.height+event.clientY-sizing.y)});for(const event of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(event,()=>sizing=null);handle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();size(card.offsetWidth+(event.key==='ArrowRight'?20:event.key==='ArrowLeft'?-20:0),card.offsetHeight+(event.key==='ArrowDown'?20:event.key==='ArrowUp'?-20:0))});
  window.observer=new ResizeObserver(()=>{this.layout();update()});window.observer.observe(canvas);this.layout();update();

 }
 close(id){const w=this.windows.get(id);w?.observer.disconnect();w?.card.remove();this.windows.delete(id);const checkbox=[...this.menu.querySelectorAll('input')].find(x=>x.dataset.fullBodyChart===id);if(checkbox)checkbox.checked=false}
 layout(){if(!this.enabled)return;const b=this.bounds();for(const w of this.windows.values()){w.card.style.maxWidth=Math.max(200,b.width-16)+'px';w.card.style.maxHeight=Math.max(180,b.height-16)+'px';w.x=Math.max(8,Math.min(b.width-w.card.offsetWidth-8,w.x));w.y=Math.max(8,Math.min(b.height-w.card.offsetHeight-8,w.y));w.card.style.left=b.x+w.x+'px';w.card.style.top=b.y+w.y+'px'}}
 update(time){this.time=time;if(!this.enabled)return;for(const w of this.windows.values()){const rect=w.canvas.getBoundingClientRect();if(!rect.width||!rect.height)continue;const width=Math.max(320,Math.round(rect.width*2)),height=Math.max(260,Math.round(rect.height*2));if(w.canvas.width!==width)w.canvas.width=width;if(w.canvas.height!==height)w.canvas.height=height;drawChart(w.canvas,w.spec,time,keypointEvents(this.trial,w.showEvents),'#176b93',plotBounds(w.spec,this.trial,w.range),{showLegend:false,hidden:[...w.hidden],bands:w.spec.series.map(s=>bandFor(this.trial,cohortKey(w.spec.id,s.label)))});w.card.querySelectorAll('[data-live-value]').forEach(node=>{const text=legendValue(w.spec.series[Number(node.dataset.liveValue)],time,w.spec.unit);if(node.textContent!==text)node.textContent=text;node.title=text;node.closest('button').title=w.spec.series[Number(node.dataset.liveValue)].label+' · '+text});}}

 settings(){return [...this.windows.values()].map(w=>({chartId:w.spec.id,hiddenLabels:[...w.hidden].map(i=>w.spec.series[i]?.label).filter(Boolean),range:{...w.range},showEvents:w.showEvents,x:w.x,y:w.y,width:w.card.style.width,height:w.card.style.height}))}
 applySettings(settings){
  const available=settings.filter(state=>this.specs.some(spec=>spec.id===state.chartId)),wanted=new Set(available.map(state=>state.chartId));
  for(const id of [...this.windows.keys()])if(!wanted.has(id))this.close(id);
  for(const state of available){const spec=this.specs.find(spec=>spec.id===state.chartId);this.open(spec);const w=this.windows.get(spec.id);
   w.hidden=new Set(spec.series.flatMap((series,i)=>state.hiddenLabels.includes(series.label)?[i]:[]));w.showEvents=!!state.showEvents;
   const range={};for(const side of ['start','end']){const key=state.range?.[side]||'full';range[side]=key==='full'||Number.isFinite(this.trial.events?.[key]?.time)?key:'full'}
   const full=plotBounds(spec,this.trial),min=range.start==='full'?full.min:this.trial.events[range.start].time,max=range.end==='full'?full.max:this.trial.events[range.end].time;if(min>=max){range.start='full';range.end='full'}
   for(const key of Object.keys(w.range))delete w.range[key];Object.assign(w.range,range);
   w.card.querySelector('.floatingRange').remove();w.canvas.before(rangeControls(this.trial,spec,w.range,()=>this.update(this.time)));
   w.card.querySelector('.keypointEventsToggle input').checked=w.showEvents;
   for(const button of w.card.querySelectorAll('[data-line]'))button.setAttribute('aria-pressed',String(!w.hidden.has(Number(button.dataset.line))));
   for(const side of ['width','height'])if(/^\d+(?:\.\d+)?px$/.test(state[side]||''))w.card.style[side]=state[side];
   if(Number.isFinite(state.x))w.x=state.x;if(Number.isFinite(state.y))w.y=state.y;
  }
  for(const input of this.menu.querySelectorAll('input'))input.checked=this.windows.has(input.dataset.fullBodyChart);
  this.layout();this.update(this.time);
 }
 movieState(){return this.enabled?[...this.windows.values()].map(w=>({chartId:w.spec.id,hidden:[...w.hidden],range:{...w.range},showEvents:w.showEvents,view:movieCardState(w.card,this.host.querySelector('#stage')||this.host)})):[]}
 destroy(){this.stopBands();for(const id of [...this.windows.keys()])this.close(id);this.menu.remove();this.root.remove()}
}

FullBodyCharts.front=18;
