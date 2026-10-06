"""Stream processed trials through the dashboard's existing JS signal definitions."""
from pathlib import Path
import json
import os
import shutil
import subprocess

from data_store import DataStore, TABLES, EVENT_LABELS, _read_signal, _clean_row


def main():
    source = Path(__file__).resolve().parent
    store = DataStore()
    node = os.environ.get('OBM_NODE') or shutil.which('node') or 'node'
    with subprocess.Popen(
        [node, '--max-old-space-size=2048', str(source / 'build_cohorts.mjs'), str(source / 'data')],
        stdin=subprocess.PIPE, text=True,
    ) as process:
        try:
            for record in store.entries.values():
                entry = record['public']
                if not entry.get('has_processed'):
                    continue
                kind, key = entry['discipline'], entry['processed_key']
                signals = {name: data for name in TABLES[kind]
                           if (data := _read_signal(kind, name, key, store.index)) is not None}
                events = {}
                for data in signals.values():
                    for column, label in EVENT_LABELS.items():
                        if column in data['series'] and column not in events:
                            value = next((v for v in data['series'][column] if v is not None), None)
                            if value is not None:
                                events[column] = {'label': label, 'time': value}
                trial = dict(entry=entry, metadata=_clean_row(store.metadata[kind].get(key)),
                             poi=_clean_row(store.poi[kind].get(key)), events=events, signals=signals,
                             motion=None, duration=max((t for g in signals.values() for t in g['time'] if t is not None), default=0))
                process.stdin.write(json.dumps(trial, separators=(',', ':'), allow_nan=False) + '\n')
        except BaseException:
            process.terminate()
            raise
        finally:
            process.stdin.close()
        if process.wait():
            raise SystemExit('Cohort builder failed; see the Node output above.')


if __name__ == '__main__':
    main()
