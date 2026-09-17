# Pak Nutrition — Implementation Baseline

**Date:** 2026-09-17
**Architecture decision:** Option C — Hybrid / Selective Migration
**Canonical repository:** `PN/` = `/Users/user/Desktop/ProteinHub/pakistan-protein-hub/`
**Reference implementation (read-only):** `EO/` = `/Users/user/Desktop/enfhantOrganic/`

This document records what was inspected, what actually exists today, what will
change, and in what order. It is the contract for the phased implementation.
Nothing in PN was modified while producing it.

---

## 1. Current Git state

### PN (canonical)

| Item | Value |
| --- | --- |
| Remote | `git@github.com:tayyabmughal-creator/pakistan-protein-hub.git` |
| Current branch | `main` |
| HEAD | `4dcc88a` — *Improve Expo push diagnostics for admin notifications* |
| Remote branches | `origin/main`, `origin/abdul`, `origin/adeel` |
| Working tree | dirty |

Uncommitted changes at baseline (preserved, not touched):

```
 M backend/db.sqlite3          # tracked binary DB, locally modified
 M backend/**/__pycache__/*.pyc  (136 tracked .pyc files churn on every run)
?? Archive.zip                 # 60 MB untracked archive at repo root
?? frontend/Archive.zip        # untracked archive
?? admin-mobile/ios/           # untracked Expo native output
```

Recent history (most recent first):

```
4dcc88a Improve Expo push diagnostics for admin notifications
8c270ef Add admin mobile app and push registration backend
90bae2a Fix order flows and add payment review tools
cdd165a Make admin panel mobile responsive
bd90708 Enhance admin workflows and add store blueprint
fb3f743 Refine promotions, homepage deals, and checkout promo flow
01e0b3a Harden VPS deploy to reset to origin/main
```

**Workflow safety note:** `origin/abdul` and `origin/adeel` are other
contributors' branches. No history rewriting, rebasing, force-pushing or branch
deletion will be performed. All Phase 0+ work lands in focused commits on a new
branch off `main`.

### EO (reference only)

HEAD `9f95b2b`. Used strictly as **specification and behavioural reference**.
No EO Git history, no EO `store` application, no EO components, and no EO
multi-country/multi-currency architecture will be merged into PN.

---

## 2. PN architecture discovered

### 2.1 Backend — Django 5.2 project `config`, seven local apps

```
backend/
├── config/            settings.py (299 lines), urls.py, wsgi, asgi
├── users/             User(AbstractUser, email login), Address, AdminDevice
├── products/          Category, Product, StockService
├── cart/              Cart (OneToOne user), CartItem (price_snapshot)
├── orders/            Order, OrderItem, PaymentSession
│                      services.py (744 lines) — the commerce core
│                      views.py / views_admin.py / serializers.py
├── reviews/           Review (1..5, unique per user+product)
├── promotions/        Promotion (percentage-only coupon)
├── storefront/        HomePageSettings singleton, admin dashboard + CSV reports
└── common/            custom DRF exception handler
```

Domain boundaries are already reasonable — PN is **not** a single-app monolith
like EO's `store`. This is a genuine PN advantage and will be preserved and
extended, not flattened.

**Stack facts confirmed:**

- `SECRET_KEY` is env-only and raises `RuntimeError` when absent — already correct.
- Database: PostgreSQL when `POSTGRES_DB` is set, otherwise **SQLite fallback**.
- Auth: SimpleJWT, 15 min access / 7 day refresh, rotation + blacklist enabled.
- No Redis. No Celery. No cache backend. Notifications send **inline**.
- DRF throttling configured (`anon 100/day`, `user 1000/day`, `auth_burst 5/min`).
- Security headers/HSTS/SSL-redirect all driven from env, default-secure when
  `DEBUG=False`.
- `drf-spectacular` schema at `/api/schema/`, Swagger at `/api/docs/`.
- Logging: single console handler, root INFO, no structure, no correlation id.

**Current model shapes (abbreviated):**

