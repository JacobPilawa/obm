# Sidebar selection optimization

Measured in desktop Chrome on October 6, 2026. Selection profiling wraps the real sidebar handler; timings end after replay state and scene construction, before the next painted frame. The same pitching recordings were selected repeatedly.

| Recording | Before: previously visited | After: parsed/derived cache hit |
| --- | ---: | ---: |
| 1097_1 | 60.7 ms | 9.7 ms |
| 1313_1 | 66.3 ms | 7.4 ms |

Cached/preloaded selection now completes within approximately one 60 Hz frame on this Mac. First use of an uncached file still reads and parses its full data; it cannot be guaranteed instantaneous. Nearby visible recordings are preloaded sequentially during idle time, and hovering/focusing a recording signals intent after 100 ms. Speculative failures do not alter the current replay.

The browser retains at most six parsed trials with a 48 MiB budget for estimated JSON footprint. Concurrent consumers share one request; cancelling a superseded selection preserves a shared prefetch. Derived chart definitions, keypoint signals and power overlays use weak caches keyed by the immutable trial object. Bat-specific keypoint variants remain separate. Same-discipline selection avoids rebuilding the filter controls, and cached selection does not flash the loading placeholder.

Validation: seven numerical/client-cache unit tests, the existing real-data numerical audit, and all 12 browser regression checks passed. Cached objects reuse the same native data; scientific formulas, units, signs, null support and plot availability are preserved. `tests/selection.cjs` profiles the path; raw timing data are in `selection-measurements.json`.
