# Dashboard scope and source map

## Replay and exploration
- Pitching and hitting: searchable files and athletes, handedness/level/type/availability filters, numeric POI filters and sorting. Linked, raw-only, processed-only and static calibration records.
- Local Three.js motion replay: skeletons, raw markers, force plates/vectors, trails, event markers, bat paths, camera presets, orbit/pan/zoom, orthographic plane views, frame stepping and event jumps. A 2D fallback supports browsers without WebGL.
- Published signal charts on native timelines, calculated diagnostics, configurable/resizable key charts, full-signal library, live values and source definitions.
- Anatomical hotspots and floating plots, focus guides, pitching report tables, skeleton color maps, arm/bat sweeps, COM/braking/knee displays and session limb-length estimates.
- Up to four comparison replays: event alignment, lab/pelvis alignment, overlay/split layouts, independent layers, shared scales and camera copying.
- Athlete-balanced cohort interquartile bands, with minimum sample counts and playing-level filters.
- Hitting HitTrax summaries and separate published versus reconstructed bat-speed values.
- Background MP4 exports capturing cameras, layouts, layers and optional floating plots.

## High performance
Assessment browser, athlete profiles/history, test availability, full metric selection, distributions, cohort filtering, percentiles and speed/assessment scatterplots. These are published assessment summaries, not motion/force-time recordings.

## Architecture
| Files | Responsibility |
| --- | --- |
| `dashboard/server.py`, `data_store.py` | Loopback HTTP API, CSV byte-span indexes, C3D parsing, catalog and trial cache |
| `dashboard/app.js`, `app.css`, `index.html` | Replay orchestration, controls, catalog and main interface |
| `compare_viewer.js`, `split_viewer.js`, `comparison.js` | Comparison scenes, camera layout and time alignment |
| `charts.js`, `quantities.js`, `biomechanics.js`, `pitch_report.js` | Plots, signal definitions, derivatives and report values |
| `keypoint_*.js`, `comparison_keypoints.js`, `floating_plot.js`, `full_body_charts.js` | Anatomical selections and floating plots |
| `energy_overlay.js`, `motion_*.js`, `focus_geometry.js`, `*_scale.js` | Spatial guides, overlays and visual scales |
| `high_performance.js`, `hittrax.js`, `limb_lengths.js`, `cohort_band.js` | Assessment and derived-data features |
| `video_jobs.py`, `render_movie.cjs`, `movie_*.js` | Export queue, headless rendering and encoding |
| `build_high_performance.py`, `build_cohorts.py`, `build_cohorts.mjs` | Generated browser data |
| `vendor/`, `assets/fonts/` | Local Three.js and fonts with third-party licenses |

## Boundaries
This is a local desktop dashboard, not an authenticated multi-user service. It reads an independent upstream checkout and downloaded/extracted release assets through `OBM_DATA_ROOT`. Source positions, published signals, summary metrics and dashboard calculations remain distinct; visual mappings are not new biomechanical measurements.

The original workspace contained successive copies and one-off installers. `dashboard/` is the active installed version; historical workspaces are excluded from this contribution snapshot. Generated cohort, limb-length and assessment JSON files are local data, not committed source. `docs/baseline-sha256.json` records hashes of the copied active source.