```python
Product(name, slug, category→FK, brand=CharField, weight=CharField,
        description, price, discount_price, show_sale_badge,
        stock=PositiveInteger, image=ImageField, is_active)
        # price + stock + image live directly on Product. No variants. No SKU.

Order(user|guest_*, promotion, applied_promo_code, subtotal_amount,
      discount_amount, shipping_fee, total_amount, shipping_address=TextField,
      payment_method, payment_provider, payment_reference, payment_tracker,
      payment_payload=JSON, payment_status ∈ {PENDING,PAID,FAILED},
      paid_at, status ∈ {PENDING,CONFIRMED,SHIPPED,DELIVERED,CANCELLED})
      # payment_status and status exist separately — good.
      # No fulfilment status distinct from order status. No history/audit rows.

OrderItem(order, product→SET_NULL, product_name, quantity, price)
      # Snapshots name + price only. No SKU, no variant, no line discount,
      # no line total.

PaymentSession(public_id=UUID4, …full checkout snapshot…, items_snapshot=JSON,
               gateway_tracker, gateway_reference, gateway_payload,
               checkout_url, status, order→FK)
```

**Tests:** 36 backend tests, **all passing** at baseline (`pytest -q` → `36 passed`).
`pytest.ini` `testpaths` omits `storefront`, so the 127 lines of storefront tests
**never run in CI or locally**.

### 2.2 Frontend — Vite + React 18 SPA

`frontend/` — React Router v6, TanStack Query, axios, shadcn/Radix, Tailwind,
`lovable-tagger`. 23 public pages + 11 admin pages under `src/pages/admin/`.
No test runner, no `typecheck` script, no Next.js.

### 2.3 Other deployables

- `admin-mobile/` — Expo admin app with push registration (backed by
  `users.AdminDevice` + `EXPO_PUSH_ACCESS_TOKEN`).
- `docker-compose.prod.yml` — Postgres 16 + backend + frontend/nginx. Exists but
  the **actual production deploy does not use it**.

### 2.4 Deployment as actually practised

`.github/workflows/deploy.yml` on push to `main`: SSH to VPS →
`git reset --hard origin/main` → `pip install -r requirements.txt` →
`migrate` → `collectstatic` → `npm ci && npm run build` → `systemctl restart`.

No tests, no lint, no typecheck, no secret scan, no dependency scan, no backup,
no build artefact, no rollback path, no health check beyond `systemctl is-active`.
Mutable in-place deployment directly on the production tree.

---

## 3. EO reference components discovered

Studied as specification only. Nothing copied.

| EO location | Behaviour worth reusing | Verdict |
| --- | --- | --- |
| `backend/store/api_views/payments.py:74` `_apply_webhook_update` | Server-to-server webhook is authoritative; `select_for_update` on the order inside `transaction.atomic`; idempotency by `(provider, provider_reference)` already-final check; provider status → order state mapping; inventory commit only after verified paid; CAPI purchase enqueued server-side because the browser thank-you page may never be reached | **Specification.** Rewrite for PN with the amount/currency verification EO lacks. |
| `backend/store/services/stock.py` | `reserve → commit → release` lifecycle; per-item idempotency flag so a retried commit is a no-op; clamping committed qty against current reserved/on-hand; explicit release on failure/cancel; separate `reserved_quantity` from `quantity` | **Specification.** PN gets a proper `StockMovement` ledger instead of EO's JSON-blob allocations. |
| `backend/store/services/admin_audit.py` | `_SENSITIVE_KEY_HINTS` redaction of secrets in before/after snapshots, with `public`/`publishable` explicitly exempt; typed serialisation of Decimal/UUID/datetime/FieldFile for JSON storage | **Behaviour ported** (small, well-factored, directly applicable). |
| `backend/store/services/admin_roles.py` | Capability constants (`orders.view`, `inventory.edit`, …) mapped to Django `Group`s; deny-by-default | **Specification.** PN gets 4 roles, not EO's 6, and a much smaller capability set. |
| `backend/store/domain_models/commerce.py:62` `STATUS_TRANSITIONS` | Explicit allowed-transition map + `can_transition_to` / `transition_to(actor, note)` | **Specification.** PN needs a *fulfilment* transition map, separate from payment state. |
| `backend/store/services/meta_capi.py` | Outbox + retry model, deterministic event ids for browser/server dedup | **Specification** (Phase 5). |
| `backend/store/services/search.py` | PostgreSQL full-text + trigram, no Elasticsearch | **Specification** (Phase 2/6). |
| `.github/workflows/ci.yml` | Split backend/frontend jobs; `manage.py check --deploy` as a distinct gate | **Specification.** PN CI additionally needs migration-consistency, secret scan and dependency scan, which EO's CI has none of. |

