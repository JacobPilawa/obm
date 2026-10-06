"""Read the released OpenBiomechanics trials without copying the large CSV tables.

The byte-span index preserves each table's native sample rate. A selected trial is
read by seeking to its rows in each CSV, while C3D markers and analog channels
come from the original recording.
"""
from __future__ import annotations

import csv
import itertools
import json
import math
import os
import re
import struct
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from memo_cache import MemoCache

import ezc3d
import numpy as np

APP_DIR = Path(__file__).resolve().parent
REPO_DIR = Path(os.environ.get("OBM_DATA_ROOT", APP_DIR.parent / "openbiomechanics")).expanduser().resolve()
CACHE_DIR = APP_DIR / "cache"
INDEX_PATH = CACHE_DIR / "csv_spans.json"
CATALOG_PATH = CACHE_DIR / "catalog.json"
INDEX_VERSION = 1
TABLES = {
    "pitching": ("energy_flow", "force_plate", "forces_moments", "joint_angles", "joint_velos", "landmarks"),
    "hitting": ("force_plate", "joint_angles", "joint_velos", "landmarks"),
}
KEYS = {"pitching": "session_pitch", "hitting": "session_swing"}
EVENT_LABELS = {
    "pkh_time": "Peak knee height",
    "fp_10_time": "Foot contact (10% BW)",
    "fp_100_time": "Foot plant (100% BW)",
    "MER_time": "Max external rotation",
    "BR_time": "Ball release",
    "MIR_time": "Max internal rotation",
    "contact_time": "Bat–ball contact",
}
HITTING_FILENAME = re.compile(r"(\d+)_(\d+)_(\d+)_(\d+)_([LR])_(\d+)_(\d+)\.c3d", re.I)


def _data_dir(kind: str) -> Path:
    return REPO_DIR / f"baseball_{kind}" / "data"


def _number(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _int(value: Any) -> int | None:
    number = _number(value)
    return int(number) if number is not None else None


def _scalar(value: Any) -> Any:
    if value is None or value == "":
        return None
    if isinstance(value, str):
        value = value.strip()
        if not value or value.lower() in {"nan", "null", "none"}:
            return None
        if re.fullmatch(r"[-+]?\d+", value):
            return int(value)
        # Python float accepts underscores ("1031_2" -> 10312); these are trial IDs.
        if "_" in value:
            return value
        number = _number(value)
        return number if number is not None else value
    if isinstance(value, (int, float)):
        return value if not isinstance(value, float) or math.isfinite(value) else None
    return value


def _clean_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    return {key: _scalar(value) for key, value in row.items()} if row else None


def _csv_rows(path: Path, key: str) -> dict[str, dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return {row[key]: row for row in csv.DictReader(handle) if row.get(key)}


def _fingerprints() -> dict[str, list[int]]:
    result: dict[str, list[int]] = {}
    for kind, names in TABLES.items():
        for name in names:
            path = _data_dir(kind) / "full_sig" / f"{name}.csv"
            stat = path.stat()
            result[f"{kind}/{name}"] = [stat.st_size, stat.st_mtime_ns]
    return result


def _catalog_fingerprints() -> dict[str, list[int]]:
    """Track the released summary files and indexed signals for catalog reuse."""
    result = _fingerprints()
    for kind in TABLES:
        for name in ("metadata.csv", "poi/poi_metrics.csv"):
            stat = (_data_dir(kind) / name).stat()
            result[f"{kind}/{name}"] = [stat.st_size, stat.st_mtime_ns]
    path = _data_dir("hitting") / "poi" / "hittrax.csv"
    stat = path.stat()
    result["hitting/poi/hittrax.csv"] = [stat.st_size, stat.st_mtime_ns]
    return result


def _scan_csv(path: Path) -> dict[str, Any]:
    """Index every contiguous run of trial rows by its exact byte range."""
    spans: dict[str, list[list[int]]] = {}
    rows = 0
    with path.open("rb") as handle:
        header_bytes = handle.readline()
        columns = next(csv.reader([header_bytes.decode("utf-8-sig").strip()]))
        if len(columns) < 3 or columns[1] != "time":
            raise ValueError(f"Unexpected full-signal header in {path}: {columns[:3]}")
        position = len(header_bytes)
        previous_key: str | None = None
        while line := handle.readline():
            end = position + len(line)
            key = line.partition(b",")[0].strip(b'"').decode("utf-8")
            if not key:
                raise ValueError(f"Missing trial key at byte {position} in {path}")
            if key == previous_key:
                span = spans[key][-1]
                span[1] = end
                span[2] += 1
            else:
                spans.setdefault(key, []).append([position, end, 1])
            previous_key = key
            position = end
            rows += 1
    return {"columns": columns, "spans": spans, "rows": rows}


def load_csv_index() -> dict[str, Any]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    fingerprints = _fingerprints()
    if INDEX_PATH.is_file():
        try:
            cached = json.loads(INDEX_PATH.read_text())
            if cached.get("version") == INDEX_VERSION and cached.get("fingerprints") == fingerprints:
                return cached
        except (ValueError, OSError):
            pass
    tables: dict[str, Any] = {}
    for key in fingerprints:
        kind, name = key.split("/", 1)
        print(f"Indexing {key}.csv…", flush=True)
        tables[key] = _scan_csv(_data_dir(kind) / "full_sig" / f"{name}.csv")
        print(f"  {tables[key]['rows']:,} samples · {len(tables[key]['spans']):,} trials", flush=True)
    result = {"version": INDEX_VERSION, "fingerprints": fingerprints, "tables": tables}
    temporary = INDEX_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, separators=(",", ":")))
    temporary.replace(INDEX_PATH)
    return result


