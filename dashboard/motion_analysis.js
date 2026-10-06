import {sample,derivative,massKg} from './biomechanics.js';
const valid=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const midpoint=(a,b)=>valid(a)&&valid(b)?a.map((v,i)=>(v+b[i])/2):null;
export function trunkAxis(hips,shoulders){
 if(!valid(hips)||!valid(shoulders))return null;
 const delta=shoulders.map((v,i)=>v-hips[i]),length=Math.hypot(...delta);if(length<.15)return null;
 const direction=delta.map(v=>v/length);if(direction[2]<0)for(let i=0;i<3;i++)direction[i]*=-1;
 // Near-horizontal trunks have a distant/ill-conditioned floor intersection.
 const floor=direction[2]>.25?hips.map((v,i)=>v-direction[i]*hips[2]/direction[2]):null;
 return {origin:hips,shoulders,direction,floor:floor&&Math.hypot(floor[0]-hips[0],floor[1]-hips[1])<3?floor:null,tilt:Math.acos(Math.min(1,direction[2]))*180/Math.PI};
}
export function leadForceLabX(discipline,value){return Number.isFinite(value)?(discipline==='pitching'?-value:value):null}
export function brakingState(force,velocity){if(!Number.isFinite(force)||!Number.isFinite(velocity)||Math.abs(velocity)<.05)return 'direction only';if(Math.abs(force)<1)return 'negligible force';return force*velocity<0?'opposes COM motion':'aids COM motion'}
export function leadNames(trial){if(trial.entry.discipline==='pitching')return ['lead_hip','lead_knee_jc','lead_ankle_jc'];const l=trial.entry.side==='L'?'r':'l';return [l==='l'?'left_hip':'right_hip',l+'kjc',l+'ajc']}
const cache=new WeakMap();
export function motionAnalysis(trial){
 if(cache.has(trial))return cache.get(trial);
 const lm=trial.signals?.landmarks,pitch=trial.entry.discipline==='pitching',time=lm?.time||[],series=lm?.series||{};
 const xyz=name=>['x','y','z'].map(a=>series[name+'_'+a]);
 const has=name=>xyz(name).every(Boolean),at=(name,t)=>{const parts=xyz(name);if(parts.some(v=>!v))return null;const p=parts.map(values=>sample({time,values},t));return valid(p)?p:null};
 const com=has('centerofmass')?time.map((_,i)=>xyz('centerofmass').map(v=>v[i])):[],vx=has('centerofmass')?derivative(time,series.centerofmass_x):[];
 const velocity=trial.signals?.joint_velos,kneeKey=pitch?'lead_knee_velo_x':'lead_knee_angular_velocity_x',knee=velocity?.series[kneeKey],force=trial.signals?.force_plate,fx=force?.series.lead_force_x,bw=massKg(trial)?massKg(trial)*9.80665:null;
 const names=leadNames(trial),hipNames=pitch?['rear_hip','lead_hip']:['left_hip','right_hip'],shoulderNames=pitch?['shoulder_jc','glove_shoulder_jc']:['lsjc','rsjc'];
 const scalar=(table,key,t)=>table?.series[key]?sample({time:table.time,values:table.series[key]},t):null;
 const result={time,com,bw,available:{com:com.some(valid),comTrail:com.some(valid),axis:[...hipNames,...shoulderNames].every(has),braking:!!fx&&has(names[2]),knee:!!knee&&names.every(has)},point:at,
  at(t){const axis=trunkAxis(midpoint(...hipNames.map(n=>at(n,t))),midpoint(...shoulderNames.map(n=>at(n,t)))),rawForce=scalar(force,'lead_force_x',t),labForce=leadForceLabX(trial.entry.discipline,rawForce),speed=sample({time,values:vx},t),rate=scalar(velocity,kneeKey,t);
   return {com:at('centerofmass',t),vx:speed,axis,leg:names.map(n=>at(n,t)),force:labForce,rawForce,forceBW:bw&&Number.isFinite(labForce)?labForce/bw:null,braking:brakingState(labForce,speed),extension:Number.isFinite(rate)?-rate:null,flexion:scalar(trial.signals?.joint_angles,'lead_knee_angle_x',t)};
  }};cache.set(trial,result);return result;
}
