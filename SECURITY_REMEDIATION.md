# Security Remediation — Phase 0

**Status:** code-side remediation complete; **operator actions below are outstanding.**
**Owner decisions required:** §3 (credential rotation) and §4 (history rewrite).

This document records exactly what was exposed, what has been fixed in the
repository, and what a human must still do on infrastructure that this
repository cannot reach.

---

## 1. What was exposed

### 1.1 `backend/data.json` — tracked Django `dumpdata` export

52 KB, 149 records, committed in `b49cf48`.

| Count | Model | Content |
| --- | --- | --- |
| 73 | `token_blacklist.outstandingtoken` | Full JWT **refresh tokens** |
| 14 | `token_blacklist.blacklistedtoken` | Blacklist rows |
| 7 | `users.user` | PBKDF2 password hashes, real emails, 3 superuser accounts |
| 5 | `users.address` | Names, phone numbers, street addresses |
| 24 | `orders.order` / `orders.orderitem` | Order and financial history |
| 1 | `sessions.session` | Session payload |

Real customer addresses appear in this file. Two of the seven accounts use
personal Gmail addresses belonging to identifiable people.

**Refresh-token impact:** the tokens carry `exp` values in **February 2026** and
are therefore expired. They are not directly replayable today. They remain a
disclosure of session material and of the signing key's output.

### 1.2 `backend/db.sqlite3` — tracked SQLite database

393 KB, present in 6 commits. Contains the same user, address and order data as
above plus everything else in the application schema. `*.sqlite3` was already in
`.gitignore`, but **`.gitignore` does not apply to files already tracked**, which
is why it kept being committed.

### 1.3 `backend/.env` — credentials in Git history

Committed in `e504279`, `ca4def3`, `b49cf48`, `b9dfa12`. At `b49cf48`:

| Variable | Kind | Rotation |
| --- | --- | --- |
| `EMAIL_HOST_USER` + `EMAIL_HOST_PASSWORD` | **Brevo SMTP relay credentials** | **Priority 1 — rotate now** |
| `SECRET_KEY` | Django signing key (`django-insecure-…`) | Priority 2 |
| `DB_PASSWORD` | PostgreSQL password | Priority 2 |
| `JWT_SECRET` | Legacy MongoDB-era secret | Obsolete — confirm unused, then retire |

**Verified:** the current working-tree `backend/.env` does **not** reuse these
values (`SECRET_KEY` is a `local-dev-secret…` placeholder, `EMAIL_HOST_PASSWORD`
is absent). Whether **production** still uses them is unknown — production
secrets live in `backend/.env` on the VPS, which is outside this repository and
was not inspected. See §3.

### 1.4 Repository hygiene

136 tracked `.pyc` files, stray `build_log*.txt` / `diag_output.txt` /
`test_results.txt`, and five NUL-corrupted source files (one of which,
`frontend/public/robots.txt`, was being served to search-engine crawlers as 160
bytes of binary garbage).

---

## 2. What was fixed in the repository

| Action | Detail |
| --- | --- |
| Untracked `backend/data.json` | `git rm --cached`; file kept on disk for local use |
| Untracked `backend/db.sqlite3` | `git rm --cached`; file kept on disk |
| Untracked 136 `.pyc` files | `git rm --cached` |
| Untracked stray logs | `diag_output.txt`, `test_results.txt`, `build_log*.txt`, `build_check.txt`, `build_error.txt` |
| Rewrote `.gitignore` | Explicit sections for secrets, credential material, databases, data exports, archives; `*.example` kept allowed |
| Added `scripts/check_repo_hygiene.py` | Filename rules + 14 inline-secret patterns + NUL-corruption detection; `--staged` / `--all` modes; `# repo-hygiene: allow` pragma for justified exemptions |
| Added `scripts/install_git_hooks.py` | Installs a pre-commit hook running the scanner against staged changes |
| Repaired 4 corrupt files | `robots.txt`, `vite-env.d.ts`, `ui/collapsible.tsx`, `ui/aspect-ratio.tsx` |
| Deleted 1 corrupt dead file | `frontend/src/App.css` — all NUL bytes and imported nowhere |

The scanner was verified in both directions: it passes on the cleaned tree
(468 files) and it correctly blocks a planted `django-insecure-…` key.

### Not done, deliberately

**`backend/media/` (26 product/category images) is still tracked.** It is not a
secret exposure — these images are publicly served anyway — and untracking it is
actively dangerous today: production deploys run `git reset --hard origin/main`,
so a commit that removes these paths from the index would **delete the
corresponding files from the production media directory** on the next deploy.
Moving media to object storage is a Phase 1 task with a migration step, not a
Phase 0 `git rm`.

One tracked image, `backend/media/categories/adeel_ahmed.jpg` (and its
`products/` copy), appears to be a personal photograph used as placeholder test
data. Recommended for manual removal through the admin UI rather than by
untracking, for the same deploy-deletion reason.

---

## 3. Operator actions — credential rotation (OWNER DECISION + ACTION REQUIRED)

This repository cannot reach production. A human must do the following.

### 3.1 Priority 1 — Brevo SMTP credentials

1. Log in to Brevo → **SMTP & API** → SMTP keys.
2. Check the send log for `a2912e001@smtp-brevo.com` for traffic you do not
   recognise. This credential has been readable by anyone with repository access
   since commit `b49cf48`.
3. Generate a new SMTP key; delete the old one.
4. Update `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` in `backend/.env` on the VPS.
5. Restart the backend service and send one test order email to confirm delivery.

### 3.2 Priority 2 — Django `SECRET_KEY`

Rotating `SECRET_KEY` **invalidates every active session and every outstanding
JWT**, which is the desired outcome here: it is the mechanism that forces the
refresh tokens in `data.json` (and any others derived from the exposed key) to
become unusable.