**Explicitly NOT taken from EO:** the single `store` app, `Region`/multi-country,
multi-currency, regional prices, Gulf taxes, Paymob/PayTabs/Thawani/OmanNet,
Arabic storefront, warehouse transfers, gift cards, the 1199-line `admin.py`,
the 35+ item admin sidebar, and the dense conversion overlays.

---

## 4. Phase 0 — exact issues confirmed

Each item below was verified against the actual code, not assumed.

### A. Repository sensitive-data exposure — CONFIRMED, includes live-credential exposure

**A1. `backend/data.json` is tracked** (52 KB, 149 records) and contains:

| Records | Model | Sensitive content |
| --- | --- | --- |
| 73 | `token_blacklist.outstandingtoken` | **Full JWT refresh tokens** (`eyJhbGciOiJIUzI1NiIs…`), expiry Feb 2026 |
| 14 | `token_blacklist.blacklistedtoken` | — |
| 7 | `users.user` | **PBKDF2 password hashes**, real customer emails incl. `adeel.ahmed83q@gmail.com`, `iamabyes10@gmail.com`; three `is_superuser=True` accounts |
| 5 | `users.address` | Names, phone numbers, street addresses (PII) |
| 10 + 14 | `orders.order` / `orderitem` | Order + financial history |
| 1 | `sessions.session` | Session data |

**A2. `backend/db.sqlite3` is tracked** (393 KB) despite `*.sqlite3` being in
`.gitignore` — the file was committed *before* the ignore rule, and `.gitignore`
does not apply to already-tracked files. It shows as modified on every local run.
Present in 6 commits including `5f61f8a`, `ea88fa7`, `b49cf48`.

**A3. Git history contains a committed `backend/.env` — real credentials.**
Present in commits `e504279`, `ca4def3`, `b49cf48`, `b9dfa12`. Contents at
`b49cf48`:

| Variable | Status |
| --- | --- |
| `SECRET_KEY` | `django-insecure-…` Django signing key — **exposed** |
| `DB_PASSWORD` | Postgres password — **exposed** |
| `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` | **Brevo SMTP relay credentials — exposed. Highest-priority rotation.** |
| `JWT_SECRET` | Legacy MongoDB-era secret — **exposed**, obsolete |

Verified: the *current* local `backend/.env` no longer uses these values
(`SECRET_KEY` is now a `local-dev-secret…` placeholder and `EMAIL_HOST_PASSWORD`
is absent locally). **Production secrets live in `backend/.env` on the VPS and
were not inspected**, so whether the exposed Brevo credential is still live in
production cannot be determined from this repository. See §10 R-1.

**A4. Repo hygiene:** 136 `.pyc` files tracked under `__pycache__/`, 26 tracked
files under `backend/media/`, stray `build_log*.txt` / `diag_output.txt` /
`test_results.txt`, and two untracked `Archive.zip` blobs (one 60 MB).

**A5. No secret scanning, no pre-commit hooks, no CI guard** preventing the next
DB dump or `.env` from being committed.

### B. Safepay payment flaw — CONFIRMED EXPLOITABLE

There is **no webhook**. The browser return URL *is* the authority.
`backend/orders/views.py:232` `SafepayReturnView._handle_callback`:

```python
callback   = SafepayGateway.extract_callback_payload(payload)   # all from query string
public_id  = callback.get("public_id", "")                      # ← caller-supplied
SafepayGateway.verify_signature(tracker=callback["tracker"],    # ← caller-supplied
                                signature=callback["signature"])
order = PaymentSessionService.complete_session(public_id=public_id, …)  # ← marks PAID
```

`verify_signature` (`services.py:357`) computes
`HMAC-SHA256(shared_secret, tracker)` and compares it to the supplied signature.
**It proves only that the tracker string is genuine. It never binds the tracker
to `public_id`.** `complete_session` (`services.py:645`) then completes whatever
session the caller named, and `create_paid_order_from_session` writes
`payment_status="PAID"`, `status="CONFIRMED"`, `paid_at=now()`.

