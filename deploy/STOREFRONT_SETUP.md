# Putting the storefront live on the current VPS

One-time setup. Everything runs on the VPS as the deploy user (`tayyab`),
except step 1, which is in GitHub.

The storefront ships as a **separate process** alongside the existing gunicorn
and nginx. Nothing about the backend or the SPA changes, and rolling back is
one commented-out line — see §8.

Until step 5 is done, deploys skip the storefront entirely (the deploy checks
for the systemd unit). Nothing breaks in the meantime.

Scripts referenced here live in `deploy/` and are copied to `/tmp` on the VPS
to run: `scp deploy/<script> personalVps:/tmp/`.

---

## Already done (2026-09-22)

- `ADMIN_URL` — set by `deploy/vps-prepare.sh` to a random `manage-…/` prefix,
  with a matching nginx `location`.
- `127.0.0.1` in `ALLOWED_HOSTS` — the storefront and the deploy's readiness
  probe call gunicorn directly on loopback, sending `X-Forwarded-Proto: https`
  (`storefront/src/lib/internal-api.ts`).
- Node 22 for the deploy user at `~/.local/node22` — see §2.

## 1. GitHub secrets

| Secret | Value | Why |
|---|---|---|
| `STOREFRONT_SITE_URL` | `https://paknutrition.com` | Baked into the client bundle at build time. Every canonical tag, Open Graph URL and sitemap entry uses it. **A restart cannot fix a wrong value — it needs a rebuild.** The deploy refuses to build the storefront without it. |
| `STOREFRONT_MEDIA_HOST` | `paknutrition.com` | Allow-list for `next/image`. Unset, every product image fails in production while working locally. |

```bash
gh secret set STOREFRONT_SITE_URL   --body 'https://paknutrition.com'
gh secret set STOREFRONT_MEDIA_HOST --body 'paknutrition.com'
```

## 2. Node 22, for the deploy user only

The system Node (`/usr/bin/node`, apt) is 18 and other services on this shared
box run on it — do not upgrade it. CI builds and tests the storefront on Node
22, so production uses the same:

```bash
scp deploy/install-storefront-node.sh personalVps:/tmp/
ssh personalVps 'bash /tmp/install-storefront-node.sh'
```

No sudo; installs under `~/.local` and points `~/.local/node22` at it,
verified against nodejs.org's SHA-256. Both the systemd unit and the deploy
workflow use `~/.local/node22/bin`, so re-running it later upgrades both.

## 3. Absolute `MEDIA_URL`

API responses build image URLs from the request's Host. The storefront calls
the API on `127.0.0.1:8000`, so without this every product image points at
`https://127.0.0.1:8000/media/…`, which no browser can load and `next/image`
rejects.

```bash
scp deploy/set-backend-env.sh personalVps:/tmp/
ssh personalVps 'bash /tmp/set-backend-env.sh \
    MEDIA_URL=https://paknutrition.com/media/ \
    BACKEND_PUBLIC_URL=https://paknutrition.com'
```

Check it took:

```bash
curl -s -H 'X-Forwarded-Proto: https' http://127.0.0.1:8000/api/v2/storefront/products/ \
  | grep -o '"url": *"[^"]*"' | head -1        # https://paknutrition.com/media/...
```

## 4. Health routes in nginx

So `/healthz` and `/readyz` reach Django rather than the SPA fallback — needed
to monitor the cutover honestly:

```bash
scp deploy/nginx-add-health-routes.sh personalVps:/tmp/
ssh -t personalVps 'bash /tmp/nginx-add-health-routes.sh'
```

## 5. Install the systemd unit and build once

```bash
cd ~/pakistan-protein-hub

sed -e "s|REPLACE_WITH_DEPLOY_USER|$(whoami)|g" \
    -e "s|/REPLACE/WITH/PROJECT_PATH|$PWD|g" \
    deploy/paknutrition-storefront.service | sudo tee /etc/systemd/system/paknutrition-storefront.service >/dev/null
grep -n REPLACE /etc/systemd/system/paknutrition-storefront.service   # must print nothing
sudo systemctl daemon-reload
```

Build before the first start, so it has something to serve. The unit runs
`.next/standalone/server.js` (next.config sets `output: "standalone"`, which
`next start` does not support), so the build is followed by
`assemble:standalone`, exactly as the deploy does:

```bash
cd storefront
export PATH="$HOME/.local/node22/bin:$PATH"
npm ci
NEXT_PUBLIC_SITE_URL=https://paknutrition.com \
NEXT_PUBLIC_MEDIA_HOST=paknutrition.com \
API_BASE_URL=http://127.0.0.1:8000 \
npm run build
npm run assemble:standalone
cd ..

sudo systemctl enable --now paknutrition-storefront
sudo systemctl status paknutrition-storefront --no-pager
```

Prove it renders before touching nginx:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/robots.txt   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/products     # 200
img=$(curl -s http://127.0.0.1:3000/products | grep -o '/_next/image?url=[^"]*' | head -1 | sed 's/&amp;/\&/g')
curl -s -o /dev/null -w 'image: %{http_code} %{content_type}\n' "http://127.0.0.1:3000$img"   # 200 image/...
```

If it fails: `sudo journalctl -u paknutrition-storefront -n 50 --no-pager`.

From here on, every deploy rebuilds and restarts it.

## 6. Point nginx at it — the cutover

**Until this step the storefront runs but nobody reaches it; after it,
customers get the new store.** Back up first:

```bash
SITE=/etc/nginx/sites-available/proteinhub
sudo cp "$SITE" "$SITE.bak.$(date -u +%Y%m%dT%H%M%SZ)"
sudo cp deploy/nginx-storefront.conf /etc/nginx/snippets/
```

Add the include to the 443 `server { }` block, **above** `location / {`:

```nginx
    include /etc/nginx/snippets/nginx-storefront.conf;   # <- add this

    location / {
        try_files $uri /index.html;                      # <- must stay last
    }
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

The snippet routes `/`, `/products*`, `/categories*`, `/deals*`, `/checkout*`,
`/track*`, `/order-confirmation/*`, the seven info pages, `/sitemap.xml`,
`/robots.txt` and `/_next/*` to the storefront, and redirects `/cart` to
`/checkout`. Staff screens (`/admin/*`), accounts (`/login`, `/register`,
`/profile`, `/orders`), `/api/`, Django admin and media stay where they are.

If the storefront process is down, its page routes fall back to the SPA
(`error_page 502 504 = /index.html`) instead of showing customers an error.

## 7. Verify

```bash
SITE=https://paknutrition.com

for p in / /products /categories /deals /checkout /track /about /contact /faq \
         /privacy /returns /shipping /terms /sitemap.xml /robots.txt; do
  printf '%-16s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$SITE$p")"
done

# A missing product must be 404, not a 200 "not found" page Google indexes.
curl -s -o /dev/null -w 'missing product: %{http_code}\n' "$SITE/products/does-not-exist"

# These stay on the SPA / Django.
curl -s -o /dev/null -w 'staff admin:     %{http_code}\n' "$SITE/admin/orders"
curl -s -o /dev/null -w 'login:           %{http_code}\n' "$SITE/login"
curl -s "$SITE/healthz"; echo

# Canonical tags and images name the real host.
curl -s "$SITE/products/<a-real-slug>" | grep -o '<link rel="canonical"[^>]*>'
curl -s "$SITE/products" | grep -o '/_next/image?url=[^"]*' | head -1   # url=https%3A%2F%2Fpaknutrition.com...
```

Expect `200` everywhere except the missing product (`404`).

Then buy something: add an item, check out with cash on delivery, confirm the
order appears in the staff screens with the right total and that stock went
down by one, then cancel it. A storefront that renders is not the same as one
that sells.

## 8. Rolling back

The storefront holds no data of its own; orders go straight to Django.

**Stop serving it, keep everything else** (seconds):

```bash
sudo sed -i 's|^\s*include /etc/nginx/snippets/nginx-storefront.conf;|#&|' /etc/nginx/sites-available/proteinhub
sudo nginx -t && sudo systemctl reload nginx
```

Every route falls through to the SPA, which still has its own homepage and
product pages — which is why they have not been deleted, and should not be
until the storefront has run for a while. Restoring the backup taken in §6
does the same.

**Stop the process too:**

```bash
sudo systemctl disable --now paknutrition-storefront
```

Neither affects the API, the database, or any order.
