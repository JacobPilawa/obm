# Primary external-drive installation

The application and its contribution repository live at `/Volumes/Elements/biomech/dashboard`. Source modules, `server.py`, Git history, documentation, tests, data builders and the local launcher are together in this folder. The layout was flattened from the earlier repository's nested `dashboard/` folder so the original external-drive dashboard path remains the application path.

The prior external-drive application was moved intact to `/Volumes/Elements/biomech/archive/dashboard_before_cleaned_20261006/`. The independent dataset remains at `/Volumes/Elements/biomech/openbiomechanics`; it has not been moved or changed. The new source defaults to that sibling directory, and `OBM_DATA_ROOT` can override it.

`start_dashboard.command` starts the local server using the installation's Python environment, Node/ffmpeg PATH, and existing Chrome when present. Run it with `--port 8773` to use the review URL. Generated JSON and CSV-span/catalog indexes were transferred into ignored `data/` and `cache/`; they continue to refer to the same upstream data. Existing export files are retained, while disposable headless-browser disk caches are omitted.

The original local workspace now contains a redirect and archived material, rather than a second working source tree. Its Git pointer resolves to this external-drive repository. Earlier experiments and the old local repository metadata are retained in the local archive. GitHub remains the backup/history for the contribution source; environments, data, cache and archives remain excluded.

Migration verification includes real data/catalog endpoints, the browser/numerical regression suites, Full body settings and a background MP4 export from the new location. Sidebar cache/performance changes are described in `SELECTION_SPEED.md`.
