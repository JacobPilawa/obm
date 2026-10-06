# Peak targetward COM velocity and acceleration versus pitch speed

Two figures compare maximum pre-release whole-body COM targetward velocity (m/s) and acceleration (m/s²) with pitch speed (mph). Each has pitcher averages on the left and individual pitches on the right. Colors identify playing level. The dashed fits and Pearson correlations are descriptive pooled associations.

## Results

| Measure | 100 pitcher averages: Pearson r | 411 individual pitches: Pearson r |
| --- | ---: | ---: |
| Peak targetward COM velocity | 0.2248 | 0.2008 |
| Peak targetward COM acceleration | 0.2249 | 0.2146 |

Both relationships are weakly positive. Repeated pitches are not independent, and the pitcher-average panels give each pitcher equal weight. Playing level and other confounders may influence these pooled associations; no causal claim or pitch-level significance test is made.

## Definition and method

- Source: released `baseball_pitching/data/full_sig/landmarks.csv`, joined to `metadata.csv` by `session_pitch`. Whole-body `centerofmass_x` is in metres; native time and `BR_time` are in seconds. Per the dataset's pitching README, **+X points toward home plate**.
- Velocity and acceleration are the first and second derivatives of COM X. They are signed targetward components, not total 3D magnitudes. Maximum acceleration means the largest positive targetward acceleration, not peak braking or absolute acceleration magnitude.
- To limit amplification of rounded position values, fit a centered cubic polynomial to a nominal 50 ms window of native COM positions at each sample. Use the actual timestamps in the least-squares fit. Analytically differentiate the fitted polynomial at the center to obtain velocity and acceleration. Acceleration is not obtained by twice differencing rounded position values.
- Fit windows have odd sample counts (19 samples for the main analysis). Exclude the half-window at each recording endpoint. Reject windows containing missing positions or a sampling interval greater than 1.5 times the median native interval; never bridge those gaps.
- Take the maximum derivative whose **center timestamp is at or before release**. This excludes follow-through maxima. Centered fits close to release can use a few post-release samples: these are offline estimates. Peak values are sampled at native centers, without interpolation to a sub-sample maximum.
- Compute each pitch's two maxima independently; they need not occur at the same time. Average those per-pitch maxima and pitch speed separately within pitcher. A maximum of an averaged trajectory would be a different quantity.

The released `max_cog_velo_x` POI is retained in the pitch CSV as a reference. The primary velocity figure uses the same fitted COM position signal and pre-release window as the acceleration analysis; it does not claim to reproduce the source pipeline exactly. Accordingly, it may differ slightly from the earlier misc COM-velocity figure based on the released POI.

## Smoothing sensitivity and verification

The script also repeats both calculations using nominal 35 ms and 75 ms windows. Pitcher-average velocity r is 0.2246, 0.2248, and 0.2257 for 35/50/75 ms. Acceleration r is 0.2212, 0.2249, and 0.1928. Acceleration magnitudes and correlations depend on the smoothing choice; treat these as estimated kinematics. `window_sensitivity.csv` preserves every pitch's results for all three windows.

Numerical checks recover analytic velocity and acceleration from a known cubic position trajectory at rounded, nonuniform native timestamps. Additional checks cover endpoint exclusion, missing-window rejection, and pre-release peak selection. Correlations were independently recomputed from exported CSVs using the Python standard library. No dashboard computer-use or screenshot tests were performed.

## Files

- `peak_targetward_com_velocity_vs_pitch_speed.png` and `.pdf`.
- `peak_targetward_com_acceleration_vs_pitch_speed.png` and `.pdf`.
- `pitch_observations.csv`: one row per pitch, including peak values/times, release time, fit-window details, quality flags, and the published velocity POI.
- `athlete_means.csv`: one row per pitcher.
- `window_sensitivity.csv`: per-pitch results for all three fitting windows.
- `statistics.json`: results, sensitivity, exclusions, and quality counts.
- `peak_targetward_motion_vs_pitch_speed.py`: reproducible source requiring NumPy and Matplotlib.

Run `python peak_targetward_motion_vs_pitch_speed.py --data-root /Volumes/Elements/biomech/openbiomechanics`. Outputs are saved beside the script. The dataset and dashboard are unchanged.
