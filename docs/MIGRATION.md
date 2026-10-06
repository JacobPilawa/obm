# Primary external-drive installation

The application and its contribution repository live at `/Volumes/Elements/biomech/dashboard`. Source modules, `server.py`, Git history, documentation, tests, data builders and the local launcher are together in this folder. The layout was flattened from the earlier repository's nested `dashboard/` folder so the original external-drive dashboard path remains the application path.

The prior external-drive application was moved intact to `/Volumes/Elements/biomech/archive/dashboard_before_cleaned_20261006/`. The independent dataset remains at `/Volumes/Elements/biomech/openbiomechanics`; it has not been moved or changed. The new source defaults to that sibling directory, and `OBM_DATA_ROOT` can override it.

`start_dashboard.command` starts the local server using the installation's Python environment, Node/ffmpeg PATH, and existing Chrome when present. Run it with `--port 8773` to use the review URL. Generated JSON and CSV-span/catalog indexes were transferred into ignored `data/` and `cache/`; they continue to refer to the same upstream data. Existing export files are retained, while disposable headless-browser disk caches are omitted.

The original local workspace now contains a redirect and archived material, rather than a second working source tree. Its Git pointer resolves to this external-drive repository. Earlier experiments and the old local repository metadata are retained in the local archive. GitHub remains the backup/history for the contribution source; environments, data, cache and archives remain excluded.

Migration verification includes real data/catalog endpoints, the browser/numerical regression suites, Full body settings and a background MP4 export from the new location. The sidebar selection path matches the reviewed cleanup version (`53c8c7c`); subsequent browser preloading, parsed-trial retention and derived-signal caching were reverted at the user’s request.


Verified on October 6, 2026:

- All 65 recorded original-application hashes match the archived files; all tracked source files and reachable Git history were verified during transfer.
- The default dataset resolves to `/Volumes/Elements/biomech/openbiomechanics`, with 1,303 catalog entries. No dataset files were modified.
- Three numerical unit tests and 11 Python tests passed. The 12 browser checks and eight-record real-data numerical audit passed.
- Seven extended checks passed, including paused GPU behavior, rapid selection, cohort bands, Full body Match settings, export cancellation and a complete split-comparison movie with floating charts. The exported movie contained 78 H.264/yuv420p frames at 60 fps (320×240).
- The review server runs from this external-drive application at `http://127.0.0.1:8773/` using `start_dashboard.command --port 8773`.