**Working exploit:** pay for a cheap session A → capture the signed
`tracker`+`signature` from your own return URL → create an expensive session B →
`GET /api/orders/payments/safepay/return/?order_id=<B.public_id>&tracker=<A's tracker>&signature=<A's signature>`.
Session B is marked paid and confirmed. Free goods, repeatable indefinitely.

Compounding defects in the same path:

1. **No amount verification** — the provider-reported amount is never compared to
   `session.total_amount`.
2. **No currency verification** — `"PKR"` is sent at init and never checked on return.
3. **No replay protection** — one signed tracker is reusable forever, across any
   number of sessions.
4. **No tracker↔session binding** — `session.gateway_tracker` is stored at init
   and never compared against the callback tracker.
5. **No server-to-server verification** — the provider is never asked to confirm.
6. **`PaymentSession` is not a `PaymentTransaction`** — no provider-reference
   uniqueness constraint, so no database-level idempotency.
7. **Stock is deducted at order creation** inside `_create_order_from_snapshot`,
   so a failed/cancelled online payment silently consumes inventory until someone
   cancels the order manually.
8. **Notifications are sent inside the checkout DB transaction**
   (`services.py:480-481`) — a slow SMTP/Expo call holds row locks open.

*Correctly handled already:* `cancel_session` and `mark_review_required` both
return early when `status == "COMPLETED"`, so a cancellation callback cannot
overwrite paid state. This behaviour is preserved.

### C. Revenue correctness — CONFIRMED

`backend/storefront/views_admin.py:37`:

```python
revenue_source = Order.objects.exclude(status="CANCELLED")
```

`total_revenue`, `monthly_revenue`, `avg_order_value` and `revenue_trend` all sum
`total_amount` over this population — which **includes `payment_status="PENDING"`
orders, unpaid COD orders that were never delivered, and orders whose payment
`FAILED`**. Meanwhile `top_products` (line 101) filters
`OrderItem.exclude(order__status="CANCELLED")` — a *different* population
computed from line items rather than order totals, so the two widgets can and do
disagree while both being labelled "revenue". No metric publishes its definition.

### D. Cart repricing — CONFIRMED

`CheckoutPreparationService.prepare_registered_checkout` (`services.py:95`):

```python
price = _to_money(item.price_snapshot if item.price_snapshot else item.product.final_price)
```

`CartItem.price_snapshot` is written **once, at add-to-cart time**
(`cart/models.py` `save()`), and is then treated as the checkout price. A cart
left open across a price rise checks out at the old price. Guest checkout
(`prepare_guest_checkout`) correctly uses `product.final_price`, so the two paths
disagree.

Additional confirmed defects in the same transaction:

- **Coupon usage is a read-modify-write race:**
  `Promotion.objects.filter(id=…).update(used_count=promotion.used_count + 1)`
  (`services.py:471`) reads `used_count` in Python. Concurrent redemptions
  overrun `usage_limit`. Must become `F("used_count") + 1` with a conditional
  `used_count__lt=usage_limit` guard.
- **No product-active / availability revalidation at checkout** — a product
  deactivated after add-to-cart still sells.
- **`StockService.deduct_stock` calls `product.save()`** (all fields), which
  clobbers concurrent price/description edits made during the lock window.
- **`select_for_update` is a silent no-op on the SQLite fallback**, so none of
  the locking guarantees hold unless Postgres is configured.

### E. Frontend quality baseline — CONFIRMED

`npx eslint .` → **127 problems (111 errors, 16 warnings)**.
`npx tsc -p tsconfig.app.json --noEmit` → **501 error lines**.

Root cause of the parse failures: **five tracked files are entirely NUL bytes** —
corrupted content, committed in that state (verified `git show HEAD:<path>` is
also all-NUL, so history holds no clean copy):

| File | Size | Used by |
| --- | --- | --- |
| `frontend/src/vite-env.d.ts` | 38 B | TS ambient types |
| `frontend/src/App.css` | 606 B | — |
| `frontend/src/components/ui/aspect-ratio.tsx` | 143 B | — |
| `frontend/src/components/ui/collapsible.tsx` | 320 B | `ui/sidebar.tsx`, `pages/FAQ.tsx` |
| `frontend/public/robots.txt` | 160 B | **served to crawlers as binary garbage** |

