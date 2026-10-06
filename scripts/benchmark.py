"""Measure repeated compressed local responses; first request is reported separately."""
import argparse
import json
from pathlib import Path
from time import perf_counter
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--origin', default='http://127.0.0.1:8773')
parser.add_argument('--output', type=Path, default=Path('tests/results/benchmark.json'))
args = parser.parse_args()
results = {}
for name, endpoint in [('catalog', '/api/catalog'), ('pitch', '/api/trial?id=pitching:processed:1097_1'), ('cohort', '/data/cohort_pitching.json')]:
    times = []
    for _ in range(4):
        start = perf_counter()
        with urlopen(Request(args.origin + endpoint, headers={'Accept-Encoding': 'gzip'})) as response:
            payload = response.read()
            encoding = response.headers.get('Content-Encoding', 'identity')
        times.append(round((perf_counter() - start) * 1000, 2))
    results[name] = dict(milliseconds=times, bytes=len(payload), encoding=encoding)
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
