import {bandFor,cohortKey} from './cohort_band.js';
import {fullBodySpecs,legendValue} from './full_body_charts.js';
import {plotBounds} from './plot_range.js';
import {keypointEvents} from './chart_events.js';
import {drawChart} from './floating_plot.js';
import {sample} from './biomechanics.js';
import {alignedTime,REPLAY_COLORS} from './comparison.js';

// Export panels reuse the live chart renderer, without window controls or prose.
export function buildMovieKeypointCharts(snapshot,{trial,entries=[],soloGroups=[],groupsFor}){
 const charts=[];
 const add=(data,state,groups,color)=>{
  const view=state?.view;
  if(!state?.enabled||!state.selected||!view||![view.x,view.y,view.width,view.height].every(Number.isFinite)||view.width<40||view.height<70)return;
  const group=groups.find(item=>item.id===state.selected),metric=group?.metrics.find(item=>item.id===state.metricId);
  if(!metric)throw Error(`Could not reload the selected keypoint signal for ${data.entry.id}.`);
  const kind=data.entry.discipline==='pitching'?'Pitch':'Swing',name=data.entry.processed_key||data.entry.id.replace(/^.*processed:/,'');
  charts.push({data,metric,color,range:state.range||{},showEvents:!!state.showEvents,view:{...view},title:`${kind} ${name} · ${group.label}`,canvas:null});
 };
 if(snapshot?.comparison?.inViewer){
  for(const state of snapshot.comparison.entries||[]){const entry=entries.find(item=>item.id===state.id);if(entry&&state.enabled&&state.selected&&state.view)add(entry.data,state,groupsFor(entry),REPLAY_COLORS[entry.colorIndex].body)}
 }else if(snapshot?.solo)add(trial,snapshot.solo,soloGroups,'#176b93');
 const addFull=(data,state,color)=>{if(!state?.enabled)return;let specs;for(const window of state.fullBody||[]){const view=window.view;if(!view||![view.x,view.y,view.width,view.height].every(Number.isFinite)||view.width<40||view.height<70)continue;specs??=fullBodySpecs(data);const metric=specs.find(s=>s.id===window.chartId);if(!metric)continue;charts.push({data,metric,color,hidden:window.hidden||[],range:window.range||{},showEvents:window.showEvents,view:{...view},title:`${data.entry.processed_key||data.entry.id} · ${metric.title}`,canvas:null})}};
 addFull(trial,snapshot?.solo,'#176b93');for(const state of snapshot?.comparison?.entries||[]){const entry=entries.find(e=>e.id===state.id);if(entry)addFull(entry.data,state,REPLAY_COLORS[entry.colorIndex].body)}
 return charts;
}

function fitText(ctx,text,width){
 if(width<=0)return '';if(ctx.measureText(text).width<=width)return text;
 while(text.length&&ctx.measureText(text+'…').width>width)text=text.slice(0,-1);
 return text?text+'…':'';
}

// Fixed columns/row count depend on panel size and signal count, never values.
export function movieLegendLayout(width,count){const columns=width>=484?2:1,rows=Math.ceil(count/columns);return {columns,rows,rowHeight:20,height:rows*20+8}}
export function drawMovieLegend(ctx,chart,local,top,layout){
 const {x,width}=chart.view,padding=12,gap=14,columnWidth=(width-padding*2-gap*(layout.columns-1))/layout.columns;
 ctx.save();ctx.textAlign='left';ctx.textBaseline='middle';
 const valueWidth=76,swatchWidth=10;
 chart.metric.series.forEach((series,index)=>{
  const column=index%layout.columns,row=Math.floor(index/layout.columns),left=x+padding+column*(columnWidth+gap),y=top+10+row*layout.rowHeight,valueX=left+columnWidth-valueWidth;
  ctx.globalAlpha=chart.hidden?.includes(index)?0.38:1;
  ctx.fillStyle=series.color||chart.color;ctx.fillRect(left,y-1,swatchWidth,2);
  ctx.font='400 12px Inter, sans-serif';ctx.fillStyle='#43545e';ctx.fillText(fitText(ctx,series.label,valueX-left-swatchWidth-10),left+swatchWidth+5,y);
  ctx.font='700 12px Inter, sans-serif';ctx.fillStyle='#263740';ctx.fillText(fitText(ctx,legendValue(series,local,chart.metric.unit),valueWidth),valueX,y);
 });ctx.restore();
}

export function drawMovieKeypointCharts(ctx,charts,time,primary,sync){
 for(const chart of charts){
  const {metric,data,view,color}=chart,{x,y,width,height}=view,local=alignedTime(time,primary,data,sync),value=sample(metric,local);
  const current=metric.series?`${metric.series.length} signals · ${metric.unit}`:Number.isFinite(value)?`${value.toLocaleString(undefined,{maximumFractionDigits:metric.unit==='m'?3:1})} ${metric.unit}`:`— ${metric.unit}`;
  ctx.save();ctx.beginPath();ctx.roundRect(x,y,width,height,4);ctx.clip();ctx.fillStyle='rgba(255,255,255,.97)';ctx.fillRect(x,y,width,height);ctx.fillStyle=color;ctx.fillRect(x,y,width,3);
  ctx.textAlign='left';ctx.textBaseline='top';ctx.font='600 11px Inter, sans-serif';ctx.fillStyle='#263740';ctx.fillText(fitText(ctx,chart.title,width-20),x+10,y+10);
  ctx.font='600 12px Inter, sans-serif';const valueWidth=ctx.measureText(current).width;
  ctx.textAlign='right';ctx.fillStyle=color;ctx.fillText(current,x+width-10,y+29);
  ctx.textAlign='left';ctx.font='10px Inter, sans-serif';ctx.fillStyle='#43545e';ctx.fillText(fitText(ctx,metric.label||metric.title,width-valueWidth-32),x+10,y+30);
  const legend=metric.series?movieLegendLayout(width,metric.series.length):null,plotWidth=Math.max(1,width-16),plotHeight=Math.max(1,height-55-(legend?.height||0));
  if(!chart.canvas)chart.canvas=document.createElement('canvas');
  const pixelWidth=Math.round(plotWidth*2),pixelHeight=Math.round(plotHeight*2);
  if(chart.canvas.width!==pixelWidth)chart.canvas.width=pixelWidth;if(chart.canvas.height!==pixelHeight)chart.canvas.height=pixelHeight;
  drawChart(chart.canvas,metric,local,keypointEvents(data,chart.showEvents),color,plotBounds(metric,data,chart.range),{showLegend:false,hidden:chart.hidden||[],bands:metric.series?metric.series.map(s=>bandFor(data,cohortKey(metric.id,s.label))):[bandFor(data,`key:${metric.id}`)]});
  ctx.drawImage(chart.canvas,x+8,y+47,plotWidth,plotHeight);if(legend)drawMovieLegend(ctx,chart,local,y+height-legend.height-6,legend);ctx.restore();
  ctx.save();ctx.strokeStyle='#cbd4d9';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x+.5,y+.5,width-1,height-1,4);ctx.stroke();ctx.restore();
 }
}
