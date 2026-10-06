#!/bin/zsh
set -e
OBM_APP_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$OBM_APP_DIR"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export OBM_DATA_ROOT="${OBM_DATA_ROOT:-$OBM_APP_DIR/../openbiomechanics}"
if [[ -z "${OBM_CHROME:-}" && -x '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' ]]; then
  export OBM_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
fi
exec "$OBM_APP_DIR/.venv/bin/python" -B "$OBM_APP_DIR/server.py" "$@"
