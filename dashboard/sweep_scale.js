// Shared ranges are based on all selected supported sweeps, including hidden
// ones, and their complete displayed phases. They do not change at the playhead.
export function combinedSweepScale(sweeps){
 const valid=sweeps.filter(s=>s?.range&&Number.isFinite(s.range.low)&&Number.isFinite(s.range.high));
 if(!valid.length)return null;
 return {low:Math.min(...valid.map(s=>s.range.low)),high:Math.max(...valid.map(s=>s.range.high))};
}
export function colorFraction(value,scale){
 if(!(scale.high>scale.low))return 0;
 return Math.max(0,Math.min(1,(value-scale.low)/(scale.high-scale.low)));
}
