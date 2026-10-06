import {initCohortControls,cohortState,configureCohort,loadCohort} from './cohort_band.js';
import {MotionVisuals} from './motion_visuals.js';
import {motionAnalysis} from './motion_analysis.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {initDisplayControls,organizeComparisonControls} from './display_controls.js';
import {HighPerformanceExplorer} from './high_performance.js';
import {initCharts,setChartTrial,setChartComparison,updateCharts} from './charts.js';
import {EVENT_SHORT} from './quantities.js';
import {batKinematics,sample} from './biomechanics.js';
import {REPLAY_COLORS,anchorTime,alignedTime,primaryTime,comparisonWindow,visualPoseRange} from './comparison.js';
import {CompareViewer} from './compare_viewer.js';
import {createMotionSweep} from './motion_sweep.js';
import {submitMovieExport} from './movie_export.js';
import {SplitViewer} from './split_viewer.js';
import {focusSpec,focusSectorGeometry} from './focus_geometry.js';
import {buildPitchReport} from './pitch_report.js';
import {peakForceMagnitude,forceArrowLength,forceArrowHead} from './force_scale.js';
import {MAX_OVERLAY_ITEMS,overlayItems,buildPowerOverlay,powerValues} from './energy_overlay.js';
import {hitTraxLaunch} from './hittrax.js';
import {loadLimbLengths,limbLengthsBody,limbLengthsDisclosure} from './limb_lengths.js';
import {KeypointExplorer} from './keypoint_ui.js';
import {ComparisonKeypoints} from './comparison_keypoints.js';
import {buildMovieKeypointCharts,drawMovieKeypointCharts} from './movie_keypoint_charts.js';

