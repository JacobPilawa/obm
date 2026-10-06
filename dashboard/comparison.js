// A single hue identifies each replay across the 3D viewer, charts, and details.
export const REPLAY_COLORS=[
 {name:'Red',body:'#bf3d38',trail:'#e87770',marker:'#a62628',force:'#d94c45',ball:'#f1a49c'},
 {name:'Blue',body:'#245fae',trail:'#5799dd',marker:'#194b8c',force:'#3478cf',ball:'#95c1ed'},
 {name:'Green',body:'#218051',trail:'#51ad79',marker:'#14653d',force:'#329c63',ball:'#91d5aa'},
 {name:'Purple',body:'#7950ae',trail:'#ab80d2',marker:'#603790',force:'#9466c4',ball:'#cbb0e5'}
];

export function anchorTime(trial,mode){
 if(mode==='start'||mode==='normalized')return 0;
 const key=mode==='event'?(trial.entry.discipline==='pitching'?'BR_time':'contact_time'):mode==='foot_contact'?'fp_10_time':'fp_100_time';
 const value=trial.events?.[key]?.time;
 return Number.isFinite(value)?value:0;
}

export function alignedTime(primaryTime,primary,other,mode){
 if(mode==='normalized')return primary.duration>0?primaryTime/primary.duration*other.duration:0;
 return primaryTime-anchorTime(primary,mode)+anchorTime(other,mode);
}

export function primaryTime(otherTime,primary,other,mode){
 if(mode==='normalized')return other.duration>0?otherTime/other.duration*primary.duration:0;
 return otherTime-anchorTime(other,mode)+anchorTime(primary,mode);
}

export function comparisonWindow(entries,primary,mode){
 if(!primary||!entries?.length)return {min:0,max:Math.max(primary?.duration||0,.001)};
 const starts=entries.map(entry=>primaryTime(0,primary,entry.data,mode));
 const ends=entries.map(entry=>primaryTime(entry.data.duration,primary,entry.data,mode));
 return {min:Math.min(0,...starts),max:Math.max(primary.duration,...ends,.001)};
}

// Find the first and last frames with the fullest available skeleton/bat pose.
// The published trial duration can extend beyond usable landmark frames.
export function visualPoseRange(data,pairs){
 const landmarks=data.signals?.landmarks,motion=data.motion,times=landmarks?.time||motion?.frames.map((_,i)=>i/motion.rate)||[];
 if(!times.length)return {start:0,end:data.duration||0};
 const valid=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
 const columns=landmarks?.series,labels=motion?.labels,rawIndex=new Map(labels?.map((name,i)=>[name,i])||[]);
 const position=(name,i)=>columns?['x','y','z'].map(axis=>columns[name+'_'+axis]?.[i]):motion.frames[i]?.[rawIndex.get(name)];
 const present=(name,i)=>valid(position(name,i));
 const connected=(a,b,i)=>{const one=position(a,i),two=position(b,i);return valid(one)&&valid(two)&&Math.hypot(...one.map((value,j)=>value-two[j]))<2};
 let best=0,first=0,last=times.length-1;
 for(let i=0;i<times.length;i++){
  const score=pairs.reduce((count,[a,b])=>count+Number(connected(a,b,i)),0);
  if(score>best){best=score;first=i;last=i}
  else if(score===best&&best>0)last=i;
 }
 if(!best){const names=columns?Object.keys(columns).filter(name=>name.endsWith('_x')).map(name=>name.slice(0,-2)):labels||[];for(let i=0;i<times.length;i++){const score=names.reduce((count,name)=>count+Number(present(name,i)),0);if(score>best){best=score;first=i;last=i}else if(score===best&&best>0)last=i}}
 return best?{start:times[first],end:times[last]}:{start:times[0],end:times.at(-1)};
}
