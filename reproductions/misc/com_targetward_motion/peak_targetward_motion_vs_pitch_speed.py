"""Peak pre-release targetward COM velocity and acceleration versus pitch speed."""
from pathlib import Path
import argparse
import collections
import csv
import json
import math
import os
os.environ.setdefault('MPLCONFIGDIR', '/tmp/obm-com-height-matplotlib')
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt


def number(value):
    try:
        v = float(value)
        return v if math.isfinite(v) else None
    except (ValueError, TypeError):
        return None


def derivatives(time, position, window_ms):
    """Centered cubic fits in actual time; no endpoints or missing-gap bridging."""
    time, position = np.asarray(time), np.asarray(position, dtype=float)
    if len(time)<7 or np.any(np.diff(time)<=0):
        raise ValueError('Insufficient or non-increasing sample times')
    dt = float(np.median(np.diff(time)))
    n = max(7, int(round(window_ms/1000/dt)))
    if n%2==0:
        n += 1
    half = n//2
    velocity, acceleration = np.full(len(time), np.nan), np.full(len(time), np.nan)
    for i in range(half, len(time)-half):
        t = time[i-half:i+half+1]
        x = position[i-half:i+half+1]
        # Reject missing data or a discontinuity in native sampling.
        if not np.isfinite(x).all() or np.max(np.diff(t))>1.5*dt:
            continue
        scale = (t[-1]-t[0])/2
        u = (t-time[i])/scale
        c = np.linalg.lstsq(np.polynomial.polynomial.polyvander(u,3), x-x[half], rcond=None)[0]
        velocity[i], acceleration[i] = c[1]/scale, 2*c[2]/scale**2
    return velocity, acceleration, n, half


def peak(time, signal, release):
    eligible = np.isfinite(signal) & (time<=release)
    if not eligible.any():
        raise ValueError('No valid pre-release derivative')
    i = int(np.argmax(np.where(eligible, signal, -np.inf)))
    return float(signal[i]), float(time[i])


