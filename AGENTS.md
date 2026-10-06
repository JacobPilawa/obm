# Dashboard development

- This repository root, `/Volumes/Elements/biomech/dashboard`, is the canonical application. Edit it in place; do not create revision folders, duplicate source trees, or one-off patch installers.
- Keep the independent OpenBiomechanics checkout outside Git and access it through `OBM_DATA_ROOT`. Never change source datasets while refactoring the dashboard.
- Generated JSON belongs in ignored `data/`; caches and exports belong in ignored `cache/`. Builders must reproduce every generated asset required by the UI.
- Preserve native timestamps, missing samples, units, sign conventions, and the distinction between published values and dashboard calculations. Changes to scientific definitions require explicit explanation and numerical validation.
- Preserve four-replay comparison, Full body Match settings, floating-window state, and deterministic 60 fps MP4 export.
- Format owned JS/CSS/HTML with `npm run format`; keep `vendor/` untouched and retain third-party notices.
- Run tests relevant to the change. Python tests: `python -m unittest discover -s tests -v`; numerical unit tests: `npm test`. Real-data browser/numerical/export suites are documented in README.md and default to port 8773.
- Preserve user experiments in `local_archive/` unless the user asks to remove them. The old dashboard is preserved in `/Volumes/Elements/biomech/archive/dashboard_before_cleaned_20261006/`. The current external-drive repository is the live source; the former local workspace only points here.
