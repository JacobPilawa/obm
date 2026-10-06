import {massKg,batKinematics,derivative} from './biomechanics.js';
// Chart definitions preserve the release's coordinate frames and sample times.
export const EVENT_SHORT={pkh_time:'PKH',fp_10_time:'FC',fp_100_time:'FP',MER_time:'MER',BR_time:'BR',MIR_time:'MIR',contact_time:'CONTACT'};
const COLORS=['#176b93','#c75b36','#4c9364','#815fa5','#bb8b25','#a84e79'];
const LABELS={joint_angles:'Joint angles',joint_velos:'Angular velocities',force_plate:'Processed ground reaction force',forces_moments:'Joint kinetics',landmarks:'Calculated landmarks',energy_flow:'Energy flow'};
function unitFor(table,key){if(table==='joint_angles')return 'deg';if(table==='joint_velos')return 'deg/s';if(table==='force_plate')return 'N';if(table==='landmarks')return 'm';if(table==='forces_moments')return key.includes('_moment_')?'N·m':'N';return 'unit not stated';}
function lookup(trial,table,key,label,color){const group=trial.signals?.[table];const values=group?.series?.[key];return values?{label:label||key.replaceAll('_',' '),values,time:group.time,color:color||COLORS[0]}:null;}
function norm(trial,table,stem,label){const g=trial.signals?.[table];if(!g)return null;const x=g.series[stem+'_x'],y=g.series[stem+'_y'],z=g.series[stem+'_z'];if(!x||!y||!z)return null;return {label,values:x.map((v,i)=>[v,y[i],z[i]].every(Number.isFinite)?Math.hypot(v,y[i],z[i]):null),time:g.time};}
function absComponent(trial,table,key,label){const s=lookup(trial,table,key,label);return s&&{...s,values:s.values.map(v=>Number.isFinite(v)?Math.abs(v):null)};}
const CHART_NOTES={
 axial_angles:'Separate published pelvis and torso segment angles.',
 torso_pelvis_separation:'Published relative joint angle, not a subtraction calculated from the two segment traces.',
 hitting_sequence:'Combines different speed measures. Compare when peaks occur, not their heights.',
 grf_resultant:'Calculated from the processed rear/lead ground reaction force X, Y and Z components.',
 grf_bw:'Vertical ground reaction force divided by body weight.',
 lead_force_bw:'Processed lead-leg ground reaction force divided by body weight; signs show direction.',
 pelvis_total_speed:'Calculated from X, Y and Z angular velocities.',
 torso_total_speed:'Calculated from X, Y and Z angular velocities.',
 upper_chain_speed:'Calculated from X, Y and Z angular velocities.',
 bat_speed:'Reconstructed bat speed = magnitude of the unfiltered three-point derivative of released sweet_spot XYZ at native CSV timestamps. No smoothing, timestamp snapping, point fitting, POI calibration, scaling, monotonic constraints or peak/contact adjustment. Endpoints and gaps lack derivative support. Published contact/peak speeds are reference values only; Blast is a separate sensor.',
 bat_speed_smooth:'Optional diagnostic: resultant of a centered 15-frame cubic XYZ derivative at released timestamps. This smoothed estimate is separate from the native headline speed and trail. No published-speed adjustments. Missing support remains missing.',
 bat_midpoint_speed:'Inferred speed at the midpoint between blast_hand and sweet_spot—the center of the rendered cylinder. It is a different bat point and is not comparable to the published sweet-spot speed POIs.',
 bat_speed_raw:'Diagnostic only: unsmoothed three-point XYZ derivative on the native 360 Hz grid. Small source-position step artifacts are amplified into speed ripples. No POI calibration.',
 bat_attack:'Sweet-spot motion direction from the same unfiltered native XYZ derivative as reconstructed bat speed. This is an inferred direction, not the published attack-angle POI.',
 com_velocity:'Estimated from center-of-mass position over time.',
 arm_moments:'Modelled joint moments do not directly measure ligament force.',
 elbow_medial_component:'This shows one force direction, not total elbow force.'
};
function spec(id,title,unit,layer,source,items,note='',focus=''){const series=items.filter(Boolean).map((x,i)=>({...x,color:x.chartColor||COLORS[i%COLORS.length]}));return series.length?{id,title,unit,layer,source,series,note:CHART_NOTES[id]||note,focus}:null;}
export function buildQuantities(trial,{includePublished=true}={}){
 const pitch=trial.entry.discipline==='pitching',out=[];const put=x=>{if(x)out.push(x)};
 const a=(key,label)=>lookup(trial,'joint_angles',key,label),v=(key,label)=>lookup(trial,'joint_velos',key,label),f=(key,label)=>lookup(trial,'force_plate',key,label),m=(key,label)=>lookup(trial,'forces_moments',key,label);
 const paint=(series,color)=>series&&({...series,chartColor:color});
 const inverse=(series,label,color)=>series&&{...series,label:label||series.label,chartColor:color,values:series.values.map(value=>Number.isFinite(value)?-value:null)};
 if(pitch){
  put(spec('report_arm_positions','Joint Kinematics · Throwing Arm','deg','core','Released joint_angles.csv; shoulder Y shown as released',[
   paint(a('elbow_angle_x','Elbow flexion'),'#18833d'),paint(a('shoulder_angle_z','Shoulder external rotation'),'#2857d9'),
   paint(a('shoulder_angle_y','Shoulder abduction'),'#7c449a'),paint(a('shoulder_angle_x','Horizontal abduction'),'#c53635'),paint(a('wrist_angle_x','Wrist extension'),'#8b8420')
  ],'Shoulder Y is shown as released; its positive elevation values agree with shoulder_abduction_fp in the POI table. The README sign table differs.','shoulder'));
  put(spec('report_lower_positions','Joint Kinematics · Torso and Lower Body','deg','core','Released joint_angles.csv',[
   paint(a('pelvis_angle_z','Pelvis rotation'),'#8b4fa6'),paint(a('torso_angle_z','Torso rotation'),'#c84232'),paint(a('torso_pelvis_angle_z','Hip–shoulder separation'),'#3862d4'),paint(a('torso_angle_y','Lateral trunk tilt'),'#999126'),paint(a('lead_knee_angle_x','Lead knee flexion'),'#278e93')
  ],'Lateral tilt uses the published glove-side-positive convention.','leadKnee'));
  const velocityChain=[paint(v('pelvis_velo_z','Pelvis rotation'),'#8b4fa6'),paint(v('torso_velo_z','Torso rotation'),'#c84232'),
   inverse(v('elbow_velo_x','Elbow extension'),'Elbow extension','#18833d'),
   inverse(v('shoulder_velo_z','Arm internal rotation'),'Arm internal rotation','#2857d9'),
   inverse(v('lead_knee_velo_x','Lead knee extension'),'Lead knee extension','#278e93')];
  put(spec('report_sequence','Kinematic Sequencing','deg/s','core','Released joint_velos.csv; extension/internal signs reversed',velocityChain,
   'Extension and internal-rotation curves are sign-reversed published components.','torso'));
  const chain=spec('report_velocity_chain','Joint Angular Velocity Chain · Foot Plant to Release','deg/s','core','Released joint_velos.csv; extension/internal signs reversed',velocityChain,
   'Same five published components as Kinematic Sequencing, shown from foot plant to ball release.','torso');
  if(chain){chain.plotWindow={start:'fp_100_time',end:'BR_time'};put(chain)}
 }
 put(spec('axial_angles','Pelvis and torso rotation (absolute)','deg','core','Published joint angles',[a('pelvis_angle_z','Pelvis axial rotation'),a('torso_angle_z','Torso axial rotation')],'Z rotation about each segment’s published coordinate convention.','torso'));
 if(pitch){
  put(spec('shoulder_er','Shoulder external rotation','deg','core','Published joint angle',[a('shoulder_angle_z','Throwing shoulder ER')],'Humeral axial external/internal rotation; distinct from torso axial rotation.','shoulder'));
  put(spec('scap_load','Scap load · shoulder horizontal abduction','deg','derived','Published joint angle',[a('shoulder_angle_x','Horizontal abduction')],'','shoulderHorizontal'));
  put(spec('knee_flexion','Lead and rear knee flexion','deg','core','Published joint angles',[a('lead_knee_angle_x','Lead knee'),a('rear_knee_angle_x','Rear knee')],'Positive values are flexion in the released pitching convention.','leadKnee'));
  put(spec('axial_velocities','Pelvis and torso rotation speed','deg/s','core','Published angular velocities',[v('pelvis_velo_z','Pelvis axial velocity'),v('torso_velo_z','Torso axial velocity')],'Signed Z components; peak ordering is visible without conflating global arm speed.','torso'));
  put(spec('arm_velocities','Throwing arm angular velocity','deg/s','core','Published angular velocities',[v('elbow_velo_x','Elbow flexion/extension'),v('shoulder_velo_z','Shoulder external/internal rotation')],'Different joint axes; compare event timing, not raw magnitude.','elbow'));
  put(spec('arm_moments','Elbow and shoulder moments','N·m','core','Published joint moments',[m('elbow_moment_y','Elbow varus/valgus'),m('shoulder_upper_arm_moment_z','Shoulder internal/external rotation')],'Internal moments in the released local frames. Not ligament strain.','elbow'));
 }else{
  put(spec('hitting_sequence','Rotation sequence (estimate)','deg/s','core','Mixed published and calculated views',[
    absComponent(trial,'joint_velos','pelvis_angular_velocity_z','Pelvis axial speed'),
    absComponent(trial,'joint_velos','torso_angular_velocity_z','Torso axial speed'),
    norm(trial,'joint_velos','lead_shoulder_global_angular_velocity','Lead shoulder global speed'),
    norm(trial,'joint_velos','lead_hand_global_angular_velocity','Lead hand global speed')
  ],'Exploratory sequence proxy: absolute axial Z speed for pelvis/torso, 3D global angular-speed magnitude for shoulder/hand. Different definitions; inspect peaks and timing cautiously.','torso'));
  put(spec('knee_flexion','Lead and rear knee flexion','deg','core','Published joint angles',[a('lead_knee_angle_x','Lead knee'),a('rear_knee_angle_x','Rear knee')],'Positive values are flexion in the released hitting convention.','leadKnee'));
  put(spec('axial_velocities','Pelvis and torso rotation speed','deg/s','core','Published angular velocities',[v('pelvis_angular_velocity_z','Pelvis axial velocity'),v('torso_angular_velocity_z','Torso axial velocity')],'Signed Z components in the released conventions.','torso'));
  put(spec('upper_chain_speed','Lead shoulder and hand angular speed','deg/s','core','Calculated vector magnitudes',[norm(trial,'joint_velos','lead_shoulder_global_angular_velocity','Lead shoulder global'),norm(trial,'joint_velos','lead_hand_global_angular_velocity','Lead hand global')],'sqrt(x²+y²+z²) of published global angular-velocity components; a view of sequencing, not linear bat speed.','shoulder'));
 }
 put(spec('grf_resultant','Ground reaction force magnitude','N','core','Calculated vector magnitude',[norm(trial,'force_plate','rear_force','Rear foot'),norm(trial,'force_plate','lead_force','Lead foot')],'sqrt(Fx²+Fy²+Fz²) from processed rear/lead ground reaction force at its native 1,080 Hz.'));
 put(spec('grf_vertical','Vertical ground reaction force','N','derived','Published processed ground reaction force',[f('rear_force_z','Rear foot vertical'),f('lead_force_z','Lead foot vertical')],'Processed vertical ground reaction force components.'));
 put(spec('pelvis_total_speed','Pelvis total angular speed','deg/s','derived','Calculated vector magnitude',[norm(trial,'joint_velos',pitch?'pelvis_velo':'pelvis_angular_velocity','Pelvis total speed')],'sqrt(ωx²+ωy²+ωz²); differs from signed axial Z velocity.','torso'));
 put(spec('torso_total_speed','Torso total angular speed','deg/s','derived','Calculated vector magnitude',[norm(trial,'joint_velos',pitch?'torso_velo':'torso_angular_velocity','Torso total speed')],'sqrt(ωx²+ωy²+ωz²); differs from signed axial Z velocity.','torso'));
 if(pitch){
  put(spec('shoulder_er_speed','Shoulder external/internal rotation speed','deg/s','derived','Published joint component',[v('shoulder_velo_z','Shoulder axial angular velocity')],'Positive is external rotation in the released convention.','shoulder'));
  put(spec('elbow_flexion','Throwing elbow flexion','deg','derived','Published joint component',[a('elbow_angle_x','Elbow flexion')],'Published anatomical flexion, not the angle between three displayed joint centers.','elbow'));
  put(spec('torso_pelvis_separation','Torso–pelvis rotation (relative)','deg','derived','Published joint component',[a('torso_pelvis_angle_z','Hip–shoulder separation')],'The released relative rotation component.','torso'));
  put(spec('lead_knee_velocity','Lead knee flexion velocity','deg/s','derived','Published joint component',[v('lead_knee_velo_x','Lead knee')],'Signed flexion/extension velocity.','leadKnee'));
  put(spec('elbow_medial_component','Elbow medial/lateral force component','N','derived','Published joint force component',[m('elbow_force_x','Lateral (+), medial (−)')],'A directional internal joint-force component; not total elbow force or direct UCL load.','elbow'));
 }else{
  put(spec('hitting_shoulder_rotation','Lead and rear shoulder axial rotation','deg','derived','Published joint angles',[a('lead_shoulder_angle_z','Lead shoulder'),a('rear_shoulder_angle_z','Rear shoulder')],'External (+) / internal (−) rotation in each shoulder’s published frame.','shoulder'));
  put(spec('hitting_elbow_flexion','Lead and rear elbow flexion','deg','derived','Published joint angles',[a('lead_elbow_angle_x','Lead elbow'),a('rear_elbow_angle_x','Rear elbow')],'Published flexion (+) / extension (−); focus rays are geometric locators.','elbow'));
 }
 const mass=massKg(trial),bw=mass?mass*9.80665:null;
 const scaled=(series,scale)=>series&&({...series,values:series.values.map(v=>Number.isFinite(v)?v/scale:null)});
 put(spec('grf_directional','Lead-leg ground reaction force components','N','core','Published processed ground reaction force',[f('lead_force_x',pitch?'X · braking / posterior (+)':'X · toward pitcher (+)'),f('lead_force_y','Y · source convention'),f('lead_force_z','Z · upward (+)')],'Direction matters: a resultant cannot distinguish horizontal braking from vertical support. Signs follow the discipline’s released ground reaction force convention.'));
 if(bw){
  put(spec('grf_bw','Vertical ground reaction force / bodyweight','BW','core','Calculated Fz / (mass × g)',[scaled(f('rear_force_z','Rear foot vertical'),bw),scaled(f('lead_force_z','Lead foot vertical'),bw)],`Session mass ${mass.toFixed(1)} kg; g = 9.80665 m/s². 1 BW is the athlete’s static weight, not a performance target.`));
  put(spec('lead_force_bw','Lead-leg ground reaction force / bodyweight','BW','derived','Calculated ground reaction force / (mass × g)',[scaled(f('lead_force_x','X'),bw),scaled(f('lead_force_y','Y'),bw),scaled(f('lead_force_z','Z'),bw)],'Signed processed ground reaction force components divided by session bodyweight. Compare timing and direction as well as amplitude.'));
 }
 put(spec('torso_posture','Torso flexion and lateral tilt','deg','core','Published joint angles',[a('torso_angle_x',pitch?'Flexion (+) / extension (−)':'Extension (+) / flexion (−)'),a('torso_angle_y',pitch?'Glove-side (+) lateral tilt':'Rear-leg (+) lateral tilt')],'These are different anatomical components. Pitching and hitting use different signs for torso flexion.','torso'));
 if(pitch)put(spec('shoulder_abduction','Shoulder Y angle','deg','derived','Published joint component',[a('shoulder_angle_y','Shoulder Y angle')],'Released values are shown without sign reversal. Positive values agree with shoulder_abduction_fp; the README sign table describes a different sign.','shoulder'));
 if(!pitch){
  put(spec('torso_pelvis_separation','Torso–pelvis rotation (relative)','deg','core','Published relative joint angle',[a('torso_pelvis_angle_z','Torso relative to pelvis')],'Released relative Z rotation; not subtraction of two global Euler angles. Positive: torso toward mound, pelvis toward catcher.','torso'));
  put(spec('lead_knee_velocity','Lead knee flexion velocity','deg/s','derived','Published joint component',[v('lead_knee_angular_velocity_x','Lead knee')],'Negative velocity indicates extension.','leadKnee'));
  const bat=batKinematics(trial);
  if(bat){
   const mph=values=>values.map(v=>Number.isFinite(v)?v/.44704:null);
   const references=[],contactTime=trial.events?.contact_time?.time;
   if(Number.isFinite(trial.poi?.bat_speed_mph_max_x))references.push({label:'Published peak · scalar reference, time unknown',time:[bat.time[0],trial.duration],values:[trial.poi.bat_speed_mph_max_x,trial.poi.bat_speed_mph_max_x],chartColor:'#c4382b',dash:[6,4],staticReference:true});
   if(Number.isFinite(contactTime))for(const [key,label,color]of[['bat_speed_mph_contact_x','Published contact · motion capture','#c4382b'],['blast_bat_speed_mph_x','Published contact · Blast sensor','#823b91']])if(Number.isFinite(trial.poi?.[key]))references.push({label,time:[contactTime],values:[trial.poi[key]],chartColor:color,marker:key.startsWith('blast')?'cross':'circle',staticReference:true});
   put({...spec('bat_speed','Reconstructed bat speed','mph','core','Native sweet-spot XYZ position derivative',[{label:'Reconstructed · native XYZ derivative',time:bat.time,values:mph(bat.speed)},...references]),note:CHART_NOTES.bat_speed+' Dashed reference and contact symbols are published scalars, not time-series measurements.'});
   put(spec('bat_speed_smooth','Inferred sweet-spot speed · independent','mph','derived','Calculated local cubic XYZ fit',[{label:'Smoothed · no POI calibration',time:bat.time,values:mph(bat.smoothSpeed)}]));
   if(bat.midpointSpeed)put(spec('bat_midpoint_speed','Inferred cylinder-midpoint speed','mph','derived','Calculated local cubic midpoint XYZ fit',[{label:'Cylinder midpoint · different bat point',time:bat.time,values:mph(bat.midpointSpeed)}]));
   put(spec('bat_speed_raw','Raw derivative · diagnostic','mph','derived','Calculated from released landmarks',[{label:'Unconstrained derivative',time:bat.time,values:mph(bat.rawSpeed)}]));
   put(spec('bat_attack','Inferred sweet-spot path elevation','deg','derived','Calculated from released landmarks',[{label:'Path elevation',time:bat.time,values:bat.attack}],'atan2(vertical velocity, horizontal speed). Upward positive; hidden below 1 m/s. Exploratory attack-angle estimate, not the vendor POI definition.'));
  }
 }
 const lm=trial.signals?.landmarks;
 if(lm?.series.centerofmass_x)put(spec('com_velocity','Center-of-mass targetward velocity','m/s','derived','Calculated position derivative',[{label:pitch?'Toward home (+)':'Toward mound (+)',time:lm.time,values:derivative(lm.time,lm.series.centerofmass_x)}],'Three-point derivative of released COM X; no extra smoothing. Inspect its change after foot plant alongside knee extension.'));
 if(!includePublished)return out;
 for(const [table,g] of Object.entries(trial.signals||{}))for(const key of Object.keys(g.series)){
  if(key.endsWith('_time'))continue;
  put(spec(`published:${table}:${key}`,key.replaceAll('_',' '),unitFor(table,key),table==='landmarks'?'landmarks':'published',LABELS[table]||table,[lookup(trial,table,key,key.replaceAll('_',' '))]));
 }
 const motion=trial.motion;if(motion){const t=motion.frames.map((_,i)=>i/motion.rate);for(const [j,label] of motion.labels.entries()){
  put(spec(`raw:marker:${label}`,`Marker ${label} position`,'m','raw','Raw C3D point', ['X','Y','Z'].map((axis,k)=>({label:axis,values:motion.frames.map(frame=>frame[j]?.[k]??null),time:t}))));
 }
 const analog=motion.analog;if(analog?.rate)for(const [j,label] of analog.labels.entries()){
  const values=analog.channels[label];if(!values)continue;
  put(spec(`raw:analog:${label}`,`Plate channel ${label}`,analog.units[j]||'unit not stated','raw','Raw C3D analog',[{label,values,time:values.map((_,i)=>i/analog.rate)}]));
 }}
 return out;
}
