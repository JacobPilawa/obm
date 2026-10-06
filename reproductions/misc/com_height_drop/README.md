# COM height drop versus pitch speed

The figure compares **the highest released whole-body COM height before ball release minus COM height at ball release**, in centimetres, against metadata pitch speed in mph. The left panel gives each pitcher one observation: their mean height drop and mean pitch speed. The right panel shows every pitch. Colors identify playing level; dashed lines are descriptive pooled linear fits.

## Results

- 411 pitches from 100 pitchers; no trials excluded.
- Pitcher averages: Pearson r = 0.1724.
- Individual pitches: Pearson r = 0.1360.
- These are weak positive pooled associations. Repeated pitches are not independent; no pitch-level significance test is reported. Playing level, body size, and other mechanical differences can affect the association.

## Calculation

1. Read `baseball_pitching/data/full_sig/landmarks.csv`: native `time`, `centerofmass_z` (m), and `BR_time` (s). Join metadata on `session_pitch` for athlete ID, speed, playing level, height, and mass.
2. Obtain COM height at the exact ball-release timestamp. Use a recorded sample when it coincides with release, otherwise linearly interpolate between the two adjacent native samples. Do not extrapolate or bridge a missing COM sample.
3. Find the maximum finite COM Z from recording start through release, including the interpolated release height as an endpoint. Exclude follow-through peaks. Subtract release height and convert metres to centimetres. The highest recorded pre-release sample is used without smoothing or fitting a sub-sample peak.
4. Average each pitch's drop within athlete; independently average that athlete's pitch speeds. This is not the difference between peaks from different pitches. Every athlete has equal weight in the left panel.

There are no missing pre-release COM samples in the included trials. One pitch has its peak at the recording's first sample; that peak could be limited by the recording window. The CSV flags it. All calculated drops are nonnegative. Numerical checks cover exact release samples, interpolation, a rising COM at release, missing data, out-of-range release, and non-increasing timestamps. Correlations were independently recomputed from the output CSVs using Python's standard library.

## Interpretation

This measures **net whole-body height loss from the pre-release peak to release**, rather than minimum COM height, knee flexion, or the lowest crouch during the throw. It can miss a deeper dip followed by upward motion before release. The definition also depends on where the recording starts.

The pitch CSV includes body-height-normalized drop (%), and gravitational potential energy change `mass_kg × 9.80665 × height_drop_m` in joules (also J/kg). These describe the change in whole-body gravitational potential energy. They do not measure how much energy transfers into the ball, mechanical efficiency, or causation. Muscular work and the timing of descent and subsequent rise matter to that hypothesis. The current pooled correlation alone does not establish an energy-transfer mechanism.

## Files and reproduction

- `com_height_drop_vs_pitch_speed.png` and `.pdf`: the two-panel figure.
- `pitch_observations.csv`: one row per pitch, with peak/release heights and timestamps, drop, metadata, energy change, and quality flags.
- `athlete_means.csv`: one row per pitcher.
- `statistics.json`: correlations, descriptive slopes, exclusions, and quality counts.
- `com_height_drop_vs_pitch_speed.py`: reproducible source; requires NumPy and Matplotlib.

Run `python com_height_drop_vs_pitch_speed.py --data-root /Volumes/Elements/biomech/openbiomechanics`. Outputs are saved beside the script. The script reads the released CSVs directly and does not alter the dashboard or dataset.
