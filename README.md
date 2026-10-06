# OpenBiomechanics Motion Lab

My dashboard contributions for exploring [OpenBiomechanics](https://github.com/drivelineresearch/openbiomechanics) pitching, hitting, and high-performance data. Upstream datasets, downloaded media, caches, and generated data snapshots are excluded.

The current dashboard source is in `dashboard/`. See [the feature map](docs/FEATURES.md) and [dashboard documentation](dashboard/README.md).

Run with Python and the upstream checkout available locally:

```sh
OBM_DATA_ROOT=/path/to/openbiomechanics python3 dashboard/server.py
```

Open http://127.0.0.1:8766. The baseline snapshot preserves the active external-drive source as of October 6, 2026.
