#!/usr/bin/env bash
#
# Install, start and verify the storefront service — WITHOUT switching traffic.
#
# STOREFRONT_SETUP.md §5, as one checked script. Run ON THE VPS as `tayyab`
# after install-storefront-node.sh and the MEDIA_URL change (§2, §3):
#
#     scp deploy/install-storefront-service.sh personalVps:/tmp/
#     ssh -t personalVps 'bash /tmp/install-storefront-service.sh'
#
# Asks for the sudo password once. Customers are unaffected: the storefront
# only listens on 127.0.0.1:3000, and nginx is not pointed at it. The nginx
# snippet is copied into /etc/nginx/snippets and `nginx -t` is run, but the
# site config is not changed — the cutover (§6) stays a separate, deliberate
# step. Undo with: sudo systemctl disable --now paknutrition-storefront

set -euo pipefail

PROJECT="${HOME}/pakistan-protein-hub"
NODE_BIN="${HOME}/.local/node22/bin"
UNIT=/etc/systemd/system/paknutrition-storefront.service
B=http://127.0.0.1:3000

step() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mFAILED:\033[0m %s\n' "$*"; exit 1; }

step "Preconditions"
[ -x "${NODE_BIN}/node" ] || fail "Node 22 missing — run install-storefront-node.sh"
echo "  node $("${NODE_BIN}/node" --version)"
grep -q '^MEDIA_URL="https://' "${HOME}/envs/backend.env.backup" \
    || fail "MEDIA_URL is not absolute — product images would break (STOREFRONT_SETUP.md §3)"
echo "  MEDIA_URL is absolute"
if ss -ltn | grep -q ':3000 ' && ! systemctl is-active -q paknutrition-storefront; then
    fail "something else is listening on port 3000"
fi
echo "  port 3000 available"

sudo -v

step "Building"
cd "${PROJECT}/storefront"
export PATH="${NODE_BIN}:${PATH}"
npm ci --no-audit --no-fund
NEXT_PUBLIC_SITE_URL=https://paknutrition.com \
NEXT_PUBLIC_MEDIA_HOST=paknutrition.com \
API_BASE_URL=http://127.0.0.1:8000 \
NEXT_TELEMETRY_DISABLED=1 \
    npm run build
npm run assemble:standalone
cd "$PROJECT"

step "Installing the unit"
sed -e "s|REPLACE_WITH_DEPLOY_USER|$(whoami)|g" \
    -e "s|/REPLACE/WITH/PROJECT_PATH|${PROJECT}|g" \
    deploy/paknutrition-storefront.service | sudo tee "$UNIT" >/dev/null
! grep -v '^#' "$UNIT" | grep -q REPLACE || fail "unfilled placeholder in $UNIT"
grep -q "ExecStart=${NODE_BIN}/node " "$UNIT" || fail "unit does not use ${NODE_BIN}/node"
sudo systemctl daemon-reload
sudo systemctl enable --now paknutrition-storefront

wait_up() {
    for attempt in $(seq 1 30); do
        curl -fsS -o /dev/null "$B/robots.txt" 2>/dev/null && return 0
        sleep 1
    done
    sudo journalctl -u paknutrition-storefront -n 40 --no-pager
    fail "storefront did not respond on $B"
}

verify() {
    for path in / /products /categories /deals /checkout /track /about /privacy /sitemap.xml; do
        code=$(curl -s -o /dev/null -w '%{http_code}' "$B$path")
        [ "$code" = 200 ] || fail "$path answered $code"
    done
    code=$(curl -s -o /dev/null -w '%{http_code}' "$B/products/does-not-exist")
    [ "$code" = 404 ] || fail "missing product answered $code, not 404"
    # [^" ]: stop at the space in a srcset list, not only at the closing quote.
    img=$(curl -s "$B/products" | grep -o '/_next/image?url=[^" ]*' | head -1 | sed 's/&amp;/\&/g' || true)
    [ -n "$img" ] || fail "no product image on /products"
    case "$img" in *127.0.0.1*) fail "image points at 127.0.0.1 — MEDIA_URL not in effect" ;; esac
    type=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$B$img" || true)
    case "$type" in "200 image/"*) ;; *) fail "image optimiser answered: $type" ;; esac
    echo "  pages 200, missing product 404, image $type"
}

step "Verifying"
wait_up
verify

step "Restart survives"
sudo systemctl restart paknutrition-storefront
wait_up
verify

step "Crash recovery (Restart=always)"
old=$(systemctl show -p MainPID --value paknutrition-storefront)
sudo kill -9 "$old"
sleep 7
new=$(systemctl show -p MainPID --value paknutrition-storefront)
[ "$new" != "0" ] && [ "$new" != "$old" ] || fail "not restarted after kill (pid $old -> $new)"
wait_up
verify
echo "  pid $old killed, systemd restarted it as $new"

step "Backend restart does not take the storefront down"
sudo systemctl restart proteinhub-backend
for attempt in $(seq 1 30); do
    curl -fsS -o /dev/null -H 'X-Forwarded-Proto: https' http://127.0.0.1:8000/readyz 2>/dev/null && break
    sleep 1
done
systemctl is-active -q paknutrition-storefront || fail "storefront stopped with the backend"
verify

step "nginx snippet staged (NOT included — no traffic switched)"
sudo cp deploy/nginx-storefront.conf /etc/nginx/snippets/nginx-storefront.conf
sudo nginx -t
if sudo grep -q 'include /etc/nginx/snippets/nginx-storefront.conf' /etc/nginx/sites-available/proteinhub; then
    echo "  NOTE: the site already includes the snippet"
else
    echo "  site config unchanged: customers still get the SPA"
fi

step "Done"
cat <<EOF

  Storefront running on $B under systemd, enabled at boot, verified after a
  restart, a crash and a backend restart. Customers still see the SPA.

  Cutover (STOREFRONT_SETUP.md §6) is the only step left.
EOF