const $ = id => document.getElementById(id);
const EVENT_DISPLAY={pkh_time:'Peak knee',fp_10_time:'Foot contact',fp_100_time:'Foot plant',MER_time:'Max ER',BR_time:'Release',MIR_time:'Max IR',contact_time:'Contact'};
const EVENT_COLORS={pkh_time:'#2862a2',fp_10_time:'#008674',fp_100_time:'#1e9e80',MER_time:'#ad5c13',BR_time:'#c73327',MIR_time:'#7b4da6',contact_time:'#c73327'};
const SLIDER_INSET=8;
const playbackBounds=()=>compareMode?comparisonWindow(compareEntries,trial,compareSync):{min:0,max:trial?.duration||0};
const playbackFraction=t=>{const {min,max}=playbackBounds();return Math.max(0,Math.min(1,max>min?(t-min)/(max-min):0))};
const timelinePosition=(fraction,width)=>SLIDER_INSET+Math.max(0,width-2*SLIDER_INSET)*fraction;
const timelinePositionCSS=fraction=>{const offset=SLIDER_INSET*(1-2*fraction);return `calc(${100*fraction}% ${offset>=0?'+':'-'} ${Math.abs(offset)}px)`};
const FILTER_METRICS={pitching:[['speed_mph','Pitch speed · mph'],['max_shoulder_external_rotation','Max shoulder ER · °'],['elbow_varus_moment','Elbow varus moment · N·m'],['max_pelvis_rotational_velo','Peak pelvis rotation · °/s'],['max_torso_rotational_velo','Peak torso rotation · °/s'],['lead_grf_mag_max','Peak lead ground reaction force · N']],hitting:[['speed_mph','Exit velocity · mph'],['bat_speed_mph_contact_x','Bat speed at contact · mph'],['attack_angle_contact_x','Attack angle · °'],['pelvis_angular_velocity_seq_max_x','Peak pelvis rotation · °/s'],['torso_angular_velocity_seq_max_x','Peak torso rotation · °/s']]};
const PAIRS = {
  pitching: [['rear_ankle_jc','rear_knee_jc'],['rear_knee_jc','rear_hip'],['lead_ankle_jc','lead_knee_jc'],['lead_knee_jc','lead_hip'],['rear_hip','lead_hip'],['rear_hip','thorax_dist'],['lead_hip','thorax_dist'],['thorax_dist','thorax_prox'],['thorax_prox','shoulder_jc'],['thorax_prox','glove_shoulder_jc'],['shoulder_jc','elbow_jc'],['elbow_jc','wrist_jc'],['wrist_jc','hand_jc'],['glove_shoulder_jc','glove_elbow_jc'],['glove_elbow_jc','glove_wrist_jc'],['glove_wrist_jc','glove_hand_jc']],
  hitting: [['lajc','lkjc'],['lkjc','left_hip'],['rajc','rkjc'],['rkjc','right_hip'],['left_hip','right_hip'],['left_hip','thorax_dist'],['right_hip','thorax_dist'],['thorax_dist','thorax_prox'],['thorax_prox','lsjc'],['thorax_prox','rsjc'],['lsjc','lejc'],['lejc','lwjc'],['lwjc','lhjc'],['rsjc','rejc'],['rejc','rwjc'],['rwjc','rhjc']]
};
const RAW_PAIRS = [['LFHD','RFHD'],['LFHD','LBHD'],['RFHD','RBHD'],['LBHD','RBHD'],['C7','CLAV'],['CLAV','STRN'],['C7','T10'],['STRN','T10'],['LSHO','RSHO'],['LSHO','LELB'],['LELB','LWRA'],['LWRA','LFIN'],['RSHO','RELB'],['RELB','RWRA'],['RWRA','RFIN'],['LASI','RASI'],['LPSI','RPSI'],['LASI','LPSI'],['RASI','RPSI'],['LASI','LKNE'],['LKNE','LANK'],['LANK','LTOE'],['RASI','RKNE'],['RKNE','RANK'],['RANK','RTOE']];
let catalog=[],catalogDescriptions={},kind='pitching',catalogMode='files',activeAthlete=null,selectedId=null,trial=null,time=0,playing=false,looping=false,loadSerial=0,focusQuantity='none',focusCameraMode='free',timelineEvents=[],popupHideTimer=null,liveBatSpeed=null;
let compareMode=false,compareSplit=false,compareSharedTrailScale=false,compareEntries=[],comparePending=new Set(),compareSync='event',comparePosition='pelvis',compareViewer=null,splitViewer=null,compareGeneration=0;
let performanceMode=false;
const performanceExplorer=new HighPerformanceExplorer();
let compareFocus=new Map();
const defaultCompareOptions=data=>({thick:true,thin:true,joints:!!data.signals?.landmarks,trail:true,eventPoint:true,markers:!data.signals?.landmarks&&!!data.motion,plates:!!data.motion?.platforms?.length,forces:!!data.motion?.platforms?.some(platform=>platform.force_global?.length),ball:false,sweep:false,power:false,powerLocal:false,powerMode:null,sweepMoment:'varus',com:false,comTrail:false,axis:false,braking:false,knee:false});
const makeCompareEntry=(data,colorIndex)=>{const processed=!!data.signals?.landmarks,pairs=processed?PAIRS[data.entry.discipline]:RAW_PAIRS,batPair=data.entry.discipline==='hitting'?[processed?['blast_hand','sweet_spot']:['Marker1','Marker3']]:[];return {id:data.entry.id,data,colorIndex,keypointColor:REPLAY_COLORS[colorIndex].body,keypoints:{enabled:false,category:'core',size:.5,search:'',selected:null,metricId:null,groups:null},options:defaultCompareOptions(data),poseRange:visualPoseRange(data,[...pairs,...batPair]),powerState:buildPowerOverlay(data),batSpeed:data.entry.discipline==='hitting'?batKinematics(data):null}};
let scene,camera,renderer,controls,dynamic,ground,plateMeshes=[],forceArrows=[],skeletonLines,skeletonDots,powerDots,powerSleeves,rawLines,rawDots,batMesh,angleLines,focusReferenceLines,focusDot,focusPlane,focusAxisArrows=[],focusSector,focusArc,ballMesh,batSpeedPoint,hitTraxArrow,hitTraxTube,solidBones,trailLine,trailKnot,soloTrailTimes=[],armSweepData=null;
let armSweepMoment='varus';
let movieSpeed=1,movieRenderMode=false,movieRenderCanvas=null,movieJob=null,moviePolling=false,movieShowInfoBoxes=false,movieKeypointCharts=[];
let planeCameras=[];
let sceneReady=false,fallbackCanvas=null,soloForceMax=0,compareForceMax=0,powerState=null;
let keypointExplorer=null,comparisonKeypoints=null,soloMotionVisuals=null;
const defaultCameraTarget=new THREE.Vector3(0,0,1);
const powerNeutral=new THREE.Color('#ffe34a'),powerMissing=new THREE.Color('#9ba6ab'),powerPositive=new THREE.Color('#ee3631'),powerNegative=new THREE.Color('#146fe0');
function powerColor(value,scale,palette='signed'){if(!Number.isFinite(value))return powerMissing;if(palette==='sweep')return armSweepColor(value,scale);const amount=Math.min(1,Math.abs(value)/scale);return powerNeutral.clone().lerp(palette==='positive'||value>=0?powerPositive:powerNegative,Math.pow(amount,.55))}
const clock=new THREE.Clock();
const vec=p=>new THREE.Vector3(p[0],p[1],p[2]);
const finite=p=>Boolean(p && p.length===3 && p.every(v=>Number.isFinite(v)));
const layerOn=id=>$(id).getAttribute('aria-pressed')==='true';
const fmt=(v,n=2)=>v==null||!Number.isFinite(Number(v))?'—':Number(v).toFixed(n);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){const el=$('toast');el.textContent=message;el.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.style.display='none',3800)}
function setupScene(){
  scene=new THREE.Scene();scene.background=new THREE.Color('#eceeed');
  camera=new THREE.PerspectiveCamera(45,1,0.02,100);camera.up.set(0,0,1);camera.position.set(3.7,-4.7,3.0);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  $('stage').appendChild(renderer.domElement);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.target.set(0,0,1);controls.minDistance=.5;controls.maxDistance=20;
  scene.add(new THREE.HemisphereLight(0xffffff,0x67706c,2.2));const sun=new THREE.DirectionalLight(0xffffff,2.2);sun.position.set(-3,-2,7);scene.add(sun);
  ground=new THREE.Group();scene.add(ground);dynamic=new THREE.Group();scene.add(dynamic);compareViewer=new CompareViewer(scene,PAIRS,RAW_PAIRS);splitViewer=new SplitViewer(scene,renderer,$('splitPaneGrid'),compareViewer,ground,dynamic);
  const halfSpan=1.9;
  planeCameras=['xy','yz','xz'].map(plane=>{const view=new THREE.OrthographicCamera(-halfSpan,halfSpan,halfSpan,-halfSpan,.02,100);view.up.set(0,...(plane==='xy'?[1,0]:[0,1]));return {plane,camera:view,element:document.querySelector(`[data-plane="${plane}"]`)}});
  new ResizeObserver(()=>{const w=$('stage').clientWidth,h=$('stage').clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}).observe($('stage'));
  setCamera('iso');animate();
}
function setCamera(which){if(!controls)return;const target=controls.target.clone();const d=2.7;const pos={iso:[d,-d,1.8],front:[0,-d,1.65],side:[d,0,1.65],top:[-.035,0,5.5]}[which]||[d,-d,2.9];camera.position.set(target.x+pos[0],target.y+pos[1],target.z+pos[2]);camera.lookAt(target);controls.update()}
function setOverheadFocus(target){controls.target.copy(target);camera.position.copy(target).add(new THREE.Vector3(-.02,0,1.35));camera.lookAt(target);controls.update()}
function clearGroup(group){while(group.children.length){const o=group.children[0];group.remove(o);o.traverse(node=>{if(!(node.parent instanceof THREE.ArrowHelper))node.geometry?.dispose?.();for(const m of Array.isArray(node.material)?node.material:[node.material]){m?.map?.dispose?.();m?.dispose?.()}})}}
function addLine(group,points,color,opacity=1,width=1){const geometry=new THREE.BufferGeometry().setFromPoints(points.map(vec));const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity,linewidth:width}));group.add(line);return line}
function addMesh(group,geometry,material){const m=new THREE.Mesh(geometry,material);group.add(m);return m}
function polygon(group,points,color,opacity=.8){if(points.length<3)return;const shape=new THREE.Shape();shape.moveTo(points[0][0],points[0][1]);points.slice(1).forEach(p=>shape.lineTo(p[0],p[1]));shape.closePath();const mesh=addMesh(group,new THREE.ShapeGeometry(shape),new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide,transparent:opacity<1,opacity,depthWrite:opacity===1}));mesh.position.z=points.reduce((s,p)=>s+p[2],0)/points.length;return mesh}
function addHomePlate(center,apexTowardPositiveX){
  // Local point faces -Y. A quarter-turn places it along the discipline's catcher direction.
  const local=[[-.215,.14],[.215,.14],[.215,-.045],[0,-.26],[-.215,-.045]];
  const outer=local.map(([x,y])=>[center[0]+(apexTowardPositiveX?-y:y),center[1]+(apexTowardPositiveX?x:-x),.019]);
  const inner=outer.map(([x,y])=>[center[0]+(x-center[0])*.9,center[1]+(y-center[1])*.9,.024]);
  polygon(ground,outer,'#101417',1);polygon(ground,inner,'#fbfbf7',1);
  addLine(ground,[...outer,outer[0]].map(([x,y])=>[x,y,.028]),'#050708',1);
}
function pointFromSignal(name,index){const s=trial?.signals?.landmarks?.series;if(!s)return null;const x=s[name+'_x']?.[index],y=s[name+'_y']?.[index],z=s[name+'_z']?.[index];return finite([x,y,z])?[x,y,z]:null}
function nearestIndex(times,t){if(!times?.length)return 0;let lo=0,hi=times.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(times[mid]<=t)lo=mid;else hi=mid-1}return lo<times.length-1 && Math.abs(times[lo+1]-t)<Math.abs(times[lo]-t)?lo+1:lo}
function valueAt(table,name,t){const s=trial?.signals?.[table];if(!s||t<s.time[0]||t>s.time.at(-1))return null;const a=s.series[name];if(!a)return null;return a[nearestIndex(s.time,t)]}
function makeTube(a,b,r,color){const direction=vec(b).sub(vec(a));if(direction.length()<.001)return null;const m=addMesh(dynamic,new THREE.CylinderGeometry(r,r,direction.length(),9),new THREE.MeshStandardMaterial({color,metalness:.35,roughness:.38}));m.position.copy(vec(a).add(vec(b)).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());return m}
function buildGround(){
  clearGroup(ground);plateMeshes=[];forceArrows=[];
  const plateData=trial?.motion?.platforms||[];
  let bounds=[];for(const p of plateData)bounds.push(...p.corners);const landmarks=trial?.signals?.landmarks;if(landmarks){const z=landmarks.series.centerofmass_z, xs=landmarks.series.centerofmass_x,ys=landmarks.series.centerofmass_y;for(let i=0;i<xs?.length;i+=Math.max(1,Math.floor(xs.length/20)))if(finite([xs[i],ys[i],z[i]]))bounds.push([xs[i],ys[i],0])}
  const mid=bounds.length?bounds.reduce((a,p)=>[a[0]+p[0],a[1]+p[1]],[0,0]).map(v=>v/bounds.length):[0,0];
  const base=addMesh(ground,new THREE.PlaneGeometry(9,9),new THREE.MeshStandardMaterial({color:'#d9ddda',roughness:1,side:THREE.DoubleSide}));base.position.set(mid[0],mid[1],-.016);
  const grid=new THREE.GridHelper(9,18,0x969f9b,0xb6bdb9);grid.rotation.x=Math.PI/2;grid.position.set(mid[0],mid[1],-.012);grid.material.transparent=true;grid.material.opacity=.28;ground.add(grid);
  const axes=new THREE.AxesHelper(.9);axes.position.set(0,0,0);ground.add(axes);const origin=addMesh(ground,new THREE.SphereGeometry(.045,12,8),new THREE.MeshBasicMaterial({color:'#112d44'}));origin.position.set(0,0,0);
  const color='#a7b3ad';
  if(plateData.length){plateData.forEach((p,i)=>{const c=p.corners;const mesh=polygon(ground,c,color,.86);if(mesh){mesh.position.z=.008;plateMeshes.push(mesh)}plateMeshes.push(addLine(ground,[...c,c[0]].map(v=>[v[0],v[1],.016]),'#345f50',1));const centroid=c.reduce((s,v)=>s.add(vec(v)),new THREE.Vector3()).multiplyScalar(1/c.length);const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(centroid.x,centroid.y,.055),.01,0x31864d,.12,.07);ground.add(arrow);forceArrows.push({arrow,center:centroid,index:i+1})});}
  else if(trial.entry.discipline==='hitting'){for(let i=0;i<4;i++){const x=(i<2?-.45:.45),y=(i%2===0?.38:-.38),plate=polygon(ground,[[x-.37,y-.29,.001],[x+.37,y-.29,.001],[x+.37,y+.29,.001],[x-.37,y+.29,.001]],'#526a60',.35);if(plate)plateMeshes.push(plate)}}
  // These decorations reflect repo photos only; their coordinates are intentionally schematic.
  if(trial.entry.discipline==='pitching'){
    const row=plateData[1]?.corners;const x=row?row.reduce((a,p)=>a+p[0],0)/4:mid[0]-.65;const y=row?row.reduce((a,p)=>a+p[1],0)/4:mid[1];
    const rubber=addMesh(ground,new THREE.BoxGeometry(.06,.44,.012),new THREE.MeshStandardMaterial({color:'#d3ddd2'}));rubber.position.set(x,y,.016);
  }else{
    const c=plateData.length?plateData.flatMap(p=>p.corners).reduce((a,p)=>[a[0]+p[0],a[1]+p[1]],[0,0]).map(v=>v/(plateData.length*4)):mid;
    addHomePlate(c,false);
  }
  controls.target.set(mid[0],mid[1],.9);defaultCameraTarget.copy(controls.target);setCamera($('cameraPreset').value);
}
function armSweepColor(moment,peak){
 const ratio=peak>0?Math.max(0,Math.min(1,moment/peak)):0;
 const green=new THREE.Color('#259e50'),yellow=new THREE.Color('#e6bf37'),red=new THREE.Color('#c4382b');
 return ratio<=.5?green.lerp(yellow,ratio*2):yellow.lerp(red,(ratio-.5)*2);
}
function buildArmSweep(){
 const sweep=createMotionSweep(trial,liveBatSpeed,armSweepMoment);if(sweep)dynamic.add(sweep.mesh);return sweep;
}
function updateArmSweep(){
 if(!armSweepData)return;const {mesh,drawTimes,drawCounts}=armSweepData;mesh.visible=layerOn('showArmSweep');if(!mesh.visible)return;
 let lo=0,hi=drawTimes.length;while(lo<hi){const mid=(lo+hi)>>1;if(drawTimes[mid]<=time)lo=mid+1;else hi=mid}mesh.geometry.setDrawRange(0,lo?drawCounts[lo-1]:0);
}
function buildDynamic(){
  clearGroup(dynamic);soloMotionVisuals=trial?new MotionVisuals(dynamic,trial):null;batMesh=null;batSpeedPoint=null;hitTraxArrow=null;hitTraxTube=null;armSweepData=null;
  if(!trial)return;
  const count=trial.entry.discipline==='pitching'?18:20;
  skeletonDots=new THREE.InstancedMesh(new THREE.SphereGeometry(.032,10,7),new THREE.MeshStandardMaterial({color:'#006b86',roughness:.35}),count);
  skeletonDots.frustumCulled=false;skeletonDots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);dynamic.add(skeletonDots);
  skeletonLines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#034965'}));dynamic.add(skeletonLines);
  solidBones=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,10),new THREE.MeshStandardMaterial({color:'#356a80',roughness:.85}),PAIRS[trial.entry.discipline].length);solidBones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);solidBones.frustumCulled=false;dynamic.add(solidBones);
  const powerMaterial=()=>new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false});
  powerDots=new THREE.InstancedMesh(new THREE.SphereGeometry(.052,14,10),powerMaterial(),MAX_OVERLAY_ITEMS);
  powerSleeves=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,10),powerMaterial(),MAX_OVERLAY_ITEMS);
  for(const mesh of [powerDots,powerSleeves]){for(let i=0;i<MAX_OVERLAY_ITEMS;i++)mesh.setColorAt(i,powerMissing);mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.visible=false;dynamic.add(mesh)}
  soloTrailTimes=[];const trailValues=[],landmarks=trial.signals?.landmarks,trailKey=trial.entry.discipline==='pitching'?'hand_jc':'sweet_spot';
  if(landmarks)for(let i=1;i<landmarks.time.length;i++){const a=['x','y','z'].map(axis=>landmarks.series[trailKey+'_'+axis]?.[i-1]),b=['x','y','z'].map(axis=>landmarks.series[trailKey+'_'+axis]?.[i]);if(finite(a)&&finite(b)){trailValues.push(...a,...b);soloTrailTimes.push(landmarks.time[i])}}
  const trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute('position',new THREE.Float32BufferAttribute(trailValues,3));trailGeometry.setDrawRange(0,0);
  trailLine=new THREE.LineSegments(trailGeometry,new THREE.LineBasicMaterial({color:'#c73327',transparent:true,opacity:1}));trailLine.frustumCulled=false;dynamic.add(trailLine);
  trailKnot=addMesh(dynamic,new THREE.SphereGeometry(.029,18,12),new THREE.MeshBasicMaterial({color:'#b62a20',depthTest:false}));trailKnot.visible=false;trailKnot.renderOrder=9;
  rawDots=new THREE.InstancedMesh(new THREE.SphereGeometry(.021,7,5),new THREE.MeshBasicMaterial({color:'#5c6670'}),Math.max(1,trial.motion?.labels?.length||0));
  rawDots.frustumCulled=false;rawDots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);dynamic.add(rawDots);
  rawLines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#79858d',transparent:true,opacity:.9}));dynamic.add(rawLines);
  angleLines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#b77816',depthTest:false}));angleLines.renderOrder=8;dynamic.add(angleLines);
  focusReferenceLines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#286b9b',depthTest:false}));focusReferenceLines.renderOrder=8;dynamic.add(focusReferenceLines);
  focusDot=addMesh(dynamic,new THREE.SphereGeometry(.055,12,8),new THREE.MeshBasicMaterial({color:'#dc8a20'}));focusDot.visible=false;
  focusPlane=addMesh(dynamic,new THREE.CircleGeometry(.65,48),new THREE.MeshBasicMaterial({color:'#cbdce4',transparent:true,opacity:.25,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));focusPlane.visible=false;focusPlane.renderOrder=6;
  focusAxisArrows=['#286b9b','#b77816'].map(color=>{const arrow=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),.58,color,.13,.075);for(const part of [arrow.line,arrow.cone]){part.material.depthTest=false;part.material.depthWrite=false;part.renderOrder=9}arrow.visible=false;dynamic.add(arrow);return arrow});
  focusSector=addMesh(dynamic,new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:'#e7a63d',transparent:true,opacity:.42,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));focusSector.visible=false;focusSector.renderOrder=7;
  focusArc=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#a7640d',depthTest:false}));focusArc.visible=false;focusArc.renderOrder=8;dynamic.add(focusArc);
  batMesh=addMesh(dynamic,new THREE.CylinderGeometry(.025,.025,1,10),new THREE.MeshStandardMaterial({color:'#9e7043',roughness:.75}));batMesh.visible=false;
  batSpeedPoint=addMesh(dynamic,new THREE.SphereGeometry(.034,14,10),new THREE.MeshBasicMaterial({color:'#156f83'}));batSpeedPoint.visible=false;
  ballMesh=addMesh(dynamic,new THREE.SphereGeometry(.038,16,12),new THREE.MeshStandardMaterial({color:'#fff8ed',roughness:.7}));ballMesh.visible=false;
  const launch=trial.entry.discipline==='hitting'?hitTraxLaunch(trial.hittrax):null,contact=trial.events?.contact_time?.time,lm=trial.signals?.landmarks;
  if(launch&&Number.isFinite(contact)&&lm?.time?.length&&contact>=lm.time[0]&&contact<=lm.time.at(-1)){
    const origin=pointFromSignal('sweet_spot',nearestIndex(lm.time,contact));
    if(finite(origin)){
      hitTraxArrow=new THREE.ArrowHelper(vec(launch),vec(origin),1.6,0x823b91,.19,.09);
      hitTraxArrow.visible=false;hitTraxArrow.line.material.depthTest=false;hitTraxArrow.cone.material.depthTest=false;
      hitTraxArrow.renderOrder=10;dynamic.add(hitTraxArrow);
      hitTraxTube=addMesh(dynamic,new THREE.CylinderGeometry(.016,.016,1,12),new THREE.MeshBasicMaterial({color:'#823b91',transparent:true,opacity:.75}));
      hitTraxTube.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vec(launch));hitTraxTube.visible=false;
    }
  }
  armSweepData=buildArmSweep();
}
const dummy=new THREE.Object3D();
function updateInstances(mesh,pts){if(!mesh)return;for(let i=0;i<mesh.count;i++){const p=pts[i];dummy.position.set(...(finite(p)?p:[0,0,-100]));dummy.scale.setScalar(finite(p)?1:0);dummy.quaternion.identity();dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)}mesh.instanceMatrix.needsUpdate=true}
function updateLineSegments(line,segments){
 if(!line)return;const arr=[];for(const [a,b] of segments)if(finite(a)&&finite(b))arr.push(...a,...b);
 const attribute=line.geometry.getAttribute('position');
 if(attribute&&attribute.array.length===arr.length){attribute.array.set(arr);attribute.needsUpdate=true}
 else line.geometry.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));
 line.geometry.computeBoundingSphere();
}
function focusGeometryData(map){
  return focusSpec(trial,map,focusQuantity,time);
}
function updateFocusSector(focus){
  focusSector.visible=false;focusArc.visible=false;
  const geometry=focusSectorGeometry(focus);if(!geometry)return;
  focusSector.geometry.dispose();focusSector.geometry=new THREE.BufferGeometry();focusSector.geometry.setAttribute('position',new THREE.Float32BufferAttribute(geometry.vertices,3));focusSector.visible=true;
  focusArc.geometry.dispose();focusArc.geometry=new THREE.BufferGeometry().setFromPoints(geometry.arc.map(vec));focusArc.visible=true;
  return geometry.degrees;
}
function updateBall(map){
  if(hitTraxTube)hitTraxTube.visible=false;
  if(!ballMesh)return;
  const enabled=layerOn('showBall'),landmarks=trial.signals.landmarks,events=trial.events;
  if(!enabled||!landmarks){ballMesh.visible=false;return}
  const pitch=trial.entry.discipline==='pitching',event=pitch?events.BR_time:events.contact_time;
  if(!event){ballMesh.visible=false;return}
  const key=pitch?'hand_jc':'sweet_spot',eventIndex=nearestIndex(landmarks.time,event.time),start=pointFromSignal(key,eventIndex);
  if(!finite(start)){ballMesh.visible=false;return}
  const pos=start.slice(),dt=time-event.time;
  if(pitch){if(dt<0&&finite(map.hand_jc))pos.splice(0,3,...map.hand_jc);else if(dt>=0){const speed=(trial.entry.speed_mph||85)*.44704;pos[0]+=Math.min(7,speed*dt);pos[2]-=4.9*dt*dt}}
  else if(dt<0){pos[0]+=Math.min(5,(event.time-time)*18)}else if(hitTraxArrow&&layerOn('showHitTrax')){
    const launch=hitTraxLaunch(trial.hittrax),distance=Math.min(7,(trial.entry.speed_mph||85)*.44704*dt);
    // Straight launch-direction illustration, not a measured flight trajectory.
    for(let i=0;i<3;i++)pos[i]=hitTraxArrow.position.getComponent(i)+launch[i]*distance;
    if(hitTraxTube&&distance>0){hitTraxTube.visible=true;hitTraxTube.scale.set(1,distance,1);hitTraxTube.position.copy(hitTraxArrow.position).addScaledVector(vec(launch),distance/2)}
  }else{const speed=(trial.entry.speed_mph||85)*.44704;pos[0]+=Math.min(7,speed*dt);pos[2]+=Math.min(1,dt*2)}
  ballMesh.visible=true;ballMesh.position.set(...pos);
}
function updateMotion(){
  if(!trial)return;
  const lm=trial.signals.landmarks,li=lm?nearestIndex(lm.time,time):0;
  const names=trial.entry.discipline==='pitching'?['rear_ankle_jc','rear_knee_jc','rear_hip','lead_ankle_jc','lead_knee_jc','lead_hip','thorax_dist','thorax_prox','shoulder_jc','elbow_jc','wrist_jc','hand_jc','glove_shoulder_jc','glove_elbow_jc','glove_wrist_jc','glove_hand_jc','centerofmass','thorax_ap']:['lajc','lkjc','left_hip','rajc','rkjc','right_hip','thorax_dist','thorax_prox','lsjc','lejc','lwjc','lhjc','rsjc','rejc','rwjc','rhjc','blast_hand','sweet_spot','centerofmass','thorax_ap'];
  const map={};names.forEach(n=>map[n]=pointFromSignal(n,li));
  const hipA=trial.entry.discipline==='hitting'?map.left_hip:map.rear_hip,hipB=trial.entry.discipline==='hitting'?map.right_hip:map.lead_hip;
  if(finite(hipA)&&finite(hipB))map.pelvis_center=vec(hipA).add(vec(hipB)).multiplyScalar(.5).toArray();
  if(finite(map.thorax_dist)&&finite(map.thorax_prox))map.torso_center=vec(map.thorax_dist).add(vec(map.thorax_prox)).multiplyScalar(.5).toArray();
  const colorPower=!!powerState&&layerOn('showPowerMap'),mode=$('powerMode').value,values=colorPower?powerValues(powerState,mode,time):{},scale=powerState?.scales[mode]||1,localScale=$('powerLocalScale').checked;
  const colorItems=overlayItems(mode,powerState);powerDots.count=colorItems.length;powerSleeves.count=colorItems.length;
  powerDots.visible=!!lm&&colorPower&&mode!=='endpoint';powerSleeves.visible=!!lm&&colorPower;
  if(colorPower)colorItems.forEach((joint,i)=>{
    const p=map[joint.point],q=map[joint.end],jointScale=localScale?(powerState.localScales[mode]?.[joint.key]||scale):scale,color=powerColor(values[joint.key],jointScale,powerState.configs[mode].palette);
    dummy.position.set(...(finite(p)?p:[0,0,-100]));dummy.scale.setScalar(finite(p)?1:0);dummy.quaternion.identity();dummy.updateMatrix();powerDots.setMatrixAt(i,dummy.matrix);powerDots.setColorAt(i,color);
    dummy.position.set(0,0,-100);dummy.scale.setScalar(0);dummy.quaternion.identity();
    if(finite(p)&&finite(q)){const shortEnd=vec(p).lerp(vec(q),.28),direction=shortEnd.clone().sub(vec(p)),length=direction.length();if(length>.001){dummy.position.copy(vec(p).add(shortEnd).multiplyScalar(.5));dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());dummy.scale.set(.038,length,.038)}}
    dummy.updateMatrix();powerSleeves.setMatrixAt(i,dummy.matrix);powerSleeves.setColorAt(i,color);
  });
  if(colorPower){powerDots.instanceMatrix.needsUpdate=true;powerDots.instanceColor.needsUpdate=true;powerSleeves.instanceMatrix.needsUpdate=true;powerSleeves.instanceColor.needsUpdate=true}
  skeletonDots.visible=!!lm&&layerOn('showJoints');updateInstances(skeletonDots,names.map(n=>map[n]));
  skeletonLines.visible=!!lm&&layerOn('showThin');updateLineSegments(skeletonLines,PAIRS[trial.entry.discipline].map(([a,b])=>[map[a],map[b]]));
  solidBones.visible=!!lm&&layerOn('showSolid');
  PAIRS[trial.entry.discipline].forEach(([a,b],i)=>{const p=map[a],q=map[b];dummy.position.set(0,0,-100);dummy.scale.setScalar(0);dummy.quaternion.identity();if(finite(p)&&finite(q)){const d=vec(q).sub(vec(p)),length=d.length();if(length>.001){dummy.position.copy(vec(p).add(vec(q)).multiplyScalar(.5));dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());dummy.scale.set(.025,length,.025)}}dummy.updateMatrix();solidBones.setMatrixAt(i,dummy.matrix)});solidBones.instanceMatrix.needsUpdate=true;
  trailLine.visible=!!lm&&layerOn('showTrail');trailKnot.visible=false;
  if(trailLine.visible){
    const key=trial.entry.discipline==='pitching'?'hand_jc':'sweet_spot',event=trial.events[trial.entry.discipline==='pitching'?'BR_time':'contact_time'];
    const next=soloTrailTimes.findIndex(value=>value>time);trailLine.geometry.setDrawRange(0,(next<0?soloTrailTimes.length:next)*2);
  }
  if(lm&&layerOn('showEventPoint')){
    const key=trial.entry.discipline==='pitching'?'hand_jc':'sweet_spot',event=trial.events[trial.entry.discipline==='pitching'?'BR_time':'contact_time'];
    if(event&&time>=event.time){const point=pointFromSignal(key,nearestIndex(lm.time,event.time));if(finite(point)){trailKnot.position.set(...point);trailKnot.visible=true}}
  }
  const motion=trial.motion,rawMap={};if(motion){const fi=Math.min(motion.frame_count-1,Math.max(0,Math.round(time*motion.rate)));motion.labels.forEach((n,i)=>rawMap[n]=motion.frames[fi]?.[i])}
  const showRaw=layerOn('showMarkers');rawDots.visible=!!motion&&showRaw;rawLines.visible=!!motion&&showRaw;
  updateInstances(rawDots,motion?.labels.map(n=>rawMap[n])||[]);updateLineSegments(rawLines,RAW_PAIRS.map(([a,b])=>[rawMap[a],rawMap[b]]));
  batMesh.visible=false;
  if(trial.entry.discipline==='hitting'){let a=map.blast_hand,b=map.sweet_spot;if(!finite(a)||!finite(b)){a=rawMap.Marker1||rawMap.Marker2;b=rawMap.Marker3||rawMap.Marker4}if(finite(a)&&finite(b)){const d=vec(b).sub(vec(a)),length=d.length();if(length>.001){batMesh.visible=true;batMesh.position.copy(vec(a).add(vec(b)).multiplyScalar(.5));batMesh.scale.set(1,length,1);batMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize())}}}
  batSpeedPoint.visible=trial.entry.discipline==='hitting'&&batMesh.visible&&finite(map.sweet_spot);if(batSpeedPoint.visible)batSpeedPoint.position.set(...map.sweet_spot);
  const focus=focusGeometryData(map),showFocus=!!focus&&finite(focus.center);
  angleLines.visible=showFocus;focusDot.visible=showFocus&&layerOn('showJoints');
  focusReferenceLines.visible=showFocus&&!!focus.referenceSegments?.length;
  focusPlane.visible=showFocus&&finite(focus.planeCenter);
  if(focusPlane.visible){focusPlane.position.set(...focus.planeCenter);focusPlane.position.z-=.006}
  focusAxisArrows.forEach((arrow,i)=>{const axis=showFocus?focus.axes?.[i]:null;arrow.visible=!!finite(axis);if(arrow.visible){arrow.position.set(...focus.center);arrow.setDirection(vec(axis).normalize());arrow.setLength(.58,.13,.075)}});
  updateFocusSector(showFocus?focus:null);
  updateLineSegments(angleLines,showFocus?focus.segments:[]);
  updateLineSegments(focusReferenceLines,showFocus?focus.referenceSegments||[]:[]);
  if(showFocus){focusDot.position.set(...focus.center);if(focusCameraMode==='follow'){const target=vec(focus.center),shift=target.clone().sub(controls.target);camera.position.add(shift);controls.target.copy(target);controls.update()}}
  updateBall(map);updateArmSweep();
  if(hitTraxArrow)hitTraxArrow.visible=layerOn('showHitTrax')&&!layerOn('showBall')&&time>=trial.events.contact_time.time;
  const analog=motion?.analog;
  forceArrows.forEach(({arrow,center,index})=>{
    const samples=motion?.platforms?.[index-1]?.force_global;
    const ai=analog?.rate&&samples?.length?Math.min(samples.length-1,Math.max(0,Math.round(time*analog.rate))):-1,p=samples?.[ai];
    const force=finite(p)?vec(p):null,mag=force?.length()||0;
    const length=forceArrowLength(mag,soloForceMax);
    arrow.visible=layerOn('showForces')&&length>0;
    if(arrow.visible){arrow.position.set(center.x,center.y,.055);arrow.setDirection(force.normalize());arrow.setLength(length,...forceArrowHead(length))}
  });
  plateMeshes.forEach(m=>m.visible=layerOn('showPlates'));
  soloMotionVisuals?.update(time,{com:layerOn('showCOM'),comTrail:layerOn('showCOMTrail'),axis:layerOn('showTrunkAxis'),braking:layerOn('showBraking'),knee:layerOn('showKneeExtension')});
  keypointExplorer?.updatePose(map,rawMap);
}
function updateReadout(){
  if(!trial)return;$('readoutTime').textContent=fmt(time,3)+' s';const cells=[],pitch=trial.entry.discipline==='pitching';
  const put=(label,value,unit,note,digits=1)=>cells.push([label,Number.isFinite(value)?fmt(value,digits)+unit:'—',Number.isFinite(value)?note:'No sample at this playhead.',!Number.isFinite(value)]);
  const angleNames=pitch?[['Shoulder ER','shoulder_angle_z'],['Torso rotation','torso_angle_z'],['Lead knee flexion','lead_knee_angle_x']]:[['Torso rotation','torso_angle_z'],['Pelvis rotation','pelvis_angle_z'],['Lead knee flexion','lead_knee_angle_x']];
  for(const [label,key] of angleNames)put(label,valueAt('joint_angles',key,time),'°',`Published ${key}`);
  if(!pitch){const speed=liveBatSpeed?sample({time:liveBatSpeed.time,values:liveBatSpeed.speed},time):null;if(!Number.isFinite(speed))cells.push(['Reconstructed bat speed','—','Insufficient contiguous sweet-spot XYZ samples for the native derivative.',true]);else put('Reconstructed bat speed',speed*2.2369362921,' mph','Magnitude of the unfiltered three-point derivative of released sweet_spot XYZ, using released CSV timestamps. No smoothing, fitting, scaling or published-speed adjustments. Published speeds are separate references.');}
  for(const foot of ['rear','lead']){const v=['x','y','z'].map(axis=>valueAt('force_plate',`${foot}_force_${axis}`,time));put(`${foot==='rear'?'Rear':'Lead'} ground reaction force`,v.every(Number.isFinite)?Math.hypot(...v):null,' N','Magnitude of processed rear/lead ground reaction force from force_plate.csv',0)}
  if(pitch)put('Elbow varus moment',valueAt('forces_moments','elbow_moment_y',time),' N·m','Published internal moment Y component; not direct ligament load');
  if(trial.motion?.analog?.rate)for(const plate of trial.motion.platforms||[]){const samples=plate.force_global||[],i=Math.min(samples.length-1,Math.max(0,Math.round(time*trial.motion.analog.rate))),force=samples[i];put(`Force plate ${plate.number} magnitude`,finite(force)?Math.hypot(...force):null,' N','Magnitude of this plate’s reconstructed C3D measurement, shown by its 3D arrow. Processed rear/lead ground reaction force is listed separately.',0)}
  $('liveMetrics').innerHTML=cells.map(([label,value,note,missing])=>`<div class="metric ${missing?'metricMissing':''}" title="${esc(note)}"><label>${esc(label)}</label><strong>${esc(value)}</strong></div>`).join('');
}
function updateArmSweepLegend(){
 const legend=$('armSweepLegend');legend.hidden=compareMode||!layerOn('showArmSweep')||!armSweepData;if(legend.hidden)return;
 const data=armSweepData,hitting=data.kind==='hitting',unit=hitting?'mph':'N·m';
 const speed=hitting?sample(data.colorSeries,time):null;
 const value=hitting&&Number.isFinite(speed)?speed*2.2369362921:hitting?null:(()=>{const raw=valueAt('forces_moments','elbow_moment_y',time);return Number.isFinite(raw)?Math.max(0,(data.momentMode==='valgus'?-1:1)*raw):null})();
 $('armSweepTitle').textContent=hitting?'Bat speed · trail color':`Elbow ${data.momentMode} moment`;
 $('armSweepCurrent').textContent=Number.isFinite(value)?`${fmt(value,1)} ${unit}${hitting?' filtered':' at playhead'}`:`No ${hitting?'speed':'moment'} sample at playhead`;
 legend.querySelector('.armSweepGradient').classList.toggle('batSpeedGradient',hitting);
 legend.querySelector('.armSweepGradient').style.background=hitting?`linear-gradient(90deg,#259e50 0%,#259e50 ${data.colorScale.greenEnd}%,#e6bf37 ${data.colorScale.yellowStop}%,#c4382b 100%)`:'';
 legend.querySelector('.armSweepTicks span').textContent=hitting?`${fmt(data.colorScale.low,1)} mph`:'0';
 $('armSweepMid').textContent=hitting?`${fmt(data.colorScale.mid,1)} mph`:fmt(data.peak/2,0);$('armSweepPeak').textContent=hitting?`${fmt(data.colorScale.high,1)} mph`:`${fmt(data.peak,0)} ${unit}`;
 $('armSweepPhase').textContent=hitting?'Smoothed for color only · native speed in right panel · blue dot = sweet spot':`${data.hasPhase?'PKH → MIR':'Full recording'} · internal ${data.momentMode==='valgus'?'−Y':'＋Y'} magnitude · opposite direction green`;
}
function updatePowerLegend(){
 const legend=$('powerLegend');legend.hidden=compareMode||!powerState||!layerOn('showPowerMap');if(legend.hidden)return;
 const mode=$('powerMode').value,config=powerState.configs[mode];if(!config)return;
 const values=powerValues(powerState,mode,time),scale=powerState.scales[mode],digits=mode==='work'?1:0,local=$('powerLocalScale').checked;
 $('powerLegendTitle').textContent=config.label;$('powerLegendUnit').textContent=local?`${config.unit} · local`:config.unit;
 $('powerGradient').classList.toggle('positive',config.palette==='positive');
 $('powerGradient').classList.toggle('sweep',config.palette==='sweep');
 $('powerNegative').textContent=config.palette!=='signed'?(local?'0%':'0'):mode==='generated'?`Absorption −${local?'100%':fmt(scale,digits)}`:`−${local?'100%':fmt(scale,digits)}`;
 $('powerMiddle').textContent=config.palette!=='signed'?(local?'50%':fmt(scale/2,digits)):'0';
 $('powerPositive').textContent=(mode==='generated'?'Generation +':'+')+(local?'100%':fmt(scale,digits)+' '+config.unit);
 const items=overlayItems(mode,powerState),visible=mode==='endpoint'?[...items].sort((a,b)=>Math.abs(values[b.key]||0)-Math.abs(values[a.key]||0)).slice(0,8):items;
 $('powerJointReadout').innerHTML=visible.map(item=>{const value=values[item.key];return `<div><span title="${esc(item.label)}">${esc(item.label.replace('Throwing ','').replace('Glove ','G. '))}</span><b>${Number.isFinite(value)?(config.palette==='signed'&&value>=0?'+':'')+fmt(value,digits):'—'}</b></div>`}).join('');
 $('powerInfoText').textContent=config.note+(local?` Each location reaches full color at its own 90th percentile ${powerState.phaseLabel}. Colors show relative intensity and cannot compare absolute values between locations.`:` All locations share one color scale, reaching full color at the 90th percentile ${powerState.phaseLabel}.`)+' Displayed numbers are never clipped. Replay endpoints hold the nearest valid signal sample; gaps inside the signal remain missing.'+(mode==='endpoint'?' Showing the eight largest endpoint magnitudes at the playhead.':'');
}
function updateTimeline(){$('playButton').setAttribute('aria-label',playing?'Pause':'Play');const {min,max}=playbackBounds();$('timeline').min=min;$('timeline').max=max;$('timeline').value=time;$('scrubFill').style.width=timelinePositionCSS(playbackFraction(time));$('timeText').textContent=compareMode?`${fmt(time,3)} s · ${fmt(min,3)}–${fmt(max,3)} s`:`${fmt(time,3)} / ${fmt(max,3)} s`;if(sceneReady){if(compareMode)renderComparisonFocusReadouts(compareViewer?.update(time)||[]);else updateMotion()}else drawFallback();if(compareMode){updateComparePlayhead();comparisonKeypoints?.updateTime(time,trial,compareSync)}else updateReadout();updateArmSweepLegend();updatePowerLegend();keypointExplorer?.updateTime(time);updateCharts(time)}
function posePoints(data,t){
 const processed=data.signals?.landmarks,body=processed?PAIRS[data.entry.discipline]:RAW_PAIRS;
 const names=new Set(body.flat());if(data.entry.discipline==='hitting')for(const name of processed?['blast_hand','sweet_spot']:['Marker1','Marker3'])names.add(name);
 if(processed){const i=nearestIndex(processed.time,t),series=processed.series;return [...names].map(name=>['x','y','z'].map(axis=>series[name+'_'+axis]?.[i])).filter(finite)}
 const motion=data.motion;if(!motion?.frames?.length)return [];
 const frame=motion.frames[Math.min(motion.frames.length-1,Math.max(0,Math.round(t*motion.rate)))];return [...names].map(name=>frame?.[motion.labels.indexOf(name)]).filter(finite);
}
function planeViewPoints(){
 if(!trial)return [];
 if(!compareMode)return posePoints(trial,time);
 return compareEntries.flatMap(entry=>{
  const part=compareViewer?.parts.get(entry.id),data=entry.data;
  const local=alignedTime(time,trial,data,compareSync),range=part?.poseRange||entry.poseRange;
  const t=Math.max(range.start,Math.min(range.end,Math.max(0,Math.min(data.duration,local))));
  const shift=part?.group.position||new THREE.Vector3();
  return posePoints(data,t).map(p=>[p[0]+shift.x,p[1]+shift.y,p[2]+shift.z]);
 });
}
function renderPlaneViews(){
 if($('planeViews').hidden)return;
 const canvasRect=renderer.domElement.getBoundingClientRect();if(!canvasRect.width||!canvasRect.height)return;
 const points=planeViewPoints(),axes={xy:[0,1],yz:[1,2],xz:[0,2]},offset=6;
 const mins=[0,1,2].map(axis=>points.length?Math.min(...points.map(p=>p[axis])):defaultCameraTarget.getComponent(axis));
 const maxs=[0,1,2].map(axis=>points.length?Math.max(...points.map(p=>p[axis])):defaultCameraTarget.getComponent(axis));
 const target=new THREE.Vector3(...mins.map((value,i)=>(value+maxs[i])/2));
 renderer.setScissorTest(true);
 try{
  for(const view of planeCameras){
   const [a,b]=axes[view.plane],halfSpan=Math.max(1.95,(maxs[a]-mins[a])*1.16,(maxs[b]-mins[b])*1.16)/2;
   view.camera.left=-halfSpan;view.camera.right=halfSpan;view.camera.top=halfSpan;view.camera.bottom=-halfSpan;view.camera.updateProjectionMatrix();
   const rect=view.element.getBoundingClientRect(),x=rect.left-canvasRect.left,y=canvasRect.bottom-rect.bottom;
   view.camera.position.copy(target).add(view.plane==='xy'?new THREE.Vector3(0,0,offset):view.plane==='yz'?new THREE.Vector3(offset,0,0):new THREE.Vector3(0,-offset,0));
   view.camera.lookAt(target);view.camera.updateMatrixWorld();
   renderer.setViewport(x,y,rect.width,rect.height);renderer.setScissor(x,y,rect.width,rect.height);
   renderer.render(scene,view.camera);
  }
 }finally{renderer.setScissorTest(false)}
}
function drawMovieOverlay(ctx,canvas){
 const rect=$('stage').getBoundingClientRect(),sx=canvas.width/rect.width,sy=canvas.height/rect.height;
 ctx.save();ctx.scale(sx,sy);ctx.font='12px sans-serif';ctx.textBaseline='top';
 const label=(text,x,y,color='#243b49')=>{const width=Math.min(rect.width-x-8,ctx.measureText(text).width+16);ctx.fillStyle='rgba(255,255,255,.92)';ctx.fillRect(x,y,width,24);ctx.fillStyle=color;ctx.fillText(text,x+8,y+6,width-16)};
 if(compareMode&&compareSplit){for(const view of splitViewer.views){const box=view.pane.getBoundingClientRect();label(view.pane.querySelector('.splitPaneTitle').innerText.replace(/\n/g,' · '),box.left-rect.left+8,box.top-rect.top+8)}}
 else label($('trialTitle').textContent,10,10);
 for(const [id,gradient,lines] of [
  ['armSweepLegend',$('armSweepLegend').querySelector('.armSweepGradient'),[$('armSweepTitle').textContent,$('armSweepCurrent').textContent,$('armSweepLegend').querySelector('.armSweepTicks').innerText.replace(/\n/g,' · '),$('armSweepPhase').textContent]],
  ['powerLegend',$('powerGradient'),[$('powerLegendTitle').textContent+' · '+$('powerLegendUnit').textContent,[$('powerNegative').textContent,$('powerMiddle').textContent,$('powerPositive').textContent].join(' · ')]],
 ]){
  const el=$(id);if(el.hidden)continue;const box=el.getBoundingClientRect(),x=box.left-rect.left,y=box.top-rect.top,w=Math.min(box.width,rect.width-x-5);
  ctx.fillStyle='rgba(255,255,255,.95)';ctx.fillRect(x,y,w,lines.length*18+28);ctx.fillStyle='#243b49';ctx.font='11px sans-serif';lines.forEach((line,i)=>ctx.fillText(line,x+9,y+8+i*18,w-18));
  const colors=gradient.classList.contains('sweep')||id==='armSweepLegend'?['#259e50','#e6bf37','#c4382b']:gradient.classList.contains('positive')?['#ffe34a','#ee3631']:['#146fe0','#ffe34a','#ee3631'];
  const fill=ctx.createLinearGradient(x+9,0,x+w-9,0);if(id==='armSweepLegend'&&armSweepData?.kind==='hitting'){fill.addColorStop(0,colors[0]);fill.addColorStop(Math.max(0,Math.min(1,armSweepData.colorScale.greenEnd/100)),colors[0]);fill.addColorStop(Math.max(0,Math.min(1,armSweepData.colorScale.yellowStop/100)),colors[1]);fill.addColorStop(1,colors[2])}else colors.forEach((color,i)=>fill.addColorStop(i/(colors.length-1),color));ctx.fillStyle=fill;ctx.fillRect(x+9,y+lines.length*18+10,w-18,7);
 }
 ctx.font='12px sans-serif';label(`${movieSpeed}× · ${fmt(time,3)} s`,10,rect.height-34);drawMovieKeypointCharts(ctx,movieKeypointCharts,time,trial,compareSync);ctx.restore();
}
const movieLayerIds=['showCOM','showCOMTrail','showTrunkAxis','showBraking','showKneeExtension','showSolid','showThin','showJoints','showTrail','showEventPoint','showArmSweep','showHitTrax','showPowerMap','showMarkers','showPlates','showForces','showBall'];
function movieCameraState(cam,orbit){return {position:cam.position.toArray(),target:orbit.target.toArray(),up:cam.up.toArray(),fov:cam.fov,zoom:cam.zoom,near:cam.near,far:cam.far}}
function currentMovieState(){
 const name=(compareMode?compareEntries.map(entry=>catalogLabel(entry.data.entry)).join('_vs_'):catalogLabel(trial.entry)).replace(/[^a-zA-Z0-9_-]/g,'_'),speed=Number($('playSpeed').value);
 return {version:2,cohort:cohortState(),filename:`${kind}_${name}_${compareMode&&compareSplit?'split':'view'}_${speed}x.mp4`,primary:trial.entry.id,entries:compareMode?compareEntries.map(entry=>({id:entry.id,colorIndex:entry.colorIndex,options:{...entry.options}})):[],compareSplit,compareSync,comparePosition,sharedTrailScale:compareSharedTrailScale,focuses:[...compareFocus],layers:Object.fromEntries(movieLayerIds.map(id=>[id,layerOn(id)])),armSweepMoment,powerMode:$('powerMode').value,powerLocal:$('powerLocalScale').checked,focusQuantity,planes:!$('planeViews').hidden,showInfoBoxes:$('movieInfoBoxes').checked,keypointCharts:$('movieInfoBoxes').checked?(compareMode?{comparison:comparisonKeypoints.movieState()}:{solo:keypointExplorer.movieState()}):null,camera:movieCameraState(camera,controls),views:splitViewer.views.map(view=>({id:view.entry.id,camera:movieCameraState(view.camera,view.controls)})),width:$('stage').clientWidth,height:$('stage').clientHeight,pixelWidth:renderer.domElement.width-renderer.domElement.width%2,pixelHeight:renderer.domElement.height-renderer.domElement.height%2,speed};
}
async function pollMovieJob(){
 if(movieRenderMode||!movieJob||moviePolling)return;moviePolling=true;
 try{const response=await fetch(`/api/video-exports/${movieJob}`);if(!response.ok)throw Error('Movie export unavailable.');const job=await response.json();
  $('saveMP4').textContent=job.status==='queued'?'Cancel MP4 · queued':`Cancel MP4 · ${Math.round((job.progress||0)*100)}%`;
  if(['completed','failed','cancelled'].includes(job.status)){
   movieJob=null;$('saveMP4').textContent='Save MP4';$('saveMP4').removeAttribute('aria-busy');
   if(job.status==='completed'){const link=document.createElement('a');link.href=`/api/video-exports/${job.id}/download`;link.download=job.filename;document.body.append(link);link.click();link.remove();toast('Trimmable MP4 saved.')}else toast(job.error||'Movie export cancelled.');
  }
 }catch(error){movieJob=null;$('saveMP4').textContent='Save MP4';$('saveMP4').removeAttribute('aria-busy');toast(error.message)}finally{moviePolling=false}
}
async function startMovieExport(){
 if(movieJob){await fetch(`/api/video-exports/${movieJob}/cancel`,{method:'POST'});await pollMovieJob();return}
 if(!sceneReady||!trial||performanceMode){toast('Load a 3D replay before saving a movie.');return}
 const bounds=playbackBounds();if(!(bounds.max>bounds.min)){toast('This recording has no replay duration.');return}
 $('saveMP4').disabled=true;
 try{const job=await submitMovieExport(currentMovieState());movieJob=job.id;$('saveMP4').setAttribute('aria-busy','true');await pollMovieJob();toast('Rendering MP4 in the background. You can switch tabs and keep using the dashboard; the file downloads when ready.')}
 catch(error){toast(error.message)}finally{$('saveMP4').disabled=false}
}
function renderMovieViewer(){controls.update();renderer.setViewport(0,0,$('stage').clientWidth,$('stage').clientHeight);if(compareMode&&compareSplit&&splitViewer?.views.length){renderer.setClearColor(scene.background);renderer.clear(true,true,true);splitViewer.render(time)}else{renderer.render(scene,camera);renderPlaneViews()}if(compareMode)comparisonKeypoints?.position({split:compareSplit,viewer:compareViewer,splitViewer,camera});else keypointExplorer?.position(camera,$('stage').clientWidth,$('stage').clientHeight)}
function animate(){requestAnimationFrame(animate);if(movieRenderMode){clock.getDelta();return}if(performanceMode){clock.getDelta();return}const dt=Math.min(clock.getDelta(),.1);if(playing&&trial){const {min,max}=playbackBounds();if(max<=min){playing=false;$('playButton').textContent='▶'}else{time+=dt*Number($('playSpeed').value);if(time>=max){if(looping)time=min+(time-min)%(max-min);else{time=max;playing=false;$('playButton').textContent='▶'}}updateTimeline()}}renderMovieViewer()}
function restoreMovieCamera(cam,orbit,state){cam.position.fromArray(state.position);cam.up.fromArray(state.up);orbit.target.fromArray(state.target);cam.fov=state.fov;cam.zoom=state.zoom;cam.near=state.near;cam.far=state.far;cam.updateProjectionMatrix();orbit.update()}
// Used only by the local background worker in its own isolated browser.
window.__movieReady=()=>sceneReady&&!!trial;
window.__movieSnapshot=currentMovieState;
window.__prepareMovie=async state=>{
 movieRenderMode=true;playing=false;movieSpeed=state.speed;movieShowInfoBoxes=state.showInfoBoxes===true;armSweepMoment=state.armSweepMoment;
 const wrap=document.querySelector('.stageWrap');wrap.style.cssText=`position:fixed;left:0;top:0;margin:0;border:0;width:${state.width}px;height:${state.height}px;min-height:0;z-index:1000`;
 await selectTrial(state.primary);if(!trial||trial.entry.id!==state.primary)throw Error('Could not load the export replay.');
 for(const [id,active] of Object.entries(state.layers)){$(id).setAttribute('aria-pressed',String(active));$(id).classList.toggle('active',active)}
 $('powerMode').value=state.powerMode;$('powerLocalScale').checked=state.powerLocal;focusQuantity=state.focusQuantity;
 if(state.entries.length){
  compareMode=true;compareSplit=state.compareSplit;compareSync=state.compareSync;comparePosition=state.comparePosition;compareSharedTrailScale=state.sharedTrailScale;compareFocus=new Map(state.focuses);
  compareEntries=await Promise.all(state.entries.map(async item=>{const response=await fetch('/api/trial?id='+encodeURIComponent(item.id));if(!response.ok)throw Error('Could not load compared replay.');const data=await response.json();return {...makeCompareEntry(data,item.colorIndex),options:item.options}}));
  refreshComparison(true);
 }
 configureCohort(state.cohort);if(state.cohort?.enabled)await Promise.all([loadCohort(trial),...compareEntries.map(entry=>loadCohort(entry.data))]);
 $('planeViews').hidden=!state.planes;wrap.classList.toggle('planeViewsOpen',state.planes);
 renderer.setPixelRatio(state.pixelWidth/state.width);renderer.setSize(state.width,state.height,false);camera.aspect=state.width/state.height;
 restoreMovieCamera(camera,controls,state.camera);for(const view of splitViewer.views){const saved=state.views.find(item=>item.id===view.entry.id);if(saved)restoreMovieCamera(view.camera,view.controls,saved.camera)}
 movieRenderCanvas=document.createElement('canvas');movieRenderCanvas.width=state.pixelWidth;movieRenderCanvas.height=state.pixelHeight;
 await document.fonts.ready;
 movieKeypointCharts=movieShowInfoBoxes?buildMovieKeypointCharts(state.keypointCharts,{trial,entries:compareMode?compareEntries:[],soloGroups:keypointExplorer.groups,groupsFor:entry=>comparisonKeypoints.groups(entry)}):[];
 const bounds=playbackBounds();time=bounds.min;updateTimeline();renderMovieViewer();
 return {bounds,width:state.pixelWidth,height:state.pixelHeight};
};
window.__renderMovieFrame=t=>{
 time=t;updateTimeline();renderMovieViewer();const ctx=movieRenderCanvas.getContext('2d',{alpha:false});ctx.drawImage(renderer.domElement,0,0,movieRenderCanvas.width,movieRenderCanvas.height);if(movieShowInfoBoxes)drawMovieOverlay(ctx,movieRenderCanvas);return movieRenderCanvas.toDataURL('image/png').split(',')[1];
};
function catalogLabel(e){if(e.processed_key)return e.processed_key;return e.filename?.replace(/\.c3d$/i,'')||e.id}
function athleteKey(e){const id=e.athlete??e.filename?.match(/^(\d+)_/)?.[1];return id==null?'unknown':String(Number(id))}
function athleteName(key){return key==='unknown'?'Unassigned files':`Athlete ${key}`}
function athleteSummary(entries){const attempts=entries.filter(e=>e.status!=='static-model').length,models=entries.length-attempts,attemptName=kind==='pitching'?'pitch':'swing';return [attempts?`${attempts} ${attemptName}${attempts===1?'':'s'}`:null,models?`${models} calibration ${models===1?'file':'files'}`:null].filter(Boolean).join(' · ')}
function attemptLabel(e){const match=e.processed_key?.match(/^(.+)_(\d+)$/);return match?`Session ${match[1]} · ${kind==='pitching'?'Pitch':'Swing'} ${Number(match[2])}`:catalogLabel(e)}
function catalogRow(e,grouped=false){const title=grouped&&e.status!=='static-model'?attemptLabel(e):catalogLabel(e),meta=[grouped?e.filename:(e.athlete!=null?`Athlete ${e.athlete}`:null),`${e.frame_count??'?'} frames`,e.speed_mph!=null?`${fmt(e.speed_mph,1)} mph`:null,e.pitch_type].filter(Boolean).join(' · '),picked=compareEntries.find(item=>item.id===e.id),pending=comparePending.has(e.id),pick=compareMode?`<span class="comparePick ${picked?'picked':pending?'pending':''}" style="--pick-color:${picked?REPLAY_COLORS[picked.colorIndex].body:'#899096'}" aria-hidden="true">${picked?'✓':pending?'…':'+'}</span>`:'';return `<button class="catalogItem ${compareMode?(picked?'compareSelected':''):e.id===selectedId?'selected':''}" data-id="${esc(e.id)}" ${compareMode?`aria-pressed="${!!picked}" aria-busy="${pending}" style="--trial-color:${picked?REPLAY_COLORS[picked.colorIndex].body:'#899096'}"`:''}><div class="catalogTop">${pick}<span class="catalogId">${esc(title)}</span><span class="chip ${esc(e.status)}">${e.status==='linked'?'FULL':e.status==='raw-only'?'RAW':e.status==='processed-only'?'DERIVED':'MODEL'}</span></div><div class="catalogMeta">${esc(meta)}</div></button>`}
function configureCatalogFilters(){
  const metrics=FILTER_METRICS[kind],extra=extraFilterMetrics(),allMetrics=[...metrics,...extra],currentMetric=$('metricFilter').value,currentSort=$('sortFilter').value;
  $('metricFilter').innerHTML='<option value="">Any metric</option>'+allMetrics.map(([key,label])=>`<option value="${key}">${esc(label)}</option>`).join('');
  $('sortFilter').innerHTML='<option value="default">Catalog order</option><option value="athlete">Athlete</option><option value="session">Session</option>'+metrics.map(([key,label])=>`<option value="${key}">${esc(label)}</option>`).join('');
  $('sortFilter').add(new Option('More options…','__more'));
  $('metricFilter').value=allMetrics.some(([key])=>key===currentMetric)?currentMetric:'';
  if(extra.some(([key])=>key===currentSort))$('sortFilter').add(new Option(extra.find(([key])=>key===currentSort)[1],currentSort));
  $('sortFilter').value=['default','athlete','session',...allMetrics.map(([key])=>key)].includes(currentSort)?currentSort:'default';
  const entries=catalog.filter(e=>e.discipline===kind),fill=(id,values,label)=>{const current=$(id).value;$(id).innerHTML=`<option value="all">${label}</option>`+[...new Set(values.filter(Boolean))].sort().map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');$(id).value=[...$(id).options].some(o=>o.value===current)?current:'all'};
  fill('levelFilter',entries.map(e=>e.playing_level),'All levels');fill('typeFilter',entries.map(e=>e.pitch_type),'All pitch types');$('typeFilterWrap').hidden=kind!=='pitching';$('sortFilter').dataset.previous=$('sortFilter').value;renderExtraSort();
}
function extraFilterMetrics(){
 const common=new Set(FILTER_METRICS[kind].map(([key])=>key)),keys=new Set();
 for(const entry of catalog)if(entry.discipline===kind)for(const [key,value] of Object.entries(entry.features||{}))if(Number.isFinite(value)&&!common.has(key))keys.add(key);
 return [...keys].sort().map(key=>[key,key.replaceAll('_',' ')]);
}
function renderExtraSort(){
 const query=$('moreSortSearch').value.trim().toLowerCase(),extra=extraFilterMetrics().filter(([key,label])=>label.toLowerCase().includes(query));
 $('moreSortOptions').innerHTML=extra.map(([key,label])=>`<button type="button" data-sort-metric="${esc(key)}" title="${esc(catalogDescriptions[kind]?.[key]||key)}">${esc(label)}</button>`).join('')||'<p>No matching published metrics.</p>';
}
function filterValue(e,key){if(key==='speed_mph')return e.speed_mph;return e.features?.[key]}
function renderCatalog(){
  const query=$('search').value.trim().toLowerCase(),status=$('statusFilter').value,side=$('sideFilter').value,type=$('typeFilter').value,level=$('levelFilter').value,metric=$('metricFilter').value,min=$('minFilter').value,max=$('maxFilter').value,sort=$('sortFilter').value,order=$('orderFilter').value;
  const rows=catalog.filter(e=>e.discipline===kind&&(status==='all'||e.status===status)&&(side==='all'||e.side===side)&&(kind!=='pitching'||type==='all'||e.pitch_type===type)&&(level==='all'||e.playing_level===level)&&(!query||[e.processed_key,e.filename,e.athlete,e.session,e.side,e.pitch_type,e.playing_level,`athlete ${athleteKey(e)}`].some(x=>String(x??'').toLowerCase().includes(query)))&&(!metric||(filterValue(e,metric)!=null&&(min===''||Number(filterValue(e,metric))>=Number(min))&&(max===''||Number(filterValue(e,metric))<=Number(max)))));
  if(sort!=='default')rows.sort((a,b)=>{let av=sort==='athlete'?(athleteKey(a)==='unknown'?null:Number(athleteKey(a))):sort==='session'?a.session:filterValue(a,sort),bv=sort==='athlete'?(athleteKey(b)==='unknown'?null:Number(athleteKey(b))):sort==='session'?b.session:filterValue(b,sort);if(av==null)return bv==null?0:1;if(bv==null)return -1;const result=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true});return (order==='asc'?1:-1)*result});
  const count=[status!=='all',side!=='all',kind==='pitching'&&type!=='all',level!=='all',sort!=='default',order!=='desc',Boolean(metric),min!=='',max!==''].filter(Boolean).length;
  $('filterBadge').hidden=!count;$('filterBadge').textContent=count;$('filterButton').classList.toggle('hasFilters',Boolean(count));
  if(catalogMode==='files'){
    $('resultCount').textContent=`${rows.length.toLocaleString()} recordings shown`;
    $('catalogList').innerHTML=rows.map(e=>catalogRow(e)).join('')||'<p class="caption catalogEmpty">No recordings match these filters.</p>';
    return;
  }
  const groups=new Map();for(const e of rows){const key=athleteKey(e);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e)}
  if(activeAthlete===null){
    const selectedEntry=catalog.find(e=>e.id===selectedId&&e.discipline===kind);
    const groupRows=[...groups];if(sort==='default')groupRows.sort(([a],[b])=>a==='unknown'?1:b==='unknown'?-1:Number(a)-Number(b));
    $('resultCount').textContent=`${groups.size.toLocaleString()} athletes · ${rows.length.toLocaleString()} recordings`;
    $('catalogList').innerHTML=groupRows.map(([key,entries])=>{const picked=compareMode?compareEntries.filter(item=>athleteKey(item.data.entry)===key).length:0;return `<button class="athleteItem ${selectedEntry&&athleteKey(selectedEntry)===key?'selected':''}" data-athlete="${esc(key)}"><span class="athleteItemTop"><strong>${esc(athleteName(key))}</strong><span aria-hidden="true">›</span></span><span class="athleteItemMeta">${esc(athleteSummary(entries))}${picked?` · ${picked} selected`:''}</span></button>`}).join('')||'<p class="caption catalogEmpty">No athletes match these filters.</p>';
    return;
  }
  const entries=groups.get(activeAthlete)||[],attempts=entries.filter(e=>e.status!=='static-model'),models=entries.filter(e=>e.status==='static-model');
  $('resultCount').textContent=`${entries.length.toLocaleString()} recordings shown`;
  $('catalogList').innerHTML=`<div class="athleteDetailHead"><button type="button" data-athlete-back>← All athletes</button><strong>${esc(athleteName(activeAthlete))}</strong><span>${esc(athleteSummary(entries))}</span></div>`+(attempts.length?'<div class="athleteSectionLabel">Attempts</div>'+attempts.map(e=>catalogRow(e,true)).join(''):'')+(models.length?'<div class="athleteSectionLabel">Calibration files</div>'+models.map(e=>catalogRow(e,true)).join(''):'')+(!entries.length?'<p class="caption catalogEmpty">No recordings match these filters for this athlete.</p>':'');
}
function updateInspectorTitle(){const title=performanceMode?'Assessment Details':compareMode?(kind==='pitching'?'Compare Pitches':'Compare Swings'):(kind==='pitching'?'Pitch Details':'Swing Details');$('detailsTitle').textContent=title;$('inspector').setAttribute('aria-label',title)}
function showPerformance(){
 if(performanceMode)return;
 if(compareMode)exitCompareMode();
 keypointExplorer?.setEnabled(false);
 performanceMode=true;playing=false;$('playButton').textContent='▶';
 document.body.classList.add('performanceMode');
 $('performanceTab').classList.add('active');$('pitchingTab').classList.remove('active');$('hittingTab').classList.remove('active');
 for(const id of ['hpRail','hpWorkspace','hpInspector'])$(id).hidden=false;
 updateInspectorTitle();
 performanceExplorer.load().catch(error=>toast(error.message));
}
function hidePerformance(){
 if(!performanceMode)return;
 performanceMode=false;document.body.classList.remove('performanceMode');
 $('performanceTab').classList.remove('active');for(const id of ['hpRail','hpWorkspace','hpInspector'])$(id).hidden=true;
 updateInspectorTitle();
}
function setKind(next){if(kind!==next)activeAthlete=null;kind=next;updateInspectorTitle();$('jointDefinitions').href=`https://github.com/drivelineresearch/openbiomechanics/blob/main/baseball_${next}/README.md#${next==='pitching'?'L79-L91':'L253-L263'}`;$('pitchingTab').classList.toggle('active',kind==='pitching');$('hittingTab').classList.toggle('active',kind==='hitting');$('shoulderFocusButton').textContent=kind==='pitching'?'Shoulder external rotation':'Lead shoulder rotation';document.querySelectorAll('[data-pitch-focus]').forEach(button=>button.hidden=kind!=='pitching');configureCatalogFilters();renderCatalog()}
async function selectTrial(id){const current=++loadSerial;selectedId=id;playing=false;$('playButton').textContent='▶';renderCatalog();$('stage').style.opacity='.35';$('trialTitle').textContent='Loading recording…';$('trialSubtitle').textContent='Reading this trial from local CSV and C3D files';try{const res=await fetch('/api/trial?id='+encodeURIComponent(id));const data=await res.json();if(!res.ok)throw Error(data.error||'Trial unavailable');if(current!==loadSerial)return;trial=data;$('stage').style.opacity='1';time=0;focusQuantity='none';document.querySelectorAll('[data-focus]').forEach(b=>{const active=b.dataset.focus==='none';b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});setKind(data.entry.discipline);populateTrial();}catch(error){if(current===loadSerial){$('trialTitle').textContent='Could not load recording';$('trialSubtitle').textContent=error.message;toast(error.message);$('stage').style.opacity='1';if(trial){selectedId=trial.entry.id;setKind(trial.entry.discipline);populateTrial();toast('Load failed; showing previous recording')}}}}
function renderFeatured(){
 const pitch=[['pitch_speed_mph','Pitch speed','mph'],['max_pelvis_rotational_velo','Peak pelvis speed','°/s'],['max_torso_rotational_velo','Peak torso speed','°/s'],['max_shoulder_external_rotation','Max shoulder ER','°'],['elbow_varus_moment','Elbow varus moment','N·m']];
 const hit=[['exit_velo_mph_x','Exit velocity','mph'],['bat_speed_mph_contact_x','Published bat speed at contact','mph'],['bat_speed_mph_max_x','Published peak bat speed','mph'],['attack_angle_contact_x','Attack angle','°'],['pelvis_angular_velocity_seq_max_x','Peak pelvis speed','°/s'],['torso_angular_velocity_seq_max_x','Peak torso speed','°/s']];
 $('featured').innerHTML=(kind==='pitching'?pitch:hit).filter(([key])=>(trial.poi?.[key]??trial.metadata?.[key])!=null).map(([key,label,unit])=>`<div class="feature" title="${esc(trial.descriptions?.poi?.[key]||key)}"><small>${esc(label)}</small><div class="featureValue"><strong>${fmt(trial.poi?.[key]??trial.metadata?.[key],1)}</strong><em>${unit}</em></div></div>`).join('')||'<p class="caption">No published POI summary for this recording.</p>';
}
function renderHitTraxSummary(){
 const section=$('hittraxSummary'),data=kind==='hitting'?trial.hittrax:null;
 section.hidden=kind!=='hitting';if(!data){$('hittraxSummaryBody').innerHTML='<p class="caption">No HitTrax record is linked to this swing.</p>';return}
 const shown=(value,unit='',digits=1)=>Number.isFinite(value)?`${fmt(value,digits)}${unit}`:'—';
 const fields=[['Launch angle',shown(data.la,'°',0)],['Spray bearing',shown(data.bearing,'°',0)],['Carry',shown(data.dist,' ft',0)],['Incoming pitch',shown(data.pitch>0?data.pitch:null,' mph',1)],['Pitch descent',shown(data.pitch>0?data.pitch_angle:null,'°',1)],['Predicted result',String(data.res||'—').trim()]];
 const x=data.horizontal_distance,y=data.vertical_distance,hasLocation=Number.isFinite(x)&&Number.isFinite(y);
 const cx=90+Math.max(-36,Math.min(36,x||0))*2,cy=90-Math.max(-36,Math.min(36,y||0))*2;
 const location=hasLocation?`<div class="hittraxLocation"><svg viewBox="0 0 180 180" role="img" aria-label="Pitch location ${fmt(x,1)} inches horizontal and ${fmt(y,1)} inches vertical from strike-zone center"><rect x="18" y="18" width="144" height="144" fill="#fafafa" stroke="#d6d9db"/><path d="M90 18V162M18 90H162" stroke="#aeb6bb" stroke-width="1"/><path d="M54 86V94M126 86V94M86 54H94M86 126H94" stroke="#aeb6bb"/><circle cx="${cx}" cy="${cy}" r="5.5" fill="#c73327" stroke="#fff" stroke-width="2"/><text x="94" y="30">higher +</text><text x="94" y="154">lower −</text><text x="21" y="104">−</text><text x="150" y="104">+</text></svg><div><strong>Pitch location</strong><span>Horizontal ${shown(x,' in')}</span><span>Vertical ${shown(y,' in')}</span>${Number.isFinite(data.strike_zone)?`<span>Zone ${fmt(data.strike_zone,0)}</span>`:''}</div></div>`:'';
 $('hittraxSummaryBody').innerHTML=`<div class="hittraxStats">${fields.map(([label,value])=>`<div><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('')}</div>${location}<p class="hittraxNote">Location uses a fixed ±36 in scale from zone center; positive horizontal means inside to a right-handed hitter. Carry and result are HitTrax estimates.</p>`;
}
function rowsHTML(object,search='',descriptions={}){if(!object)return '<span class="caption">Not available for this recording.</span>';return Object.entries(object).filter(([k,v])=>!search||k.toLowerCase().includes(search.toLowerCase())||String(descriptions[k]||'').toLowerCase().includes(search.toLowerCase())).map(([k,v])=>`<span class="key" title="${esc(descriptions[k]||k)}">${esc(k.replaceAll('_',' '))}</span><span class="value" title="${esc(v)}">${esc(v==null?'—':typeof v==='number'?Number(v).toLocaleString(undefined,{maximumFractionDigits:3}):v)}</span>`).join('')}
function renderPitchReport(){
 const host=$('pitchReport'),sections=trial&&kind==='pitching'?buildPitchReport(trial):[];host.hidden=!sections.length;
 host.innerHTML=sections.map(section=>`<details class="readout readoutDisclosure reportDisclosure"><summary>${esc(section.title)}</summary><div class="disclosureBody"><div class="reportTable" style="--report-columns:${section.columns.length}"><div class="reportHeader"><span>Measure</span>${section.columns.map(column=>`<span>${esc(column)}</span>`).join('')}</div>${section.rows.map(row=>`<div class="reportRow" title="${esc(row.source||'Released full-signal CSV')}"><span>${esc(row.label)}</span>${section.columns.map((_,i)=>`<strong>${Number.isFinite(row.values[i])?`${fmt(row.values[i],row.unit==='s'?3:1)} <small>${esc(row.unit||section.unit)}</small>`:'—'}</strong>`).join('')}</div>`).join('')}</div><p class="reportNote">${esc(section.note)}</p></div></details>`).join('');
}
function hideEventPopup(){clearTimeout(popupHideTimer);$('eventPopup').hidden=true;$('scrubEvents').querySelectorAll('.scrubMarker.active').forEach(b=>b.classList.remove('active'))}
function renderTimelineEvents(){if(!trial)return;$('scrubEvents').innerHTML=timelineEvents.map((v,i)=>`<button class="scrubMarker" type="button" data-event-index="${i}" style="left:${timelinePositionCSS(playbackFraction(v.time))};--event-color:${v.color}" aria-label="${esc(v.label)} at ${fmt(v.time,3)} seconds; jump to event"></button>`).join('')}
function jumpToEvent(eventTime){if(!trial||!Number.isFinite(eventTime))return;playing=false;$('playButton').textContent='▶';time=eventTime;updateTimeline();hideEventPopup()}
function schedulePopupHide(){clearTimeout(popupHideTimer);popupHideTimer=setTimeout(hideEventPopup,180)}
function showEventPopup(index){
  const event=timelineEvents[index];if(!event)return;clearTimeout(popupHideTimer);
  const popup=$('eventPopup'),scrub=$('scrub'),width=scrub.clientWidth;
  $('eventPopupName').textContent=event.label;$('eventPopupTime').textContent=fmt(event.time,2)+' s';
  popup.dataset.time=String(event.time);popup.style.setProperty('--event-color',event.color);popup.hidden=false;
  const markerX=timelinePosition(playbackFraction(event.time),width),half=popup.offsetWidth/2;
  popup.style.left=Math.max(half+3,Math.min(width-half-3,markerX))+'px';
  $('scrubEvents').querySelectorAll('.scrubMarker').forEach(b=>b.classList.toggle('active',Number(b.dataset.eventIndex)===index));
}
function nearbyEvent(clientX){
  if(!timelineEvents.length||!trial)return -1;
  const rect=$('scrub').getBoundingClientRect(),x=clientX-rect.left;
  let closest=-1,distance=20;
  timelineEvents.forEach((event,i)=>{const delta=Math.abs(x-timelinePosition(playbackFraction(event.time),rect.width));if(delta<distance){distance=delta;closest=i}});
  return closest;
}
function populateTrial(){
  for(const [id,key] of [['showCOM','com'],['showCOMTrail','comTrail'],['showTrunkAxis','axis'],['showBraking','braking'],['showKneeExtension','knee']]){$(id).disabled=!sceneReady||!motionAnalysis(trial).available[key];if($(id).disabled)$(id).setAttribute('aria-pressed','false')}
  const e=trial.entry;$('dataCoverage').textContent=[`${Object.keys(trial.signals||{}).length} processed tables`,trial.motion?`${trial.motion.labels.length} raw markers`:'No raw markers',`${Object.keys(trial.poi||{}).length} POI fields`].join(' · ');powerState=buildPowerOverlay(trial);const powerButton=$('showPowerMap');powerButton.hidden=false;powerButton.disabled=!sceneReady||!powerState;powerButton.title=powerState?'Color mapped locations with available processed signals':'Requires processed joint centers and joint velocity or force-plate signals';if(powerButton.disabled){powerButton.setAttribute('aria-pressed','false');powerButton.classList.remove('active')}
  for(const option of $('powerMode').options){const available=!!powerState?.available[option.value];option.disabled=!available;option.hidden=!available}
  for(const group of $('powerMode').querySelectorAll('optgroup'))group.hidden=![...group.querySelectorAll('option')].some(option=>!option.hidden);
  if(!powerState?.available[$('powerMode').value])$('powerMode').value=Object.keys(powerState?.available||{})[0]||'generated';
  $('powerModeWrap').hidden=!layerOn('showPowerMap')||powerButton.disabled;soloForceMax=peakForceMagnitude([trial.motion]);const forceButton=$('showForces'),hasForce=soloForceMax>0;forceButton.disabled=!hasForce;forceButton.title=hasForce?'Individual force-plate measurements reconstructed from the C3D; arrows start at plate centers for display':'No individual C3D force-plate measurements in this replay';
  $('trialTitle').textContent=(e.discipline==='pitching'?'Pitch ':'Swing ')+catalogLabel(e);
  $('trialSubtitle').textContent=[e.athlete!=null?`Athlete ${e.athlete}`:null,e.session!=null?`Session ${e.session}`:null,e.side==='R'?'Right-handed':e.side==='L'?'Left-handed':null,`${fmt(trial.duration,2)} s`].filter(Boolean).join(' · ');
  $('limbLengthsBody').innerHTML=limbLengthsBody(trial);$('limbLengthsSection').open=false;
  $('metadata').innerHTML=rowsHTML(trial.metadata);$('poi').innerHTML=rowsHTML(trial.poi,'',trial.descriptions?.poi);$('hittrax').innerHTML=rowsHTML(trial.hittrax);renderHitTraxSummary();
  for(const [id,data] of [['poiSection',trial.poi],['metadataSection',trial.metadata],['hittraxSection',trial.hittrax]]){const section=$(id);section.open=false;section.hidden=!data||!Object.values(data).some(value=>value!=null&&value!=='')}
  const events=Object.entries(trial.events).sort((a,b)=>a[1].time-b[1].time);
  timelineEvents=events.map(([key,v])=>({time:v.time,label:EVENT_DISPLAY[key]||EVENT_SHORT[key]||v.label,color:EVENT_COLORS[key]||'#64717c'}));
  hideEventPopup();
  renderTimelineEvents();
  document.querySelectorAll('[data-focus]').forEach(b=>{if(b.dataset.focus!=='none')b.disabled=!trial.signals.landmarks});
  if(!trial.signals.landmarks&&trial.motion){const raw=$('showMarkers');raw.setAttribute('aria-pressed','true');raw.classList.add('active')}
  liveBatSpeed=e.discipline==='hitting'?batKinematics(trial):null;keypointExplorer?.setTrial(trial,liveBatSpeed);$('keypointModeButton').disabled=!sceneReady||!keypointExplorer?.groups.length;renderFeatured();renderPitchReport();setChartTrial(trial);if(sceneReady){buildGround();buildDynamic()}
  const sweepButton=$('showArmSweep'),hitting=e.discipline==='hitting';sweepButton.hidden=false;sweepButton.textContent=hitting?'Bat sweep · speed':`Arm sweep · ${armSweepMoment} moment`;$('armSweepMetricWrap').hidden=hitting||!armSweepData;$('armSweepMetric').value=armSweepMoment;sweepButton.disabled=!sceneReady||!armSweepData;
  const eventButton=$('showEventPoint');eventButton.textContent=hitting?'Contact point':'Release point';eventButton.disabled=!trial.signals?.landmarks||!trial.events?.[hitting?'contact_time':'BR_time'];
  const launchButton=$('showHitTrax');launchButton.hidden=!hitting;launchButton.disabled=!sceneReady||!hitTraxArrow;launchButton.title=launchButton.disabled?'Requires linked HitTrax launch angles and processed contact landmarks':'HitTrax launch direction at contact; enable Fake ball for a moving ball and purple trail';
  if(launchButton.disabled){launchButton.setAttribute('aria-pressed','false');launchButton.classList.remove('active')}
  sweepButton.title=sweepButton.disabled?(hitting?'Requires released bat handle and sweet-spot landmarks':'Requires released pitching joint centers and elbow moment data'):(hitting?'Smooth green–yellow–red bat speed sweep with an mph scale; filtering affects color only':'Shoulder–elbow–wrist sweep through the playhead, colored by the selected directional elbow moment component');updateTimeline();
}
function comparisonLabel(entry){const athlete=athleteKey(entry.data.entry),name=catalogLabel(entry.data.entry);return `${athlete==='unknown'?'Unassigned':`Athlete ${athlete}`} · ${name}`}
function comparisonChartLabel(entry){const athlete=athleteKey(entry.data.entry);return `${athlete==='unknown'?'File':`A${athlete}`} · ${catalogLabel(entry.data.entry)}`}
function renderComparisonFocusReadouts(foci){
 const byId=new Map(foci.map(focus=>[focus.id,focus.readout]));
 for(const readout of $('compareTrialControls').querySelectorAll('[data-compare-focus-readout]')){
  const text=byId.get(readout.dataset.compareFocusReadout);
  readout.hidden=!text;readout.textContent=text||'';
 }
}
function focusComparison(id,quantity,fromKeypoint=false){
 const entry=compareEntries.find(item=>item.id===id);
 if(!entry||!sceneReady)return;
 if(!fromKeypoint&&entry.keypoints?.selected){comparisonKeypoints?.close(id,false,false);comparisonKeypoints?.render()}
 if(!entry.data.signals?.landmarks&&quantity!=='none')return;
 if(quantity==='none')compareFocus.delete(id);else compareFocus.set(id,quantity);
 compareViewer?.setFocus(id,quantity);
 renderCompareControls();updateTimeline();
}
function matchComparisonSettings(id){
 const source=compareEntries.find(entry=>entry.id===id);
 if(!source)return;
 for(const target of compareEntries){
  if(target===source)continue;
  const data=target.data,hasEvent=!!data.events?.[data.entry.discipline==='pitching'?'BR_time':'contact_time'],part=compareViewer?.parts.get(target.id),modes=Object.keys(target.powerState?.available||{});
  Object.assign(target.options,source.options);for(const key of ['com','comTrail','axis','braking','knee'])target.options[key]&&=motionAnalysis(data).available[key];
  target.options.joints&&=!!data.signals?.landmarks;
  target.options.markers&&=!!data.motion;
  target.options.plates&&=!!data.motion?.platforms?.length;
  target.options.forces&&=!!data.motion?.platforms?.some(platform=>platform.force_global?.length);
  target.options.ball&&=hasEvent;target.options.eventPoint&&=hasEvent&&!!data.signals?.landmarks;
  target.options.sweep&&=!!part?.sweep;
  target.options.power&&=modes.length>0;
  if(!modes.includes(target.options.powerMode))target.options.powerMode=modes[0]||null;
  if(data.entry.discipline==='pitching'&&part)compareViewer.setSweepMoment(target.id,target.options.sweepMoment);
  const from=source.keypoints,to=target.keypoints;
  to.enabled=from.enabled;to.category=from.category;to.size=from.size;to.search=from.search;to.showEvents=from.showEvents;to.range={...from.range};
  // Match the anatomical selection and signal as well as its display controls.
  if(to.enabled){const groups=comparisonKeypoints?.groups(target)||[];if(to.category!=='full'&&!groups.some(group=>group.categories.includes(to.category)))to.category=groups.some(group=>group.categories.includes('core'))?'core':'raw'}
  comparisonKeypoints?.copyFullBodySettings(source,target);
  const metric=comparisonKeypoints?.copySelection(source,target),focus=metric?.focus||(source.keypoints.selected?'none':compareFocus.get(source.id)||'none');
  if(focus!=='none'&&data.signals?.landmarks){compareFocus.set(target.id,focus);compareViewer?.setFocus(target.id,focus)}
  else{compareFocus.delete(target.id);compareViewer?.setFocus(target.id,'none')}
 }
 compareViewer?.setSharedTrailScale(compareSharedTrailScale);
 comparisonKeypoints?.setEntries(compareEntries);
 renderCompareControls();updateTimeline();
}
function comparisonHasAnchor(data){if(compareSync==='start'||compareSync==='normalized')return true;const key=compareSync==='event'?(data.entry.discipline==='pitching'?'BR_time':'contact_time'):compareSync==='foot_contact'?'fp_10_time':'fp_100_time';return Number.isFinite(data.events?.[key]?.time)}
function renderCompareControls(){
 const bodyLayers=[['thick','Thick segments'],['thin','Thin skeleton'],['joints','Joint centers'],['markers','Raw markers'],['power','Color skeleton']];
 const focusChoices=[['none','Whole motion'],['torso','Torso rotation'],['torsoPelvis','Torso–pelvis separation'],['shoulder',kind==='pitching'?'Shoulder external rotation':'Lead shoulder rotation'],['elbow','Elbow flexion'],['leadKnee','Lead knee flexion'],['rearKnee','Rear knee flexion'],...(kind==='pitching'?[['pelvis','Pelvis rotation'],['trunkForward','Forward trunk tilt'],['trunkLateral','Lateral trunk tilt'],['shoulderAbduction','Shoulder abduction'],['shoulderHorizontal','Scap load · horizontal abduction'],['wrist','Wrist extension'],['pelvisSpeed','Pelvis rotation speed'],['torsoSpeed','Torso rotation speed'],['elbowExtensionSpeed','Elbow extension speed'],['armInternalSpeed','Arm internal rotation speed'],['leadKneeExtensionSpeed','Lead knee extension speed']]:[['pelvis','Pelvis rotation'],['pelvisSpeed','Pelvis rotation speed'],['torsoSpeed','Torso rotation speed']])];
 $('compareModeButton').classList.toggle('active',compareMode);$('compareModeButton').setAttribute('aria-pressed',String(compareMode));$('compareModeCount').hidden=!compareMode;$('compareModeCount').textContent=`${compareEntries.length}/4`;
 $('compareTrialControls').innerHTML=compareEntries.map((entry,i)=>{const color=REPLAY_COLORS[entry.colorIndex],data=entry.data,hasPlates=!!data.motion?.platforms?.length,hasForces=!!data.motion?.platforms?.some(p=>p.force_global?.length),hasBall=!!data.events?.[data.entry.discipline==='pitching'?'BR_time':'contact_time'],focusValue=compareFocus.get(entry.id)||'none',hitting=data.entry.discipline==='hitting',sweep=compareViewer?.parts.get(entry.id)?.sweep;
 const power=entry.powerState,modes=Object.keys(power?.available||{});if(!modes.includes(entry.options.powerMode))entry.options.powerMode=modes[0]||null;
 const disabled=key=>['com','comTrail','axis','braking','knee'].includes(key)&&(!sceneReady||!motionAnalysis(data).available[key])||key==='power'&&(!modes.length||!sceneReady)||key==='joints'&&!data.signals?.landmarks||key==='markers'&&!data.motion||key==='plates'&&!hasPlates||key==='forces'&&!hasForces||(key==='ball'||key==='eventPoint')&&!hasBall||key==='eventPoint'&&!data.signals?.landmarks||key==='sweep'&&!sweep;
 const menu=(name,items)=>`<details class="layerMenu"><summary>${name}</summary><div class="layerMenuPanel">${items.map(([key,label])=>`<button class="soloLayer" type="button" data-compare-option="${key}" data-id="${esc(entry.id)}" aria-pressed="${!!entry.options[key]}" ${disabled(key)?'disabled':''}>${label}</button>`).join('')}</div></details>`;
 const scale=sweep?.colorScale,unit=hitting?'mph':'N·m',legend=scale?`<div class="compareSweepGradient" style="background:linear-gradient(90deg,#259e50 0%,#259e50 ${scale.greenEnd}%,#e6bf37 ${scale.yellowStop}%,#c4382b 100%)"></div><div class="armSweepTicks"><span>${fmt(scale.low,1)} ${unit}</span><span>${fmt(scale.mid,1)} ${unit}</span><span>${fmt(scale.high,1)} ${unit}</span></div><small>${hitting?'Smoothed color · ':`Elbow ${entry.options.sweepMoment} · internal ${entry.options.sweepMoment==='valgus'?'−Y':'＋Y'} magnitude · `}${compareSharedTrailScale?'Shared selected-replay scale':hitting?'Per-swing scale':'Per-pitch scale'}</small>`:`<small>Arm sweep · 0–${fmt(sweep?.peak,0)} N·m</small>`;
 return `<article class="compareTrialCard" style="--trial-color:${color.body};--trail-color:${color.trail}"><div class="compareTrialHead"><span class="compareTrialDot" aria-hidden="true"></span><strong title="${esc(comparisonLabel(entry))}">${esc(comparisonLabel(entry))}</strong><time data-compare-time="${esc(entry.id)}"></time><button type="button" data-compare-remove="${esc(entry.id)}" aria-label="Remove ${esc(comparisonLabel(entry))}" ${compareEntries.length===1?'disabled':''}>×</button></div><div class="compareTrialMeta">${i===0?'<b>Timeline reference</b>':`<button type="button" data-compare-primary="${esc(entry.id)}">Use as reference</button>`}${comparisonHasAnchor(data)?'':'<span>Event missing · uses start</span>'}</div><label class="compareTrialFocus">Focus in 3D<select data-compare-focus data-id="${esc(entry.id)}" ${!data.signals?.landmarks||!sceneReady?'disabled':''}>${focusChoices.map(([key,label])=>`<option value="${key}" ${focusValue===key?'selected':''}>${label}</option>`).join('')}</select></label><div class="compareTrialFocusValue" data-compare-focus-readout="${esc(entry.id)}" hidden></div><div class="compareTrialLayers">${menu('Body display',[...bodyLayers,['com','Center of mass'],['comTrail','COM trail'],['axis','Trunk axis · geometric guide'],['braking','Lead-leg braking / force X'],['knee','Lead-knee extension'],['trail',hitting?'Bat path · line':'Hand path · line'],['sweep',hitting?'Bat sweep · speed':`Arm sweep · ${entry.options.sweepMoment} moment`]])}${menu('Scene display',[['plates','Force plates'],['forces','Force plate vectors'],['ball','Fake ball'],['eventPoint',hitting?'Contact point':'Release point']])}<button type="button" data-compare-snap="${esc(entry.id)}" ${compareSplit&&splitViewer?.views.some(view=>view.entry.id===entry.id)?'':'disabled'} title="${compareSplit?'Apply this pane’s camera angle, zoom and pan to all visible panes':'Enable separate views to synchronize pane cameras'}">Snap all to view</button><button type="button" data-compare-match="${esc(entry.id)}" ${compareEntries.length<2?'disabled':''} title="Copy display choices to the other replays">Match settings</button><button type="button" data-compare-keypoints="${esc(entry.id)}" aria-pressed="${!!entry.keypoints?.enabled}">Explore keypoints</button></div><div class="compareKeypointControls" ${entry.keypoints?.enabled?'':'hidden'}><label>Show<select data-compare-keypoint-category data-id="${esc(entry.id)}">${[['core','Essentials'],['full','Full body'],['joints','Joints and motion'],['kinetics','Forces and power'],['raw','Raw C3D markers']].map(([key,label])=>`<option value="${key}" ${entry.keypoints?.category===key?'selected':''}>${label}</option>`).join('')}</select></label><label>Point size<input type="range" data-compare-keypoint-size data-id="${esc(entry.id)}" min="0" max="150" value="${Math.round((entry.keypoints?.size??.5)*100)}"><output>${Math.round((entry.keypoints?.size??.5)*100)}%</output></label><input type="search" data-compare-keypoint-search data-id="${esc(entry.id)}" value="${esc(entry.keypoints?.search||'')}" placeholder="Find marker" aria-label="Find raw marker" ${entry.keypoints?.category==='raw'?'':'hidden'}></div>${hitting?'':`<label class="compareTrialFocus">Arm trail metric<select data-compare-sweep-moment data-id="${esc(entry.id)}" ${!sweep?'disabled':''}><option value="varus" ${entry.options.sweepMoment==='varus'?'selected':''}>Elbow varus moment (+Y)</option><option value="valgus" ${entry.options.sweepMoment==='valgus'?'selected':''}>Elbow valgus moment (−Y)</option></select></label>`}<div class="comparePowerControls" ${entry.options.power?'':'hidden'}><label>Color metric<select data-compare-power-mode data-id="${esc(entry.id)}">${modes.map(mode=>`<option value="${mode}" ${mode===entry.options.powerMode?'selected':''}>${esc(power.configs[mode].label)}</option>`).join('')}</select></label><label class="comparePowerLocal"><input type="checkbox" data-compare-power-local data-id="${esc(entry.id)}" ${entry.options.powerLocal?'checked':''}>Scale each location separately</label><div data-compare-power-legend="${esc(entry.id)}"></div></div><div class="compareSweepLegend" ${entry.options.sweep&&sweep?'':'hidden'}>${legend}</div></article>`}).join('');
 organizeComparisonControls($('compareTrialControls'));comparisonKeypoints?.mountFullBodyControls();
}
function compareNumber(value,unit,digits=1){return value!=null&&Number.isFinite(Number(value))?`${fmt(Number(value),digits)} ${unit}`:'—'}
function comparePlayheadNumber(value,unit,digits=1){return value!=null&&Number.isFinite(value)?`${fmt(value,digits)} ${unit}`:`— ${unit}`}
function comparisonMeasurements(data){
 const meta=data.metadata||{},number=value=>value!=null&&value!==''&&Number.isFinite(Number(value))&&Number(value)>0?Number(value):null;
 const meters=number(meta.session_height_m)??(number(meta.session_height_in)==null?null:number(meta.session_height_in)*.0254);
 const kg=number(meta.session_mass_kg)??(number(meta.session_mass_lbs)==null?null:number(meta.session_mass_lbs)*.45359237);
 const inches=meters==null?null:Math.round(meters/.0254);
 return {height:inches==null?'—':`${Math.floor(inches/12)}′${inches%12}″`,heightMetric:meters==null?'':`${fmt(meters*100,1)} cm`,weight:kg==null?'—':`${fmt(kg/.45359237,0)} lb`,weightMetric:kg==null?'':`${fmt(kg,1)} kg`};
}
function comparisonMoreInfo(data){
 const meta=data.metadata||{},pitch=data.entry.discipline==='pitching';
 const rows=[['Athlete',data.entry.athlete],['Session',data.entry.session],['Age',meta.age_yrs??meta.athlete_age],['Playing level',meta.playing_level??meta.highest_playing_level??data.entry.playing_level],['Handedness',data.entry.side],...(pitch?[['Pitch type',data.entry.pitch_type]]:[['Bat length',meta.bat_length_in==null?null:`${meta.bat_length_in} in`],['Bat weight',meta.bat_weight_oz==null?null:`${meta.bat_weight_oz} oz`]]),['Data availability',data.entry.status]].filter(([,value])=>value!=null&&value!=='');
 return `<details class="compareRecordingInfo"><summary>More athlete & recording info</summary><dl>${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(String(value))}</dd></div>`).join('')}</dl><small>Height and weight are published session measurements.</small></details>`;
}
function renderCompareInspector(){
 $('compareInspector').innerHTML=compareEntries.map(entry=>{const data=entry.data,color=REPLAY_COLORS[entry.colorIndex],poi=data.poi||{},measurements=comparisonMeasurements(data),pitch=data.entry.discipline==='pitching',stats=pitch?[['Velocity',data.entry.speed_mph,'mph'],['Peak torso',poi.max_torso_rotational_velo,'°/s'],['Elbow varus',poi.elbow_varus_moment,'N·m']]:[['Exit velocity',data.entry.speed_mph,'mph'],['Published bat at contact',poi.bat_speed_mph_contact_x,'mph'],['Published peak bat speed',poi.bat_speed_mph_max_x,'mph'],['Attack angle',poi.attack_angle_contact_x,'°']];return `<section class="compareDetailCard" style="--trial-color:${color.body}"><div class="compareDetailHead"><span class="compareTrialDot" aria-hidden="true"></span><strong>${esc(comparisonLabel(entry))}</strong><time data-compare-detail-time="${esc(entry.id)}"></time></div><div class="compareSummary">${stats.slice(0,1).map(([label,value,unit])=>`<div><span>${esc(label)}</span><strong>${esc(compareNumber(value,unit))}</strong></div>`).join('')}<div title="Published session height"><span>Height</span><strong>${measurements.height}</strong><small>${measurements.heightMetric}</small></div><div title="Published session weight"><span>Weight</span><strong>${measurements.weight}</strong><small>${measurements.weightMetric}</small></div>${stats.slice(1).map(([label,value,unit])=>`<div><span>${esc(label)}</span><strong>${esc(compareNumber(value,unit))}</strong></div>`).join('')}</div>${comparisonMoreInfo(data)}${limbLengthsDisclosure(data)}<div class="compareLive"><div><span>${pitch?'Torso rotation':'Pelvis rotation'}</span><strong data-compare-live="${esc(entry.id)}:one">—</strong></div><div><span>${pitch?'Shoulder ER':'Torso rotation'}</span><strong data-compare-live="${esc(entry.id)}:two">—</strong></div>${pitch?'':`<div title="Unfiltered sweet-spot XYZ position derivative at released timestamps; published speeds are separate references"><span>Reconstructed bat speed</span><strong data-compare-live="${esc(entry.id)}:bat">—</strong></div>`}<div title="Processed lead-foot ground reaction force from force_plate.csv"><span>Lead ground reaction force</span><strong data-compare-live="${esc(entry.id)}:force">—</strong></div></div></section>`}).join('');
}
function dataValue(data,table,key,t){const signal=data.signals?.[table];if(!signal?.time?.length||t<signal.time[0]||t>signal.time.at(-1))return null;const value=signal.series?.[key]?.[nearestIndex(signal.time,t)];return Number.isFinite(value)?value:null}
function updateComparePowerLegends(){
 for(const entry of compareEntries){
  const el=$('compareTrialControls').querySelector(`[data-compare-power-legend="${CSS.escape(entry.id)}"]`),state=entry.powerState,mode=entry.options.powerMode,config=state?.configs[mode];
  if(!el||!config||!entry.options.power)continue;
  const scale=state.scales[mode]||1,local=entry.options.powerLocal,values=powerValues(state,mode,Math.max(0,Math.min(entry.data.duration,alignedTime(time,trial,entry.data,compareSync))));
  const colors=config.palette==='sweep'?'#259e50,#e6bf37,#c4382b':config.palette==='positive'?'#ffe34a,#ee3631':'#146fe0,#ffe34a,#ee3631';
  el.innerHTML=`<div class="compareSweepGradient" style="background:linear-gradient(90deg,${colors})"></div><div class="armSweepTicks"><span>${config.palette==='signed'?local?'−100%':fmt(-scale,1):'0'}</span><span>${config.palette==='signed'?'0':local?'50%':fmt(scale/2,1)}</span><span>${local?'100%':fmt(scale,1)+' '+esc(config.unit)}</span></div><small title="${esc(config.note)}">${esc(config.note)} ${local?'Each location uses its own':'Locations share this replay’s'} 90th-percentile scale ${esc(state.phaseLabel)}; gray means missing.</small><div class="comparePowerValues">${overlayItems(mode,state).map(item=>`<span>${esc(item.label)}: <b>${Number.isFinite(values[item.key])?fmt(values[item.key],1)+' '+esc(config.unit):'—'}</b></span>`).join('')}</div>`;
 }
}
function updateComparePlayhead(){
 if(!compareMode||!trial)return;
 updateComparePowerLegends();
 for(const entry of compareEntries){const t=alignedTime(time,trial,entry.data,compareSync),active=t>=0&&t<=entry.data.duration,shown=t<entry.poseRange.start-.000001?'Held at start':t>entry.poseRange.end+.000001?'Held at end':`${fmt(t,3)} s`;for(const el of document.querySelectorAll('[data-compare-time],[data-compare-detail-time]'))if(el.dataset.compareTime===entry.id||el.dataset.compareDetailTime===entry.id)el.textContent=shown;
  const pitch=kind==='pitching',one=active?dataValue(entry.data,'joint_angles',pitch?'torso_angle_z':'pelvis_angle_z',t):null,two=active?dataValue(entry.data,'joint_angles',pitch?'shoulder_angle_z':'torso_angle_z',t):null,f=active?['x','y','z'].map(axis=>dataValue(entry.data,'force_plate',`lead_force_${axis}`,t)):[],batSample=!pitch&&active&&entry.batSpeed?sample({time:entry.batSpeed.time,values:entry.batSpeed.speed},t):null,bat=Number.isFinite(batSample)?batSample*2.2369362921:null;for(const [field,value,unit,digits] of [['one',one,'°',1],['two',two,'°',1],...(!pitch?[['bat',bat,'mph',1]]:[]),['force',f.length===3&&f.every(Number.isFinite)?Math.hypot(...f):null,'N',0]]){const el=$('compareInspector').querySelector(`[data-compare-live="${CSS.escape(entry.id+':'+field)}"]`);if(el){el.textContent=field==='bat'&&!Number.isFinite(value)?'— mph':comparePlayheadNumber(value,unit,digits);el.title=value==null?(field==='bat'?'Insufficient contiguous XYZ samples for the native derivative.':'No sample at this playhead.') : ''}}
 }
}
function updateSplitLayout(){
 const active=compareMode&&compareSplit&&sceneReady;
 $('compareSplit').setAttribute('aria-pressed',String(active));$('compareSplit').disabled=!sceneReady;
 document.querySelector('.stageWrap').classList.toggle('splitPanes',active);
 $('planeViewsToggle').disabled=active||!sceneReady;
 if(active)splitViewer.setEntries(compareEntries,trial,compareSync,time,camera,controls.target,comparisonLabel,entry=>REPLAY_COLORS[entry.colorIndex].body);
 else splitViewer?.clear();
}
function refreshComparison(rebuildScene=true){
 if(!compareMode||!trial)return;
 compareForceMax=peakForceMagnitude(compareEntries.map(entry=>entry.data.motion));
 const {min,max}=playbackBounds();time=Math.max(min,Math.min(max,time));
 document.body.classList.add('comparing');$('focusMenuButton').closest('.menuWrap').hidden=true;
 $('compareToolbar').hidden=false;$('compareInspector').hidden=false;document.querySelector('.inspectorScroll').hidden=true;updateInspectorTitle();
 if(sceneReady){dynamic.visible=false;forceArrows.forEach(({arrow})=>arrow.visible=false);plateMeshes.forEach(mesh=>mesh.visible=false);if(rebuildScene)compareViewer.setEntries(compareEntries);compareViewer.setAlignment(trial,compareSync,comparePosition);compareViewer.setForceScale(compareForceMax);compareViewer.setSharedTrailScale(compareSharedTrailScale);compareViewer.setFocuses(compareFocus)}
 updateSplitLayout();
 comparisonKeypoints?.setEntries(compareEntries);
 setChartComparison(compareEntries.map(entry=>({...entry,label:comparisonChartLabel(entry)})),compareSync);renderCompareControls();renderCompareInspector();renderCatalog();renderTimelineEvents();updateTimeline();
}
function enterCompareMode(){
 if(!trial||trial.entry.status==='static-model'){toast('Select a pitch or swing before comparing replays.');return}
 keypointExplorer?.setEnabled(false);$('keypointModeButton').hidden=true;
 compareGeneration++;compareMode=true;compareSplit=false;compareSync='event';comparePosition='pelvis';compareSharedTrailScale=false;$('compareSharedTrailScale').setAttribute('aria-pressed','false');compareFocus=new Map();$('compareSync').value=compareSync;$('comparePosition').value=comparePosition;focusQuantity='none';document.querySelectorAll('[data-focus]').forEach(button=>{const active=button.dataset.focus==='none';button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});
 compareEntries=[makeCompareEntry(trial,0)];refreshComparison(true);
}
function exitCompareMode(){
 compareGeneration++;compareMode=false;compareSplit=false;compareEntries=[];comparePending.clear();compareFocus=new Map();comparisonKeypoints?.setEntries([]);time=Math.min(trial?.duration||0,Math.max(0,time));document.body.classList.remove('comparing');$('keypointModeButton').hidden=false;$('focusMenuButton').closest('.menuWrap').hidden=false;$('compareToolbar').hidden=true;$('compareInspector').hidden=true;document.querySelector('.inspectorScroll').hidden=false;updateSplitLayout();compareViewer?.clear();if(dynamic)dynamic.visible=true;setChartComparison(null);updateInspectorTitle();renderCompareControls();renderCatalog();renderTimelineEvents();updateTimeline();
}
function activateComparisonPrimary(previous){const entry=compareEntries[0];selectedId=entry.id;trial=entry.data;time=alignedTime(time,previous,trial,compareSync);const {min,max}=playbackBounds();time=Math.max(min,Math.min(max,time));playing=false;$('playButton').textContent='▶';setKind(trial.entry.discipline);populateTrial();refreshComparison(true)}
function makeComparisonPrimary(id){const index=compareEntries.findIndex(entry=>entry.id===id);if(index<=0)return;const previous=trial,entry=compareEntries.splice(index,1)[0];compareEntries.unshift(entry);activateComparisonPrimary(previous)}
async function toggleComparisonTrial(id){
 const index=compareEntries.findIndex(entry=>entry.id===id);
 if(index>=0){if(compareEntries.length===1){toast('Keep one replay as the timeline reference, or leave comparison mode.');return}const previous=trial;compareEntries.splice(index,1);compareFocus.delete(id);compareViewer?.setFocus(id,'none');if(index===0)activateComparisonPrimary(previous);else refreshComparison(true);return}
 if(compareEntries.length+comparePending.size>=4){toast('Compare up to four replays at a time.');return}
 const listing=catalog.find(entry=>entry.id===id);if(!listing||listing.discipline!==kind||listing.status==='static-model'){toast('Choose a pitch or swing from the current discipline.');return}
 if(comparePending.has(id))return;comparePending.add(id);const generation=compareGeneration;renderCatalog();
 try{const response=await fetch('/api/trial?id='+encodeURIComponent(id));const data=await response.json();if(!response.ok)throw Error(data.error||'Replay unavailable');if(!compareMode||generation!==compareGeneration||data.entry.discipline!==kind||compareEntries.some(entry=>entry.id===id))return;const wasAtStart=Math.abs(time-playbackBounds().min)<.001,colorIndex=REPLAY_COLORS.findIndex((_,i)=>!compareEntries.some(entry=>entry.colorIndex===i));compareEntries.push(makeCompareEntry(data,colorIndex));if(wasAtStart)time=playbackBounds().min;refreshComparison(true)}catch(error){if(generation===compareGeneration)toast(error.message)}finally{if(generation===compareGeneration){comparePending.delete(id);renderCatalog()}}
}
function frameFocusCamera(){
 if(!sceneReady||!trial||focusQuantity==='none')return;
 if(focusQuantity==='shoulderHorizontal'){
  const times=trial.signals?.landmarks?.time,index=times?.length?nearestIndex(times,time):0,center=pointFromSignal('shoulder_jc',index);
  if(center)setOverheadFocus(vec(center));
 }else{
  const offset=camera.position.clone().sub(controls.target).normalize().multiplyScalar(focusQuantity==='torso'?2.5:1.6);
  camera.position.copy(controls.target).add(offset);controls.update();
 }
}
function setFocusCameraMode(mode){
 focusCameraMode=mode;
 for(const [id,value] of [['focusCameraFree','free'],['focusCameraFollow','follow']]){
  const button=$(id),active=value===mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
 }
 if(mode==='follow'&&!compareMode&&focusQuantity!=='none'){frameFocusCamera();if(sceneReady)updateMotion()}
}
function focusGeometry(which){
 if(compareMode)return;
 focusQuantity=which;
 document.querySelectorAll('[data-focus]').forEach(b=>{const active=b.dataset.focus===which;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
 if(which==='none'){if(sceneReady&&focusCameraMode==='follow'){controls.target.copy(defaultCameraTarget);setCamera($('cameraPreset').value)}}
 else if(focusCameraMode==='follow')frameFocusCamera();
 if(sceneReady)updateMotion();else drawFallback();
}
function bindControls(){
  const left=$('toggleLeft'),right=$('toggleRight');
  left.addEventListener('click',()=>{const closed=document.body.classList.toggle('hideLeft');left.textContent=closed?'›':'Hide ‹';left.setAttribute('aria-label',closed?'Expand sessions':'Collapse sessions');left.title=closed?'Expand sessions':'Collapse sessions'});
  right.addEventListener('click',()=>{const closed=document.body.classList.toggle('hideRight');right.textContent=closed?'‹':'Hide ›';right.setAttribute('aria-label',closed?'Expand details':'Collapse details');right.title=closed?'Expand details':'Collapse details'});
  document.querySelectorAll('.tabs button[data-kind]').forEach(b=>b.addEventListener('click',()=>{hidePerformance();if(compareMode&&b.dataset.kind!==kind)exitCompareMode();setKind(b.dataset.kind);const next=catalog.find(e=>e.discipline===kind&&e.status==='linked');if(next&&trial?.entry.discipline!==kind)selectTrial(next.id)}));
  $('performanceTab').addEventListener('click',showPerformance);
  for(const [id,mode] of [['filesMode','files'],['athletesMode','athletes']])$(id).addEventListener('click',()=>{if(catalogMode===mode)return;catalogMode=mode;activeAthlete=null;$('search').placeholder=mode==='athletes'?'Search athletes or attempts':'Search recordings';$('search').setAttribute('aria-label',$('search').placeholder);for(const [button,value] of [['filesMode','files'],['athletesMode','athletes']]){const active=value===mode;$(button).classList.toggle('active',active);$(button).setAttribute('aria-pressed',String(active))}renderCatalog();$('catalogList').scrollTop=0});
  $('catalogList').addEventListener('click',e=>{if(e.target.closest('[data-athlete-back]')){activeAthlete=null;renderCatalog();$('catalogList').scrollTop=0;return}const athlete=e.target.closest('[data-athlete]');if(athlete){activeAthlete=athlete.dataset.athlete;renderCatalog();$('catalogList').scrollTop=0;return}const recording=e.target.closest('[data-id]');if(recording){if(compareMode)toggleComparisonTrial(recording.dataset.id);else selectTrial(recording.dataset.id)}});
  $('compareModeButton').addEventListener('click',()=>compareMode?exitCompareMode():enterCompareMode());
  $('compareSync').addEventListener('change',e=>{const wasAtStart=Math.abs(time-playbackBounds().min)<.001;compareSync=e.target.value;if(wasAtStart)time=playbackBounds().min;refreshComparison(false)});
  $('comparePosition').addEventListener('change',e=>{comparePosition=e.target.value;refreshComparison(false)});
  $('compareSharedTrailScale').addEventListener('click',()=>{compareSharedTrailScale=!compareSharedTrailScale;$('compareSharedTrailScale').setAttribute('aria-pressed',String(compareSharedTrailScale));compareViewer?.setSharedTrailScale(compareSharedTrailScale);renderCompareControls();updateTimeline()});
  $('compareSplit').addEventListener('click',()=>{if(!sceneReady)return;compareSplit=!compareSplit;updateSplitLayout();renderCompareControls();updateTimeline()});
  $('compareKeypointInViewer').addEventListener('click',()=>{const enabled=!comparisonKeypoints.inViewer;comparisonKeypoints.setInViewer(enabled);$('compareKeypointInViewer').setAttribute('aria-pressed',String(enabled));updateTimeline()});
  $('compareTrialControls').addEventListener('change',e=>{const category=e.target.closest('[data-compare-keypoint-category]');if(category){comparisonKeypoints?.setCategory(category.dataset.id,category.value);renderCompareControls();updateTimeline();return}const select=e.target.closest('[data-compare-focus]');if(select)focusComparison(select.dataset.id,select.value);const moment=e.target.closest('[data-compare-sweep-moment]');if(moment){compareViewer?.setSweepMoment(moment.dataset.id,moment.value);compareViewer?.setSharedTrailScale(compareSharedTrailScale);renderCompareControls();updateTimeline()}const metric=e.target.closest('[data-compare-power-mode]'),local=e.target.closest('[data-compare-power-local]'),control=metric||local;if(control){const entry=compareEntries.find(item=>item.id===control.dataset.id);if(entry){if(metric)entry.options.powerMode=metric.value;else entry.options.powerLocal=local.checked;updateTimeline()}}});
  $('compareTrialControls').addEventListener('click',e=>{const match=e.target.closest('[data-compare-match]'),keypoints=e.target.closest('[data-compare-keypoints]'),option=e.target.closest('[data-compare-option]'),remove=e.target.closest('[data-compare-remove]'),primary=e.target.closest('[data-compare-primary]'),snap=e.target.closest('[data-compare-snap]');if(snap){splitViewer?.snapAllToView(snap.dataset.compareSnap)}else if(match)matchComparisonSettings(match.dataset.compareMatch);else if(keypoints){const entry=compareEntries.find(item=>item.id===keypoints.dataset.compareKeypoints);if(entry){comparisonKeypoints?.setEnabled(entry.id,!entry.keypoints.enabled);renderCompareControls();updateTimeline()}}else if(option){const entry=compareEntries.find(item=>item.id===option.dataset.id);if(entry){entry.options[option.dataset.compareOption]=!entry.options[option.dataset.compareOption];option.setAttribute('aria-pressed',String(entry.options[option.dataset.compareOption]));const legend=option.closest('.compareTrialCard').querySelector('.compareSweepLegend');if(legend)legend.hidden=!entry.options.sweep;const powerControls=option.closest('.compareTrialCard').querySelector('.comparePowerControls');if(powerControls)powerControls.hidden=!entry.options.power;updateTimeline()}}else if(remove)toggleComparisonTrial(remove.dataset.compareRemove);else if(primary)makeComparisonPrimary(primary.dataset.comparePrimary)});
  $('compareTrialControls').addEventListener('input',e=>{const size=e.target.closest('[data-compare-keypoint-size]'),search=e.target.closest('[data-compare-keypoint-search]');if(size){comparisonKeypoints?.setSize(size.dataset.id,size.value);size.nextElementSibling.textContent=`${size.value}%`}else if(search)comparisonKeypoints?.setSearch(search.dataset.id,search.value)});
  $('sortFilter').addEventListener('change',()=>{const select=$('sortFilter');if(select.value==='__more'){select.value=select.dataset.previous||'default';$('moreSort').open=true;$('moreSortSearch').focus()}else select.dataset.previous=select.value});
  $('moreSortSearch').addEventListener('input',renderExtraSort);$('moreSortOptions').addEventListener('click',event=>{const button=event.target.closest('[data-sort-metric]');if(!button)return;const select=$('sortFilter');if(![...select.options].some(option=>option.value===button.dataset.sortMetric))select.add(new Option(button.textContent,button.dataset.sortMetric));select.value=button.dataset.sortMetric;select.dataset.previous=select.value;$('moreSort').open=false;select.focus();renderCatalog()});
  $('search').addEventListener('input',renderCatalog);for(const id of ['statusFilter','sortFilter','orderFilter','sideFilter','typeFilter','levelFilter','metricFilter'])$(id).addEventListener('change',renderCatalog);for(const id of ['minFilter','maxFilter'])$(id).addEventListener('input',()=>{if(($('minFilter').value||$('maxFilter').value)&&!$('metricFilter').value)$('metricFilter').value='speed_mph';renderCatalog()});$('filterButton').addEventListener('click',()=>{const open=$('filterPanel').hidden;$('filterPanel').hidden=!open;$('filterButton').setAttribute('aria-expanded',String(open))});$('clearFilters').addEventListener('click',()=>{for(const id of ['statusFilter','sideFilter','typeFilter','levelFilter'])$(id).value='all';$('sortFilter').value='default';$('sortFilter').dataset.previous='default';$('orderFilter').value='desc';$('metricFilter').value='';$('minFilter').value='';$('maxFilter').value='';renderCatalog()});
  const menus=[[$('focusMenuButton'),$('focusMenu')]];
  const closeMenus=(except=null)=>{for(const [button,panel] of menus){const open=panel===except;panel.hidden=!open;button.setAttribute('aria-expanded',String(open))}};
  for(const [button,panel] of menus)button.addEventListener('click',()=>closeMenus(panel.hidden?panel:null));
  const layerMenus=()=>[...document.querySelectorAll('.layerMenu')];
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.menuWrap'))closeMenus();for(const menu of layerMenus())if(!menu.contains(e.target))menu.open=false});
  document.addEventListener('focusin',e=>{for(const menu of layerMenus())if(!menu.contains(e.target))menu.open=false});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){const open=layerMenus().find(menu=>menu.open);for(const menu of layerMenus())menu.open=false;if(open)open.querySelector('summary').focus()}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){const open=menus.find(([,panel])=>!panel.hidden);if(open){closeMenus();open[0].focus()}}});
  $('focusBar').addEventListener('click',e=>{if(e.target.closest('[data-focus]'))closeMenus()});
  $('cameraPreset').addEventListener('change',e=>{if(sceneReady){setCamera(e.target.value);if(compareSplit)splitViewer?.reset(camera,controls.target,time)}else drawFallback()});
  $('planeViewsToggle').addEventListener('click',()=>{const button=$('planeViewsToggle'),open=button.getAttribute('aria-pressed')!=='true';button.setAttribute('aria-pressed',String(open));$('planeViews').hidden=!open;document.querySelector('.stageWrap').classList.toggle('planeViewsOpen',open)});
  $('resetView').addEventListener('click',()=>{setFocusCameraMode('free');if(sceneReady){controls.target.copy(defaultCameraTarget);setCamera($('cameraPreset').value);if(compareSplit)splitViewer?.reset(camera,controls.target,time)}else drawFallback()});
  $('focusCameraFree').addEventListener('click',()=>setFocusCameraMode('free'));
  $('focusCameraFollow').addEventListener('click',()=>setFocusCameraMode('follow'));
  document.querySelectorAll('[data-focus]').forEach(b=>b.addEventListener('click',()=>{keypointExplorer?.clearSelection(false);focusGeometry(b.dataset.focus)}));
  $('saveMP4').addEventListener('click',startMovieExport);
  setInterval(pollMovieJob,1500);
  window.addEventListener('pagehide',()=>{if(movieJob)navigator.sendBeacon(`/api/video-exports/${movieJob}/cancel`,new Blob([]))});
  $('armSweepMetric').addEventListener('change',()=>{
   armSweepMoment=$('armSweepMetric').value==='valgus'?'valgus':'varus';
   if(armSweepData){dynamic.remove(armSweepData.mesh);armSweepData.mesh.geometry.dispose();armSweepData.mesh.material.dispose()}
   armSweepData=buildArmSweep();$('showArmSweep').textContent=`Arm sweep · ${armSweepMoment} moment`;updateTimeline();
  });
  for(const id of ['showCOM','showCOMTrail','showTrunkAxis','showBraking','showKneeExtension','showSolid','showThin','showJoints','showTrail','showEventPoint','showArmSweep','showHitTrax','showPowerMap','showMarkers','showPlates','showForces','showBall'])$(id).addEventListener('click',()=>{const button=$(id),active=!layerOn(id);button.setAttribute('aria-pressed',String(active));button.classList.toggle('active',active);$('powerModeWrap').hidden=!layerOn('showPowerMap');if(sceneReady)updateMotion();else drawFallback();updateArmSweepLegend();updatePowerLegend()});
  $('powerMode').addEventListener('change',()=>{if(sceneReady)updateMotion();updatePowerLegend()});
  $('powerLocalScale').addEventListener('change',()=>{if(sceneReady)updateMotion();updatePowerLegend()});
  $('playButton').addEventListener('click',()=>{const {min,max}=playbackBounds();if(!trial||max<=min)return;if(time>=max)time=min;playing=!playing;$('playButton').textContent=playing?'Ⅱ':'▶';$('playButton').setAttribute('aria-label',playing?'Pause':'Play')});
  $('loopButton').addEventListener('click',()=>{looping=!looping;$('loopButton').classList.toggle('active',looping);$('loopButton').setAttribute('aria-pressed',String(looping))});
  $('scrubEvents').addEventListener('focusin',e=>{const marker=e.target.closest('.scrubMarker');if(marker)showEventPopup(Number(marker.dataset.eventIndex))});
  $('scrubEvents').addEventListener('click',e=>{const marker=e.target.closest('.scrubMarker');if(marker)jumpToEvent(timelineEvents[Number(marker.dataset.eventIndex)]?.time)});
  let timelineGesture=null;
  $('timeline').addEventListener('pointerdown',e=>{timelineGesture={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};const index=nearbyEvent(e.clientX);if(index>=0)showEventPopup(index)});
  $('timeline').addEventListener('pointermove',e=>{if(timelineGesture?.id===e.pointerId&&Math.hypot(e.clientX-timelineGesture.x,e.clientY-timelineGesture.y)>5)timelineGesture.moved=true;if(timelineGesture?.moved){hideEventPopup();return}const index=nearbyEvent(e.clientX);if(index>=0)showEventPopup(index);else schedulePopupHide()});
  $('timeline').addEventListener('pointerup',e=>{const gesture=timelineGesture;timelineGesture=null;if(!gesture||gesture.id!==e.pointerId||gesture.moved||Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>5)return;const index=nearbyEvent(e.clientX);if(index>=0)jumpToEvent(timelineEvents[index]?.time)});
  $('timeline').addEventListener('pointercancel',()=>{timelineGesture=null});
  $('scrub').addEventListener('pointerleave',schedulePopupHide);
  $('scrub').addEventListener('focusout',e=>{if(!e.relatedTarget||!$('scrub').contains(e.relatedTarget))schedulePopupHide()});
  $('eventPopup').addEventListener('pointerenter',()=>clearTimeout(popupHideTimer));
  $('eventPopup').addEventListener('click',()=>jumpToEvent(Number($('eventPopup').dataset.time)));
  $('timeline').addEventListener('input',e=>{playing=false;$('playButton').textContent='▶';time=Number(e.target.value);updateTimeline()});
  for(const [id,sign] of [['stepBack',-1],['stepForward',1]])$(id).addEventListener('click',()=>{if(!trial)return;playing=false;$('playButton').textContent='▶';const {min,max}=playbackBounds();time=Math.min(max,Math.max(min,time+sign/(trial.motion?.rate||360)));updateTimeline()});
  $('poiSearch').addEventListener('input',e=>{$('poi').innerHTML=rowsHTML(trial?.poi,e.target.value,trial?.descriptions?.poi)});
  document.addEventListener('keydown',e=>{if(!performanceMode&&e.code==='Space'&&!['INPUT','SELECT','TEXTAREA','BUTTON','CANVAS'].includes(document.activeElement.tagName)){e.preventDefault();$('playButton').click()}});
  setInterval(()=>{if(sceneReady||!playing||!trial)return;const {min,max}=playbackBounds();if(max<=min){playing=false;return}time+=.016*Number($('playSpeed').value);if(time>=max){if(looping)time=min+(time-min)%(max-min);else{time=max;playing=false;$('playButton').textContent='▶'}}updateTimeline()},16);
}
function drawFallback(){
  if(!fallbackCanvas||!trial)return;
  if(compareMode){drawCompareFallback();return}
  const host=$('stage'),dpr=Math.min(devicePixelRatio,2),w=host.clientWidth,h=host.clientHeight;
  fallbackCanvas.width=Math.round(w*dpr);fallbackCanvas.height=Math.round(h*dpr);
  const ctx=fallbackCanvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#eaf2f5';ctx.fillRect(0,0,w,h);
  const kind=trial.entry.discipline,lm=trial.signals.landmarks,li=lm?nearestIndex(lm.time,time):0;
  const map={};for(const [a,b] of PAIRS[kind]){map[a]=pointFromSignal(a,li);map[b]=pointFromSignal(b,li)}
  if(!lm&&trial.motion){const frame=trial.motion.frames[Math.min(trial.motion.frame_count-1,Math.round(time*trial.motion.rate))];trial.motion.labels.forEach((n,i)=>map[n]=frame[i])}
  const all=Object.values(map).filter(finite),proj=p=>{const view=$('cameraPreset').value;return view==='front'?[p[1],p[2]]:view==='side'?[p[0],p[2]]:view==='top'?[p[0],p[1]]:[(p[0]-p[1])*.707,p[2]-(p[0]+p[1])*.3]};
  if(!all.length){ctx.fillStyle='#52717e';ctx.font='14px sans-serif';ctx.fillText('No motion coordinates in this recording',24,40);return}
  const pts=all.map(proj),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),scale=Math.min((w-90)/Math.max(.5,maxX-minX),(h-80)/Math.max(.5,maxY-minY),250),toScreen=p=>{const q=proj(p);return [w/2+(q[0]-(minX+maxX)/2)*scale,h/2-(q[1]-(minY+maxY)/2)*scale]};
  const drawSegments=(pairs,width,color)=>{ctx.lineWidth=width;ctx.strokeStyle=color;for(const [a,b] of pairs){if(!finite(map[a])||!finite(map[b]))continue;const x=toScreen(map[a]),y=toScreen(map[b]);ctx.beginPath();ctx.moveTo(...x);ctx.lineTo(...y);ctx.stroke()}};
  if(lm){if(layerOn('showSolid'))drawSegments(PAIRS[kind],5,'#2862a2');if(layerOn('showThin'))drawSegments(PAIRS[kind],1.5,'#174b71')}
  else if(layerOn('showMarkers'))drawSegments(RAW_PAIRS,2,'#747b80');
  if((lm&&layerOn('showJoints'))||(!lm&&layerOn('showMarkers'))){ctx.fillStyle='#1f568a';for(const p of all){const [x,y]=toScreen(p);ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill()}}
  if(lm&&layerOn('showTrail')){
    const key=kind==='pitching'?'hand_jc':'sweet_spot',event=trial.events[kind==='pitching'?'BR_time':'contact_time'];
    ctx.lineWidth=2.5;ctx.strokeStyle='#c73327';ctx.beginPath();let active=false;
    for(let i=0;i<=li;i++){const p=pointFromSignal(key,i);if(!finite(p)){active=false;continue}const xy=toScreen(p);if(active)ctx.lineTo(...xy);else{ctx.moveTo(...xy);active=true}}ctx.stroke();
  }
  if(lm&&layerOn('showEventPoint')){
    const key=kind==='pitching'?'hand_jc':'sweet_spot',event=trial.events[kind==='pitching'?'BR_time':'contact_time'];
    if(event&&time>=event.time){const p=pointFromSignal(key,nearestIndex(lm.time,event.time));if(finite(p)){ctx.fillStyle='#b62a20';ctx.beginPath();ctx.arc(...toScreen(p),3,0,Math.PI*2);ctx.fill()}}
  }
  if(kind==='hitting'&&finite(map.blast_hand)&&finite(map.sweet_spot)){ctx.lineWidth=7;ctx.strokeStyle='#b48248';ctx.beginPath();ctx.moveTo(...toScreen(map.blast_hand));ctx.lineTo(...toScreen(map.sweet_spot));ctx.stroke()}
  if(layerOn('showPlates'))for(const plate of trial.motion?.platforms||[]){const corners=plate.corners||[];if(corners.length<3)continue;ctx.strokeStyle='#146d4d';ctx.lineWidth=1.5;ctx.beginPath();corners.forEach((p,i)=>i?ctx.lineTo(...toScreen(p)):ctx.moveTo(...toScreen(p)));ctx.closePath();ctx.stroke()}
  if(layerOn('showForces'))for(const plate of trial.motion?.platforms||[]){const samples=plate.force_global||[],analog=trial.motion?.analog,index=analog?.rate?Math.min(samples.length-1,Math.max(0,Math.round(time*analog.rate))):-1,force=samples[index];if(!finite(force)||!plate.corners?.length)continue;const magnitude=Math.hypot(...force),length=forceArrowLength(magnitude,soloForceMax);if(!length)continue;const center=plate.corners.reduce((out,p)=>out.map((v,i)=>v+p[i]/plate.corners.length),[0,0,0]),tip=center.map((v,i)=>v+force[i]/magnitude*length);ctx.strokeStyle='#31864d';ctx.fillStyle='#31864d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(...toScreen(center));ctx.lineTo(...toScreen(tip));ctx.stroke();ctx.beginPath();ctx.arc(...toScreen(tip),5,0,Math.PI*2);ctx.fill()}
  ctx.font='12px sans-serif';ctx.fillStyle='#686c70';ctx.fillText('2D projection · 3D graphics unavailable in this browser',16,h-16);
}
function compareFallbackPoint(data,name,t){
 const lm=data.signals?.landmarks;
 if(lm?.time?.length){const i=nearestIndex(lm.time,t),s=lm.series,p=[s[name+'_x']?.[i],s[name+'_y']?.[i],s[name+'_z']?.[i]];return finite(p)?p:null}
 const motion=data.motion,j=motion?.labels.indexOf(name);if(!motion||j<0)return null;
 const p=motion.frames[Math.min(motion.frames.length-1,Math.max(0,Math.round(t*motion.rate)))]?.[j];return finite(p)?p:null;
}
function compareFallbackPelvis(data,t){const names=data.signals?.landmarks?(kind==='pitching'?['rear_hip','lead_hip']:['left_hip','right_hip']):['LASI','RASI'],points=names.map(n=>compareFallbackPoint(data,n,t)).filter(finite);return points.length?points.reduce((out,p)=>out.map((v,i)=>v+p[i]/points.length),[0,0,0]):null}
function drawCompareFallback(){
 const host=$('stage'),dpr=Math.min(devicePixelRatio,2),w=host.clientWidth,h=host.clientHeight,ctx=fallbackCanvas.getContext('2d');fallbackCanvas.width=Math.round(w*dpr);fallbackCanvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#eaf2f5';ctx.fillRect(0,0,w,h);
 const view=$('cameraPreset').value,project=p=>view==='front'?[p[1],p[2]]:view==='side'?[p[0],p[2]]:view==='top'?[p[0],p[1]]:[(p[0]-p[1])*.707,p[2]-(p[0]+p[1])*.3];
 const primaryRange=compareEntries.find(entry=>entry.id===trial.entry.id)?.poseRange,baseTime=anchorTime(trial,compareSync),base=compareFallbackPelvis(trial,primaryRange?Math.max(primaryRange.start,Math.min(primaryRange.end,baseTime)):baseTime),items=compareEntries.map(entry=>{const data=entry.data,local=alignedTime(time,trial,data,compareSync),sourceTime=Math.max(0,Math.min(data.duration,local)),t=Math.max(entry.poseRange.start,Math.min(entry.poseRange.end,sourceTime)),processed=!!data.signals?.landmarks,pairs=processed?PAIRS[kind]:RAW_PAIRS,otherTime=anchorTime(data,compareSync),other=compareFallbackPelvis(data,Math.max(entry.poseRange.start,Math.min(entry.poseRange.end,otherTime))),shift=comparePosition==='pelvis'&&base&&other?base.map((v,i)=>v-other[i]):[0,0,0],move=p=>p?.map((v,i)=>v+shift[i]),map=Object.fromEntries([...new Set(pairs.flat())].map(name=>[name,move(compareFallbackPoint(data,name,t))]));return {entry,data,t,sourceTime,processed,pairs,shift,move,map}});
 const all=items.flatMap(item=>Object.values(item.map).filter(finite));if(!all.length){ctx.fillStyle='#52717e';ctx.font='14px sans-serif';ctx.fillText('No motion coordinates at this time',24,40);return}
 const projected=all.map(project),xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),scale=Math.min((w-90)/Math.max(.5,maxX-minX),(h-80)/Math.max(.5,maxY-minY),250),screen=p=>{const q=project(p);return [w/2+(q[0]-(minX+maxX)/2)*scale,h/2-(q[1]-(minY+maxY)/2)*scale]};
 for(const item of items){const {entry,data,t,sourceTime,processed,pairs,move,map}=item;const opts=entry.options,color=REPLAY_COLORS[entry.colorIndex];
  if(opts.plates)for(const plate of data.motion?.platforms||[]){const corners=plate.corners.map(move).filter(finite);if(corners.length<3)continue;ctx.beginPath();corners.forEach((p,i)=>i?ctx.lineTo(...screen(p)):ctx.moveTo(...screen(p)));ctx.closePath();ctx.strokeStyle=color.force;ctx.lineWidth=1.5;ctx.stroke()}
  if(opts.forces)for(const plate of data.motion?.platforms||[]){const analog=data.motion?.analog,index=analog?.rate?Math.min(analog.sample_count-1,Math.max(0,Math.round(sourceTime*analog.rate))):-1;let force=plate.force_global?.[index];if(sourceTime>=data.duration&&!finite(force))for(let i=index-1;i>=0;i--)if(finite(plate.force_global?.[i])){force=plate.force_global[i];break}if(!finite(force))continue;const magnitude=Math.hypot(...force),length=forceArrowLength(magnitude,compareForceMax);if(!length)continue;const center=move(plate.corners.reduce((out,p)=>out.map((v,i)=>v+p[i]/plate.corners.length),[0,0,0])),tip=center.map((v,i)=>v+force[i]/magnitude*length);ctx.strokeStyle=color.force;ctx.fillStyle=color.force;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(...screen(center));ctx.lineTo(...screen(tip));ctx.stroke();ctx.beginPath();ctx.arc(...screen(tip),3,0,Math.PI*2);ctx.fill()}
  for(const [key,width,stroke] of [['thick',5,color.body],['thin',1.5,color.marker]])if(opts[key]){ctx.lineWidth=width;ctx.strokeStyle=stroke;for(const [a,b] of pairs)if(finite(map[a])&&finite(map[b])){ctx.beginPath();ctx.moveTo(...screen(map[a]));ctx.lineTo(...screen(map[b]));ctx.stroke()}}
  if(opts.joints){ctx.fillStyle=color.body;for(const p of Object.values(map).filter(finite)){ctx.beginPath();ctx.arc(...screen(p),3.4,0,Math.PI*2);ctx.fill()}}
  if(opts.markers&&data.motion){const frame=data.motion.frames[Math.min(data.motion.frames.length-1,Math.max(0,Math.round(t*data.motion.rate)))];ctx.fillStyle=color.marker;for(const p of frame||[])if(finite(p)){ctx.beginPath();ctx.arc(...screen(move(p)),2,0,Math.PI*2);ctx.fill()}}
  const key=processed?(kind==='pitching'?'hand_jc':'sweet_spot'):(kind==='pitching'?'RFIN':'Marker3'),times=processed?data.signals.landmarks.time:data.motion?.frames.map((_,i)=>i/data.motion.rate)||[],event=data.events?.[kind==='pitching'?'BR_time':'contact_time']?.time;
  if(opts.trail){ctx.lineWidth=2;ctx.strokeStyle=color.trail;ctx.beginPath();let active=false;for(let i=0;i<times.length&&times[i]<=sourceTime;i++){const p=move(compareFallbackPoint(data,key,times[i]));if(!finite(p)){active=false;continue}if(active)ctx.lineTo(...screen(p));else{ctx.moveTo(...screen(p));active=true}}ctx.stroke();const knot=Number.isFinite(event)&&sourceTime>=event?move(compareFallbackPoint(data,key,event)):null;if(finite(knot)){ctx.fillStyle=color.trail;ctx.beginPath();ctx.arc(...screen(knot),4,0,Math.PI*2);ctx.fill()}}
  if(kind==='hitting'&&(opts.thick||opts.thin)){const a=move(compareFallbackPoint(data,processed?'blast_hand':'Marker1',t)),b=move(compareFallbackPoint(data,processed?'sweet_spot':'Marker3',t));if(finite(a)&&finite(b)){ctx.strokeStyle=color.body;ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(...screen(a));ctx.lineTo(...screen(b));ctx.stroke()}}
  if(opts.ball&&Number.isFinite(event)){const p=move(compareFallbackPoint(data,key,sourceTime<event?t:event));if(finite(p)){const dt=sourceTime-event;if(dt>0)p[0]+=Math.min(7,(data.entry.speed_mph||85)*.44704*dt);ctx.fillStyle=color.ball;ctx.beginPath();ctx.arc(...screen(p),4,0,Math.PI*2);ctx.fill()}}
 }
 ctx.font='12px sans-serif';ctx.fillStyle='#686c70';ctx.fillText('2D projection · 3D graphics unavailable in this browser',16,h-16);
}
async function init(){
  if(window.matchMedia('(max-width:800px)').matches){document.body.classList.add('hideLeft','hideRight');$('toggleLeft').textContent='›';$('toggleLeft').setAttribute('aria-label','Expand sessions');$('toggleRight').textContent='‹';$('toggleRight').setAttribute('aria-label','Expand details')}
  try{setupScene();sceneReady=true}catch(error){console.error('3D unavailable:',error);$('stage').replaceChildren();fallbackCanvas=document.createElement('canvas');fallbackCanvas.style.cssText='width:100%;height:100%;display:block';$('stage').appendChild(fallbackCanvas);$('planeViewsToggle').disabled=true;$('planeViewsToggle').title='Plane views require 3D graphics';}
  initDisplayControls();initCohortControls();
  keypointExplorer=new KeypointExplorer({onFocus:which=>focusGeometry(which),onScrub:t=>{playing=false;$('playButton').textContent='▶';time=t;updateTimeline()},onColorMap:mode=>{if(!powerState?.available[mode])return;$('powerMode').value=mode;const button=$('showPowerMap');button.setAttribute('aria-pressed','true');button.classList.add('active');$('powerModeWrap').hidden=false;updateTimeline()},onVisual:action=>{const id=({com:'showCOM',axis:'showTrunkAxis',braking:'showBraking',knee:'showKneeExtension'})[action]||(action==='plateArrows'?'showForces':'showArmSweep'),button=$(id);if(button.disabled)return;if(action==='armSweep'&&armSweepMoment!=='varus'){$('armSweepMetric').value='varus';$('armSweepMetric').dispatchEvent(new Event('change'))}button.setAttribute('aria-pressed','true');button.classList.add('active');updateTimeline()}});
  comparisonKeypoints=new ComparisonKeypoints(document.querySelector('.stageWrap'),{onFocus:(id,quantity)=>focusComparison(id,quantity,true),onScrub:(entry,localTime)=>{playing=false;$('playButton').textContent='▶';const bounds=playbackBounds();time=Math.max(bounds.min,Math.min(bounds.max,primaryTime(localTime,trial,entry.data,compareSync)));updateTimeline()},onVisual:(entry,metric)=>{if(metric.mapMode&&entry.powerState?.available[metric.mapMode]){entry.options.power=true;entry.options.powerMode=metric.mapMode}else if(['com','axis','braking','knee'].includes(metric.visualAction)){entry.options[metric.visualAction]=motionAnalysis(entry.data).available[metric.visualAction]}else if(metric.visualAction==='plateArrows')entry.options.forces=!!entry.data.motion?.platforms?.some(platform=>platform.force_global?.length);else if(metric.visualAction==='armSweep'||metric.visualAction==='batSweep'){entry.options.sweep=!!compareViewer?.parts.get(entry.id)?.sweep;if(metric.visualAction==='armSweep'&&entry.options.sweepMoment!=='varus')compareViewer?.setSweepMoment(entry.id,'varus')}renderCompareControls();updateTimeline()}});
  bindControls();initCharts({onSeek:t=>{playing=false;$('playButton').textContent='▶';time=t;updateTimeline()}});try{const [res]=await Promise.all([fetch('/api/catalog'),loadLimbLengths()]);if(!res.ok)throw Error('Catalog unavailable');const data=await res.json();catalog=data.entries;catalogDescriptions=data.metric_descriptions||{};
setKind('pitching');const preferred=catalog.find(e=>e.discipline==='pitching'&&e.status==='linked');if(preferred)selectTrial(preferred.id)}catch(error){toast(error.message);$('trialSubtitle').textContent='Start server.py from the dashboard directory, then reload.'}}
init();
