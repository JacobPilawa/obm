// Only released event timestamps are annotated; no POI peak timing is invented.
const labels={pkh_time:'PKH',fp_10_time:'FC',fp_100_time:'FP',MER_time:'MER',BR_time:'BR',MIR_time:'MIR',contact_time:'Contact'};
const colors={pkh_time:'#2862a2',fp_10_time:'#008674',fp_100_time:'#1e9e80',MER_time:'#ad5c13',BR_time:'#c73327',MIR_time:'#7b4da6',contact_time:'#c73327'};
export function keypointEvents(trial,all=false){
 const main=trial?.entry.discipline==='pitching'?'BR_time':'contact_time';
 return Object.entries(trial?.events||{}).filter(([key,event])=>(all||key===main)&&Number.isFinite(event?.time)).sort((a,b)=>a[1].time-b[1].time).map(([key,event])=>({time:event.time,label:labels[key]||event.label||key,color:colors[key]||'#68737b'}));
}