The remaining 111 lint errors are overwhelmingly
`@typescript-eslint/no-explicit-any` concentrated in `src/pages/admin/*`, plus one
`no-require-imports` in `tailwind.config.ts`. 16 `react-hooks/exhaustive-deps`
warnings. No CI gate enforces any of it.

### F. Additional confirmed issues (not in the original audit list)

- **`AdminOrderSerializer` is a writable `ModelSerializer` on
  `RetrieveUpdateAPIView`** (`orders/views_admin.py:20`). Its
  `read_only_fields` omit `payment_status`, `paid_at`, `subtotal_amount`,
  `discount_amount`, `total_amount` is read-only but `payment_reference`,
  `payment_tracker` and `applied_promo_code` are writable. Any staff user can
  `PATCH` an order to `payment_status="PAID"` with no service, no invariant, no
  stock consequence and no audit trail.
- **Unpinned dependencies:** `requirements.txt` says `Django>=4.2`; every other
  line is unpinned entirely. A fresh install in this session resolved to
  **Django 5.2.17** while the machine's system Python has 4.2.16 — the deploy
  script runs `pip install -r requirements.txt` on the production host, so the
  production Django version is whatever PyPI serves that day.
- **JWT access *and* refresh tokens in `localStorage`**
  (`frontend/src/context/AuthContext.tsx:45-47`, `lib/apiClient.ts`) — XSS-readable.
- **Unverifiable marketing claims shipped as defaults** in `HomePageSettings`:
  "Pakistan's #1 Supplement Store", "50K+ Happy Customers", "24hr Fast Delivery".
  §19 forbids these unless defensible.
- **`storefront` tests excluded from `pytest.ini` `testpaths`** — they have never run.

---

## 5. Target file / module mapping

`KEEP` · `REFACTOR` · `PORT` (behaviour from EO) · `REWRITE` · `NEW` · `DROP`

| # | PN component | Problem | Target design | EO reuse | Verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | `backend/data.json`, `db.sqlite3` | PII, hashes, JWTs, DB in Git | untracked; generated fixtures only | — | **DROP from index** |
| 2 | `.gitignore` + new `scripts/check_repo_hygiene.py` | nothing blocks re-commit | deny DB dumps/PII exports/secrets; CI gate | — | **NEW** |
| 3 | `orders/services.py` `SafepayGateway` | tracker↔session unbound | `payments/` module: provider adapter + `PaymentTransaction` + signed webhook + reconciliation | EO `_apply_webhook_update` as spec | **REWRITE** |
| 4 | `orders/views.py` `SafepayReturnView` | browser return marks PAID | observational only; redirect + poll | EO spec | **REWRITE** |
| 5 | *(new)* `payments/` app | none exists | `PaymentTransaction`, adapters, webhook views, replay table | EO spec | **NEW** |
| 6 | `storefront/views_admin.py` metrics | revenue counts unpaid | `operations/metrics.py`, one definition per metric, exposed in API | — | **REFACTOR** |
| 7 | `orders/services.py` checkout | snapshot pricing, coupon race | server repricing inside locked transaction; `F()` coupon guard | — | **REFACTOR** |
| 8 | `products/services.py` `StockService` | product-level stock, full `save()` | `inventory/` app: `InventoryLocation`, `InventoryBalance`, `StockMovement`, reservations | EO reserve/commit/release as spec | **NEW + REFACTOR** |
| 9 | `products/models.py` `Product` | price/stock/image on product; brand string | `Brand`, `Product` (content), `ProductVariant` (SKU/price), `ProductMedia` | — | **REFACTOR (additive)** |
| 10 | `orders/models.py` `Order` | no fulfilment status, thin snapshots | payment/fulfilment split, `OrderHistory`, richer `OrderItem` snapshot, `sales_channel` | EO transition map as spec | **REFACTOR** |
| 11 | `orders/views_admin.py` | writable financial serializer | explicit command endpoints + capability checks + audit | — | **REWRITE** |
| 12 | *(new)* `operations/` app | none | `AdminAuditLog`, reports, imports/exports | EO `admin_audit` redaction **ported** | **NEW** |
| 13 | *(new)* RBAC in `users/` | `is_staff` only | 4 roles → capabilities, deny by default | EO `admin_roles` as spec | **NEW** |
| 14 | `frontend/src/**` (5 NUL files) | corrupt, unparseable | reconstructed from known-good shadcn/Vite sources | — | **REWRITE** |
| 15 | `frontend` lint/type debt | 111 errors / 501 type errors | typed API client; CI gate | — | **REFACTOR** |
| 16 | `requirements.txt` | `Django>=4.2` | pinned `==` for all runtime deps | — | **REWRITE** |
| 17 | `.github/workflows/` | deploy without gates | `ci.yml` (migrations, checks, tests, lint, typecheck, build, secret + dep scan) then gated deploy | EO `ci.yml` as spec | **NEW + REFACTOR** |
| 18 | *(new)* backup/restore commands | none | `pg_dump`/`pg_restore` workflow + documented drill | — | **NEW** |
| 19 | `frontend/` Vite SPA | no SSR/SEO | Next.js App Router storefront, PN URLs preserved | — | **REWRITE (Phase 3)** |
| 20 | EO `Region`, multi-currency, Gulf PSPs, gift cards | — | — | — | **NOT BUILT** |

