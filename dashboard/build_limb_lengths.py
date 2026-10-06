#!/usr/bin/env python3
"""Audit joint-center length proxies, repeatability, and static marker alternatives."""
from pathlib import Path
import argparse
import os
import json
import numpy as np
import pandas as pd
import ezc3d

SEGMENTS = {
    'hitting': {'left': [('upper_arm','lsjc','lejc'),('forearm','lejc','lwjc'),('thigh','left_hip','lkjc'),('shank','lkjc','lajc')],
                'right': [('upper_arm','rsjc','rejc'),('forearm','rejc','rwjc'),('thigh','right_hip','rkjc'),('shank','rkjc','rajc')]},
    'pitching': {'throwing': [('upper_arm','shoulder_jc','elbow_jc'),('forearm','elbow_jc','wrist_jc')],
                 'glove': [('upper_arm','glove_shoulder_jc','glove_elbow_jc'),('forearm','glove_elbow_jc','glove_wrist_jc')],
                 'lead': [('thigh','lead_hip','lead_knee_jc'),('shank','lead_knee_jc','lead_ankle_jc')],
                 'rear': [('thigh','rear_hip','rear_knee_jc'),('shank','rear_knee_jc','rear_ankle_jc')]},
}
BOUNDS = {'upper_arm':(.15,.65),'forearm':(.1,.5),'thigh':(.2,.75),'shank':(.2,.7)}


def physical_side(kind, role, throws):
    if kind == 'hitting':
        return role
    if throws not in ('R', 'L'):
        return None
    return ('right' if throws=='R' else 'left') if role in ('throwing','rear') else ('left' if throws=='R' else 'right')


def static_proxies(path):
    c = ezc3d.c3d(str(path))
    params = c['parameters']
    unit = params['POINT']['UNITS']['value'][0].strip().lower()
    scale = {'m':1.,'mm':.001,'cm':.01}[unit]
    p = np.asarray(c['data']['points'][:3]).transpose(2,1,0)*scale
    labels = [x.strip() for x in params['POINT']['LABELS']['value']]
    good = np.isfinite(p).all(axis=2)
    residual = c['data'].get('meta_points',{}).get('residuals')
    if residual is not None:
        r = np.asarray(residual)[0].T
        good &= np.isfinite(r)&(r>=0)
    p[~good] = np.nan
    def point(names):
        if not all(n in labels for n in names):
            return None
        # Both paired markers must be observed in the same static frame.
        return np.mean(p[:,[labels.index(n) for n in names],:],axis=1)
    rows=[]
    for side, s in [('left','L'),('right','R')]:
        elbow=point([s+'ELB',s+'MELB'])
        wrist=point([s+'WRA',s+'WRB'])
        knee=point([s+'KNE',s+'MKNE'])
        ankle=point([s+'ANK',s+'MANK'])
        shoulder=point([s+'SHO'])
        for name,a,b in [('upper_arm_surface',shoulder,elbow),('forearm',elbow,wrist),('shank',knee,ankle)]:
            if a is None or b is None:
                continue
            d=np.linalg.norm(a-b,axis=1)
            d=d[np.isfinite(d)&(d>.01)]
            if len(d):
                rows.append(dict(side=side,segment=name,static_median_m=float(np.median(d)),
                                 static_p05_m=float(np.percentile(d,5)),static_p95_m=float(np.percentile(d,95)),
                                 static_valid_frames=len(d),model=str(path),units=unit))
    explicit=[]
    for group, values in params.items():
        for key in values:
            if any(word in key.lower() for word in ['length','humerus','radius','femur','tibia']):
                explicit.append(group+':'+key)
    return rows,explicit


