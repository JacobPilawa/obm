# October 6, 2026 cleanup audit

## Baseline and scope

The active source was `/Volumes/Elements/biomech/dashboard`, rather than the earlier revision folders in this workspace. Its latest installed patch was October 2 at 2:41 PM Pacific: Full body comparison Match settings. Active `app.js`, `comparison_keypoints.js`, and `full_body_charts.js` matched that patch byte-for-byte. The immediately preceding patches were visible-curve axis scaling and live legends in movie exports.

Commit `97c0d60` preserves the current application source and bundled assets before this refactor. `baseline-sha256.json` records the original content hashes. The baseline was pushed to GitHub before code changes. The external-drive application and original dataset have not been modified.

## Cleanup and refactor

- Established one canonical `dashboard/` directory, a feature/source map, setup instructions, and development conventions.
- Moved 15 earlier revision/patch/experiment folders and three one-off deploy scripts into ignored `local_archive/`. Velocity analysis and Gaussian reconstruction remain separate experiments. Nothing in that archive is required by the dashboard.
- Removed unused reference images, Poppins/Source Sans fonts, and their notices from the active tree after confirming there were no runtime references; preserved them in `local_archive/unused_assets/` and baseline Git history. Inter and its license remain.
- Normalized copied source/assets to ordinary non-executable files and formatted owned web source. Vendored Three.js content remains unchanged. Removed an unused `makeTube` helper.
- Added Python dependencies, a Node package/lockfile, a pinned formatter, and portable export dependency discovery. No build step is required for browser source.
- Made data builders honor `OBM_DATA_ROOT`. Added the existing scientific limb-length builder to this repository, with generated audit output ignored. `scripts/build_data.py` rebuilds all four browser JSON assets. Cohort output publishes atomically. Assessment conversion treats non-finite numeric values as missing.
- Added bounded LRU memoization with shared concurrent work. Six parsed trials remain cached; encoded API/static-data responses are bounded by 12 entries and 64 MiB. Separate recording loads can run concurrently. Failed loads can be retried.
- Compressed generated JSON responses, respected `gzip;q=0`, declared `Vary: Accept-Encoding`, and invalidated cached data assets when file size/mtime changes.
- Aborted superseded solo fetches and prevented entering comparison while a new solo recording is loading. Normal client disconnects no longer produce write errors.
- Reduced paused-view GPU work: redraw only when the view changes or playback runs. Camera changes, split panes, window interaction, resizing and scrubbing invalidate rendering. The lightweight animation clock still runs; deterministic export renders each frame explicitly.
- Improved cohort-asset validation and persistent error messages. The original toggle already loaded bands through chart subscriptions; that mechanism is preserved.
- Refactored export job code: malformed requests return 400, queue capacity is checked atomically, cancellation cannot be overwritten by renderer progress, process groups stop together, shutdown cancels active jobs, and interrupted jobs are marked failed on the next start. Missing encoder errors are handled immediately. Export remains 60 fps.

## Measurements

Same loopback server, local data, four requests per endpoint, `Accept-Encoding: gzip`; median of requests 2–4:

| Endpoint | Baseline warm response | Refactored warm response |
| --- | ---: | ---: |
| Catalog | 82.92 ms | 0.83 ms |
| Pitch 1097_1 | 164.49 ms | 1.37 ms |
| Pitching cohort | 11.57 ms | 3.37 ms |

Pitching cohort transfer size fell from 14,345,872 uncompressed bytes to 3,871,397 gzip bytes (~73% smaller). The first compressed cohort request took ~347 ms, since compression is performed once rather than on every request. Catalog/trial response bytes decoded to the same data. These are local response measurements, not end-to-end browser timing or a hardware-independent guarantee. Raw samples are in `benchmark-baseline.json` and `benchmark-refactor.json`; `scripts/benchmark.py` reruns the measurements.

## Validation

- 11 Python regression tests: shared concurrent loads, eviction/byte limits, failure retries, JSON preservation and encoding variants, rebuilt-asset invalidation, malformed/unknown requests, export capacity, cancellation and restart recovery.
- 3 numerical unit tests: derivatives on irregular timestamps, null gaps, cumulative-work support, mass units and fallback chart event windows.
- Real-data numerical audit across eight representative recordings: both disciplines, handedness, linked, processed-only, raw-only and static-model paths where available. Verified full published-signal chart coverage, finite/null outputs, native lengths, alignment inversion and available overlays.
- Browser suite: 12 checks covering POI sorting, keyboard/display controls, overlays, solo/comparison keypoints, legend stability, four replays, split cameras, hitting, high-performance metrics, narrow desktop layout and availability paths. No page errors.
- All four rebuilt browser JSON assets matched the external-drive baseline as parsed JSON, including cohort values and limb-length screens.
- Python/JS syntax, formatter consistency, and Git whitespace checks passed.

Extended browser checks passed: paused GPU draws stop; scrub/playback redraw; enabling cohort bands loads data; rapid selection preserves the latest recording and blocks comparison during loading; Full body settings copy correctly; background split-comparison MP4 includes floating charts; cancellation remains authoritative. The complete 78-frame smoke movie verified as 320×240 H.264/yuv420p at 60 fps. No page errors.

## Practical limits

The scientific numerical definitions and scientific thresholds have not changed. This pass did not reinterpret bat speed, joint power/moments, missing samples, or published POI values. It does not turn the loopback app into a hosted multi-user service.

Fresh clones require the independent upstream release data and regenerated JSON. Movie checks use a small output resolution to exercise the complete renderer/encoder workflow; they do not establish performance at 4K. Browser testing used desktop Chrome on this Mac, not every browser/device. The main orchestration module remains substantial, but it is now formatted and supported by reusable checks; its existing scientific/view modules remain separate.