def _c3d_frame_count(path: Path) -> int:
    # Both release archives use Intel C3D files and recordings below 65536 frames.
    with path.open("rb") as handle:
        header = handle.read(10)
    if len(header) < 10:
        raise ValueError(f"Truncated C3D header: {path}")
    first, last = struct.unpack_from("<HH", header, 6)
    count = last - first + 1
    if not 0 < count < 65536:
        raise ValueError(f"Invalid C3D frame range: {path}")
    return count


def _read_signal(kind: str, table: str, key: str, index: dict[str, Any]) -> dict[str, Any] | None:
    entry = index["tables"][f"{kind}/{table}"]
    spans = entry["spans"].get(key)
    if not spans:
        return None
    columns = entry["columns"]
    times: list[float | None] = []
    series: dict[str, list[float | None]] = {name: [] for name in columns[2:]}
    path = _data_dir(kind) / "full_sig" / f"{table}.csv"
    with path.open("rb") as handle:
        for start, end, _ in spans:
            handle.seek(start)
            data = handle.read(end - start).decode("utf-8")
            for row in csv.reader(data.splitlines()):
                if not row:
                    continue
                if row[0] != key or len(row) != len(columns):
                    raise ValueError(f"CSV span mismatch in {path} for {key}")
                times.append(_number(row[1]))
                for name, value in zip(columns[2:], row[2:]):
                    series[name].append(_number(value))
    return {
        "source": f"baseball_{kind}/data/full_sig/{table}.csv",
        "key_column": columns[0],
        "row_count": len(times),
        "time": times,
        "series": series,
    }


