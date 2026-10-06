import {MotionVisuals} from './motion_visuals.js';
import * as THREE from 'three';
import {REPLAY_COLORS,anchorTime,alignedTime,visualPoseRange} from './comparison.js';
import {MAX_OVERLAY_ITEMS,overlayItems,buildPowerOverlay,powerValues} from './energy_overlay.js';
import {focusSpec,focusSectorGeometry} from './focus_geometry.js';
import {forceArrowLength,forceArrowHead} from './force_scale.js';
import {createMotionSweep,applySweepScale,combinedSweepScale} from './motion_sweep.js';

const valid=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const vector=p=>new THREE.Vector3(p[0],p[1],p[2]);
function nearest(times,t){let lo=0,hi=times.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(times[mid]<=t)lo=mid;else hi=mid-1}return lo<times.length-1&&Math.abs(times[lo+1]-t)<Math.abs(times[lo]-t)?lo+1:lo}
function point(data,name,t){
 const lm=data.signals?.landmarks;
 if(lm){const i=nearest(lm.time,t),s=lm.series,p=[s[name+'_x']?.[i],s[name+'_y']?.[i],s[name+'_z']?.[i]];return valid(p)?p:null}
 const motion=data.motion;if(!motion)return null;const j=motion.labels.indexOf(name);if(j<0)return null;
 const i=Math.min(motion.frames.length-1,Math.max(0,Math.round(t*motion.rate))),p=motion.frames[i]?.[j];return valid(p)?p:null;
}
function pelvis(data,t){
 const names=data.signals?.landmarks?(data.entry.discipline==='pitching'?['rear_hip','lead_hip']:['left_hip','right_hip']):['LASI','RASI'];
 const points=names.map(name=>point(data,name,t)).filter(valid);return points.length?points.reduce((out,p)=>out.map((v,i)=>v+p[i]/points.length),[0,0,0]):null;
}
const dummy=new THREE.Object3D();
const up=new THREE.Vector3(0,1,0);
function setCylinder(mesh,i,a,b,r){dummy.position.set(0,0,-100);dummy.scale.setScalar(0);dummy.quaternion.identity();if(valid(a)&&valid(b)){const direction=vector(b).sub(vector(a)),length=direction.length();if(length>.001){dummy.position.copy(vector(a).add(vector(b)).multiplyScalar(.5));dummy.quaternion.setFromUnitVectors(up,direction.normalize());dummy.scale.set(r,length,r)}}dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)}
function setBat(mesh,a,b){const direction=vector(b).sub(vector(a)),length=direction.length();if(length<.001)return false;mesh.position.copy(vector(a).add(vector(b)).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());mesh.scale.set(1,length,1);return true}
function setDots(mesh,names,map){names.forEach((name,i)=>{const p=map[name];dummy.position.set(...(valid(p)?p:[0,0,-100]));dummy.scale.setScalar(valid(p)?1:0);dummy.quaternion.identity();dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)});mesh.instanceMatrix.needsUpdate=true}
function setFocusLines(line,segments){const values=[];for(const [a,b] of segments)if(valid(a)&&valid(b))values.push(...a,...b);line.geometry.dispose();line.geometry=new THREE.BufferGeometry();line.geometry.setAttribute('position',new THREE.Float32BufferAttribute(values,3));line.visible=values.length>0}
function setFocusSector(sector,arc,spec){
 sector.visible=false;arc.visible=false;const geometry=focusSectorGeometry(spec);if(!geometry)return null;
 sector.geometry.dispose();sector.geometry=new THREE.BufferGeometry();sector.geometry.setAttribute('position',new THREE.Float32BufferAttribute(geometry.vertices,3));sector.visible=true;
 arc.geometry.dispose();arc.geometry=new THREE.BufferGeometry().setFromPoints(geometry.arc.map(vector));arc.visible=true;return geometry.degrees;
}
function publishedValue(data,spec,t){const table=data.signals?.[spec.table||'joint_angles'];if(!table?.time?.length)return null;const value=table.series?.[spec.key]?.[nearest(table.time,t)];return Number.isFinite(value)?value*(spec.sign||1):null}
const valueText=(value,unit)=>Number.isFinite(value)?value.toFixed(1)+unit:'—';
function dispose(group){while(group.children.length){const child=group.children[0];group.remove(child);child.traverse(node=>{if(!(node.parent instanceof THREE.ArrowHelper))node.geometry?.dispose?.();for(const mat of Array.isArray(node.material)?node.material:[node.material]){mat?.map?.dispose?.();mat?.dispose?.()}})}}
function makeSplitGround(data,group){
 const floor=new THREE.Group();floor.visible=false;group.add(floor);
 const corners=(data.motion?.platforms||[]).flatMap(platform=>platform.corners||[]);
 const reference=corners.length?corners:([pelvis(data,anchorTime(data,'event'))].filter(valid));
 const center=reference.length?reference.reduce((sum,p)=>sum.add(vector(p)),new THREE.Vector3()).multiplyScalar(1/reference.length):new THREE.Vector3();
 const base=new THREE.Mesh(new THREE.PlaneGeometry(9,9),new THREE.MeshStandardMaterial({color:'#d9ddda',roughness:1,side:THREE.DoubleSide}));base.position.set(center.x,center.y,-.016);floor.add(base);
 const grid=new THREE.GridHelper(9,18,0x969f9b,0xb6bdb9);grid.rotation.x=Math.PI/2;grid.position.set(center.x,center.y,-.012);grid.material.transparent=true;grid.material.opacity=.34;floor.add(grid);
 if(data.entry.discipline==='pitching'){
  const row=data.motion?.platforms?.[1]?.corners;
  const x=row?.length?row.reduce((sum,p)=>sum+p[0],0)/row.length:center.x-.65;
  const y=row?.length?row.reduce((sum,p)=>sum+p[1],0)/row.length:center.y;
  const mound=new THREE.Mesh(new THREE.CircleGeometry(.8,40),new THREE.MeshBasicMaterial({color:'#bfc5c1',transparent:true,opacity:.48,side:THREE.DoubleSide,depthWrite:false}));mound.position.set(x,y,-.005);floor.add(mound);
  const rubber=new THREE.Mesh(new THREE.BoxGeometry(.06,.44,.015),new THREE.MeshStandardMaterial({color:'#f5f6ef'}));rubber.position.set(x,y,.014);floor.add(rubber);
 }else{
  const x=center.x,y=center.y,local=[[-.215,.14],[.215,.14],[.215,-.045],[0,-.26],[-.215,-.045]],outlinePoints=local.map(([a,b])=>[x+b,y-a]),shape=new THREE.Shape();
  outlinePoints.forEach(([a,b],i)=>i?shape.lineTo(a,b):shape.moveTo(a,b));shape.closePath();
  const plate=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:'#fbfbf7',side:THREE.DoubleSide}));plate.position.z=.009;floor.add(plate);
  const outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outlinePoints.map(([a,b])=>new THREE.Vector3(a,b,.012))),new THREE.LineBasicMaterial({color:'#14191c'}));floor.add(outline);
 }
 return floor;
}

