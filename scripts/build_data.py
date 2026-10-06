"""Rebuild ignored dashboard JSON from an independently downloaded OBP release."""
from pathlib import Path
import argparse
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
BUILDERS = {'high-performance': 'build_high_performance.py',
            'cohorts': 'build_cohorts.py', 'limbs': 'build_limb_lengths.py'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', choices=BUILDERS, help='Build one feature instead of all three')
    args = parser.parse_args()
    for name in ([args.only] if args.only else BUILDERS):
        print(f'Building {name}…', flush=True)
        subprocess.run([sys.executable, '-B', str(ROOT / BUILDERS[name])], check=True)


if __name__ == '__main__':
    main()
