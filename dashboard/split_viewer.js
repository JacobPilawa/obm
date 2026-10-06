import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const valid=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
// Fit the full motion and all plates once, independently of the playhead.
function replayFrame(part){
 const {data,processed,group,poseRange}=part,names=new Set(part.names),box=new THREE.Box3();
 if(data.entry.discipline==='hitting')for(const name of processed?['blast_hand','sweet_spot']:['Marker1','Marker3'])names.add(name);
 const add=p=>{if(valid(p))box.expandByPoint(new THREE.Vector3(...p).add(group.position))};
 for(const plate of data.motion?.platforms||[])for(const corner of plate.corners||[])add(corner);
 if(processed){
  const table=data.signals.landmarks,series=table.series;
  for(let i=0;i<table.time.length;i++)if(table.time[i]>=poseRange.start&&table.time[i]<=poseRange.end)for(const name of names)add(['x','y','z'].map(a=>series[name+'_'+a]?.[i]));
 }else{
  const motion=data.motion,indices=[...names].map(name=>motion?.labels.indexOf(name)).filter(i=>i>=0);
  for(let i=0;i<(motion?.frames.length||0);i++)if(i/motion.rate>=poseRange.start&&i/motion.rate<=poseRange.end)for(const j of indices)add(motion.frames[i]?.[j]);
 }
 if(box.isEmpty())box.set(new THREE.Vector3(-1,-1,0),new THREE.Vector3(1,1,2));
 // Include breathing room around the plates and above the complete delivery.
 box.min.add(new THREE.Vector3(-.55,-.55,-.35));box.max.add(new THREE.Vector3(.55,.55,.35));
 return {box,center:box.getCenter(new THREE.Vector3())};
}
function fitDistance(frame,direction,fov,aspect){
 const basis=new THREE.Matrix4().lookAt(direction,new THREE.Vector3(),new THREE.Vector3(0,0,1)),right=new THREE.Vector3().setFromMatrixColumn(basis,0),up=new THREE.Vector3().setFromMatrixColumn(basis,1),forward=new THREE.Vector3().setFromMatrixColumn(basis,2);
 const tanV=Math.tan(THREE.MathUtils.degToRad(fov/2)),tanH=tanV*aspect;let distance=3.5;
 for(const x of [frame.box.min.x,frame.box.max.x])for(const y of [frame.box.min.y,frame.box.max.y])for(const z of [frame.box.min.z,frame.box.max.z]){
  const p=new THREE.Vector3(x,y,z).sub(frame.center),depth=p.dot(forward);
  distance=Math.max(distance,depth+Math.abs(p.dot(right))/tanH,depth+Math.abs(p.dot(up))/tanV);
 }
 return distance*1.12;
}