export class CompareViewer{
 constructor(scene,pairs,rawPairs){this.root=new THREE.Group();this.root.visible=false;scene.add(this.root);this.pairs=pairs;this.rawPairs=rawPairs;this.parts=new Map();this.entries=[];this.primary=null;this.sync='event';this.position='pelvis';this.focus=new Map();this.forceMax=0}
 setEntries(entries){
  dispose(this.root);this.parts.clear();this.entries=entries;this.root.visible=entries.length>0;
  for(const entry of entries){const data=entry.data,color=REPLAY_COLORS[entry.colorIndex],group=new THREE.Group(),processed=!!data.signals?.landmarks,pairs=processed?this.pairs[data.entry.discipline]:this.rawPairs,names=[...new Set([...pairs.flat(),'thorax_ap'])],batPair=data.entry.discipline==='hitting'?[processed?['blast_hand','sweet_spot']:['Marker1','Marker3']]:[],poseRange=entry.poseRange||visualPoseRange(data,[...pairs,...batPair]);this.root.add(group);const motionVisuals=new MotionVisuals(group,data);
   const body=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,8),new THREE.MeshStandardMaterial({color:color.body,roughness:.72}),pairs.length);body.frustumCulled=false;body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(body);
   const thin=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:color.marker}));thin.frustumCulled=false;group.add(thin);
   const dots=new THREE.InstancedMesh(new THREE.SphereGeometry(.027,9,7),new THREE.MeshStandardMaterial({color:color.body,roughness:.55}),names.length);dots.frustumCulled=false;dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(dots);
   const powerState=entry.powerState||buildPowerOverlay(data),powerMaterial=()=>new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false});
   const powerDots=new THREE.InstancedMesh(new THREE.SphereGeometry(.055,12,9),powerMaterial(),MAX_OVERLAY_ITEMS);
   const powerSleeves=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,10),powerMaterial(),MAX_OVERLAY_ITEMS);
   for(const mesh of [powerDots,powerSleeves]){for(let i=0;i<MAX_OVERLAY_ITEMS;i++)mesh.setColorAt(i,new THREE.Color('#9ba6ab'));mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.visible=false;group.add(mesh)}
   const splitGround=makeSplitGround(data,group);
   const motion=data.motion,rawGeometry=new THREE.BufferGeometry(),rawPositions=new Float32Array(Math.max(1,motion?.labels.length||0)*3);rawGeometry.setAttribute('position',new THREE.BufferAttribute(rawPositions,3));const markers=new THREE.Points(rawGeometry,new THREE.PointsMaterial({color:color.marker,size:.038,sizeAttenuation:true}));markers.frustumCulled=false;group.add(markers);
   const trailKey=processed?(data.entry.discipline==='pitching'?'hand_jc':'sweet_spot'):(data.entry.discipline==='pitching'?'RFIN':'Marker3'),sourceTimes=processed?data.signals.landmarks.time:motion?.frames.map((_,i)=>i/motion.rate)||[],trailValues=[],trailTimes=[];
   for(let i=1;i<sourceTimes.length;i++){const a=point(data,trailKey,sourceTimes[i-1]),b=point(data,trailKey,sourceTimes[i]);if(valid(a)&&valid(b)){trailValues.push(...a,...b);trailTimes.push(sourceTimes[i])}}
   const trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute('position',new THREE.Float32BufferAttribute(trailValues,3));trailGeometry.setDrawRange(0,0);const trail=new THREE.LineSegments(trailGeometry,new THREE.LineBasicMaterial({color:color.trail,linewidth:2}));trail.frustumCulled=false;group.add(trail);
   const sweep=createMotionSweep(data,entry.batSpeed,entry.options.sweepMoment);if(sweep)group.add(sweep.mesh);
   const knot=new THREE.Mesh(new THREE.SphereGeometry(.035,12,8),new THREE.MeshBasicMaterial({color:color.trail}));group.add(knot);
   const bat=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,1,9),new THREE.MeshStandardMaterial({color:color.body,roughness:.72}));group.add(bat);
   const speedPoint=new THREE.Mesh(new THREE.SphereGeometry(.034,12,8),new THREE.MeshBasicMaterial({color:'#156f83'}));speedPoint.visible=false;group.add(speedPoint);
   const ball=new THREE.Mesh(new THREE.SphereGeometry(.04,12,8),new THREE.MeshStandardMaterial({color:color.ball,roughness:.6}));group.add(ball);
   const plates=(motion?.platforms||[]).map(platform=>{const corners=platform.corners||[],outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners.map(p=>new THREE.Vector3(p[0],p[1],.018))),new THREE.LineBasicMaterial({color:color.force,transparent:true,opacity:.95}));group.add(outline);let fill=null;if(corners.length>=3){const shape=new THREE.Shape();corners.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();fill=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:color.force,transparent:true,opacity:.12,side:THREE.DoubleSide,depthWrite:false}));fill.position.z=.012;group.add(fill)}const center=corners.length?corners.reduce((sum,p)=>sum.add(vector(p)),new THREE.Vector3()).multiplyScalar(1/corners.length):new THREE.Vector3();const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,1),center,1,color.force,.12,.06);group.add(arrow);const forces=platform.force_global||[],firstForce=forces.findIndex(valid);let lastForce=forces.length-1;while(lastForce>=0&&!valid(forces[lastForce]))lastForce--;return {platform,outline,fill,arrow,center,firstForce,lastForce}});
   const focusLines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:color.body,depthTest:false}));focusLines.renderOrder=8;group.add(focusLines);
   const focusReferenceLines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:color.marker,depthTest:false}));focusReferenceLines.renderOrder=8;group.add(focusReferenceLines);
   const focusDot=new THREE.Mesh(new THREE.SphereGeometry(.055,12,8),new THREE.MeshBasicMaterial({color:color.trail,depthTest:false}));focusDot.renderOrder=9;group.add(focusDot);
   const focusPlane=new THREE.Mesh(new THREE.CircleGeometry(.65,48),new THREE.MeshBasicMaterial({color:color.marker,transparent:true,opacity:.17,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));focusPlane.visible=false;focusPlane.renderOrder=6;group.add(focusPlane);
   const focusAxisArrows=[color.marker,color.body].map(tint=>{const arrow=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),.58,tint,.13,.075);for(const item of [arrow.line,arrow.cone]){item.material.depthTest=false;item.material.depthWrite=false;item.renderOrder=9}arrow.visible=false;group.add(arrow);return arrow});
   const focusSector=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:color.trail,transparent:true,opacity:.4,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));focusSector.renderOrder=7;group.add(focusSector);
   const focusArc=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:color.marker,depthTest:false}));focusArc.renderOrder=9;group.add(focusArc);
   this.parts.set(entry.id,{entry,data,group,motionVisuals,splitGround,powerState,powerDots,powerSleeves,processed,pairs,names,poseRange,body,thin,dots,markers,rawPositions,trail,trailTimes,trailKey,sweep,knot,bat,speedPoint,ball,plates,focusLines,focusReferenceLines,focusDot,focusPlane,focusAxisArrows,focusSector,focusArc});
  }
  this.setAlignment(this.primary,this.sync,this.position);
 }
 setAlignment(primary,sync,position){this.primary=primary;this.sync=sync;this.position=position;if(!primary)return;const primaryRange=this.parts.get(primary.entry.id)?.poseRange,baseTime=anchorTime(primary,sync),base=pelvis(primary,primaryRange?Math.max(primaryRange.start,Math.min(primaryRange.end,baseTime)):baseTime);for(const part of this.parts.values()){part.group.position.set(0,0,0);if(position==='pelvis'&&base){const otherTime=anchorTime(part.data,sync),other=pelvis(part.data,Math.max(part.poseRange.start,Math.min(part.poseRange.end,otherTime)));if(other)part.group.position.copy(vector(base).sub(vector(other)))}}}
 setForceScale(max){this.forceMax=max}
 setSharedTrailScale(enabled){
 const sweeps=[...this.parts.values()].map(p=>p.sweep).filter(Boolean),shared=enabled?combinedSweepScale(sweeps):null;
 for(const sweep of sweeps)applySweepScale(sweep,shared);
 }
 setSweepMoment(id,mode){
  const part=this.parts.get(id);if(!part||part.data.entry.discipline!=='pitching')return;
  part.entry.options.sweepMoment=mode==='valgus'?'valgus':'varus';
  if(part.sweep){part.group.remove(part.sweep.mesh);part.sweep.mesh.geometry.dispose();part.sweep.mesh.material.dispose()}
  part.sweep=createMotionSweep(part.data,part.entry.batSpeed,part.entry.options.sweepMoment);if(part.sweep)part.group.add(part.sweep.mesh);
 }
 setSplitMode(enabled){for(const part of this.parts.values())part.splitGround.visible=enabled}
 setFocus(id,quantity){if(!id)this.focus.clear();else if(!quantity||quantity==='none')this.focus.delete(id);else this.focus.set(id,quantity)}
 setFocuses(focuses){this.focus=new Map(focuses)}
 rawKeypoint(id,name){
  const part=this.parts.get(id),motion=part?.data.motion;
  if(!motion?.frames?.length)return null;
  const index=motion.labels.indexOf(name);
  if(index<0)return null;
  const frame=Math.min(motion.frames.length-1,Math.max(0,Math.round((part.poseTime||0)*motion.rate)));
  const value=motion.frames[frame]?.[index];
  return valid(value)?value:null;
 }
 update(primaryTime){
  if(!this.primary)return [];const focused=[];
  for(const part of this.parts.values()){
   const {entry,data,group,processed,pairs,names,poseRange,body,thin,dots,markers,rawPositions,trail,trailTimes,trailKey,sweep,knot,bat,speedPoint,ball,plates}=part,local=alignedTime(primaryTime,this.primary,data,this.sync),sourceTime=Math.max(0,Math.min(data.duration,local)),t=Math.max(poseRange.start,Math.min(poseRange.end,sourceTime)),opts=entry.options;
   group.visible=true;part.motionVisuals.update(local,opts);
   const map={};for(const name of names)map[name]=point(data,name,t);
   const midpoint=(a,b)=>valid(a)&&valid(b)?vector(a).add(vector(b)).multiplyScalar(.5).toArray():null;
   map.pelvis_center=data.entry.discipline==='pitching'?midpoint(map.rear_hip,map.lead_hip):midpoint(map.left_hip,map.right_hip);
   map.torso_center=midpoint(map.thorax_dist,map.thorax_prox);
   map.centerofmass=part.motionVisuals.analysis.point('centerofmass',sourceTime);part.currentMap=map;part.poseTime=t;
   const state=part.powerState,mode=opts.powerMode,enabled=!!opts.power&&!!state?.available[mode];
   part.powerDots.visible=enabled&&mode!=='endpoint';part.powerSleeves.visible=enabled;
   if(enabled){
    const items=overlayItems(mode,state),values=powerValues(state,mode,sourceTime),config=state.configs[mode];
    part.powerDots.count=items.length;part.powerSleeves.count=items.length;
    items.forEach((item,i)=>{
     const a=map[item.point]||point(data,item.point,t),b=map[item.end]||point(data,item.end,t),scale=(opts.powerLocal?state.localScales[mode]?.[item.key]:state.scales[mode])||1,value=values[item.key];
     let color=new THREE.Color('#9ba6ab');
     if(Number.isFinite(value)){const ratio=Math.min(1,Math.abs(value)/scale);if(config.palette==='sweep')color=ratio<=.5?new THREE.Color('#259e50').lerp(new THREE.Color('#e6bf37'),ratio*2):new THREE.Color('#e6bf37').lerp(new THREE.Color('#c4382b'),(ratio-.5)*2);else color=new THREE.Color('#ffe34a').lerp(new THREE.Color(config.palette==='positive'||value>=0?'#ee3631':'#146fe0'),Math.pow(ratio,.55))}
     dummy.position.set(...(valid(a)?a:[0,0,-100]));dummy.scale.setScalar(valid(a)?1:0);dummy.quaternion.identity();dummy.updateMatrix();part.powerDots.setMatrixAt(i,dummy.matrix);part.powerDots.setColorAt(i,color);
     const end=valid(a)&&valid(b)?vector(a).lerp(vector(b),.28).toArray():null;setCylinder(part.powerSleeves,i,a,end,.038);part.powerSleeves.setColorAt(i,color);
    });
    for(const mesh of [part.powerDots,part.powerSleeves]){mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true}
   }
   body.visible=opts.thick;thin.visible=opts.thin;dots.visible=opts.joints;
   if(opts.thick){pairs.forEach(([a,b],i)=>setCylinder(body,i,map[a],map[b],.018));body.instanceMatrix.needsUpdate=true}
   if(opts.thin){const values=[];for(const [a,b] of pairs)if(valid(map[a])&&valid(map[b]))values.push(...map[a],...map[b]);const previous=thin.geometry.getAttribute('position');if(previous?.array.length===values.length){previous.array.set(values);previous.needsUpdate=true}else thin.geometry.setAttribute('position',new THREE.Float32BufferAttribute(values,3));thin.geometry.computeBoundingSphere()}
   if(opts.joints)setDots(dots,names,map);
   markers.visible=opts.markers&&!!data.motion;if(markers.visible){const motion=data.motion,frame=motion.frames[Math.min(motion.frames.length-1,Math.max(0,Math.round(t*motion.rate)))];for(let i=0;i<motion.labels.length;i++){const p=frame?.[i],k=i*3;rawPositions[k]=valid(p)?p[0]:0;rawPositions[k+1]=valid(p)?p[1]:0;rawPositions[k+2]=valid(p)?p[2]:-100}markers.geometry.attributes.position.needsUpdate=true}
   if(sweep){sweep.mesh.visible=!!opts.sweep;let lo=0,hi=sweep.drawTimes.length;while(lo<hi){const mid=(lo+hi)>>1;if(sweep.drawTimes[mid]<=sourceTime)lo=mid+1;else hi=mid}sweep.mesh.geometry.setDrawRange(0,lo?sweep.drawCounts[lo-1]:0)}
   trail.visible=opts.trail;const n=trailTimes.length?trailTimes.findIndex(value=>value>sourceTime):-1;trail.geometry.setDrawRange(0,(n<0?trailTimes.length:n)*2);
   const event=data.events?.[data.entry.discipline==='pitching'?'BR_time':'contact_time']?.time,eventPoint=Number.isFinite(event)?point(data,trailKey,event):null;knot.visible=opts.eventPoint!==false&&valid(eventPoint)&&sourceTime>=event;if(knot.visible)knot.position.set(...eventPoint);
   bat.visible=false;if((opts.thick||opts.thin)&&data.entry.discipline==='hitting'){const a=point(data,processed?'blast_hand':'Marker1',t),b=point(data,processed?'sweet_spot':'Marker3',t);if(valid(a)&&valid(b))bat.visible=setBat(bat,a,b)}
   speedPoint.visible=processed&&data.entry.discipline==='hitting'&&bat.visible;if(speedPoint.visible){const b=point(data,'sweet_spot',t);if(valid(b))speedPoint.position.set(...b);else speedPoint.visible=false}
   ball.visible=opts.ball&&valid(eventPoint);if(ball.visible){const p=eventPoint.slice(),dt=sourceTime-event;if(data.entry.discipline==='pitching'){if(dt<0){const hand=point(data,trailKey,t);if(valid(hand))p.splice(0,3,...hand)}else{p[0]+=Math.min(7,(data.entry.speed_mph||85)*.44704*dt);p[2]-=4.9*dt*dt}}else if(dt<0)p[0]+=Math.min(5,-dt*18);else{p[0]+=Math.min(7,(data.entry.speed_mph||85)*.44704*dt);p[2]+=Math.min(1,dt*2)}ball.position.set(...p)}
   for(const {platform,outline,fill,arrow,center,firstForce,lastForce} of plates){outline.visible=opts.plates;if(fill)fill.visible=opts.plates;const analog=data.motion?.analog,i=analog?.rate&&firstForce>=0?Math.max(firstForce,Math.min(lastForce,Math.round(sourceTime*analog.rate))):-1,p=platform.force_global?.[i],v=valid(p)?vector(p):null,mag=v?.length()||0;const length=forceArrowLength(mag,this.forceMax);arrow.visible=opts.forces&&length>0;if(arrow.visible){arrow.position.set(center.x,center.y,.055);arrow.setDirection(v.normalize());arrow.setLength(length,...forceArrowHead(length))}}
   const quantity=this.focus.get(entry.id),activeFocus=processed&&!!quantity,spec=activeFocus?focusSpec(data,map,quantity,t):null;
   part.focusDot.visible=!!spec&&valid(spec.center);part.focusLines.visible=false;part.focusReferenceLines.visible=false;part.focusPlane.visible=false;part.focusAxisArrows.forEach(arrow=>arrow.visible=false);part.focusSector.visible=false;part.focusArc.visible=false;
   if(part.focusDot.visible){part.focusDot.position.set(...spec.center);setFocusLines(part.focusLines,spec.segments);setFocusLines(part.focusReferenceLines,spec.referenceSegments||[]);part.focusPlane.visible=valid(spec.planeCenter);if(part.focusPlane.visible){part.focusPlane.position.set(...spec.planeCenter);part.focusPlane.position.z-=.006}part.focusAxisArrows.forEach((arrow,i)=>{const axis=spec.axes?.[i];arrow.visible=valid(axis);if(arrow.visible){arrow.position.set(...spec.center);arrow.setDirection(vector(axis).normalize());arrow.setLength(.58,.13,.075)}});const geometric=setFocusSector(part.focusSector,part.focusArc,spec),published=publishedValue(data,spec,t),unit=spec.table==='joint_velos'?'°/s':'°';focused.push({id:entry.id,readout:`${spec.label}: ${valueText(published,unit)} released CSV${Number.isFinite(geometric)?` · ${spec.poseGuide||'shaded pose guide'} ${valueText(geometric,'°')}`:''}`})}
  }
  return focused;
 }
 clear(){dispose(this.root);this.parts.clear();this.entries=[];this.primary=null;this.root.visible=false;this.focus=new Map()}
}
