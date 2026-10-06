# OpenBiomechanics Motion Lab

My local dashboard contributions for exploring [OpenBiomechanics](https://github.com/drivelineresearch/openbiomechanics) pitching, hitting, and high-performance data. Includes 3D replay, synchronized charts, four-recording comparisons, anatomical overlays, cohort bands, assessment analysis, and background MP4 export. See [the feature map](docs/FEATURES.md) and [the dashboard guide](docs/DASHBOARD_GUIDE.md).

## Run locally

The primary application and Git repository now live at `/Volumes/Elements/biomech/dashboard`. `server.py` and the browser modules are directly in that directory. The previous external-drive dashboard is preserved under `../archive/dashboard_before_cleaned_20261006/`.

On this Mac, double-click `start_dashboard.command`, or run:

```sh
cd /Volumes/Elements/biomech/dashboard
./start_dashboard.command --port 8773
```


Use Python 3.10+ (tested with 3.12). Keep the upstream repository and its release data separate: download the pitching/hitting assets using its instructions, then extract the full-signal ZIPs into each discipline's `data/full_sig/` folder.

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
export OBM_DATA_ROOT=/path/to/openbiomechanics
python server.py
```

Open http://127.0.0.1:8766. `--port 8767` selects another port; `--refresh-catalog` rescans added C3D recordings. The server binds to loopback. For your existing dataset, set `OBM_DATA_ROOT=/Volumes/Elements/biomech/openbiomechanics`.

## Build supporting data and enable export

Node 22+ is needed for cohort generation and movie export. Install ffmpeg on your system for MP4 output.

```sh
npm ci
npx playwright install chromium
python scripts/build_data.py
```

The data builder regenerates high-performance, cohort, and limb-length JSON without changing the upstream data. Use `--only high-performance`, `--only cohorts`, or `--only limbs` to build one feature. Cohort generation reads all processed trials and can take several minutes. Replay works without these snapshots; the corresponding features require them.

Movie export uses Playwright Chromium and `ffmpeg` on PATH. Optional overrides: `OBM_NODE`, `OBM_PLAYWRIGHT`, `OBM_CHROME`, and `OBM_FFMPEG`. For your installed Chrome, `OBM_CHROME=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` avoids downloading Chromium.

## Development

```sh
python -m unittest discover -s tests -v
npm test
npm run format:check
# With the dashboard running on port 8773:
npm run test:browser
npm run test:numerics
npm run test:regressions
npm run test:bones
npm run test:planes
```

Set `OBM_TEST_URL` for another test port. Browser/export checks require the downloaded release data, generated JSON, Chromium/Chrome, and ffmpeg/ffprobe. Test outputs stay in ignored `tests/results/`. `npm run format` formats owned web source; vendored libraries remain unchanged.

The unchanged original external-drive source was pushed first as commit `97c0d60`. [The cleanup audit](docs/CLEANUP.md) records changes, measurements, and limitations. Earlier agent workspaces remain archived in the former local workspace; the separate velocity/Gaussian projects are excluded. Datasets, derived JSON, caches, downloaded media, and environments are excluded using upstream rules plus local exclusions. See [third-party attribution](docs/THIRD_PARTY.md).

[Sidebar speed measurements](docs/SELECTION_SPEED.md) describe parsed-trial reuse and bounded idle preloading.
