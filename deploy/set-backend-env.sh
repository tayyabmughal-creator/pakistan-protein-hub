#!/usr/bin/env bash
#
# Set production backend env values, then restart what reads them.
#
# Run ON THE VPS as `tayyab`:
#
#     scp deploy/set-backend-env.sh personalVps:/tmp/
#     ssh personalVps 'bash /tmp/set-backend-env.sh KEY=value [KEY=value ...]'
#
# ~/envs/backend.env.backup is the source of truth: every deploy copies it over
# backend/.env, so editing backend/.env alone is undone by the next deploy.
# This edits the source, backs it up first, copies it into place, restarts the
# backend and Celery (passwordless via the sudoers rule from vps-prepare.sh),
# and waits for readiness.
#
# Values are passed to Python via argv and written quoted, so no character in
# them is interpreted by the shell or as a regex. Values are never printed.

set -euo pipefail

[ "$#" -gt 0 ] || { echo "usage: $0 KEY=value [KEY=value ...]"; exit 2; }

ENV_FILE="${HOME}/envs/backend.env.backup"
PROJECT="${HOME}/pakistan-protein-hub"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

cp "$ENV_FILE" "${ENV_FILE}.bak.${STAMP}"
echo "Backed up to ${ENV_FILE}.bak.${STAMP}"

python3 - "$ENV_FILE" "$@" <<'PY'
import re
import sys

path, pairs = sys.argv[1], sys.argv[2:]
lines = open(path).read().splitlines(keepends=True)
for pair in pairs:
    key, sep, value = pair.partition("=")
    if not sep or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
        sys.exit(f"not KEY=value: {key!r}")
    replacement = f'{key}="{value}"\n'
    for index, line in enumerate(lines):
        if line.startswith(key + "="):
            lines[index] = replacement
            break
    else:
        if lines and not lines[-1].endswith("\n"):
            lines[-1] += "\n"
        lines.append(replacement)
    print(f"  set {key}")
open(path, "w").writelines(lines)
PY

chmod 600 "$ENV_FILE"
cp "$ENV_FILE" "${PROJECT}/backend/.env"

for unit in proteinhub-backend proteinhub-worker proteinhub-beat; do
    if systemctl list-unit-files | grep -q "^${unit}.service"; then
        sudo -n systemctl restart "$unit"
        echo "  restarted ${unit}"
    fi
done

for attempt in $(seq 1 30); do
    if curl -fsS -H "X-Forwarded-Proto: https" http://127.0.0.1:8000/readyz >/dev/null 2>&1; then
        echo "Backend ready after ${attempt}s"
        exit 0
    fi
    sleep 1
done

echo "ERROR: backend not ready after 30s. To roll back:"
echo "  cp ${ENV_FILE}.bak.${STAMP} ${ENV_FILE} && cp ${ENV_FILE} ${PROJECT}/backend/.env \\"
echo "    && sudo systemctl restart proteinhub-backend proteinhub-worker proteinhub-beat"
sudo -n journalctl -u proteinhub-backend -n 30 --no-pager
exit 1
