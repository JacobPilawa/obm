# Dashboard audit — October 2, 2026

## Changes

- Preserved the three-column layout and all 201 existing HTML control IDs. Grouped exploration, cameras, and movie export; placed body/scene/color tools together. Comparison cards group exploration, display choices, and camera/matching actions. Arm-trail metrics live inside Scene display.
- Body and scene layers are persistent multi-select checkbox menus, including keyboard activation, checked-state accessibility, disabled unavailable layers, and existing outside-click/Escape behavior.
- Kept the common sorts and added **More options…**, a searchable list of every available numeric POI measurement. Additional fields also appear in metric-range filtering. Names retain the source field terminology; tooltips use released definitions. Missing values sort last; identifiers are excluded, measured zeros are preserved.
- Fixed time-series legend geometry: labels and live values occupy separate fixed columns, so changing signs/digits/missing values cannot alter line count. Full values remain available in tooltips. Resizing a chart can still reflow its labels intentionally.
- Added **Show more key moments** in solo and comparison keypoint charts. Annotations use actual released timestamps, stay on each replay's local time axis, and carry into movies when Info boxes in MP4 is enabled. Pitching supports PKH/FC/FP/MER/BR/MIR; hitting supports FC/FP/contact where available. No peak timing is inferred from scalar POIs.
- Added a compact data-coverage line to Trial summary.

## Calculation and interpretation fixes

1. **Pitching angular-speed colors were unavailable.** The overlay searched for `elbow_x` rather than `elbow_velo_x` (and similarly for other joints). Corrected all pitching angular-velocity component prefixes; verified against XYZ vector magnitudes.
2. **Missing live samples appeared as zero.** Solo and comparison readouts now display a dash. Actual measured zeros are retained. Held skeletons at comparison boundaries remain display padding; they do not manufacture live measurements.
3. **Cumulative work could conceal missing intervals.** Integration now starts at the exact PKH timestamp, interpolating the boundary only with valid adjacent samples. A missing value or timestamp gap makes subsequent cumulative work unknown. The work overlay does not hold the last valid integral across missing tails; missing PKH disables that view. Other established overlay edge-hold behavior is unchanged.
4. **Scientific explanations were silently omitted.** Most notes supplied to chart definitions were discarded. They are now displayed, including direction, normalization, source, and interpretation details.
5. **Two source labels were inconsistent.** The arm-position chart incorrectly claimed shoulder-Y sign reversal although it plots the released values. Corrected the source label without changing those values. Pitching lead-GRF X now identifies the published braking/posterior convention, rather than claiming targetward force.

The shoulder-Y documentation/data discrepancy remains explicitly labeled. Published model angles and geometric 3D pose guides remain distinct. Angular-speed and moment vector magnitudes are labeled derived quantities; joint moments are not ligament force or an injury prediction. Native reconstructed bat speed is not calibrated to published POIs. Source measurement validity and anatomical accuracy cannot be established by software tests alone.

## Performance and implementation

- Keypoint charts cache the static curve, axes and event annotations; playback redraws the cursor only. Verified that repeat draws make no axis/text calls.
- Bat kinematics are memoized per immutable loaded trial; key charts, color sweeps and keypoint explorers share the same computed result.
- Backend cache uses a locked, bounded six-entry LRU, accommodating four compared trials plus navigation/export without the previous two-entry churn. Dataset location can be overridden with `OBM_DATA_ROOT` for isolated verification.
- Shared event annotations and display organization are small dedicated modules. Existing raw markers, calibration models, HitTrax, focus geometry, overlays, splits, synchronization, chart resizing, reference curves, export, and high-performance features remain available.

## Verification and coverage

- Audited **4,749,574 rows across all 10 released full-signal tables**. Verified byte-index row/trial counts, strictly increasing native timestamps, constant event fields within trials, numeric availability, and exact catalog POI values including 58 zero values.
- Catalog: **411 linked pitches + 100 pitching calibrations; 669 linked swings + 8 processed-only swings + 18 raw-only captures + 97 hitting calibrations**. Raw-only/unmatched files remain distinct rather than guessed into processed matches.
- Processed force tables cover **403/411 pitches** and **665/677 swings**. Missing tables are genuine release gaps. The app keeps native timestamps, including hitting force data with varying timestamp intervals.
- Every non-event full-signal column is reachable in the existing source library: **286 pitching fields**, **162 hitting fields**. Raw XYZ and analog channels, scalar POIs, metadata, and paired HitTrax remain accessible through their existing views.
- The high-performance browser snapshot exactly matches **1,934 rows × 53 columns** in the source CSV. There is no released crosswalk to pitching/hitting athlete IDs; no linkage was invented.
- Recomputed limb lengths from **all 1,088 processed trials**, plus the original static-marker checks. All **198 session profiles / 1,584 segment estimates** match the dashboard asset exactly. Method: per-frame Euclidean joint-center distances, recording median, then equal-weight session median; physical sides mapped using handedness. Existing coverage/plausibility/variability screens and composite withholding remain intact. This is a reasonable exploratory model-segment proxy, not measured bone length; thigh estimates are particularly model dependent.
- Numerical regression covers nonuniform differentiation, missing-data interpolation, exact-boundary/gapped integration, mass conversion, event alignment, published signal coverage, handedness, all overlay modes, and eight recording categories/representatives.
- Browser regression covers solo pitching/hitting, two/four-person comparisons, independent controls, split cameras, event toggles, sorting, stable legend heights, high performance, narrow desktop layout, and raw/calibration/processed-only paths. No browser JavaScript errors in the completed checks.
- Exported an actual **92-frame, 60 fps H.264/yuv420p MP4** with all six event annotations and verified its encoded format.

Machine-readable evidence: `data_results.json`, `numerical_results.json`, `browser_results.json`, and `movie_results.json` in the workspace audit directory. Screenshots and the test MP4 are alongside them. All original source CSV/C3D data are unchanged.

## Useful next visualizations (not implemented)

- A center-of-mass path and velocity vector synchronized with lead-foot braking and knee extension; source data are already available.
- Event-window comparisons that combine force/bodyweight, elbow moment, and pitch speed with athlete/session grouping, avoiding treating repeated pitches as independent athletes.
- A separate computer-vision media explorer. The local tutorial/calibration footage and Theia examples are separate collections, not established matched views of these pitching/hitting replays.

## References

- [OpenBiomechanics pitching definitions](https://github.com/drivelineresearch/openbiomechanics/blob/main/baseball_pitching/README.md)
- [OpenBiomechanics hitting definitions](https://github.com/drivelineresearch/openbiomechanics/blob/main/baseball_hitting/README.md)
- [Dataset datasheet](https://github.com/drivelineresearch/openbiomechanics/blob/main/DATASHEET.md)
- [Visual3D signals and events](https://wiki.has-motion.com/doku.php?id=visual3d%3Adocumentation%3Adialogs%3Asignals_and_events): inspiration for keeping anatomical exploration, signal provenance, and event annotations coordinated.