---

## 6. Planned migrations

All additive first; nothing destructive before cutover.

| Phase | App | Migration | Backward compatible? |
| --- | --- | --- | --- |
| 0 | `orders` | `PaymentSession`: add `expires_at`, `amount_verified`, unique `gateway_tracker` | Yes — nullable/defaulted |
| 0 | `payments` *(new)* | `PaymentTransaction` (order, provider, `provider_reference`, amount, currency, status, raw payload; **unique `(provider, provider_reference)`**), `WebhookEvent` (replay detection) | Yes — new tables |
| 0 | `promotions` | `Promotion`: `CheckConstraint(used_count <= usage_limit)` | Yes — validate existing rows first |
| 1 | — | none | — |
| 2 | `catalog` | `Brand`; `Product` +SEO/benefits/ingredients/nutrition/usage/warnings/goal tags/publish status; `ProductVariant` (SKU unique, flavor, weight, serving count, price, compare price); `ProductMedia` | Yes — legacy `Product.price/stock/image` retained and dual-written until cutover |
| 2 | `inventory` *(new)* | `InventoryLocation`, `InventoryBalance` (unique `variant+location`, `on_hand`, `reserved`, `CheckConstraint(reserved >= 0, on_hand >= 0)`), `StockMovement` (immutable ledger), `StockReservation` | Yes — new tables |
| 2 | `orders` | `Order`: `fulfilment_status`, `sales_channel`, payment status enum widened; `OrderItem`: `sku`, `variant`, `variant_description`, `unit_price`, `line_discount`, `line_total`; `OrderHistory` | Yes — defaults backfilled from existing columns |
| 4 | `operations` *(new)* | `AdminAuditLog` | Yes |
| 4 | `users` | `StaffRole` / capability mapping | Yes |

Data migration commands (Phase 2, all `--dry-run` capable and idempotent):
`audit_legacy_data`, `migrate_catalog_v2`, `migrate_inventory_v2`,
`migrate_orders_v2`, `verify_migration`.

---

## 7. Backward compatibility

- **Public API contract is preserved.** No existing endpoint is removed or
  renamed during Phase 0–2. New capability lives at new paths.
- The Vite SPA and the Expo admin app keep working throughout. The Next.js
  storefront is built beside the SPA and only becomes canonical at Phase 3 cutover.
- **JWT remains valid for mobile/API clients.** Cookie auth is added for the web
  origin alongside it, not instead of it.
- `Product.price` / `Product.stock` remain readable and correct after the
  variant/inventory migration (derived from default variant + balance) until the
  SPA is retired.
- Product slugs and `/products/{slug}` URLs are preserved; a URL map with
  explicit 301s is produced before any cutover.
- Historical orders are never rewritten. New snapshot columns are backfilled from
  existing data, and existing financial values are left untouched.

---

## 8. Implementation sequence

Phase order is mandatory; a phase ships as its own focused commit(s).