def _c3d_motion(path: Path) -> dict[str, Any]:
    c3d = ezc3d.c3d(str(path), extract_forceplat_data=True)
    params = c3d["parameters"]
    point = params["POINT"]
    analog = params.get("ANALOG", {})
    labels = [str(label).strip() for label in point["LABELS"]["value"]]
    rate = float(point["RATE"]["value"][0])
    unit = str(point.get("UNITS", {}).get("value", ["m"])[0]).strip().lower()
    scale = {"m": 1.0, "mm": 0.001, "cm": 0.01}.get(unit)
    if scale is None:
        raise ValueError(f"Unsupported C3D point unit {unit!r} in {path}")
    points = np.asarray(c3d["data"]["points"], dtype=float)
    xyz = points[:3].transpose(2, 1, 0).copy() * scale
    valid = np.isfinite(xyz).all(axis=2)
    residuals = None
    # ezc3d points[3] is homogeneous W, not the C3D residual.
    residual_data = c3d["data"].get("meta_points", {}).get("residuals")
    if residual_data is not None:
        residuals = np.asarray(residual_data, dtype=float)[0].T
        valid &= np.isfinite(residuals) & (residuals >= 0)
    xyz[~valid] = np.nan
    frames = [
        [[float(v) if math.isfinite(v) else None for v in marker] for marker in frame]
        for frame in xyz
    ]
    analog_data = np.asarray(c3d["data"]["analogs"], dtype=float)
    analog_labels = [str(label).strip() for label in analog.get("LABELS", {}).get("value", [])]
    analog_units = [str(value).strip() for value in analog.get("UNITS", {}).get("value", [])]
    analog_rate_values = analog.get("RATE", {}).get("value", [0.0])
    analog_rate = float(analog_rate_values[0]) if len(analog_rate_values) else 0.0
    channels: dict[str, list[float | None]] = {}
    if analog_data.size and analog_data.shape[1] == len(analog_labels):
        for i, label in enumerate(analog_labels):
            values = analog_data[0, i]
            channels[label] = [float(v) if math.isfinite(v) else None for v in values]
    platforms = []
    force_platform = params.get("FORCE_PLATFORM", {})
    corners = force_platform.get("CORNERS", {}).get("value")
    if corners is not None:
        corners = np.asarray(corners, dtype=float)
        if corners.ndim == 3 and corners.shape[:2] == (3, 4):
            for i in range(corners.shape[2]):
                platforms.append({
                    "number": i + 1,
                    "corners": (corners[:, :, i].T * scale).tolist(),
                })
    # ezc3d transforms local transducer forces using the C3D platform geometry.
    # Do not interpret Fx/Fy/Fz analog channels as global XYZ by negating them.
    for platform, extracted in zip(platforms, c3d["data"].get("platform", [])):
        force = np.asarray(extracted["force"], dtype=float).T
        if str(extracted["unit_force"]).strip().lower() == "n":
            platform["force_global"] = [
                [float(v) if math.isfinite(v) else None for v in row] for row in force
            ]
            platform["force_units"] = "N"
    return {
        "file": path.name,
        "source": str(path.relative_to(REPO_DIR)),
        "labels": labels,
        "frames": frames,
        "rate": rate,
        "first_frame": int(c3d["header"]["points"]["first_frame"]),
        "units": "m",
        "source_units": unit,
        "frame_count": len(frames),
        "residuals": (
            [[float(v) if math.isfinite(v) else None for v in frame] for frame in residuals]
            if residuals is not None else None
        ),
        "analog": {
            "rate": analog_rate,
            "sample_count": int(analog_data.shape[2]) if analog_data.ndim == 3 else 0,
            "labels": analog_labels,
            "units": analog_units,
            "channels": channels,
        },
        "platforms": platforms,
    }


