"""Released COM pre-release height loss versus fastball speed; no C3D processing."""
from pathlib import Path
import argparse
import bisect
import collections
import csv
import json
import math
import os

os.environ.setdefault('MPLCONFIGDIR', '/tmp/obm-com-height-matplotlib')


def number(value):
    try:
        v = float(value)
        return v if math.isfinite(v) else None
    except (ValueError, TypeError):
        return None


def height_drop(samples, release):
    """Interpolate only between adjacent valid samples; never extrapolate."""
    times = [s[0] for s in samples]
    if not times or any(b <= a for a, b in zip(times, times[1:])):
        raise ValueError('Missing or non-increasing sample times')
    i = bisect.bisect_left(times, release)
    if i < len(times) and abs(times[i] - release) < 1e-9:
        zr = samples[i][1]
    elif i == 0 or i == len(times):
        raise ValueError('Release outside recording')
    else:
        t0, z0 = samples[i-1]
        t1, z1 = samples[i]
        if z0 is None or z1 is None:
            raise ValueError('Missing COM adjacent to release')
        zr = z0 + (z1-z0) * (release-t0)/(t1-t0)
    if zr is None:
        raise ValueError('Missing COM at release')
    before = [(t, z) for t, z in samples if t <= release and z is not None]
    peak_t, peak_z = max(before + [(release, zr)], key=lambda p: p[1])
    return peak_z, zr, peak_t


