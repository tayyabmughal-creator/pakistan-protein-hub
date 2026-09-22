#!/usr/bin/env bash
#
# The storefront cutover (STOREFRONT_SETUP.md §6), with automatic rollback.
#
# Run ON THE VPS as `tayyab`, after install-storefront-service.sh:
#
#     scp deploy/nginx-enable-storefront.sh personalVps:/tmp/
#     ssh -t personalVps 'bash /tmp/nginx-enable-storefront.sh'
#
# Backs up the site config, includes the storefront snippet above the SPA's
# `location /`, runs nginx -t, reloads, then checks the public site. If any
# check fails, the backup is restored and nginx reloaded — production is never
# left half-switched. Rollback later: restore the printed backup and reload.

set -euo pipefail

SITE=/etc/nginx/sites-available/proteinhub
SNIPPET=/etc/nginx/snippets/nginx-storefront.conf
PUBLIC=https://paknutrition.com
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="${SITE}.bak.${STAMP}"

fail() { printf '\033[1;31mFAILED:\033[0m %s\n' "$*"; }

sudo -v
systemctl is-active -q paknutrition-storefront || { fail "storefront service not active"; exit 1; }
curl -fsS -o /dev/null http://127.0.0.1:3000/robots.txt || { fail "storefront not answering on :3000"; exit 1; }
sudo test -f "$SNIPPET" || { fail "$SNIPPET missing — run install-storefront-service.sh"; exit 1; }

if sudo grep -q "include ${SNIPPET};" "$SITE"; then
    echo "Already switched."
    exit 0
fi

sudo cp "$SITE" "$BACKUP"
echo "Backup: $BACKUP"

sudo python3 - "$SITE" "$SNIPPET" <<'PY'
import sys

path, snippet = sys.argv[1], sys.argv[2]
text = open(path).read()
# Only the 443 server block has `location / {`; the port-80 block redirects.
anchor = "    location / {"
assert text.count(anchor) == 1, "expected exactly one `location / {`"
include = (
    "    # Storefront (Next.js) routes — STOREFRONT_SETUP.md §6. Comment out\n"
    "    # and reload to roll back to the SPA.\n"
    f"    include {snippet};\n\n"
)
open(path, "w").write(text.replace(anchor, include + anchor, 1))
PY

rollback() {
    fail "$1 — rolling back"
    sudo cp "$BACKUP" "$SITE"
    sudo nginx -t && sudo systemctl reload nginx
    echo "Rolled back to $BACKUP; customers are on the SPA."
    exit 1
}

sudo nginx -t || rollback "nginx -t"
sudo systemctl reload nginx
sleep 2   # let old workers finish, so the checks below hit the new config

check() {  # path expected_status content_must_contain
    local body code
    body=$(curl -s -w '\n%{http_code}' "${PUBLIC}$1") || rollback "$1 unreachable"
    code="${body##*$'\n'}"
    [ "$code" = "$2" ] || rollback "$1 answered $code, expected $2"
    [ -z "$3" ] || grep -q -- "$3" <<<"$body" || rollback "$1 lacks '$3'"
    printf '  %-28s %s\n' "$1" "$code"
}

echo "Verifying the public site"
check /                          200 '/_next/static/'
check /products                  200 '/_next/static/'
check /products/does-not-exist   404 ''
check /checkout                  200 '/_next/static/'
check /track                     200 '/_next/static/'
check /about                     200 '/_next/static/'
check /sitemap.xml               200 '<loc>https://paknutrition.com'
check /healthz                   200 '"status": "ok"'
check /readyz                    200 '"checks"'
check /api/products/             200 '"slug"'
check /admin/orders              200 'id="root"'
check /login                     200 'id="root"'

img=$(curl -s "${PUBLIC}/products" | grep -o '/_next/image?url=[^" ]*' | head -1 | sed 's/&amp;/\&/g' || true)
[ -n "$img" ] || rollback "no product image on /products"
type=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "${PUBLIC}${img}" || true)
case "$type" in "200 image/"*) echo "  image                        $type" ;; *) rollback "image answered: $type" ;; esac

code=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "${PUBLIC}/cart")
case "$code" in "301 "*"/checkout") echo "  /cart                        $code" ;; *) rollback "/cart answered $code" ;; esac

echo
echo "Storefront is live. Rollback: sudo cp $BACKUP $SITE && sudo nginx -t && sudo systemctl reload nginx"