export class SplitViewer{
 constructor(scene,renderer,grid,compareViewer,ground,dynamic){this.scene=scene;this.renderer=renderer;this.grid=grid;this.compareViewer=compareViewer;this.ground=ground;this.dynamic=dynamic;this.views=[];this.primary=null;this.sync='event'}
 clear(){for(const view of this.views)view.controls.dispose();this.views=[];this.grid.replaceChildren();this.grid.hidden=true}
 setEntries(entries,primary,sync,time,mainCamera,mainTarget,labelFor,colorFor){
  this.clear();this.primary=primary;this.sync=sync;this.grid.hidden=false;this.grid.dataset.count=String(entries.length);
  const direction=mainCamera.position.clone().sub(mainTarget).normalize();
  const frames=entries.map(entry=>replayFrame(this.compareViewer.parts.get(entry.id)));
  entries.forEach((entry,i)=>{
   const pane=document.createElement('div');pane.className='splitPane';pane.dataset.splitId=entry.id;pane.style.setProperty('--trial-color',colorFor(entry));
   const title=document.createElement('div');title.className='splitPaneTitle';
   const name=document.createElement('span');name.textContent=labelFor(entry);name.title=labelFor(entry);
   const at=document.createElement('time');at.dataset.compareTime=entry.id;
   title.append(name,at);pane.append(title);this.grid.append(pane);
   const camera=new THREE.PerspectiveCamera(45,1,.02,100);camera.up.set(0,0,1);
   const rect=pane.getBoundingClientRect(),aspect=Math.max(.2,rect.width/Math.max(1,rect.height));
   const distance=fitDistance(frames[i],direction,camera.fov,aspect);
   camera.aspect=aspect;camera.position.copy(frames[i].center).addScaledVector(direction,distance);camera.lookAt(frames[i].center);camera.updateProjectionMatrix();
   const controls=new OrbitControls(camera,pane);controls.enableDamping=false;controls.target.copy(frames[i].center);controls.minDistance=.7;controls.maxDistance=25;controls.update();
   this.views.push({entry,pane,camera,controls,frame:frames[i],defaultDistance:distance});
  });
  const distance=Math.max(...this.views.map(view=>view.defaultDistance));
  for(const view of this.views){view.controls.maxDistance=Math.max(25,distance*2);view.camera.position.copy(view.frame.center).addScaledVector(direction,distance);view.controls.update();}
 }
 reset(mainCamera,mainTarget,time){
  const direction=mainCamera.position.clone().sub(mainTarget).normalize();
  const frames=this.views.map(view=>replayFrame(this.compareViewer.parts.get(view.entry.id)));
  const distance=Math.max(3.5,...this.views.map((view,i)=>{const rect=view.pane.getBoundingClientRect();return fitDistance(frames[i],direction,view.camera.fov,Math.max(.2,rect.width/Math.max(1,rect.height)))}));
  for(const [i,view] of this.views.entries()){const frame=frames[i];view.frame=frame;view.controls.maxDistance=Math.max(25,distance*2);
   view.camera.position.copy(frame.center).addScaledVector(direction,distance);view.controls.target.copy(frame.center);view.controls.update();
  }
 }
 // Copy the view relative to each replay's fixed framing center, including manual pan.
 snapAllToView(id){
  const source=this.views.find(view=>view.entry.id===id);
  if(!source)return false;
  source.controls.update();
  const pan=source.controls.target.clone().sub(source.frame.center);
  const offset=source.camera.position.clone().sub(source.controls.target);
  for(const view of this.views){
   if(view===source)continue;
   view.controls.target.copy(view.frame.center).add(pan);
   view.camera.position.copy(view.controls.target).add(offset);
   view.camera.up.copy(source.camera.up);view.camera.fov=source.camera.fov;view.camera.zoom=source.camera.zoom;
   view.controls.minDistance=source.controls.minDistance;view.controls.maxDistance=source.controls.maxDistance;
   view.camera.updateProjectionMatrix();view.controls.update();
  }
  return true;
 }
 render(){
  if(!this.views.length)return;
  const canvasRect=this.renderer.domElement.getBoundingClientRect(),parts=[...this.compareViewer.parts.values()];
  const visibility=parts.map(part=>[part,part.group.visible]),groundVisible=this.ground.visible,dynamicVisible=this.dynamic.visible;
  this.ground.visible=false;this.dynamic.visible=false;this.compareViewer.setSplitMode(true);this.renderer.setScissorTest(true);
  try{
   for(const view of this.views){
    const part=this.compareViewer.parts.get(view.entry.id);
    // Playback updates the athlete, never the pane camera or orbit target.
    view.controls.update();
    const rect=view.pane.getBoundingClientRect(),x=rect.left-canvasRect.left,y=canvasRect.bottom-rect.bottom;
    view.camera.aspect=rect.width/Math.max(1,rect.height);view.camera.updateProjectionMatrix();
    for(const other of parts)other.group.visible=other===part;
    this.renderer.setViewport(x,y,rect.width,rect.height);this.renderer.setScissor(x,y,rect.width,rect.height);
    this.renderer.render(this.scene,view.camera);
   }
  }finally{
   this.renderer.setScissorTest(false);this.ground.visible=groundVisible;this.dynamic.visible=dynamicVisible;this.compareViewer.setSplitMode(false);
   for(const [part,visible] of visibility)part.group.visible=visible;
  }
 }
}