def write_csv(path, rows):
    with path.open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', type=Path, default=Path('/Volumes/Elements/biomech/openbiomechanics'))
    args = parser.parse_args()
    out = Path(__file__).resolve().parent
    data = args.data_root/'baseball_pitching'/'data'
    with (data/'metadata.csv').open() as f:
        metadata = {r['session_pitch']: r for r in csv.DictReader(f)}
    signals = collections.defaultdict(list)
    events = collections.defaultdict(set)
    with (data/'full_sig'/'landmarks.csv').open() as f:
        reader = csv.reader(f)
        header = next(reader)
        ik, it, iz, ir = [header.index(k) for k in ['session_pitch','time','centerofmass_z','BR_time']]
        for row in reader:
            key = row[ik]
            if key not in metadata:
                continue
            t = number(row[it])
            if t is None:
                raise ValueError(f'Missing sample time: {key}')
            signals[key].append((t, number(row[iz])))
            br = number(row[ir])
            if br is not None:
                events[key].add(br)
    rows, excluded = [], []
    for key, meta in metadata.items():
        try:
            speed = number(meta['pitch_speed_mph'])
            if speed is None:
                raise ValueError('Missing pitch speed')
            if len(events[key]) != 1:
                raise ValueError('Missing or inconsistent release event')
            release = next(iter(events[key]))
            samples = signals[key]
            peak, zr, peak_t = height_drop(samples, release)
            drop = peak-zr
            mass, height = number(meta['session_mass_kg']), number(meta['session_height_m'])
            rows.append({
                'trial': key, 'athlete': int(meta['user']), 'session': meta['session'],
                'playing_level': meta['playing_level'], 'pitch_speed_mph': speed,
                'peak_prerelease_COM_height_m': peak, 'release_COM_height_m': zr,
                'COM_height_drop_cm': 100*drop, 'COM_height_drop_pct_body_height': 100*drop/height if height and height>0 else None,
                'peak_COM_time_s': peak_t, 'ball_release_time_s': release,
                'peak_to_release_duration_s': release-peak_t,
                'recording_start_s': samples[0][0], 'peak_at_recording_start': peak_t==samples[0][0],
                'prerelease_missing_COM_samples': sum(z is None for t,z in samples if t<=release),
                'mass_kg': mass, 'height_m': height,
                'gravitational_potential_energy_drop_J': mass*9.80665*drop if mass and mass>0 else None,
                'gravitational_potential_energy_drop_J_per_kg': 9.80665*drop,
            })
        except ValueError as error:
            excluded.append({'trial': key, 'reason': str(error)})
    assert rows and len({r['trial'] for r in rows})==len(rows)
    assert all(r['COM_height_drop_cm']>=0 and r['peak_COM_time_s']<=r['ball_release_time_s'] for r in rows)
    import numpy as np
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    grouped = collections.defaultdict(list)
    for row in rows:
        grouped[row['athlete']].append(row)
    athletes = []
    for athlete, pitches in sorted(grouped.items()):
        athletes.append({'athlete': athlete, 'n_pitches': len(pitches),
                         'playing_level': collections.Counter(p['playing_level'] for p in pitches).most_common(1)[0][0],
                         **{k: float(np.mean([p[k] for p in pitches])) for k in
                            ['COM_height_drop_cm','pitch_speed_mph','peak_prerelease_COM_height_m','release_COM_height_m','COM_height_drop_pct_body_height']
                            if all(p[k] is not None for p in pitches)}})
    write_csv(out/'pitch_observations.csv', rows)
    write_csv(out/'athlete_means.csv', athletes)
    colors = {'college':'#247995','high_school':'#d2932c','independent':'#80599f','milb':'#3b9368'}
    fig, axes = plt.subplots(1,2,figsize=(11.8,5.5),sharex=True,sharey=True,layout='constrained')
    stats = {}
    for ax, values, title in zip(axes, [athletes, rows], ['Pitcher averages', 'Individual pitches']):
        x = np.array([v['COM_height_drop_cm'] for v in values])
        y = np.array([v['pitch_speed_mph'] for v in values])
        r = float(np.corrcoef(x,y)[0,1])
        slope, intercept = np.polyfit(x,y,1)
        for level, color in colors.items():
            subset = [v for v in values if v['playing_level']==level]
            if subset:
                ax.scatter([v['COM_height_drop_cm'] for v in subset], [v['pitch_speed_mph'] for v in subset],
                           s=38 if title=='Pitcher averages' else 23, alpha=.82 if title=='Pitcher averages' else .5,
                           color=color, edgecolors='none', label=level.replace('_',' ').title())
        xx = np.linspace(x.min(),x.max(),100)
        ax.plot(xx,slope*xx+intercept,color='#44515b',lw=1.5,ls='--',label='Descriptive pooled fit')
        ax.set_title(f'{title}\nn = {len(values)} · Pearson r = {r:.2f}',fontsize=11)
        ax.set_xlabel('COM height drop: pre-release peak − release (cm)')
        ax.grid(alpha=.18)
        ax.spines[['top','right']].set_visible(False)
        stats[title] = {'n':len(values),'pearson_r':r,'slope_mph_per_cm':float(slope),'intercept_mph':float(intercept)}
    axes[0].set_ylabel('Pitch speed (mph)')
    axes[1].legend(fontsize=8,frameon=False,loc='lower right')
    fig.suptitle('Does a larger COM height drop accompany a faster pitch?',fontsize=14)
    fig.supxlabel('Released whole-body COM Z · Height at exact ball release interpolated from adjacent samples\nPitcher averages give each athlete equal weight; associations are descriptive.',fontsize=8)
    fig.savefig(out/'com_height_drop_vs_pitch_speed.png',dpi=220)
    fig.savefig(out/'com_height_drop_vs_pitch_speed.pdf')
    plt.close(fig)
    summary = {
        'definition':'max(centerofmass_z from recording start through BR) minus centerofmass_z at BR; metres converted to cm',
        'release_sampling':'Linear interpolation of adjacent native samples only, no extrapolation or bridging missing values',
        'results':stats,'excluded_trials':excluded,
        'peak_at_recording_start_count':sum(r['peak_at_recording_start'] for r in rows),
        'trials_with_missing_prerelease_COM':sum(r['prerelease_missing_COM_samples']>0 for r in rows),
        'drop_cm_range':[min(r['COM_height_drop_cm'] for r in rows),max(r['COM_height_drop_cm'] for r in rows)],
        'note':'Repeated pitches are not independent. Pooled associations can reflect playing level and other confounders. COM height loss is not a direct measurement of energy transfer into the ball.'}
    (out/'statistics.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps(summary,indent=2))


if __name__=='__main__':
    main()
