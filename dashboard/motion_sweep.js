import * as THREE from 'three';
import {sample,batTrailColoring} from './biomechanics.js';
import {combinedSweepScale,colorFraction} from './sweep_scale.js';
export {combinedSweepScale};
const finite=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
function armSweepColor(moment,peak){
 const ratio=peak>0?Math.max(0,Math.min(1,moment/peak)):0;
 const green=new THREE.Color('#259e50'),yellow=new THREE.Color('#e6bf37'),red=new THREE.Color('#c4382b');
 return ratio<=.5?green.lerp(yellow,ratio*2):yellow.lerp(red,(ratio-.5)*2);
}
export function createMotionSweep(trial,kinematics=null,momentMode='varus'){
 if(trial.entry.discipline==='hitting')return createBatSweep(trial,kinematics);
 const landmarks=trial.signals?.landmarks,moments=trial.signals?.forces_moments,values=moments?.series?.elbow_moment_y;
 if(trial.entry.discipline!=='pitching'||!landmarks?.time?.length||!moments?.time?.length||!values)return null;
 const pkh=trial.events?.pkh_time?.time,mir=trial.events?.MIR_time?.time,hasPhase=Number.isFinite(pkh)&&Number.isFinite(mir)&&mir>pkh;
 const mode=momentMode==='valgus'?'valgus':'varus',direction=mode==='valgus'?-1:1;
 const start=hasPhase?pkh:0,end=hasPhase?mir:trial.duration,momentSeries={time:moments.time,values},columns=landmarks.series;
 const point=(name,i)=>{const p=['x','y','z'].map(axis=>columns[name+'_'+axis]?.[i]);return finite(p)?p:null};
 const records=landmarks.time.map((t,i)=>{if(t<start||t>end)return null;const signed=sample(momentSeries,t),moment=Number.isFinite(signed)?Math.max(0,direction*signed):null,shoulder=point('shoulder_jc',i),elbow=point('elbow_jc',i),wrist=point('wrist_jc',i);return Number.isFinite(moment)&&shoulder&&elbow&&wrist?{t,moment,shoulder,elbow,wrist}:null});
 let peak=0;for(const record of records)if(record&&record.moment>peak)peak=record.moment;
 const positions=[],colors=[],vertexValues=[],drawTimes=[],drawCounts=[],typical=(landmarks.time.at(-1)-landmarks.time[0])/Math.max(1,landmarks.time.length-1);
 const append=(p,color,value)=>{positions.push(...p);colors.push(...color.toArray());vertexValues.push(value)};
 for(let i=1;i<records.length;i++){
  const prev=records[i-1],next=records[i];if(!prev||!next||next.t-prev.t>typical*1.6)continue;
  const before=armSweepColor(prev.moment,peak),after=armSweepColor(next.moment,peak);
  for(const [proximal,distal] of [['shoulder','elbow'],['elbow','wrist']]){
   const a=prev[proximal],b=prev[distal],c=next[proximal],d=next[distal];
   append(a,before,prev.moment);append(b,before,prev.moment);append(c,after,next.moment);
   append(b,before,prev.moment);append(d,after,next.moment);append(c,after,next.moment);
  }
  drawTimes.push(next.t);drawCounts.push(positions.length/3);
 }
 if(!positions.length)return null;
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:.6,depthWrite:false});
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.visible=false;geometry.setDrawRange(0,0);
 return {mesh,peak,start,end,hasPhase,drawTimes,drawCounts,kind:'pitching',momentMode:mode,vertexValues,ownScale:{low:0,high:peak},range:{low:Math.min(...vertexValues),high:Math.max(...vertexValues)}};
}
function createBatSweep(trial,kinematics){
 const landmarks=trial.signals?.landmarks;
 if(!landmarks?.time?.length||!kinematics?.speed?.length)return null;
 const columns=landmarks.series,point=(name,i)=>{const p=['x','y','z'].map(axis=>columns[`${name}_${axis}`]?.[i]);return finite(p)?p:null};
 const last=landmarks.time.length-1,coloring=batTrailColoring(landmarks.time,kinematics.speed,trial.events?.fp_10_time?.time??landmarks.time[0]);
 if(!coloring)return null;
 const green=new THREE.Color('#259e50'),yellow=new THREE.Color('#e6bf37'),red=new THREE.Color('#c4382b');
 const speedColor=v=>{const u=Math.max(0,Math.min(1,(v-coloring.low)/(coloring.high-coloring.low)));return u<.5?green.clone().lerp(yellow,u*2):yellow.clone().lerp(red,(u-.5)*2)};
 const records=landmarks.time.map((t,i)=>{
  const estimate=coloring.speed[i],speed=Number.isFinite(estimate)?estimate/.44704:null;
  const handle=point('blast_hand',i),sweetSpot=point('sweet_spot',i);
  return coloring.visible[i]&&Number.isFinite(speed)&&handle&&sweetSpot?{t,speed,handle,sweetSpot,color:speedColor(estimate)}:null;
 });
 const peak=coloring.peak/.44704;
 const positions=[],colors=[],vertexValues=[],drawTimes=[],drawCounts=[],typical=(landmarks.time.at(-1)-landmarks.time[0])/Math.max(1,last);
 const append=(p,color,value)=>{positions.push(...p);colors.push(...color.toArray());vertexValues.push(value)};
 for(let i=1;i<records.length;i++){
  const prev=records[i-1],next=records[i];if(!prev||!next||next.t-prev.t>typical*1.6)continue;
  const before=prev.color,after=next.color;
  append(prev.handle,before,prev.speed);append(prev.sweetSpot,before,prev.speed);append(next.handle,after,next.speed);
  append(prev.sweetSpot,before,prev.speed);append(next.sweetSpot,after,next.speed);append(next.handle,after,next.speed);
  drawTimes.push(next.t);drawCounts.push(positions.length/3);
 }
 if(!positions.length)return null;
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setDrawRange(0,0);
 const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:.6,depthWrite:false}));mesh.frustumCulled=false;mesh.visible=false;
 return {mesh,peak,drawTimes,drawCounts,kind:'hitting',vertexValues,ownScale:{low:coloring.low/.44704,high:coloring.high/.44704},range:{low:Math.min(...vertexValues),high:Math.max(...vertexValues)},colorSeries:{time:landmarks.time,values:coloring.speed},colorScale:{low:0,mid:coloring.high/2/.44704,high:coloring.high/.44704,greenEnd:100*coloring.low/coloring.high,yellowStop:100*coloring.mid/coloring.high}};
}

// Recolor existing geometry only: poses, filtered values and native signals stay
// identical when the comparison scale changes.
export function applySweepScale(sweep,shared=null){
 const scale=shared||sweep.ownScale,attribute=sweep.mesh.geometry.getAttribute('color');
 const green=new THREE.Color('#259e50'),yellow=new THREE.Color('#e6bf37'),red=new THREE.Color('#c4382b');
 sweep.vertexValues.forEach((v,i)=>{const u=colorFraction(v,scale),color=u<=.5?green.clone().lerp(yellow,u*2):yellow.clone().lerp(red,(u-.5)*2);attribute.setXYZ(i,color.r,color.g,color.b)});attribute.needsUpdate=true;
 sweep.sharedScale=!!shared;
 const low=shared?scale.low:0,high=scale.high,span=Math.max(1e-9,high-low);
 sweep.colorScale={low,mid:(low+high)/2,high,greenEnd:shared?0:100*scale.low/span,yellowStop:shared?50:100*((scale.low+high)/2)/span};
}
