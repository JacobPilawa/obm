"""Refresh the browser-friendly snapshot of the released High Performance CSV."""
from __future__ import annotations

import csv
import json
import math
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(os.environ.get("OBM_DATA_ROOT", ROOT / "openbiomechanics")).expanduser() / "high_performance/data/hp_obp.csv"
OUTPUT = ROOT / "dashboard/data/high_performance.json"
TEXT_COLUMNS = {
    "test_date", "playing_level", "bat_speed_mph_group", "pitch_speed_mph_group",
    "pitching_session_date", "hitting_session_date", "athlete_uid",
}


def convert(key: str, value: str | None):
    if value is None or not value.strip():
        return None
    if key in TEXT_COLUMNS:
        return value
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except ValueError:
        return value


def main() -> None:
    with SOURCE.open(newline="") as handle:
        reader = csv.DictReader(handle)
        columns = reader.fieldnames or []
        rows = [[convert(key, record[key]) for key in columns] for record in reader]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w") as handle:
        json.dump({"source": "openbiomechanics/high_performance/data/hp_obp.csv",
                   "columns": columns, "rows": rows}, handle,
                  separators=(",", ":"), allow_nan=False)
    print(f"Wrote {len(rows):,} assessments to {OUTPUT}")


if __name__ == "__main__":
    main()
