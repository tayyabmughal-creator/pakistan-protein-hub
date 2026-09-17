# Safepay integration — verification checklist

**Status: BLOCKED — awaiting sandbox credentials and provider documentation.**
**Until this checklist is complete, `SAFEPAY_ENABLED` must stay `0` in production.**

The adapter in `providers/safepay.py` was written against a documented interface
shape, not against Safepay's actual documentation or a live sandbox. The webhook
signature scheme in particular is **configurable because it is unverified**:

| Setting | Current default | Confirmed? |
| --- | --- | --- |
| `SAFEPAY_WEBHOOK_SIGNATURE_HEADER` | `HTTP_X_SFPY_SIGNATURE` | **No** |
| `SAFEPAY_WEBHOOK_SIGNATURE_ALGORITHM` | `sha512` | **No** |
| HMAC covers the raw request body | assumed | **No** |
| Verification endpoint `GET /order/v1/{tracker}` | assumed | **No** |
| Init endpoint `POST /order/v1/init` | inherited from previous code | Partially — this one was in use |
| Amount quoted in minor units (paisa) | assumed | **No** |

The adapter **fails closed**: with no webhook secret configured it rejects every
callback rather than trusting it. A wrong guess here means payments do not
settle — it does not mean payments settle incorrectly. That is the right way for
this to be wrong, but it still has to be made right before go-live.

---

## What is needed

1. A Safepay **sandbox** merchant account.
2. `SAFEPAY_API_KEY` and the **webhook signing secret** for that account.
3. Provider documentation for: checkout initialisation, the webhook payload,
   the signature scheme, and the transaction-status endpoint.

---

## Checklist

### 1. Configuration

- [ ] Set in `backend/.env` (sandbox values):
      `SAFEPAY_ENABLED=1`, `SAFEPAY_ENV=sandbox`, `SAFEPAY_API_KEY=…`,
      `SAFEPAY_WEBHOOK_SECRET=…`, `SAFEPAY_SOURCE=paknutrition`
- [ ] Confirm `BACKEND_PUBLIC_URL` is reachable from the internet, or use a
      tunnel — the webhook is inbound and will not reach `localhost`.
- [ ] Register the webhook URL in the Safepay dashboard:
      `https://<host>/api/payments/safepay/webhook/`
- [ ] Register redirect and cancel URLs:
      `https://<host>/api/payments/safepay/return/`
      `https://<host>/api/payments/safepay/cancel/`

### 2. Confirm the signature scheme

- [ ] Read the docs and record the **exact header name** Safepay sends.
      Set `SAFEPAY_WEBHOOK_SIGNATURE_HEADER` to its Django `META` form —
      `X-Sfpy-Signature` becomes `HTTP_X_SFPY_SIGNATURE`.
- [ ] Confirm the **digest algorithm** (`sha256` / `sha512`) and set
      `SAFEPAY_WEBHOOK_SIGNATURE_ALGORITHM`.
- [ ] Confirm **what the HMAC covers**. `_verify_signature` assumes the raw
      request body. If Safepay signs a concatenation of specific fields instead,
      `_verify_signature` must be rewritten — and note that the previous
      implementation signed the tracker alone, which is what made the old
      integration forgeable. Whatever the scheme, the signature must cover the
      amount, or an attacker can alter it in transit.
- [ ] Trigger one real sandbox payment and confirm the webhook verifies. A
      rejected callback appears in `WebhookEvent` with
      `result=REJECTED` and `signature_valid=False` — check there first.

### 3. Confirm amounts and currency

- [ ] Pay a known amount in sandbox and confirm `PaymentTransaction.verified_amount`
      equals `expected_amount` exactly. If it is off by 100×, the minor-unit
      assumption in `to_subunits`/`from_subunits` is wrong for this endpoint.
- [ ] Confirm the webhook reports a currency and that it reads `PKR`.
      An absent currency is treated as unverifiable and parks the payment.

### 4. Confirm the status vocabulary

- [ ] Collect the actual `state`/`status` strings Safepay sends for: success,
      failure, cancellation, refund.
- [ ] Check each against `_STATUS_MAP` in `providers/safepay.py`. **Anything not
      in that map is treated as non-final and will not settle an order** — a
      missing success string means paid customers never get an order.

### 5. Confirm server-to-server verification

- [ ] Confirm the transaction-status endpoint path and response shape; correct
      `fetch_status` if needed.
- [ ] With the webhook URL temporarily removed from the dashboard, complete a
      sandbox payment and confirm the **browser return page still settles it**
      via `verify_session`. This is the path that protects customers when a
      webhook is never delivered.
- [ ] Run `python manage.py reconcile_payments --dry-run`, then for real, and
      confirm it settles a transaction the webhook never resolved.

### 6. End-to-end, in order

- [ ] Successful payment → order created, `payment_status=PAID`, stock decremented once.
- [ ] Webhook redelivery → `already_processed`, no second order.
- [ ] Failed payment → no order, session `FAILED`.
- [ ] Customer abandons at the hosted page → session `CANCELLED`.
- [ ] Customer pays then presses Back → cancel callback verifies first and the
      order is still created.
- [ ] Browser return arrives before the webhook → settles via verification.
- [ ] Browser return arrives after the webhook → reports the existing order.

### 7. Before enabling in production

- [ ] Repeat sections 1–6 against **production** credentials in a maintenance window.
- [ ] Place one small real order end-to-end and confirm it in the Safepay dashboard.
- [ ] Schedule `reconcile_payments` (every 15 minutes).
- [ ] Set up an alert on `PaymentTransaction.status = MISMATCH` — that means a
      customer was charged an amount that did not match the basket, and it
      should never happen silently.
- [ ] Only then set `SAFEPAY_ENABLED=1` in production.

---

## Until this is done

COD, Easypaisa, JazzCash and bank transfer are unaffected and continue to work —
they do not go through `PaymentSession` or the provider adapter at all. PN can
ship COD-only with no payment risk while this remains outstanding.
