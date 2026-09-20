#!/usr/bin/env bash
#
# One-time VPS preparation for the Pak Nutrition upgrade.
#
# Run this ON THE VPS, as the `tayyab` user, before deploying the new code:
#
#     ssh personalVps
#     cd ~/pakistan-protein-hub && git fetch origin
#     bash deploy/vps-prepare.sh
#
# It will ask for the sudo password once.
#
# ── What it does, and why each step is needed ─────────────────────────────
#
# The new backend refuses to start in production if its configuration is
# unsafe (DEBUG=False + CONFIG_CHECK_STRICT). Right now the live env fails
# three of those checks, so deploying without this script would stop gunicorn
# and take the site down. Each step below clears one failure.
#
#   1. Redis + Celery worker + beat
#      The code queues order emails, SMS and payment reconciliation. With no
#      broker configured Celery falls back to "eager" mode, which runs every
#      one of those inside the customer's request — an SMTP handshake with a
#      10s timeout while they wait on the checkout button. The validator
#      rejects eager mode in production, correctly.
#
#      Important: a broker WITHOUT a worker is worse than no broker. Tasks
#      would queue and nothing would consume them, so order confirmations
#      would silently stop. That is why the worker and beat units are
#      installed here, in the same step as Redis.
#
#   2. ADMIN_URL
#      Django admin currently sits at /admin/, the first path any scanner
#      tries. It is also unreachable through nginx, which sends /admin/* to
#      the staff SPA screens. Moving it to an obscure prefix fixes both.
#
#   3. SECRET_KEY
#      The live key still begins with "django-insecure-" — the throwaway key
#      Django generates for a new project, currently signing every session
#      and password-reset token in production. Rotating it is item §3.2 of
#      SECURITY_REMEDIATION.md.
#
#      ⚠️  ROTATING LOGS EVERY USER OUT. 17 accounts will need to sign in
#      again. Run this at a quiet time.
#
# Nothing here touches the database, and nothing here is destructive. The
# previous env file is backed up before it is edited.
#
# ──────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT="${HOME}/pakistan-protein-hub"
ENV_FILE="${HOME}/envs/backend.env.backup"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