**Phase 0 — critical safety** *(in progress)*
1. Repo hygiene: untrack `data.json`, `db.sqlite3`, `.pyc`, stray logs; harden
   `.gitignore`; add repo-hygiene + secret-scan checks. Write rotation
   requirements for the credentials found in history. **History rewrite is not
   performed — it requires owner approval (§10 R-1).**
2. Payments rebuild: `PaymentTransaction`, tracker↔session binding, amount +
   currency verification, server-to-server verification, idempotency, replay
   detection, webhook endpoint authoritative, browser return observational.
3. Revenue correctness: settled-revenue definition, payment/fulfilment split in
   metrics, definitions exposed.
4. Checkout repricing: server-authoritative prices inside the locked transaction,
   coupon concurrency safety, availability revalidation, notifications moved out
   of the transaction.
5. Frontend baseline: repair the 5 NUL files, clear lint/type errors, add CI gate.
6. Lock down `AdminOrderSerializer` behind explicit commands.

**Phase 1** — pinned deps, Redis + Celery, full CI, immutable deploy with
migration step and rollback, structured logging + health endpoint, backup/restore
with a rehearsed drill.

**Phase 2** — `Brand`/`Product`/`ProductVariant`/`ProductMedia`; `inventory` app
with ledger and reservations; order lifecycle upgrade; returns/refunds; migration
commands.

**Phase 3** — Next.js App Router storefront (PN identity: black/charcoal/green,
performance retail), homepage, collection, product page, cart drawer, checkout,
confirmation + tracking.

**Phase 4** — responsive admin: overview, orders, catalog, inventory, customers;
RBAC; audit log.

**Phase 5** — typed commerce event contract, Meta Pixel + CAPI with dedup and
consent gating, GA4, attribution on order, notification delivery logs.

**Phase 6** — SSR/ISR, metadata, JSON-LD, sitemap/robots, URL map + 301s, media
pipeline, caching, indexes, query-count tests.

**Phase 7** — advanced conversion, only after the above is stable.

---

## 9. Test plan

Business invariants, not coverage percentages.

**Payments (Phase 0, written first):** valid webhook · invalid signature ·
replayed webhook · wrong amount · wrong currency · tracker/session mismatch
*(the live exploit — this test must fail against current code and pass after)* ·
duplicate webhook · already-processed payment · late webhook · browser return
before webhook · browser return after webhook · cancel callback cannot overwrite
paid.

**Checkout/pricing (Phase 0):** price rise between add-to-cart and checkout ·
deactivated product at checkout · out-of-stock at checkout · coupon at usage
limit under concurrency · coupon expiry mid-checkout · totals arithmetic ·
free-shipping threshold boundary.

**Revenue (Phase 0):** pending COD excluded · failed payment excluded ·
cancelled excluded · refunded handled · dashboard widgets agree on population.

**Inventory (Phase 2):** reserve → commit → release round trip · concurrent
purchase of the final unit · cancellation compensates exactly · return restores ·
`available` never negative · ledger sums equal balances.

**Orders (Phase 2):** legal and illegal transitions · history rows recorded ·
snapshots immutable after catalogue edits.

**RBAC (Phase 4):** every privileged endpoint denies without capability.

**Frontend:** variant selection and price switching · availability · add to cart ·
cart · checkout · admin permission gating · analytics payload mapping.

**E2E:** ad landing → product → cart → guest COD → fulfilment → tracking ·
online payment success + idempotent webhook · payment failure and retry ·
390px mobile viewport · last-item concurrent purchase.

---

## 10. Risk list

