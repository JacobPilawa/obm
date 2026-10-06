// All colors are annotations of released signals or labeled calculations at reconstructed locations.
import {derivative,cumulativeIntegral} from './biomechanics.js';
const joint=(key,label,point,end)=>({key,label,point,end});
export const POWER_JOINTS=[
  joint('rear_knee','Rear knee','rear_knee_jc','rear_hip'),joint('lead_knee','Lead knee','lead_knee_jc','lead_hip'),
  joint('rear_hip','Rear hip','rear_hip','thorax_dist'),joint('lead_hip','Lead hip','lead_hip','thorax_dist'),
  joint('shoulder','Throwing shoulder','shoulder_jc','elbow_jc'),joint('elbow','Throwing elbow','elbow_jc','wrist_jc'),
  joint('glove_shoulder','Glove shoulder','glove_shoulder_jc','glove_elbow_jc'),joint('glove_elbow','Glove elbow','glove_elbow_jc','glove_wrist_jc')
];
const endpoint=(key,label,point,end)=>({key,label,point,end});
const ENDPOINTS=[
  endpoint('upper_arm_prox_seg_pwr','Upper arm · shoulder','shoulder_jc','elbow_jc'),endpoint('upper_arm_dist_seg_pwr','Upper arm · elbow','elbow_jc','shoulder_jc'),
  endpoint('forearm_prox_seg_pwr','Forearm · elbow','elbow_jc','wrist_jc'),endpoint('forearm_dist_seg_pwr','Forearm · wrist','wrist_jc','elbow_jc'),
  endpoint('glove_upper_arm_prox_seg_pwr','Glove upper arm · shoulder','glove_shoulder_jc','glove_elbow_jc'),endpoint('glove_upper_arm_dist_seg_pwr','Glove upper arm · elbow','glove_elbow_jc','glove_shoulder_jc'),
  endpoint('glove_forearm_prox_seg_pwr','Glove forearm · elbow','glove_elbow_jc','glove_wrist_jc'),endpoint('glove_forearm_dist_seg_pwr','Glove forearm · wrist','glove_wrist_jc','glove_elbow_jc'),
  endpoint('lead_thigh_prox_seg_pwr','Lead thigh · hip','lead_hip','lead_knee_jc'),endpoint('lead_thigh_dist_seg_pwr','Lead thigh · knee','lead_knee_jc','lead_hip'),
  endpoint('lead_shank_prox_seg_pwr','Lead shank · knee','lead_knee_jc','lead_ankle_jc'),endpoint('lead_shank_dist_seg_pwr','Lead shank · ankle','lead_ankle_jc','lead_knee_jc'),
  endpoint('rear_thigh_prox_seg_pwr','Rear thigh · hip','rear_hip','rear_knee_jc'),endpoint('rear_thigh_dist_seg_pwr','Rear thigh · knee','rear_knee_jc','rear_hip'),
  endpoint('rear_shank_prox_seg_pwr','Rear shank · knee','rear_knee_jc','rear_ankle_jc'),endpoint('rear_shank_dist_seg_pwr','Rear shank · ankle','rear_ankle_jc','rear_knee_jc'),
  endpoint('pelvis_leadhip_seg_pwr','Pelvis · lead hip','lead_hip','rear_hip'),endpoint('pelvis_rearhip_seg_pwr','Pelvis · rear hip','rear_hip','lead_hip'),
  endpoint('pelvis_thorax_seg_pwr','Pelvis · trunk','pelvis_center','thorax_dist'),
  endpoint('thorax_prox_seg_pwr','Thorax · lower','thorax_dist','thorax_prox'),endpoint('thorax_dist_seg_pwr','Thorax · throwing arm','shoulder_jc','thorax_prox'),endpoint('thorax_dist_glove_seg_pwr','Thorax · glove arm','glove_shoulder_jc','thorax_prox')
];
const WRISTS=[joint('wrist','Throwing wrist','wrist_jc','hand_jc'),joint('glove_wrist','Glove wrist','glove_wrist_jc','glove_hand_jc')];
const ANKLES=[joint('rear_ankle','Rear ankle','rear_ankle_jc','rear_knee_jc'),joint('lead_ankle','Lead ankle','lead_ankle_jc','lead_knee_jc')];
const MOMENTS=[...POWER_JOINTS,...WRISTS,...ANKLES];
const ANGULAR=[...POWER_JOINTS,...WRISTS,joint('pelvis','Pelvis','pelvis_center','thorax_dist'),joint('torso','Torso','torso_center','thorax_dist')];
const GRF=[joint('rear_force','Rear foot','rear_ankle_jc','rear_knee_jc'),joint('lead_force','Lead foot','lead_ankle_jc','lead_knee_jc')];
const hittingJoints=side=>{
 const lead=side==='L'?'r':'l',rear=side==='L'?'l':'r';
 const make=(role,letter)=>[
  joint(`${role}_knee_angular_velocity`,`${role==='lead'?'Lead':'Rear'} knee`,`${letter}kjc`,letter==='l'?'left_hip':'right_hip'),
  joint(`${role}_hip_angular_velocity`,`${role==='lead'?'Lead':'Rear'} hip`,letter==='l'?'left_hip':'right_hip','thorax_dist'),
  joint(`${role}_shoulder_angular_velocity`,`${role==='lead'?'Lead':'Rear'} shoulder`,`${letter}sjc`,`${letter}ejc`),
  joint(`${role}_elbow_angular_velocity`,`${role==='lead'?'Lead':'Rear'} elbow`,`${letter}ejc`,`${letter}wjc`),
  joint(`${role}_wrist_angular_velocity`,`${role==='lead'?'Lead':'Rear'} wrist`,`${letter}wjc`,`${letter}hjc`)
 ];
 return [...make('lead',lead),...make('rear',rear),joint('pelvis_angular_velocity','Pelvis','pelvis_center','thorax_dist'),joint('torso_angular_velocity','Torso','torso_center','thorax_prox')];
};
const hittingForces=side=>{
 const lead=side==='L'?'r':'l',rear=side==='L'?'l':'r';
 return [joint('rear_force','Rear foot',`${rear}ajc`,`${rear}kjc`),joint('lead_force','Lead foot',`${lead}ajc`,`${lead}kjc`)];
};
export const MAX_OVERLAY_ITEMS=Math.max(POWER_JOINTS.length,ENDPOINTS.length,MOMENTS.length,ANGULAR.length,GRF.length,hittingJoints('R').length);
export const POWER_MODES={
 generated:{label:'Joint generation / absorption',unit:'W',table:'energy_flow',items:POWER_JOINTS,palette:'signed',note:'Published energy_generated signal. Positive means joint generation; negative means absorption. W is inferred from agreement with released joule totals.'},
 jfp:{label:'Joint-force transfer power',unit:'W',table:'energy_flow',items:POWER_JOINTS,palette:'signed',note:'Published energy_transfer_jfp signal. Sign indicates the published value, not a verified anatomical flow direction. W is inferred.'},
 stp:{label:'Segment-torque transfer power',unit:'W',table:'energy_flow',items:POWER_JOINTS,palette:'signed',note:'Published energy_transfer_stp signal. Sign indicates the published value, not a verified anatomical flow direction. W is inferred.'},
 work:{label:'Net joint work since PKH',unit:'J',table:'energy_flow',items:POWER_JOINTS,palette:'signed',note:'Dashboard integral of energy_generated from peak knee height; positive is net generation, negative net absorption. Integrates from the exact event timestamp; a missing interval makes subsequent cumulative work unavailable.'},
 moment:{label:'Joint moment magnitude',unit:'N·m',table:'forces_moments',items:MOMENTS,palette:'sweep',note:'Dashboard vector magnitude of published x/y/z joint moments. Green is zero, yellow is half the color limit, and red is the limit. Hip and shoulder use the distal thigh/upper-arm reference. Magnitude is not ligament load.'},
 angular:{label:'Angular velocity magnitude',unit:'°/s',table:'joint_velos',items:ANGULAR,palette:'positive',note:'Dashboard vector magnitude of published x/y/z angular-velocity components. Pelvis and torso are placed at schematic center points.'},
 grf:{label:'Ground reaction force magnitude',unit:'N',table:'force_plate',items:GRF,palette:'positive',note:'Dashboard vector magnitude of the processed rear/lead ground reaction force components in force_plate.csv. Color appears near each foot; the green 3D arrows separately show individual C3D force plates.'},
 grfVertical:{label:'Vertical ground reaction force',unit:'N',table:'force_plate',items:GRF,palette:'signed',note:'Processed rear/lead force_z component from force_plate.csv. Positive is upward in the pitching coordinate system. The green 3D arrows use individual C3D force plates.'},
 endpoint:{label:'Segment-endpoint power',unit:'W',table:'energy_flow',items:ENDPOINTS,palette:'signed',note:'Published proximal/distal segment power. Short sleeves mark the corresponding segment end; this does not show power flowing along the bone. Pelvis/thorax endpoint placement is schematic. W is inferred.'}
};
export const overlayItems=(mode,state)=>state?.configs?.[mode]?.items||POWER_MODES[mode]?.items||POWER_JOINTS;
const finite=v=>Number.isFinite(v);
const nearest=(times,t)=>{let lo=0,hi=times.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(times[m]<=t)lo=m;else hi=m-1}return lo<times.length-1&&Math.abs(times[lo+1]-t)<Math.abs(times[lo]-t)?lo+1:lo};
const mag=(series,prefix,i)=>{const a=['x','y','z'].map(axis=>series[`${prefix}_${axis}`]?.[i]);return a.every(finite)?Math.hypot(...a):null};
const momentPrefix={rear_knee:'rear_knee_moment',lead_knee:'lead_knee_moment',rear_hip:'rear_hip_rear_thigh_moment',lead_hip:'lead_hip_lead_thigh_moment',shoulder:'shoulder_upper_arm_moment',elbow:'elbow_moment',glove_shoulder:'glove_shoulder_glove_upper_arm_moment',glove_elbow:'glove_elbow_moment',wrist:'wrist_moment',glove_wrist:'glove_wrist_moment',rear_ankle:'rear_ankle_moment',lead_ankle:'lead_ankle_moment'};
const percentile=(values,p)=>{if(!values.length)return 1;values.sort((a,b)=>a-b);return Math.max(values[Math.floor((values.length-1)*p)],1e-9)};