def write_csv(path, rows):
    with path.open('w',newline='') as f:
        w = csv.DictWriter(f,fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


def aggregate(rows):
    grouped = collections.defaultdict(list)
    for row in rows:
        grouped[row['athlete']].append(row)
    keys = ['peak_targetward_COM_velocity_m_s','peak_targetward_COM_acceleration_m_s2','pitch_speed_mph']
    return [{'athlete':a,'n_pitches':len(p),
             'playing_level':collections.Counter(r['playing_level'] for r in p).most_common(1)[0][0],
             **{k:float(np.mean([r[k] for r in p])) for k in keys}}
            for a,p in sorted(grouped.items())]


def stats(values, key):
    x = np.array([v[key] for v in values])
    y = np.array([v['pitch_speed_mph'] for v in values])
    slope,intercept = np.polyfit(x,y,1)
    return {'n':len(values),'pearson_r':float(np.corrcoef(x,y)[0,1]),
            'slope_mph_per_x_unit':float(slope),'intercept_mph':float(intercept),
            'peak_range':[float(x.min()),float(x.max())]}


def plot(out, rows, athletes, key, label, name):
    colors = {'college':'#247995','high_school':'#d2932c','independent':'#80599f','milb':'#3b9368'}
    fig,axes = plt.subplots(1,2,figsize=(11.8,5.5),sharex=True,sharey=True,layout='constrained')
    result = {}
    for ax,values,title in zip(axes,[athletes,rows],['Pitcher averages','Individual pitches']):
        summary = stats(values,key)
        result[title] = summary
        for level,color in colors.items():
            subset = [v for v in values if v['playing_level']==level]
            if subset:
                ax.scatter([v[key] for v in subset],[v['pitch_speed_mph'] for v in subset],
                           s=38 if title=='Pitcher averages' else 23,
                           alpha=.82 if title=='Pitcher averages' else .5,
                           color=color,edgecolors='none',label=level.replace('_',' ').title())
        xx = np.linspace(*summary['peak_range'],100)
        ax.plot(xx,summary['slope_mph_per_x_unit']*xx+summary['intercept_mph'],
                color='#44515b',lw=1.5,ls='--',label='Descriptive pooled fit')
        ax.set_title(f"{title}\nn = {len(values)} · Pearson r = {summary['pearson_r']:.2f}",fontsize=11)
        ax.set_xlabel(label)
        ax.grid(alpha=.18)
        ax.spines[['top','right']].set_visible(False)
    axes[0].set_ylabel('Pitch speed (mph)')
    axes[1].legend(fontsize=8,frameon=False,loc='lower right')
    fig.suptitle(f'Peak targetward COM {name} and pitch speed',fontsize=14)
    fig.supxlabel('Maximum signed +X derivative before release · Centered cubic position fit, ~50 ms window\nPitcher averages give each athlete equal weight; associations are descriptive.',fontsize=8)
    filename = f'peak_targetward_com_{name}_vs_pitch_speed'
    fig.savefig(out/f'{filename}.png',dpi=220)
    fig.savefig(out/f'{filename}.pdf')
    plt.close(fig)
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--data-root',type=Path,default=Path('/Volumes/Elements/biomech/openbiomechanics'))
    args = p.parse_args()
    out = Path(__file__).resolve().parent
    data = args.data_root/'baseball_pitching'/'data'
    with (data/'metadata.csv').open() as f:
        metadata = {r['session_pitch']:r for r in csv.DictReader(f)}
    with (data/'poi'/'poi_metrics.csv').open() as f:
        poi = {r['session_pitch']:r for r in csv.DictReader(f)}
    signals,events = collections.defaultdict(list),collections.defaultdict(set)
    with (data/'full_sig'/'landmarks.csv').open() as f:
        reader = csv.reader(f)
        header = next(reader)
        ik,it,ix,ir = [header.index(k) for k in ['session_pitch','time','centerofmass_x','BR_time']]
        for r in reader:
            if r[ik] not in metadata:
                continue
            t = number(r[it])
            if t is None:
                raise ValueError(f'Missing time: {r[ik]}')
            signals[r[ik]].append((t,number(r[ix])))
            br = number(r[ir])
            if br is not None:
                events[r[ik]].add(br)
    rows_by_window,excluded = {35:[],50:[],75:[]},[]
    for key,meta in metadata.items():
        try:
            speed = number(meta['pitch_speed_mph'])
            if speed is None or len(events[key])!=1:
                raise ValueError('Missing pitch speed or inconsistent release event')
            release = next(iter(events[key]))
            time = np.array([s[0] for s in signals[key]])
            position = [s[1] for s in signals[key]]
            if not len(time) or not time[0]<=release<=time[-1]:
                raise ValueError('Release outside recording')
            trial_rows = {}
            for window in rows_by_window:
                v,a,n,half = derivatives(time,position,window)
                vmax,tv = peak(time,v,release)
                amax,ta = peak(time,a,release)
                trial_rows[window] = {
                    'trial':key,'athlete':int(meta['user']),'session':meta['session'],
                    'playing_level':meta['playing_level'],'pitch_speed_mph':speed,
                    'peak_targetward_COM_velocity_m_s':vmax,'peak_targetward_COM_acceleration_m_s2':amax,
                    'peak_velocity_time_s':tv,'peak_acceleration_time_s':ta,'ball_release_time_s':release,
                    'fit_window_samples':n,'fit_window_span_ms':float(np.median(time[n-1:]-time[:len(time)-n+1])*1000),
                    'first_eligible_derivative_time_s':float(time[half]),
                    'velocity_peak_at_first_eligible_sample':bool(tv==time[half]),
                    'acceleration_peak_at_first_eligible_sample':bool(ta==time[half]),
                    'missing_COM_samples':sum(x is None for x in position),
                    'released_max_cog_velo_x_m_s':number(poi.get(key,{}).get('max_cog_velo_x')),
                }
            for window,row in trial_rows.items():
                rows_by_window[window].append(row)
        except ValueError as e:
            excluded.append({'trial':key,'reason':str(e)})
    rows = rows_by_window[50]
    assert rows and len({r['trial'] for r in rows})==len(rows)
    athletes = aggregate(rows)
    write_csv(out/'pitch_observations.csv',rows)
    write_csv(out/'athlete_means.csv',athletes)
    metrics = [('peak_targetward_COM_velocity_m_s','Peak targetward COM velocity (m/s)','velocity'),
               ('peak_targetward_COM_acceleration_m_s2','Peak targetward COM acceleration (m/s²)','acceleration')]
    result = {name:plot(out,rows,athletes,key,label,name) for key,label,name in metrics}
    sensitivity = {}
    sensitivity_rows = []
    for window,values in rows_by_window.items():
        means = aggregate(values)
        sensitivity[str(window)+'_ms'] = {name:{'Pitcher averages':stats(means,key),'Individual pitches':stats(values,key)}
                                         for key,_,name in metrics}
        sensitivity_rows.extend({'nominal_window_ms':window,**r} for r in values)
    write_csv(out/'window_sensitivity.csv',sensitivity_rows)
    summary = {'definition':'Maximum signed first and second derivative of centerofmass_x at sample centers from recording start to ball release.',
               'derivative_method':'Centered cubic least-squares position fit using actual timestamps, nominal 50 ms window; missing windows/gaps and endpoint half-windows excluded. Fits near BR can use post-release samples.',
               'results':result,'window_sensitivity':sensitivity,'excluded_trials':excluded,
               'trials_with_missing_COM':sum(r['missing_COM_samples']>0 for r in rows),
               'peaks_at_first_eligible_sample':{name:sum(r[f'{name}_peak_at_first_eligible_sample'] for r in rows) for name in ['velocity','acceleration']},
               'note':'Derived values can differ from the released max_cog_velo_x POI, whose processing and peak window are not replicated. Repeated pitches are not independent; pooled correlations are descriptive.'}
    (out/'statistics.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps(summary,indent=2))


if __name__=='__main__':
    main()