1. Generate: `python -c "import secrets; print(secrets.token_urlsafe(64))"`
2. Set `SECRET_KEY` in `backend/.env` on the VPS.
3. Restart the backend.
4. **Expected effect:** all users are logged out and must sign in again. Choose a
   low-traffic window and tell staff in advance.

To additionally invalidate refresh tokens explicitly (belt and braces), after the
restart run:

```bash
python manage.py shell -c "from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken; [BlacklistedToken.objects.get_or_create(token=t) for t in OutstandingToken.objects.all()]"
```

This is possible because `rest_framework_simplejwt.token_blacklist` is already
installed and `BLACKLIST_AFTER_ROTATION` is enabled.

### 3.3 Priority 2 — PostgreSQL password

1. `ALTER ROLE <user> WITH PASSWORD '<new>';`
2. Update `POSTGRES_PASSWORD` in `backend/.env` on the VPS.
3. Restart the backend and confirm it connects.

### 3.4 Retire the legacy `JWT_SECRET`

From the MongoDB/Express era predating the Django backend. Confirm nothing still
consumes it, then delete the variable.

### 3.5 Superuser accounts

`data.json` shows three `is_superuser=True` accounts, including one with the
username `admin123` and an unusable password hash (`!…`). After rotation, audit
`User.objects.filter(is_superuser=True)` in production and disable any account
that is not a current staff member.

### 3.6 Before the next deploy — read this

The first deploy of this branch removes `backend/db.sqlite3` from the index.
Because the deploy script runs `git reset --hard origin/main`, that **deletes
`backend/db.sqlite3` from the production working tree.**

- If production runs **PostgreSQL** (`POSTGRES_DB` set in the VPS `backend/.env`,
  which the deploy script already prints), this is harmless and in fact removes a
  standing hazard: until now, every `git reset --hard` was overwriting that file
  with the committed copy.
- If production runs **SQLite**, this deletes the live database.

**Confirm which, and take a backup of `backend/db.sqlite3` on the VPS, before
deploying this branch.** Phase 1 adds a mandatory pre-deploy backup step so this
check stops depending on someone remembering.

---

## 4. Git history — DECIDED: rotate, do not rewrite

**Owner decision (2026-09-17): the repository is private. Rotate the credentials
in §3; do not rewrite history.**

Untracking a file removes it from future commits. It does not remove it from
history — `backend/data.json`, `backend/db.sqlite3` and `backend/.env` remain
readable at their historical commits by anyone who can clone this repository.
That residual exposure is **accepted**, bounded by the repository's existing
collaborator list.

What this decision does and does not cover:

- **Covered by rotation.** Once §3 is done, the Brevo credentials, `SECRET_KEY`,
  database password and legacy `JWT_SECRET` in history are worthless for
  authentication. This is the exposure that mattered.
- **Not covered.** The **customer PII** in `data.json` and `db.sqlite3` — names,
  phone numbers, addresses, emails, PBKDF2 hashes — cannot be rotated away. It
  stays readable to anyone with repository access, historically and permanently.

**Therefore: treat repository access as access to customer data.** Audit the
collaborator list, remove anyone who no longer needs it, and require 2FA. If the
repository is ever made public, or if it turns out a past collaborator was
outside the business, revisit this decision — the §4.1 procedure below still
applies, and the PII should then be treated as disclosed.

No force-push has been performed. `origin/abdul` and `origin/adeel` are
untouched.

### 4.1 Rewrite procedure — retained for reference, NOT to be run

Kept only in case the visibility assumption changes. Running this requires a
fresh decision and coordination with every contributor.

Requires [`git-filter-repo`](https://github.com/newren/git-filter-repo).
Coordinate with every contributor first: **all of them must re-clone afterwards.**
Any branch not included in the rewrite reintroduces the files when merged.

```bash
# 0. Full mirror backup FIRST. Do not skip.
git clone --mirror git@github.com:tayyabmughal-creator/pakistan-protein-hub.git pn-backup.git
tar czf pn-backup-$(date +%F).tar.gz pn-backup.git

# 1. Confirm every contributor has pushed and is ready to re-clone.
#    Merge or explicitly abandon origin/abdul and origin/adeel first — a
#    rewrite that skips them lets the secrets back in on the next merge.

# 2. Rewrite a fresh mirror clone (never the working clone).
git clone --mirror git@github.com:tayyabmughal-creator/pakistan-protein-hub.git pn-rewrite.git
cd pn-rewrite.git
git filter-repo --invert-paths \
    --path backend/data.json \
    --path backend/db.sqlite3 \
    --path backend/.env \
    --path-glob '*.pyc'

# 3. Verify the files are gone from every ref.
git log --all --oneline -- backend/.env backend/data.json backend/db.sqlite3   # expect no output

# 4. Force-push all refs. This rewrites shared history.
git push --force --mirror origin

# 5. Every contributor deletes their clone and clones fresh.
#    Old clones still contain the secrets and will push them back if merged.

# 6. Ask GitHub Support to purge cached views of the old commit SHAs, and
#    rotate anything in §3 that has not already been rotated.
```

A rewrite without rotation protects nothing — anyone who already cloned still
has the credentials. **§3 rotation is the action that matters, and it is
outstanding.**

---

## 5. Verification

```bash
# Nothing sensitive is tracked:
git ls-files | grep -iE '\.(sqlite3|db|dump|sql)$|data\.json|\.pyc$'   # expect empty

# Scanner passes:
python3 scripts/check_repo_hygiene.py

# Hook installed:
python3 scripts/install_git_hooks.py
```

Current result: `repo-hygiene: OK — 468 file(s) scanned (all).`