def quantiles(values):
    a=np.asarray(values,dtype=float)
    a=a[np.isfinite(a)]
    return {k:float(np.percentile(a,q)) for k,q in [('p50',50),('p90',90),('p95',95),('max',100)]} if len(a) else {}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo',type=Path,default=Path(os.environ.get('OBM_DATA_ROOT', Path(__file__).resolve().parent.parent/'openbiomechanics')).expanduser())
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parent/'data/limb_audit')
    args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    trial_rows=[];static_rows=[];explicit={};fingerprints={};counts={}
    for kind in SEGMENTS:
        base=args.repo/('baseball_'+kind)/'data'; key='session_pitch' if kind=='pitching' else 'session_swing'
        meta=pd.read_csv(base/'metadata.csv',dtype={'user':str,'session':str,key:str})
        meta['user']=meta['user'].astype(int).astype(str);meta['session']=meta['session'].astype(int).astype(str)
        if kind=='pitching':
            poi=pd.read_csv(base/'poi/poi_metrics.csv',usecols=[key,'p_throws'],dtype={key:str})
            meta=meta.merge(poi,on=key,validate='one_to_one')
        columns=[key,'time']+[n+'_'+axis for roles in SEGMENTS[kind].values() for _,a,b in roles for n in (a,b) for axis in 'xyz']
        signal=base/'full_sig/landmarks.csv'
        stat=signal.stat();fingerprints[kind]=dict(path=str(signal),size=stat.st_size,mtime_ns=stat.st_mtime_ns)
        frame=pd.read_csv(signal,usecols=list(dict.fromkeys(columns)),dtype={key:str})
        print(kind,len(frame),'frames',flush=True)
        bymeta=meta.set_index(key)
        for trial, group in frame.groupby(key,sort=False):
            m=bymeta.loc[trial];height=float(m['session_height_m']) if kind=='pitching' else float(m['session_height_in'])*.0254
            for role,segments in SEGMENTS[kind].items():
                side=physical_side(kind,role,m.get('p_throws'))
                if side is None:
                    continue
                for name,a,b in segments:
                    xyz=lambda n:group[[n+'_'+axis for axis in 'xyz']].to_numpy(dtype=float)
                    d=np.linalg.norm(xyz(a)-xyz(b),axis=1)
                    finite=np.isfinite(d)&(d>0);values=d[finite]
                    if not len(values):
                        continue
                    median=float(np.median(values));lo,hi=np.percentile(values,[5,95])
                    lower,upper=BOUNDS[name]
                    trial_rows.append(dict(discipline=kind,athlete=m['user'],session=m['session'],trial=trial,
                        side=side,role=role,segment=name,proximal=a,distal=b,median_m=median,p05_m=float(lo),p95_m=float(hi),
                        span_pct=float(100*(hi-lo)/median),valid_frames=len(values),total_frames=len(d),
                        valid_fraction=float(finite.mean()),height_m=height,stature_pct=100*median/height,
                        usable=bool(len(values)>=30 and finite.mean()>=.8 and lower<=median<=upper)))
        for model in sorted((base/'c3d').rglob('*model.c3d')):
            parts=model.stem.split('_');athlete=str(int(parts[0]));session=str(int(parts[1]))
            rows,names=static_proxies(model)
            static_rows.extend(dict(discipline=kind,athlete=athlete,session=session,**row) for row in rows)
            if names:
                explicit[str(model)]=names
        counts[kind]=dict(trials=len(frame[key].unique()),athletes=meta.user.nunique(),sessions=meta.session.nunique(),
                          static_models=len(list((base/'c3d').rglob('*model.c3d'))))
        del frame
    trials=pd.DataFrame(trial_rows);statics=pd.DataFrame(static_rows)
    trials.to_csv(args.output/'trial_segment_lengths.csv',index=False)
    statics.to_csv(args.output/'static_marker_proxies.csv',index=False)
    profiles={};session_rows=[]
    for (kind,athlete,session),group in trials.groupby(['discipline','athlete','session']):
        profile=dict(discipline=kind,athlete=athlete,session=session,trial_count=group.trial.nunique(),segments={})
        for (side,segment),g in group.groupby(['side','segment']):
            g=g[g.usable]
            if not len(g):
                continue
            median=float(g.median_m.median());span=float(100*(g.median_m.max()-g.median_m.min())/median)
            within=float(g.span_pct.median())
            # These are transparent display screens, not clinically validated cutoffs.
            status='variable' if within>15 or span>10 else 'approximate'
            row=dict(discipline=kind,athlete=athlete,session=session,side=side,segment=segment,
                     median_m=median,within_trial_span_pct=within,between_trial_range_pct=span,
                     trial_count=len(g),valid_fraction=float(g.valid_fraction.median()),status=status)
            session_rows.append(row)
            profile['segments'][side+'_'+segment]={k:v for k,v in row.items() if k not in ('discipline','athlete','session','side','segment')}
        profiles[kind+':'+session]=profile
    sessions=pd.DataFrame(session_rows)
    sessions.to_csv(args.output/'session_segment_lengths.csv',index=False)
    comparison=sessions.merge(statics,on=['discipline','athlete','session','side','segment'],how='inner',validate='one_to_one')
    comparison['dynamic_minus_static_cm']=100*(comparison.median_m-comparison.static_median_m)
    comparison['abs_difference_pct']=100*abs(comparison.median_m-comparison.static_median_m)/comparison.static_median_m
    comparison.to_csv(args.output/'static_vs_joint_center_lengths.csv',index=False)
    surface=sessions[sessions.segment.eq('upper_arm')].merge(
        statics[statics.segment.eq('upper_arm_surface')].drop(columns='segment'),
        on=['discipline','athlete','session','side'],validate='one_to_one')
    surface['surface_minus_joint_center_cm']=100*(surface.static_median_m-surface.median_m)
    surface.to_csv(args.output/'static_shoulder_surface_vs_joint_center.csv',index=False)
    summary=dict(counts=counts,explicit_limb_parameters_found=explicit,source_fingerprints=fingerprints,
                 method='Median Euclidean joint-center distance within each trial, then median of trial medians within session. Equal weight per trial.',
                 display_screens=dict(min_valid_frames=30,min_valid_fraction=.8,max_within_trial_p95_p05_span_pct=15,max_between_trial_range_pct=10),
                 quality_threshold_note='Exploratory display screens; not accuracy or clinical validation. Variability is not a confidence interval.',
                 units_note='Released landmarks use lab-scale positions consistent with meter C3D points; static POINT:UNITS explicitly checked for every model.',metrics={})
    for (kind,segment),g in sessions.groupby(['discipline','segment']):
        c=comparison[(comparison.discipline==kind)&(comparison.segment==segment)]
        summary['metrics'][kind+'_'+segment]=dict(side_session_estimates=len(g),variable_estimates=int(g.status.eq('variable').sum()),
             median_length_cm=float(g.median_m.median()*100),within_trial_span_pct=quantiles(g.within_trial_span_pct),
             between_trial_range_pct=quantiles(g[g.trial_count>=2].between_trial_range_pct),
             static_comparison_count=len(c),static_abs_difference_pct=quantiles(c.abs_difference_pct),
             static_difference_cm=quantiles(c.dynamic_minus_static_cm))
    summary['static_shoulder_surface_note']='Acromion skin marker to epicondyle midpoint, not glenohumeral center to elbow. Not an anatomical upper-arm reference.'
    summary['static_shoulder_surface_comparisons']={kind:dict(n=len(g),median_difference_cm=float(g.surface_minus_joint_center_cm.median()),
        p05_difference_cm=float(g.surface_minus_joint_center_cm.quantile(.05)),p95_difference_cm=float(g.surface_minus_joint_center_cm.quantile(.95)))
        for kind,g in surface.groupby('discipline')}
    (args.output/'audit_statistics.json').write_text(json.dumps(summary,indent=2)+'\n')
    (Path(__file__).resolve().parent/'data/limb_lengths.json').write_text(json.dumps(dict(version=1,profiles=profiles,source_fingerprints=fingerprints,
        method=summary['method'],display_screens=summary['display_screens']),separators=(',',':'))+'\n')
    print(json.dumps(summary,indent=2))


if __name__=='__main__':
    main()
