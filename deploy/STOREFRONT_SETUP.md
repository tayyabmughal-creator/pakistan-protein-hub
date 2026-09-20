# Putting the storefront live on the current VPS

One-time setup. Everything here runs on the VPS as the deploy user, except
step 1 which is in GitHub.

The storefront ships as a **separate process** alongside the existing gunicorn
and nginx. Nothing about the backend or the SPA changes, and rolling back is
one commented-out line — see §6.

Until you finish step 4, deploys will build the storefront and then skip
starting it, printing a note. Nothing breaks in the meantime.

---

## 1. GitHub secrets

| Secret | Value | Why |
|---|---|---|
| `STOREFRONT_SITE_URL` | `https://paknutrition.com` | Baked into the client bundle at build time. Every canonical tag, Open Graph URL and sitemap entry uses it. **A restart cannot fix a wrong value — it needs a rebuild.** The deploy refuses to run without it. |
| `STOREFRONT_MEDIA_HOST` | `paknutrition.com` | Allow-list for `next/image`. Unset, every product image fails in production while working locally. |

## 2. Check Node

The storefront needs Node 20 or newer. The SPA build already uses Node, so it
is probably there:

```bash
node --version
```

If it is older than 20, upgrade before continuing — Next.js 15 will not run on
Node 18.

## 3. Set `ADMIN_URL` — do this before the next deploy

```bash
grep ADMIN_URL backend/.env || echo 'ADMIN_URL=secure-admin/' >> backend/.env
```

**This matters more than it looks.** nginx routes `/admin/*` to the staff SPA
screens and proxies Django admin at `ADMIN_URL`. If `ADMIN_URL` is still the
default, Django admin ends up at `/admin/`, which nginx now sends to the SPA —
Django admin becomes unreachable.

The backend refuses to start in production without a non-default `ADMIN_URL`,
so a mistake here fails the deploy rather than going unnoticed. After setting
it, Django admin moves to `https://paknutrition.com/secure-admin/`.

## 4. Install the systemd unit

```bash
cd "$PROJECT_PATH"

# Fill in the deploy user and project path first.
sed -e "s|REPLACE_WITH_DEPLOY_USER|$(whoami)|g" \
    -e "s|/REPLACE/WITH/PROJECT_PATH|$PWD|g" \
    deploy/paknutrition-storefront.service | sudo tee /etc/systemd/system/paknutrition-storefront.service

sudo systemctl daemon-reload
```

Build it once by hand before starting the service, so the first start has
something to serve:

```bash
cd storefront
npm ci
NEXT_PUBLIC_SITE_URL=https://paknutrition.com \
NEXT_PUBLIC_MEDIA_HOST=paknutrition.com \
API_BASE_URL=http://127.0.0.1:8000 \
npm run build
cd ..

sudo systemctl enable --now paknutrition-storefront
sudo systemctl status paknutrition-storefront --no-pager
```

Prove it renders before touching nginx:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/robots.txt   # 200
curl -s http://127.0.0.1:3000/products | head -c 300
```

If it fails: `sudo journalctl -u paknutrition-storefront -n 50 --no-pager`.

## 5. Point nginx at it

**This is the cutover.** Until this step the storefront is running but nobody
reaches it; after it, customers get the new store.

```bash
sudo cp deploy/nginx-storefront.conf /etc/nginx/snippets/
```

Then edit the site's server block — usually `/etc/nginx/sites-available/…` —
and add the include **above** the SPA's `location / { try_files … }`:

```nginx
server {
    # … existing ssl, server_name, root …

    include /etc/nginx/snippets/nginx-storefront.conf;   # <- add this

    location / {
        try_files $uri $uri/ /index.html;                # <- must stay last
    }
}
```

Also fix the Django admin proxy in the same file, if it still says `/admin/`:

```nginx
# was: location /admin/ { proxy_pass http://127.0.0.1:8000/admin/; }
location /secure-admin/ { proxy_pass http://127.0.0.1:8000/secure-admin/; }
```

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 6. Verify — and what each check catches

```bash
SITE=https://paknutrition.com

# The storefront is serving the public pages.
for p in / /products /categories /deals /checkout /track /sitemap.xml /robots.txt; do
  printf '%-16s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$SITE$p")"
done

# A missing product must be 404, not 200 with not-found content. A soft 404
# gets indexed by Google as a real page.
curl -s -o /dev/null -w 'missing product: %{http_code}\n' "$SITE/products/does-not-exist"

# The staff screens still reach the SPA, not Django.
curl -s -o /dev/null -w 'staff admin:      %{http_code}\n' "$SITE/admin/inventory"

# Django admin moved.
curl -s -o /dev/null -w 'django admin:     %{http_code}\n' "$SITE/secure-admin/"

# Account pages still reach the SPA.
curl -s -o /dev/null -w 'login:            %{http_code}\n' "$SITE/login"

# Canonical tags name the real host — not localhost, not a preview domain.
curl -s "$SITE/products/<a-real-slug>" | grep -o '<link rel="canonical"[^>]*>'

# Product images load through the optimiser.
curl -s "$SITE/products" | grep -o '/_next/image?url=[^"]*' | head -1
```

Expect `200` for everything except the missing product, which must be `404`.

Then buy something. Add an item, check out with cash on delivery, and confirm
the order appears in the staff screens with the right total and that stock went
down by one. A storefront that renders is not the same as a storefront that
sells.

## 7. Rolling back

The storefront is independent of the backend and holds no data of its own.

**Stop serving it, keep everything else:**

```bash
sudo sed -i 's|^\s*include /etc/nginx/snippets/nginx-storefront.conf;|#&|' /etc/nginx/sites-available/<site>
sudo nginx -t && sudo systemctl reload nginx
```

Every route falls through to the SPA, which still has its own homepage and
product pages. That is why they have not been deleted, and why they should not
be deleted until the storefront has run for a while.

**Stop the process too:**

```bash
sudo systemctl stop paknutrition-storefront
```

Neither affects the API, the database, or any order.
