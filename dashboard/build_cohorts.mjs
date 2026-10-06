import fs from 'node:fs';
import readline from 'node:readline';
import {buildQuantities} from './quantities.js';
import {buildKeypointGroups} from './keypoint_data.js';
import {sample} from './biomechanics.js';
export function quantile(values,p){if(!values.length)return null;const a=[...values].sort((a,b)=>a-b),at=(a.length-1)*p,i=Math.floor(at);return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*(at-i)}
export const grid=Array.from({length:401},(_,i)=>Number((-3+i*.01).toFixed(2)));
const output=process.argv[2];
if(output){const disciplines=new Map();let trials=0;
 for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){if(!line)continue;const trial=JSON.parse(line),kind=trial.entry.discipline,anchor=trial.events[kind==='pitching'?'BR_time':'contact_time']?.time,athlete=trial.entry.athlete;
  if(!Number.isFinite(anchor)||athlete==null)continue;
  let levels=disciplines.get(kind);if(!levels)disciplines.set(kind,levels=new Map());const series=[];
  for(const spec of buildQuantities(trial))for(const s of spec.series)if(!s.staticReference)series.push([`chart:${spec.id}:${s.label}`,s]);
  for(const group of buildKeypointGroups(trial))for(const metric of group.metrics)series.push([`key:${metric.id}`,metric]);
  for(const level of ['all',trial.entry.playing_level||'unknown']){let cohort=levels.get(level);if(!cohort)levels.set(level,cohort={trials:0,athletes:new Map()});cohort.trials++;let signals=cohort.athletes.get(athlete);if(!signals)cohort.athletes.set(athlete,signals=new Map());
   for(const [key,s] of series){let a=signals.get(key);if(!a)signals.set(key,a={sum:new Float64Array(grid.length),n:new Uint16Array(grid.length)});for(let i=0;i<grid.length;i++){const value=sample(s,grid[i]+anchor);if(Number.isFinite(value)){a.sum[i]+=value;a.n[i]++}}}
  }
  if(++trials%100===0)console.error(`Cohort extraction: ${trials} trials`);
 }
 fs.mkdirSync(output,{recursive:true});
 for(const [kind,levels] of disciplines){const cohorts={};for(const [level,group] of levels){const signals={},keys=new Set([...group.athletes.values()].flatMap(m=>[...m.keys()]));for(const key of keys){const peers=[...group.athletes.values()].map(m=>m.get(key)).filter(Boolean),low=[],high=[],n=[];for(let i=0;i<grid.length;i++){const values=peers.filter(a=>a.n[i]>0).map(a=>a.sum[i]/a.n[i]);n.push(values.length);low.push(values.length>=5?Number(quantile(values,.25).toPrecision(7)):null);high.push(values.length>=5?Number(quantile(values,.75).toPrecision(7)):null)}if(n.some(x=>x>=5))signals[key]={low,high,n}}
   cohorts[level]={label:level==='all'?'All playing levels':level.replaceAll('_',' '),athletes:group.athletes.size,trials:group.trials,signals};console.error(`${kind}/${level}: ${group.athletes.size} athletes, ${group.trials} trials, ${Object.keys(signals).length} signals`)}
  fs.writeFileSync(`${output}/cohort_${kind}.json`,JSON.stringify({version:1,alignment:kind==='pitching'?'BR_time':'contact_time',grid,minimumAthletes:5,aggregation:'Mean per athlete per timepoint, then linear-interpolated 25th and 75th percentiles across athletes. Includes selected athlete.',cohorts}));
 }
}
