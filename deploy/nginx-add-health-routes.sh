#!/usr/bin/env bash
#
# Route /healthz and /readyz to Django instead of the SPA fallback.
#
# Run ON THE VPS as `tayyab`; it asks for the sudo password once:
#
#     scp deploy/nginx-add-health-routes.sh personalVps:/tmp/
#     ssh -t personalVps 'bash /tmp/nginx-add-health-routes.sh; rm -f /tmp/nginx-add-health-routes.sh'
#
# (Not `bash -s < script`: that uses stdin for the script, leaving no
# terminal for the sudo password prompt.)
#
# Without this, both paths fall through to `location / { try_files ... }` and
# answer 200 with the admin SPA's index.html, so external uptime monitoring
# reports "up" even when Django is down. Exact-match locations, so nothing
# else under these names is proxied.
#
# Idempotent. Backs up the site config first, and reverts rather than reloads
# if `nginx -t` fails.

set -euo pipefail

SITE=/etc/nginx/sites-available/proteinhub
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

sudo -v

if sudo grep -q "location = /healthz" "$SITE"; then
    echo "Health routes already present — nothing to do."
    exit 0
fi

sudo cp "$SITE" "${SITE}.bak.${STAMP}"

sudo python3 - "$SITE" <<'PY'
import sys

path = sys.argv[1]
text = open(path).read()
block = """    # Health endpoints go to Django, not the SPA fallback.
    location = /healthz {
        proxy_pass http://127.0.0.1:8000/healthz;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        access_log off;
    }

    location = /readyz {
        proxy_pass http://127.0.0.1:8000/readyz;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

"""
anchor = "    location /api/ {"
assert text.count(anchor) == 1, "could not find exactly one /api/ block"
open(path, "w").write(text.replace(anchor, block + anchor, 1))
PY

if sudo nginx -t >/dev/null 2>&1; then
    sudo systemctl reload nginx
    echo "Added; nginx reloaded (previous config: ${SITE}.bak.${STAMP})"
    sleep 2   # old workers answer for a moment after a reload
else
    sudo cp "${SITE}.bak.${STAMP}" "$SITE"
    echo "nginx config test FAILED — reverted, nothing changed"
    exit 1
fi

for path in healthz readyz; do
    printf '%s: ' "$path"
    curl -s "https://paknutrition.com/${path}"
    echo
done
