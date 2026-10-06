import * as THREE from 'three';
import {motionAnalysis} from './motion_analysis.js';
const valid=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite),v=p=>new THREE.Vector3(...p);
const C={com:'#ffb000',trail:'#b76b00',axis:'#7043bc',braking:'#007f95',extend:'#16885b',flex:'#ca6028'};
const line=(parent,color,dashed=false)=>{const object=new THREE.LineSegments(new THREE.BufferGeometry(),dashed?new THREE.LineDashedMaterial({color,dashSize:.045,gapSize:.035,depthTest:false}):new THREE.LineBasicMaterial({color,depthTest:false}));object.renderOrder=12;object.frustumCulled=false;parent.add(object);return object};
function segments(object,pairs){const coords=pairs.filter(p=>p.every(valid)).flat(2);object.geometry.dispose();object.geometry=new THREE.BufferGeometry();object.geometry.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));if(object.isLineSegments&&object.material.isLineDashedMaterial)object.computeLineDistances();object.visible=coords.length>0}
function label(parent,color){const canvas=document.createElement('canvas');canvas.width=768;canvas.height=96;const texture=new THREE.CanvasTexture(canvas),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false}));sprite.scale.set(1.22,.1525,1);sprite.renderOrder=20;parent.add(sprite);let last='';return {sprite,set(text,point){sprite.visible=!!text&&valid(point);if(!sprite.visible)return;sprite.position.copy(v(point));if(text===last)return;last=text;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,768,96);ctx.fillStyle='rgba(255,255,255,.94)';ctx.fillRect(0,0,768,96);ctx.strokeStyle=color;ctx.lineWidth=5;ctx.strokeRect(2,2,764,92);ctx.font='600 32px sans-serif';ctx.fillStyle='#23333d';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,384,48,744);texture.needsUpdate=true}}}
export class MotionVisuals{
 constructor(parent,trial){
  this.analysis=motionAnalysis(trial);this.root=new THREE.Group();parent.add(this.root);
  this.dot=new THREE.Mesh(new THREE.SphereGeometry(.032,10,7),new THREE.MeshStandardMaterial({color:C.com,roughness:.35}));this.dot.renderOrder=16;this.root.add(this.dot);

  this.trail=line(this.root,C.trail);const points=[],times=[],a=this.analysis,typical=(a.time.at(-1)-a.time[0])/Math.max(1,a.time.length-1);
  for(let i=1;i<a.time.length;i++)if(valid(a.com[i-1])&&valid(a.com[i])&&a.time[i]-a.time[i-1]<=typical*1.6){points.push(...a.com[i-1],...a.com[i]);times.push(a.time[i])}
  this.trail.geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));this.trailTimes=times;
  this.axis=line(this.root,C.axis);this.vertical=line(this.root,'#67747b',true);this.leg=line(this.root,C.extend);this.arc=line(this.root,C.extend);
  this.force=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),1,C.braking,.11,.055);for(const o of [this.force.line,this.force.cone]){o.material.depthTest=false;o.renderOrder=14}this.root.add(this.force);
  this.labels={braking:label(this.root,C.braking),knee:label(this.root,C.extend)};
 }
 update(t,options){
  this.root.visible=!!(options.com||options.comTrail||options.axis||options.braking||options.knee);if(!this.root.visible)return;
  const a=this.analysis,s=a.at(t);this.dot.visible=!!options.com&&valid(s.com);if(this.dot.visible)this.dot.position.copy(v(s.com));

  this.trail.visible=!!options.comTrail;let lo=0,hi=this.trailTimes.length;while(lo<hi){const mid=(lo+hi)>>1;if(this.trailTimes[mid]<=t)lo=mid+1;else hi=mid}this.trail.geometry.setDrawRange(0,lo*2);
  for(const x of [this.axis,this.vertical,this.leg,this.arc,this.force])x.visible=false;for(const name of ['braking','knee'])this.labels[name].set('',null);
  if(options.axis&&s.axis){const axis=s.axis,top=axis.shoulders.map((x,i)=>x+axis.direction[i]*.38);segments(this.axis,[[axis.floor||axis.origin,top]]);segments(this.vertical,[[[axis.origin[0],axis.origin[1],0],[axis.origin[0],axis.origin[1],top[2]]]]);

  }
  if(options.braking&&valid(s.leg[2])&&Number.isFinite(s.force)){
   const origin=[s.leg[2][0],s.leg[2][1],.06],length=Math.min(1.8,Math.abs(a.bw?s.force/a.bw*.45:s.force*.00045));this.force.visible=length>.006;
   if(this.force.visible){this.force.position.copy(v(origin));this.force.setDirection(new THREE.Vector3(Math.sign(s.force),0,0));this.force.setLength(length,Math.min(.12,length*.35),Math.min(.065,length*.2));this.force.setColor(s.braking==='opposes COM motion'?C.braking:'#8c6a33')}
   const force=Number.isFinite(s.forceBW)?`${s.forceBW.toFixed(2)} BW`:`${s.force.toFixed(0)} N`;this.labels.braking.set(`Lead Fx ${force} · ${s.braking}`,origin.map((x,i)=>x+(i===2?.19:0)));
  }
  if(options.knee&&s.leg.every(valid)&&Number.isFinite(s.extension)){
   const [hip,knee,ankle]=s.leg,u=v(hip).sub(v(knee)),w=v(ankle).sub(v(knee));if(u.length()>.01&&w.length()>.01){u.normalize();w.normalize();const color=s.extension>=0?C.extend:C.flex;this.leg.material.color.set(color);this.arc.material.color.set(color);segments(this.leg,[[hip,knee],[knee,ankle]]);
    const angle=Math.acos(Math.max(-1,Math.min(1,u.dot(w)))),normal=new THREE.Vector3().crossVectors(u,w);if(normal.length()>.001){normal.normalize();const points=Array.from({length:25},(_,i)=>u.clone().applyAxisAngle(normal,angle*i/24).multiplyScalar(.18).add(v(knee)).toArray());segments(this.arc,points.slice(1).map((point,i)=>[points[i],point]))}
    this.labels.knee.set(`Knee ${Number.isFinite(s.flexion)?s.flexion.toFixed(0)+'° · ':''}extension ${s.extension.toFixed(0)}°/s`,knee.map((x,i)=>x+(i===2?.18:0)));
   }
  }
 }
}
