export function plotBounds(metric,trial,range={}){
 const series=metric.series||[metric],starts=series.map(s=>s.time?.[0]).filter(Number.isFinite),ends=series.map(s=>s.time?.at(-1)).filter(Number.isFinite);
 const full={min:starts.length?Math.min(...starts):0,max:ends.length?Math.max(...ends):trial?.duration||1};
 const min=range.start&&range.start!=='full'?trial?.events?.[range.start]?.time:full.min,max=range.end&&range.end!=='full'?trial?.events?.[range.end]?.time:full.max;
 return Number.isFinite(min)&&Number.isFinite(max)&&max>min?{min,max}:full;
}
export function rangeControls(trial,metric,state,onChange){
 const root=document.createElement('div');root.className='floatingRange';
 for(const [key,label] of [['start','Start'],['end','End']]){const wrap=document.createElement('label');wrap.append(label);const select=document.createElement('select');select.dataset.rangeSide=key;select.setAttribute('aria-label',label+' of chart time window');select.add(new Option(key==='start'?'Signal start':'Signal end','full'));
  for(const [event,value] of Object.entries(trial.events||{}).filter(([,v])=>Number.isFinite(v.time)).sort((a,b)=>a[1].time-b[1].time))select.add(new Option(`${({pkh_time:'PKH',fp_10_time:'FC',fp_100_time:'FP',MER_time:'MER',BR_time:'BR',MIR_time:'MIR',contact_time:'Contact'})[event]||value.label} · ${value.time.toFixed(3)} s`,event));
  select.value=state[key]||'full';if(!select.value)select.value='full';wrap.append(select);root.append(wrap);
 }
 const error=document.createElement('small');error.className='rangeError';error.setAttribute('role','status');root.append(error);
 root.addEventListener('change',()=>{const start=root.querySelector('[data-range-side="start"]'),end=root.querySelector('[data-range-side="end"]'),full=plotBounds(metric,trial),min=start.value==='full'?full.min:trial.events[start.value]?.time,max=end.value==='full'?full.max:trial.events[end.value]?.time;
  const valid=Number.isFinite(min)&&Number.isFinite(max)&&max>min;error.textContent=valid?'':'Start must precede end; previous window retained.';start.setAttribute('aria-invalid',String(!valid));end.setAttribute('aria-invalid',String(!valid));if(valid){state.start=start.value;state.end=end.value;onChange()}
 });return root;
}
