# Dashboard audit — 25 September 2026

## Assessment

The original dashboard was already a good data explorer: offline assets, native-time signal tables, linked C3D playback, complete published fields, provenance, and sensible anatomical labels. A replacement application would add risk without solving the main problem. This pass keeps that structure and concentrates on data correctness, interpretable comparisons, and a calmer display.

A backup of the original source is in `audit/backup/`. The original OpenBiomechanics dataset has not been edited.

## Correctness fixes

- **Plate force direction:** Raw `Fx/Fy/Fz` channels are plate-local components. Simply negating XYZ does not place them in laboratory coordinates. The viewer now uses `ezc3d.c3d(..., extract_forceplat_data=True)` and its reconstructed global platform force. This accounts for plate orientation, including tilted mound plates. Arrows still start at plate centers, use a display length scale, and hide below 35 N. They do not depict center of pressure or processed rear/lead assignment. Numeric raw-channel plots remain unchanged.
- **C3D validity:** `data.points[3]` in ezc3d is the homogeneous coordinate, not the residual. Marker validity now uses `data.meta_points.residuals`; negative residuals remain gaps.
- **Trial IDs:** Python accepts underscores inside numeric strings, so `float('1031_2')` becomes `10312`. IDs now remain strings in metadata and POI displays.
- **Display state:** Changing discipline selects a matching trial instead of leaving a pitching motion beside hitting labels. Failed loads restore the previous recording consistently. Scrubbing pauses playback. Plate visibility includes outlines and labels. Joint focus now moves closer to its target.
- **Playback resources:** Bat geometry is reused, line buffers are updated without disposing whole geometries each frame, moving instanced markers cannot disappear because of a stale culling bound, and discarded scene textures are disposed.

## Added analysis

| View | Definition and intended use |
| --- | --- |
| Pin current as reference | Dashed reference against solid current curves. Available across trials of the same discipline. Raw sensor traces are excluded because identical channel labels need not imply equivalent sensors. |
| Event time | Milliseconds relative to the published release or contact event. Reference trials use their own event. |
| Phase time | Crops to 10% bodyweight foot contact through release/contact, mapped to 0–100%. This compares curve shape while hiding duration; event measurements retain the actual elapsed milliseconds. No temporal resampling is applied to the stored signals. |
| Directional lead-leg force | Released X/Y/Z forces, preserving source signs. Useful information is lost when all three are collapsed into a magnitude. |
| Bodyweight force | Force divided by session mass × 9.80665. Hitting mass converts pounds to kilograms using 0.45359237. Missing or invalid mass suppresses these views. |
| Torso posture | Released torso X/Y angles. The differing hitting/pitching flexion conventions are explicitly labeled. |
| Hitting torso–pelvis rotation | Released relative Z angle, not subtraction of global Euler angles. |
| Sweet-spot speed | Three-point derivative of released sweet-spot XYZ, then Euclidean magnitude, in m/s. Rounded, slightly nonuniform timestamps are accommodated. No extra smoothing is applied. |
| Sweet-spot path elevation | atan2(vertical velocity, horizontal speed), degrees; hidden below 1 m/s. This is an independent estimate, not a claim to reproduce the vendor attack-angle POI. |
| COM targetward velocity | Three-point derivative of released center-of-mass X. Examine changes after plant alongside knee extension; this is not a validated block score. |
| Event calculations retained in `insights.js` | Linearly interpolated readings at adjacent valid event samples; signed sampled maxima within the contact phase and their timing. The event-measurements panel was removed from the dashboard. |
| Solid segments and trails | Cylinders along published joint-center links and a red throwing-hand/sweet-spot path through the available recording, with a release/contact knot. These do not reconstruct bone surfaces or an athlete-specific body mesh. |

Derivative endpoints and missing neighborhoods are omitted. Interpolation never extrapolates outside a signal's timestamps and does not bridge missing values. Reference overlays are descriptive, without significance bands, athlete rankings, or causal claims. The mixed-axis hitting sequence appears under **Recommended** as **Rotation sequence (estimate)**; its components use different speed definitions, so compare peak timing cautiously.

## Research trail

Sources accessed during this audit:

1. [Driveline: Forcing Rotation — lead-leg force curves in hitters](https://drivelinebaseball.com/blogs/blog/forcing-rotation-exploring-lead-leg-force-curves-and-rotation-in-hitters). Motivated directional-force and normalized-phase views. Its reported GRF associations with pelvis/torso rotation do not establish a direct bat-speed benefit; it reports no significant GRF–bat-speed windows. This dashboard does not reproduce its SPM analysis or turn reported windows into individual training targets.
2. [Driveline: Quantitative analysis of the lead-leg block](https://drivelinebaseball.com/blogs/blog/a-quantitative-analysis-of-the-lead-leg-block-and-its-contributions-to-velocity). Motivated post-plant knee extension, COM velocity, and body-size context for force. The exploratory dashboard does not reproduce its regression or composite score.
3. [Driveline: Hitting biomechanics](https://drivelinebaseball.com/blogs/blog/hitting-biomechanics). Motivated full-swing bat-path quantities alongside rotation. The released full-signal tables contain landmarks but not the exact vendor bat-speed/attack-angle traces, so numerical estimates are labeled separately.
4. [Driveline: Full signal analyses](https://drivelinebaseball.com/blogs/blog/full-signal-analyses-the-next-step-in-biomechanical-analysis). Supports inspecting trajectories beyond isolated POI peaks. No statistical inference is performed by the chart viewer.
5. [Driveline: Using assessment data to develop a throwing program](https://drivelinebaseball.com/blogs/blog/leveraging-assessment-data-build-throwing-programming). Includes Anthony Brady's public assessment/retest material and informed the comparison workflow. A curated shoulder-adduction/abduction trace is available with the released pitching sign convention.
6. [Kyle Boddy on X: OpenBiomechanics velocity-modeling example](https://x.com/drivelinekyle/status/2032242254035992610). A useful project direction, not evidence validating any individual metric or a reason to add an opaque velocity predictor.
7. [Anthony Brady's biomechanics thread on X](https://x.com/BaseballFreak_9/status/1079205780761399296). Located through public indexing; direct X retrieval failed. The first-party Driveline article above was used for context instead of treating inaccessible social content as verified unpublished research. Searches also covered Alex Caravan and Driveline's public accounts. No proprietary or unpublished findings were inferred.
8. [ezc3d force-platform documentation](https://github.com/pyomeca/ezc3d#force-platform-filter). Basis for correcting platform coordinates. Raw platform output is distinct from Driveline's filtered, assigned rear/lead force curves.
9. Local official [pitching definitions](../openbiomechanics/baseball_pitching/README.md) and [hitting definitions](../openbiomechanics/baseball_hitting/README.md) remain the authority for field names, signs and sampling conventions.

## Design assessment

The previous layout did not need a wholesale redesign. Its main visual weaknesses were the amount of tinted UI, unnecessary category-colored metric borders, a distant motion camera, and the difficulty of comparing trials. This pass uses neutral metric rows, smaller radii, restrained surfaces, clearer scientific readouts, and collapsible event/research material. Signal colors carry the visual emphasis. The toy ball is now opt-in because it is illustrative.

The two requested images, `baseball_pitching/imgs/image2.png` and `image3.png`, are front/back marker-placement illustrations, not usable meshes or animation rigs. The added solid-segment representation follows the actual joint centers and is more honest than pretending to recover a rigged body from those screenshots.

## Validation and remaining limits

Validation completed:

- All **1,303 recordings** loaded with valid JSON, consistent signal lengths and increasing timestamps; **zero errors**. The residual correction identified **67 invalid marker samples** and preserved them as null coordinates.
- Numerical tests passed on **seven** fixture categories: pitching linked/calibration, left/right hitting linked, and hitting raw-only/processed-only/calibration. Tests check interpolation, missing values, nonuniform numerical derivatives, mass conversion, phase alignment, unique quantity IDs, and finite series.
- **20 browser integration checks passed**, covering discipline switching, references, phase keyboard scrubbing, joint focus/reset, all availability classes, chart layout controls and narrow-screen overflow. No uncaught frontend errors were recorded. Desktop motion and comparison renders were visually inspected.
- Independent sweet-spot-speed estimates at contact were 69.30 vs published 66.85 mph for the sampled right-handed swing, 64.75 vs 64.08 for the left-handed swing, and 67.18 vs 61.55 for the processed-only swing. These differences reinforce the explicit distinction from vendor POI, rather than being treated as a successful exact reproduction.

Reproducible checks and results live in `audit/`: `backend-results.json`, `numerics-results.json`, and `ui-results.html`. The browser checks ran as headless code, without computer-use tools. `audit/test_backend.py` regenerates the fixtures; `node audit/test_numerics.mjs` tests them; `audit/render.py` runs the UI harness against port 8767.

The existing hitting filename links remain inferred from athlete/session/side/order/frame count. They are not equivalent to an explicit published filename mapping; two linked recordings already carry speed-discrepancy notes. The audit preserves those caveats. A point-cloud match study would be a separate stronger validation of those links.

The dashboard is a descriptive exploration tool. It does not estimate injury probability, predict command, infer causality from velocity associations, or prescribe an ideal sequence. A strong next research step is repeated-trial analysis within athletes, with athlete-grouped validation for any predictive model. Do not split individual trials from the same athlete across training and test sets and report that as independent-athlete performance.