info()  { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
ok()    { printf '  \033[0;32mok\033[0m %s\n' "$*"; }

[ -f "$ENV_FILE" ] || { echo "Cannot find $ENV_FILE"; exit 1; }
[ -d "$PROJECT" ]  || { echo "Cannot find $PROJECT"; exit 1; }

info "Authenticating sudo (you will be prompted once)"
sudo -v

# Keep the sudo timestamp alive for the whole run.
while true; do sudo -n true; sleep 50; kill -0 "$$" 2>/dev/null || exit; done 2>/dev/null &
SUDO_KEEPALIVE=$!
trap 'kill "$SUDO_KEEPALIVE" 2>/dev/null || true' EXIT

# ── 1. Redis ──────────────────────────────────────────────────────────────

info "Installing Redis"
if command -v redis-server >/dev/null 2>&1; then
    ok "already installed ($(redis-server --version | cut -d' ' -f3))"
else
    sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq redis-server
    ok "installed"
fi

# Loopback only. This box hosts several unrelated sites and Redis has no
# authentication configured — it must not be reachable from anywhere else.
if ! sudo grep -qE '^bind 127\.0\.0\.1' /etc/redis/redis.conf; then
    sudo cp /etc/redis/redis.conf "/etc/redis/redis.conf.bak.$STAMP"
    sudo sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
    ok "bound to loopback (previous config saved as redis.conf.bak.$STAMP)"
else
    ok "already bound to loopback"
fi

sudo systemctl enable --now redis-server >/dev/null 2>&1 || true
sudo systemctl restart redis-server
sleep 1
redis-cli ping >/dev/null && ok "responding to PING"

# ── 2. Celery worker and beat ─────────────────────────────────────────────

info "Installing Celery units"

VENV="venv"
[ -d "${PROJECT}/backend/.venv" ] && VENV=".venv"

sudo tee /etc/systemd/system/proteinhub-worker.service >/dev/null <<UNIT
[Unit]
Description=ProteinHub Celery worker
After=network.target redis-server.service postgresql.service
Requires=redis-server.service

[Service]
Type=simple
User=${USER}
Group=${USER}
WorkingDirectory=${PROJECT}/backend
EnvironmentFile=${PROJECT}/backend/.env
ExecStart=${PROJECT}/backend/${VENV}/bin/celery -A config worker --loglevel=info --concurrency=2
Restart=always
RestartSec=10
KillSignal=SIGTERM
# Let a task finish rather than killing it mid-send and losing the email.
TimeoutStopSec=60
StandardOutput=journal
StandardError=journal
SyslogIdentifier=proteinhub-worker

[Install]
WantedBy=multi-user.target
UNIT

sudo tee /etc/systemd/system/proteinhub-beat.service >/dev/null <<UNIT
[Unit]
Description=ProteinHub Celery beat scheduler
After=network.target redis-server.service
Requires=redis-server.service

[Service]
Type=simple
User=${USER}
Group=${USER}
WorkingDirectory=${PROJECT}/backend
EnvironmentFile=${PROJECT}/backend/.env
# Exactly one beat process. Two schedulers means every scheduled job runs
# twice, and for payment reconciliation that means duplicated provider calls.
ExecStart=${PROJECT}/backend/${VENV}/bin/celery -A config beat --loglevel=info --schedule=${PROJECT}/backend/celerybeat-schedule
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=proteinhub-beat

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
ok "units written (NOT started — they need the new code, which deploys next)"

# ── 3. Passwordless restarts for the deploy ───────────────────────────────

info "Allowing the deploy to restart the new services without a password"
sudo tee /etc/sudoers.d/proteinhub-deploy >/dev/null <<SUDOERS
# The GitHub Actions deploy restarts these over SSH and cannot answer a
# password prompt. Restricted to exactly these commands on exactly these
# units — not a general sudo grant.
${USER} ALL=(root) NOPASSWD: /usr/bin/systemctl restart proteinhub-backend, \\
  /usr/bin/systemctl restart proteinhub-worker, \\
  /usr/bin/systemctl restart proteinhub-beat, \\
  /usr/bin/systemctl restart paknutrition-storefront, \\
  /usr/bin/systemctl restart nginx, \\
  /usr/bin/systemctl reload nginx, \\
  /usr/bin/systemctl is-active proteinhub-backend, \\
  /usr/bin/systemctl is-active proteinhub-worker, \\
  /usr/bin/systemctl is-active proteinhub-beat, \\
  /usr/bin/systemctl is-active paknutrition-storefront, \\
  /usr/bin/systemctl is-active nginx, \\
  /usr/bin/journalctl -u proteinhub-backend *, \\
  /usr/bin/journalctl -u proteinhub-worker *, \\
  /usr/bin/journalctl -u paknutrition-storefront *
SUDOERS
sudo chmod 440 /etc/sudoers.d/proteinhub-deploy
# visudo -c validates the whole sudoers tree; a broken file locks out sudo.
if sudo visudo -c >/dev/null 2>&1; then
    ok "sudoers rule installed and validated"
else
    sudo rm -f /etc/sudoers.d/proteinhub-deploy
    echo "sudoers validation FAILED — rule removed, nothing changed"; exit 1
fi

# ── 4. Environment ────────────────────────────────────────────────────────

info "Updating $ENV_FILE"
cp "$ENV_FILE" "${ENV_FILE}.bak.${STAMP}"
ok "backed up to ${ENV_FILE}.bak.${STAMP}"

set_env() {
    local key="$1" value="$2"
    # Values are written quoted: a generated SECRET_KEY contains # ( ) $ and
    # &, and anything that reads this file with `source` breaks on them. The
    # value is passed to Python via argv, never interpolated into the script,
    # so no character in it can be interpreted as shell or as a regex.
    python3 - "$ENV_FILE" "$key" "$value" <<'PYEOF'
import sys

path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(path).read().splitlines(keepends=True)

replacement = f'{key}="{value}"\n'
for index, line in enumerate(lines):
    if line.startswith(key + "="):
        lines[index] = replacement
        break
else:
    if lines and not lines[-1].endswith("\n"):
        lines[-1] += "\n"
    lines.append(replacement)

open(path, "w").writelines(lines)
PYEOF
    echo "  set     ${key}"
}

# A fresh 64-byte key. Rotating invalidates every session and JWT, which is
# the point: the old key was Django's development default and anything signed
# with it must stop being trusted.
NEW_SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')"
set_env SECRET_KEY "$NEW_SECRET"

# An unguessable admin path. Random, so it is not in any scanner's wordlist.
if grep -q '^ADMIN_URL=' "$ENV_FILE"; then
    ADMIN_PATH="$(sed -n 's/^ADMIN_URL="\?\([^"]*\)"\?/\1/p' "$ENV_FILE" | head -1)"
    ok "ADMIN_URL already set, leaving it alone"
else
    ADMIN_PATH="manage-$(python3 -c 'import secrets; print(secrets.token_hex(4))')/"
    set_env ADMIN_URL "$ADMIN_PATH"
fi

set_env CELERY_BROKER_URL "redis://127.0.0.1:6379/1"
set_env REDIS_URL         "redis://127.0.0.1:6379/0"

chmod 600 "$ENV_FILE"

# ── 5. nginx: make Django admin reachable at its new path ────────────────

info "Adding the Django admin location to nginx"
SITE=/etc/nginx/sites-available/proteinhub
if sudo grep -q "location /${ADMIN_PATH}" "$SITE" 2>/dev/null; then
    ok "already present"
else
    sudo cp "$SITE" "${SITE}.bak.${STAMP}"
    # Insert before the /api/ block so it is matched first.
    sudo python3 - "$SITE" "$ADMIN_PATH" <<'PY'
import sys
path, admin = sys.argv[1], sys.argv[2]
text = open(path).read()
block = f'''    location /{admin} {{
        proxy_pass http://127.0.0.1:8000/{admin};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}

'''
anchor = "    location /api/ {"
assert anchor in text, "could not find the /api/ block"
open(path, 'w').write(text.replace(anchor, block + anchor, 1))
PY
    if sudo nginx -t >/dev/null 2>&1; then
        sudo systemctl reload nginx
        ok "added and nginx reloaded (previous config saved as proteinhub.bak.${STAMP})"
    else
        sudo cp "${SITE}.bak.${STAMP}" "$SITE"
        echo "nginx config test FAILED — reverted, nothing changed"; exit 1
    fi
fi

# ── Done ──────────────────────────────────────────────────────────────────

info "Ready"
cat <<SUMMARY

  Redis            running on 127.0.0.1:6379
  Celery units     installed, not yet started (they need the new code)
  SECRET_KEY       rotated — everyone will be logged out at the next deploy
  ADMIN_URL        /${ADMIN_PATH}
  nginx            Django admin reachable at https://paknutrition.com/${ADMIN_PATH}

  Backups taken:
    ${ENV_FILE}.bak.${STAMP}
    ${SITE}.bak.${STAMP}

  The new settings take effect when the backend restarts, which the deploy
  does. Nothing has changed for customers yet.

  Next: push to main to deploy, then start the workers:
    sudo systemctl enable --now proteinhub-worker proteinhub-beat

SUMMARY
