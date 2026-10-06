// Pure numerical helpers. Native sample times and null gaps are preserved.
export function sample(series, t) {
  if (!series?.time?.length || !Number.isFinite(t)) return null;
  const {time, values} = series;
  if (t < time[0] || t > time.at(-1)) return null;
  let lo = 0, hi = time.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (time[m] <= t) lo = m; else hi = m - 1; }
  if (time[lo] === t || lo === time.length - 1) return Number.isFinite(values[lo]) ? values[lo] : null;
  const a = values[lo], b = values[lo + 1], dt = time[lo + 1] - time[lo];
  // Never bridge a missing sample or a timestamp discontinuity.
  const typical = time.length > 1 ? (time.at(-1) - time[0]) / (time.length - 1) : 0;
  if (![a,b].every(Number.isFinite) || dt <= 0 || dt > typical * 1.6) return null;
  return a + (b - a) * (t - time[lo]) / dt;
}
export function derivative(time, values) {
  const typical = time.length > 1 ? (time.at(-1) - time[0]) / (time.length - 1) : 0;
  return values.map((v,i) => {
    if (i === 0 || i === values.length - 1 || ![values[i-1],v,values[i+1]].every(Number.isFinite)) return null;
    const h0 = time[i] - time[i-1], h1 = time[i+1] - time[i];
    if (h0 <= 0 || h1 <= 0 || Math.max(h0,h1) > typical * 1.6) return null;
    // Three-point derivative accommodates the rounded timestamps in the CSVs.
    return -h1/(h0*(h0+h1))*values[i-1] + (h1-h0)/(h0*h1)*v + h0/(h1*(h0+h1))*values[i+1];
  });
}
export function massKg(trial) {
  const m = trial.entry.discipline === 'pitching' ? trial.metadata?.session_mass_kg : trial.metadata?.session_mass_lbs * 0.45359237;
  return Number.isFinite(m) && m > 0 ? m : null;
}
export function phaseEvents(trial) {
  const start = trial.events?.fp_10_time?.time;
  const end = trial.events?.[trial.entry.discipline === 'pitching' ? 'BR_time' : 'contact_time']?.time;
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? {start,end} : null;
}
export function timeAxis(trial, mode = 'recording') {
  const phase = phaseEvents(trial), end = trial.events?.[trial.entry.discipline === 'pitching' ? 'BR_time' : 'contact_time']?.time;
  if (mode === 'phase' && phase) return {min:phase.start,max:phase.end,to:t=>100*(t-phase.start)/(phase.end-phase.start),label:'Phase (%) · foot contact → '+(trial.entry.discipline==='pitching'?'release':'contact')};
  if (mode === 'event' && Number.isFinite(end)) return {min:0,max:trial.duration,to:t=>(t-end)*1000,label:'Time from '+(trial.entry.discipline==='pitching'?'release':'contact')+' (ms)'};
  return {min:0,max:Math.max(trial.duration,.001),to:t=>t,label:'Recording time (s)'};
}
export function peakInWindow(series, start, end) {
  let peak = null, valid = 0, count = 0;
  for (let i=0;i<series.time.length;i++) {
    const t=series.time[i],v=series.values[i]; if(t<start||t>end)continue; count++;
    if(!Number.isFinite(v))continue;valid++;
    if(!peak||v>peak.value)peak={time:t,value:v};
  }
  return peak ? {...peak,coverage:count?valid/count:0} : null;
}
// Savitzky–Golay style local cubic derivative of XYZ, with a 15-frame window.
// Fit the position path, not its scalar speed. A centered fit has no causal lag;
// it cannot cross a missing point or a timestamp discontinuity. No edge extrapolation.
export function smoothPointVelocity(time, xyz, window=15) {
 const half=(window-1)/2, n=time.length;
 const output=xyz.map(()=>Array(n).fill(null));
 if(!Number.isInteger(half)||half<2||n<window)return output;
 const typical=(time.at(-1)-time[0])/(n-1), cache=new Map();
 if(!(typical>0))return output;
 for(let i=half;i<n-half;i++) {
  let first=i-half;
  if(first<0||first+window>n)continue;
  const indices=Array.from({length:window},(_,j)=>first+j);
  if(indices.some(k=>!xyz.every(v=>Number.isFinite(v[k])))||indices.slice(1).some(k=>time[k]<=time[k-1]||time[k]-time[k-1]>typical*1.6))continue;
  const u=indices.map(k=>(time[k]-time[i])/typical), key=u.map(v=>v.toFixed(7)).join(',');
  let weights=cache.get(key);
  if(!weights){
   const powers=u.map(v=>[1,v,v*v,v*v*v]);
   const matrix=Array.from({length:4},(_,r)=>[...Array.from({length:4},(_,c)=>powers.reduce((sum,a)=>sum+a[r]*a[c],0)),r===1?1:0]);
   let valid=true;
   for(let col=0;col<4;col++){
    let pivot=col;for(let r=col+1;r<4;r++)if(Math.abs(matrix[r][col])>Math.abs(matrix[pivot][col]))pivot=r;
    if(Math.abs(matrix[pivot][col])<1e-12){valid=false;break}
    [matrix[pivot],matrix[col]]=[matrix[col],matrix[pivot]];
    const scale=matrix[col][col];for(let c=col;c<=4;c++)matrix[col][c]/=scale;
    for(let r=0;r<4;r++)if(r!==col){const factor=matrix[r][col];for(let c=col;c<=4;c++)matrix[r][c]-=factor*matrix[col][c]}
   }
   if(!valid)continue;
   weights=powers.map(a=>a.reduce((sum,v,j)=>sum+v*matrix[j][4],0)/typical);cache.set(key,weights);
  }
  for(let axis=0;axis<xyz.length;axis++)output[axis][i]=indices.reduce((sum,k,j)=>sum+weights[j]*(xyz[axis][k]-xyz[axis][i]),0);
 }
 return output;
}
const batCache=new WeakMap();
export function batKinematics(trial) {
 if(batCache.has(trial))return batCache.get(trial);
 const g=trial.signals?.landmarks;if(!g)return null;
 const xyz=['x','y','z'].map(a=>g.series['sweet_spot_'+a]);if(xyz.some(x=>!x))return null;
 const rate=trial.motion?.rate||360;
 const magnitude=velocities=>g.time.map((_,i)=>velocities.every(v=>Number.isFinite(v[i]))?Math.hypot(...velocities.map(v=>v[i])):null);
 // Headline signal: differentiate the released XYZ at the released timestamps.
 // No filtering, grid snapping, POI scaling, point fitting or shape constraints.
 const velocities=xyz.map(v=>derivative(g.time,v)),rawSpeed=magnitude(velocities),speed=rawSpeed;
 // Optional diagnostic only: this never drives the headline or trail.
 const smoothSpeed=magnitude(smoothPointVelocity(g.time,xyz,15));
 const handle=['x','y','z'].map(a=>g.series['blast_hand_'+a]);
 const midpoint=handle.every(Boolean)?xyz.map((v,a)=>v.map((p,i)=>Number.isFinite(p)&&Number.isFinite(handle[a][i])?(p+handle[a][i])/2:null)):null;
 const midpointSpeed=midpoint?magnitude(smoothPointVelocity(g.time,midpoint,15)):null;
 const attack=speed.map((v,i)=>Number.isFinite(v)&&v>=1?Math.atan2(velocities[2][i],Math.hypot(velocities[0][i],velocities[1][i]))*180/Math.PI:null);
 const result={time:g.time,speed,rawSpeed,smoothSpeed,midpointSpeed,attack,reconstruction:{method:"Unfiltered three-point XYZ derivative at released timestamps",point:"Released sweet_spot"},
  smoothing:{method:'Continuous centered local cubic XYZ derivative',window:15,spanMs:14/rate*1000,point:'Released sweet_spot',contactWindow:'Continuous across contact'}};
 batCache.set(trial,result);return result;
}
// Visual filter only. The native reconstructed signal remains untouched.
// Positive Gaussian weights suppress sampling ripples without ringing.
export function batTrailColoring(time, nativeSpeed, start=-Infinity) {
 const sigma=.012,radius=3*sigma,n=time.length,typical=n>1?(time.at(-1)-time[0])/(n-1):0;
 const speed=nativeSpeed.map((v,i)=>{
  if(!Number.isFinite(v)||time[i]<start)return null;
  let sum=v,weight=1;
  for(const direction of [-1,1])for(let j=i+direction;j>=0&&j<n;j+=direction){
   const previous=j-direction,dt=Math.abs(time[j]-time[i]);
   if(dt>radius||time[j]<start||!Number.isFinite(nativeSpeed[j])||Math.abs(time[j]-time[previous])>typical*1.6)break;
   const w=Math.exp(-.5*(dt/sigma)**2);sum+=w*nativeSpeed[j];weight+=w;
  }
  return sum/weight;
 });
 const sorted=speed.filter(Number.isFinite).sort((a,b)=>a-b);
 if(!sorted.length)return null;
 const quantile=p=>{const k=(sorted.length-1)*p,i=Math.floor(k);return sorted[i]+(sorted[Math.min(i+1,sorted.length-1)]-sorted[i])*(k-i)};
 const low=quantile(.4),high=Math.max(low+1e-6,quantile(.95)),mid=(low+high)/2;
 const peakIndex=speed.reduce((best,v,i)=>Number.isFinite(v)&&(best<0||v>speed[best])?i:best,-1);
 // Every supported frame is drawn, including the slowest speeds in green.
 const first=speed.findIndex(Number.isFinite),last=speed.findLastIndex(Number.isFinite);
 const visible=speed.map(Number.isFinite);
 return {speed,visible,low,mid,high,peak:speed[peakIndex],first,last,sigmaMs:12};
}

// Integral from an exact event time. A missing interval makes the subsequent
// cumulative total unknown; restarting it would imply that the missing work was zero.
export function cumulativeIntegral(time,values,start){
 const out=Array(time.length).fill(null);
 if(!time.length||!Number.isFinite(start)||start<time[0]||start>time.at(-1))return out;
 let previous=sample({time,values},start),previousTime=start,sum=0;
 if(!Number.isFinite(previous))return out;
 const typical=time.length>1?(time.at(-1)-time[0])/(time.length-1):0;
 for(let i=0;i<time.length;i++){
  if(time[i]<start)continue;
  const dt=time[i]-previousTime,value=values[i];
  if(!Number.isFinite(value)||!Number.isFinite(dt)||dt<0||dt>typical*1.6)break;
  sum+=(previous+value)*dt/2;out[i]=sum;previous=value;previousTime=time[i];
 }
 return out;
}