class DataStore:
    def __init__(self) -> None:
        self.index = load_csv_index()
        self.metadata = {
            kind: _csv_rows(_data_dir(kind) / "metadata.csv", KEYS[kind])
            for kind in TABLES
        }
        self.poi = {
            kind: _csv_rows(_data_dir(kind) / "poi" / "poi_metrics.csv", KEYS[kind])
            for kind in TABLES
        }
        self.hittrax = _csv_rows(_data_dir("hitting") / "poi" / "hittrax.csv", "session_swing")
        self.descriptions = self._load_descriptions()
        self.entries: dict[str, dict[str, Any]] = {}
        if not self._load_catalog_cache():
            self._build_catalog()
            self._save_catalog_cache()
        self._trial_cache = MemoCache(max_entries=6)

    def _load_catalog_cache(self) -> bool:
        try:
            cached = json.loads(CATALOG_PATH.read_text())
            if cached.get("version") != 4 or cached.get("fingerprints") != _catalog_fingerprints():
                return False
            for public in cached["entries"]:
                path = REPO_DIR / public["source"] if public.get("source") else None
                if path is not None and not path.is_file():
                    self.entries.clear()
                    return False
                self.entries[public["id"]] = {"public": public, "path": path}
            if len(self.entries) != len(cached["entries"]):
                self.entries.clear()
                return False
            return True
        except (OSError, ValueError, KeyError, TypeError):
            self.entries.clear()
            return False

    def _save_catalog_cache(self) -> None:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        data = {"version": 4, "fingerprints": _catalog_fingerprints(),
                "entries": [entry["public"] for entry in self.entries.values()]}
        temporary = CATALOG_PATH.with_suffix(".tmp")
        temporary.write_text(json.dumps(data, separators=(",", ":")))
        temporary.replace(CATALOG_PATH)

    @staticmethod
    def _load_descriptions() -> dict[str, dict[str, dict[str, str]]]:
        result: dict[str, dict[str, dict[str, str]]] = {}
        for kind in TABLES:
            lookup: dict[str, dict[str, str]] = {"poi": {}, "metadata": {}, "hittrax": {}}
            path = _data_dir(kind) / "data_dictionary.csv"
            with path.open(newline="", encoding="utf-8-sig") as handle:
                for row in csv.DictReader(handle):
                    for group in lookup:
                        if row["dataset"] == f"{kind}_{group}":
                            lookup[group][row["column"]] = row["description"]
            result[kind] = lookup
        return result

    def _add(self, *, kind: str, status: str, key: str | None, path: Path | None,
             frame_count: int | None, speed: float | None, match: str,
             metadata: dict[str, str] | None = None) -> None:
        if key:
            identity = f"{kind}:processed:{key}"
        elif status == "static-model":
            identity = f"{kind}:model:{path.name}"
        else:
            identity = f"{kind}:raw:{path.name}"
        poi = self.poi[kind].get(key, {}) if key else {}
        # Full numeric POI coverage supports exploration without loading motion files.
        # IDs are labels, not measurements; preserve measured zeros explicitly.
        features = {field: value for field, raw in poi.items()
                    if field not in {KEYS[kind], "session", "user"}
                    and (value := _number(raw)) is not None}
        public = {
            "id": identity,
            "discipline": kind,
            "status": status,
            "processed_key": key,
            "filename": path.name if path else None,
            "source": str(path.relative_to(REPO_DIR)) if path else None,
            "frame_count": frame_count,
            "speed_mph": speed,
            "athlete": _scalar(metadata.get("user")) if metadata else None,
            "session": _scalar(metadata.get("session")) if metadata else None,
            "side": (metadata or {}).get("p_throws") or (metadata or {}).get("hitter_side") or poi.get("p_throws"),
            "match": match,
            "has_raw_c3d": path is not None,
            "has_processed": key is not None,
            "has_hittrax": bool(key and kind == "hitting" and key in self.hittrax),
            "pitch_type": poi.get("pitch_type") if kind == "pitching" else None,
            "playing_level": (metadata or {}).get("playing_level") or (metadata or {}).get("highest_playing_level"),
            "features": features,
        }
        if identity in self.entries:
            raise ValueError(f"Duplicate catalog ID {identity}")
        self.entries[identity] = {"public": public, "path": path}

    def _build_catalog(self) -> None:
        self._build_pitching_catalog()
        self._build_hitting_catalog()

    def _build_pitching_catalog(self) -> None:
        kind = "pitching"
        root = _data_dir(kind) / "c3d"
        paths = {path.name: path for path in root.rglob("*.c3d")}
        used: set[str] = set()
        for key, row in self.metadata[kind].items():
            filename = row["filename_new"]
            path = paths.get(filename)
            if path is None:
                raise FileNotFoundError(f"Pitching metadata C3D missing: {filename}")
            frames = _c3d_frame_count(path)
            spans = self.index["tables"]["pitching/joint_angles"]["spans"].get(key, [])
            expected = sum(span[2] for span in spans)
            if frames != expected:
                raise ValueError(f"Pitching frame mismatch: {filename} ({frames} vs {expected})")
            self._add(kind=kind, status="linked", key=key, path=path,
                      frame_count=frames, speed=_number(row.get("pitch_speed_mph")),
                      match="Exact metadata filename and 360 Hz frame count", metadata=row)
            used.add(filename)
        for name, path in paths.items():
            if name in used:
                continue
            status = "static-model" if "model" in name.lower() else "raw-only"
            self._add(kind=kind, status=status, key=None, path=path,
                      frame_count=_c3d_frame_count(path), speed=None,
                      match="Static calibration model" if status == "static-model" else "No processed row")

    def _build_hitting_catalog(self) -> None:
        kind = "hitting"
        root = _data_dir(kind) / "c3d"
        raw_by_session: dict[int, list[dict[str, Any]]] = defaultdict(list)
        models: list[Path] = []
        for path in root.rglob("*.c3d"):
            match = HITTING_FILENAME.fullmatch(path.name)
            if not match:
                models.append(path)
                continue
            user, session, _, _, side, swing, speed = match.groups()
            raw_by_session[int(session)].append({
                "path": path, "user": int(user), "side": side.upper(),
                "swing": int(swing), "speed": int(speed) / 10,
                "frames": _c3d_frame_count(path),
            })
        for records in raw_by_session.values():
            records.sort(key=lambda item: item["swing"])
        metadata_by_session: dict[int, list[dict[str, str]]] = defaultdict(list)
        for row in self.metadata[kind].values():
            metadata_by_session[int(row["session"])].append(row)
        for rows in metadata_by_session.values():
            rows.sort(key=lambda row: int(row["session_swing"].rsplit("_", 1)[1]))
        frame_spans = self.index["tables"]["hitting/joint_angles"]["spans"]
        for session in sorted(set(raw_by_session) | set(metadata_by_session)):
            raw = raw_by_session.get(session, [])
            rows = metadata_by_session.get(session, [])
            if not raw:
                chosen: tuple[int, ...] | None = None
            elif len(raw) == len(rows):
                chosen = tuple(range(len(raw)))
            elif len(raw) >= len(rows):
                candidates = []
                for combo in itertools.combinations(range(len(raw)), len(rows)):
                    if all(
                        raw[j]["user"] == int(row["user"])
                        and raw[j]["side"] == row["hitter_side"].upper()
                        and (
                            _number(row.get("exit_velo_mph_x")) is None
                            or abs(raw[j]["speed"] - round(float(row["exit_velo_mph_x"]), 1)) < 0.051
                        )
                        for row, j in zip(rows, combo)
                    ):
                        candidates.append(combo)
                verified = [
                    combo for combo in candidates
                    if all(
                        raw[j]["frames"] == sum(span[2] for span in frame_spans.get(row["session_swing"], []))
                        for row, j in zip(rows, combo)
                    )
                ]
                chosen = verified[0] if len(verified) == 1 else None
            else:
                chosen = None
            if chosen is not None:
                for row, j in zip(rows, chosen):
                    frames = sum(span[2] for span in frame_spans.get(row["session_swing"], []))
                    if (raw[j]["frames"] != frames or raw[j]["user"] != int(row["user"])
                            or raw[j]["side"] != row["hitter_side"].upper()):
                        chosen = None
                        break
            if chosen is None:
                for row in rows:
                    self._add(kind=kind, status="processed-only", key=row["session_swing"],
                              path=None, frame_count=sum(span[2] for span in frame_spans.get(row["session_swing"], [])),
                              speed=_number(row.get("exit_velo_mph_x")),
                              match="No unique C3D link; processed trajectories remain available", metadata=row)
                for item in raw:
                    self._add(kind=kind, status="raw-only", key=None, path=item["path"],
                              frame_count=item["frames"], speed=item["speed"],
                              match="No unique processed-row link")
                continue
            assigned = set(chosen)
            for row, j in zip(rows, chosen):
                speed = _number(row.get("exit_velo_mph_x"))
                discrepancy = speed is not None and abs(raw[j]["speed"] - round(speed, 1)) >= 0.051
                method = "Session, athlete, side, swing order, and exact frame count"
                method += "; filename speed differs" if discrepancy else "; exit speed agrees"
                self._add(kind=kind, status="linked", key=row["session_swing"],
                          path=raw[j]["path"], frame_count=raw[j]["frames"],
                          speed=speed if speed is not None else raw[j]["speed"],
                          match=method, metadata=row)
            for j, item in enumerate(raw):
                if j not in assigned:
                    self._add(kind=kind, status="raw-only", key=None, path=item["path"],
                              frame_count=item["frames"], speed=item["speed"],
                              match="Raw C3D excluded from processed release")
        for path in models:
            self._add(kind=kind, status="static-model", key=None, path=path,
                      frame_count=_c3d_frame_count(path), speed=None,
                      match="Static calibration model")

    def catalog(self) -> dict[str, Any]:
        entries = [record["public"] for record in self.entries.values()]
        counts = Counter(f"{entry['discipline']}/{entry['status']}" for entry in entries)
        return {
            "entries": entries,
            "counts": dict(counts),
            "table_names": TABLES,
            "metric_descriptions": {kind: values["poi"] for kind, values in self.descriptions.items()},
            "coordinate_systems": {
                "pitching": "+X toward home plate, +Y toward first base, +Z upward",
                "hitting": "+X toward mound, +Y toward right-handed batter's box, +Z upward",
            },
        }

    def trial(self, identity: str) -> dict[str, Any]:
        return self._trial_cache.get(identity, lambda: self._load_trial(identity))

    def _load_trial(self, identity: str) -> dict[str, Any]:
        record = self.entries.get(identity)
        if record is None:
            raise KeyError(f"Unknown trial ID {identity!r}")
        entry = record["public"]
        kind = entry["discipline"]
        key = entry["processed_key"]
        signals = {
            name: data for name in TABLES[kind]
            if (data := _read_signal(kind, name, key, self.index)) is not None
        } if key else {}
        events: dict[str, dict[str, Any]] = {}
        for data in signals.values():
            for column, label in EVENT_LABELS.items():
                if column not in data["series"] or column in events:
                    continue
                value = next((v for v in data["series"][column] if v is not None), None)
                if value is not None:
                    events[column] = {"label": label, "time": value}
        motion = _c3d_motion(record["path"]) if record["path"] else None
        metadata = self.metadata[kind].get(key) if key else None
        poi = self.poi[kind].get(key) if key else None
        hittrax = self.hittrax.get(key) if kind == "hitting" and key else None
        duration = max(
            [((motion["frame_count"] - 1) / motion["rate"]) if motion and motion["rate"] else 0.0]
            + [max((v for v in data["time"] if v is not None), default=0.0) for data in signals.values()]
        )
        result = {
            "entry": entry,
            "metadata": _clean_row(metadata),
            "poi": _clean_row(poi),
            "hittrax": _clean_row(hittrax),
            "descriptions": self.descriptions[kind],
            "signals": signals,
            "motion": motion,
            "events": events,
            "duration": duration,
            "coordinate_system": self.catalog()["coordinate_systems"][kind],
            "timeline_note": "C3D frame zero and processed full-signal time zero align; force and analog data retain their native 1,080 Hz timestamps.",
        }
        return result
