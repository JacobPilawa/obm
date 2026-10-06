// One force magnitude scale for every plate and replay in the current selection.
export const FORCE_ARROW_MAX_LENGTH=1.8;
export function peakForceMagnitude(motions){
 let peak=0;
 for(const motion of motions)for(const plate of motion?.platforms||[])for(const force of plate.force_global||[]){
  if(!Array.isArray(force)||force.length!==3||!force.every(Number.isFinite))continue;
  const magnitude=Math.hypot(...force);
  if(magnitude>peak)peak=magnitude;
 }
 return peak;
}
export function forceArrowLength(magnitude,peak){
 return Number.isFinite(magnitude)&&magnitude>0&&Number.isFinite(peak)&&peak>0?FORCE_ARROW_MAX_LENGTH*magnitude/peak:0;
}
export function forceArrowHead(length){
 return [Math.min(.16,length*.25),Math.min(.075,length*.12)];
}