| ID | Risk | Severity | Handling |
| --- | --- | --- | --- |
| **R-1** | **Brevo SMTP credentials, Django `SECRET_KEY`, Postgres password and a legacy JWT secret are in Git history (`b49cf48` et al.). Removing them requires rewriting history on a repo with two other contributor branches.** | **Critical** | **Owner decision required.** Rotation steps documented in `SECURITY_REMEDIATION.md`; rewrite commands prepared but **not executed**. Rotation is effective even without a rewrite; the rewrite only removes the historical copy. |
| **R-2** | The Safepay flaw is live and exploitable today. | Critical | Phase 0 item 2, first code change after repo hygiene. |
| **R-3** | Production `backend/.env` was not inspected; actual live credential values are unknown. | High | Owner must confirm which secrets are live before rotation ordering is final. |
| **R-4** | Production DB is the only copy; no proven restore exists. | High | No migration is run against production until Phase 1 backup + restore drill passes. |
| **R-5** | `select_for_update` is a no-op under the SQLite fallback — concurrency tests pass locally while production behaviour differs. | High | Concurrency tests run against PostgreSQL in CI; SQLite fallback restricted to non-concurrency tests. |
| **R-6** | `Product.stock` is not evidence of physical inventory. | High | Opening balances imported as `MANUAL_ADJUSTMENT` with a reconciliation step against a physical count before go-live. |
| **R-7** | Legacy orders reference products that will gain variants; historical accuracy must survive. | Medium | Order snapshots are additive and backfilled; existing columns never rewritten. |
| **R-8** | Safepay API/webhook documentation and sandbox credentials are not available in this repository — `_extract_tracker` guesses across six payload shapes, which suggests the integration was built by trial and error. | Medium | Adapter is written against a documented interface with the verification contract enforced; **live provider verification cannot be completed without credentials** and will be reported as a blocker rather than faked. |
| **R-9** | Two other contributor branches may conflict with refactors. | Medium | Work on a dedicated branch; no force-push; no rebase of shared history. |
| **R-10** | The 5 NUL-corrupted files have no clean copy in Git history. | Low | Reconstructed from upstream shadcn/Vite sources and reviewed. |
| **R-11** | SPA → Next.js cutover risks SEO regression. | Medium | URL map + 301s + side-by-side read-only stack before proxy switch. |
| **R-12** | Homepage ships unverifiable claims ("50K+ customers", "24hr delivery", "#1 store"). | Medium | Defaults replaced with defensible copy in Phase 3; owner supplies any figure they can substantiate. |

---

## 11. Baseline measurements, and Phase 0 result

Recorded so the claims are checkable.

| Metric | Before Phase 0 | After Phase 0 |
| --- | --- | --- |
| Backend tests | **36 passed** | **91 passed** |
| Backend test paths run | `storefront` excluded — never ran | all apps, incl. `payments`, `storefront` |
| Frontend lint | 108 errors, 16 warnings | **0 errors, 0 warnings** |
| Frontend typecheck | **501 errors** | **0 errors** |
| Frontend production build | passes | passes |
| Tracked `.pyc` files | 136 | 0 |
| Tracked DB/PII files | 2 | 0 |
| NUL-corrupted tracked files | 5 | 0 |
| Payment webhook endpoints | **0** | 1, signature-verified |
| Paths that can write `payment_status=PAID` | any staff `PATCH`, any browser callback | 2, both audited |
| Secret scanning | none | CI gate + pre-commit hook |
| CI gates before deploy | none | 4 jobs, deploy blocked on all |
| `requirements.txt` | `Django>=4.2`, rest unpinned | fully pinned |
| npm advisories | 23 (17 high) | 4 (1 high, dev-only) |

### Phase 0 status by item

| Item | Status |
| --- | --- |
| **A. Repository exposure** | Code side **done**. Credential rotation and the Git-history decision are **owner actions** — `SECURITY_REMEDIATION.md` §3, §4. |
| **B. Safepay flaw** | **Done.** Exploit closed and pinned by regression test. Webhook signature scheme **unverified against live provider docs** — see §10 R-8. |
| **C. Revenue correctness** | **Done.** Settled-revenue definition, payment split, definitions published in the API. |
| **D. Cart repricing** | **Done.** Server-authoritative pricing under row locks; coupon concurrency fixed with a DB constraint behind it. |
| **E. Frontend baseline** | **Done.** Zero errors, zero warnings, zero type errors, CI-enforced. |
| **F. Writable admin financials** | **Done.** Read-only serializer + validated transition endpoint. |

### Verified by live smoke test

- Unsigned webhook → `400`, rejected, nothing settled.
- Browser return asserting `state=paid&status=success` → redirect only, no order created.
- Legacy callback path still routes to the new observational view.
- Migrations applied cleanly against a copy of the existing dev database,
  including both data migrations.