export function buildPowerOverlay(trial){
 const discipline=trial?.entry?.discipline;
 if(!['pitching','hitting'].includes(discipline)||!trial.signals?.landmarks)return null;
 const hitting=discipline==='hitting',side=trial.entry.side;
 const phaseStart=hitting?0:(trial.events?.pkh_time?.time??0);
 const joints=hitting?hittingJoints(side):null,forces=hitting?hittingForces(side):null;
 const configs=hitting?{
  hittingAngular:{label:'Joint angular speed',unit:'°/s',table:'joint_velos',items:joints,palette:'positive',note:'Dashboard vector magnitude of released x/y/z joint angular-velocity components. Lead and rear locations follow the hitter’s stance. Pelvis and torso are shown at schematic centers.'},
  jointSpeed:{label:'Joint-center linear speed',unit:'m/s',table:'landmarks',items:joints,palette:'positive',note:'Dashboard three-point derivative of released joint-center x/y/z positions, then vector magnitude. This is movement speed of the joint center, not angular velocity, power, or energy flow. Pelvis and torso use the midpoint of the two hip and two thorax landmarks.'},
  grf:{...POWER_MODES.grf,items:forces,note:'Dashboard vector magnitude of processed rear/lead ground reaction force components in force_plate.csv. Values are drawn near the corresponding foot, not at the ankle joint. The 3D arrows separately show individual C3D force plates.'},
  grfVertical:{...POWER_MODES.grfVertical,items:forces,note:'Processed rear/lead vertical ground reaction force from force_plate.csv. Positive is upward in the hitting lab coordinate system. Values are drawn near each foot; the 3D arrows use individual C3D force plates.'}
 }:POWER_MODES;
 const state={series:{},times:{},edges:{},scales:{},localScales:{},available:{},configs,phaseLabel:hitting?'across this swing':'after peak knee height'};
 for(const [mode,config] of Object.entries(configs)){
  if(mode==='work'&&!Number.isFinite(trial.events?.pkh_time?.time))continue;
  const table=trial.signals?.[config.table];if(!table?.time?.length)continue;
  const data={};for(const item of config.items){let values;
   if(mode==='generated'||mode==='work'||mode==='jfp'||mode==='stp'){const suffix=mode==='generated'||mode==='work'?'energy_generated':mode==='jfp'?'energy_transfer_jfp':'energy_transfer_stp';values=table.series[`${item.key}_${suffix}`];if(mode==='work'&&values)values=cumulativeIntegral(table.time,values,phaseStart)}
   else if(mode==='endpoint')values=table.series[item.key];
   else if(mode==='grfVertical')values=table.series[`${item.key}_z`];
   else if(mode==='jointSpeed'){
    const centers=item.key.startsWith('pelvis_')?['left_hip','right_hip']:item.key.startsWith('torso_')?['thorax_dist','thorax_prox']:[item.point];
    const coordinates=['x','y','z'].map(axis=>table.time.map((_,i)=>{
     const parts=centers.map(name=>table.series[`${name}_${axis}`]?.[i]);return parts.every(finite)?parts.reduce((sum,v)=>sum+v,0)/parts.length:null;
    }));
    const velocities=coordinates.map(points=>derivative(table.time,points));
    values=table.time.map((_,i)=>velocities.every(axis=>finite(axis[i]))?Math.hypot(...velocities.map(axis=>axis[i])):null);
   }
   else {const prefix=mode==='moment'?momentPrefix[item.key]:mode==='angular'?item.key+'_velo':item.key;values=prefix?table.time.map((_,i)=>mag(table.series,prefix,i)):null}
   if(values?.some(finite))data[item.key]=values;
  }
  if(!Object.keys(data).length)continue;
  const edges={};for(const [key,values] of Object.entries(data)){
   let first=0,last=values.length-1;
   while(first<values.length&&!finite(values[first]))first++;
   while(last>=first&&!finite(values[last]))last--;
   if(first<values.length)edges[key]={first,last};
  }
  state.series[mode]=data;state.times[mode]=table.time;state.edges[mode]=edges;state.available[mode]=true;
  const magnitudes=[],localScales={};
  for(const [key,values] of Object.entries(data)){
   const local=[];
   for(let i=0;i<values.length;i++)if(table.time[i]>=phaseStart&&finite(values[i])){
    const magnitude=Math.abs(values[i]);magnitudes.push(magnitude);local.push(magnitude);
   }
   localScales[key]=percentile(local,.9);
  }
  state.scales[mode]=percentile(magnitudes,.9);
  state.localScales[mode]=localScales;
 }
 return Object.keys(state.available).length?state:null;
}
export function powerValues(state,mode,time){
 const times=state?.times[mode],data=state?.series[mode];if(!times?.length||!data||!finite(time))return {};
 const i=time<=times[0]?0:time>=times.at(-1)?times.length-1:nearest(times,time),out={};
 for(const [key,values] of Object.entries(data)){
  const edge=state.edges?.[mode]?.[key];
  out[key]=mode==='work'?(time<times[0]||time>times.at(-1)?null:values[i]):!edge?null:i<edge.first?values[edge.first]:i>edge.last?values[edge.last]:values[i];
 }
 return out;
}
