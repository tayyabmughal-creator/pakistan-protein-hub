# Launch Checklist

This checklist focuses on the minimum bar to launch Pakistan Protein Hub as a usable, supportable store.

## 1. Commerce Critical

- Verify all primary product data is complete:
  - name
  - price
  - stock
  - category
  - brand
  - image
  - description
- Verify guest checkout works end-to-end.
- Verify signed-in checkout works end-to-end.
- Verify order confirmation page, guest lookup, and email confirmation work.
- Verify admin can see both guest and signed-in orders.
- Verify order status changes from admin panel work.
- Verify stock deducts on order creation and restores on cancellation.
- Add and validate at least one real payment option if launch requires more than COD.

## 2. Customer Trust

- Replace static/fake review/rating displays with real review data or hide them until ready.
- Add clear contact/support details in footer, contact page, and order confirmation email.
- Add visible delivery policy, return policy, and refund policy.
- Add authenticity / sourcing trust messaging if supplements are the business focus.
- Add a clear guest-order tracking entry point in the navbar or footer.

## 3. Catalog and UX

- Add usable catalog filtering:
  - category
  - brand
  - price range
  - sorting
- Improve search experience and verify no-result states.
- Verify mobile responsiveness across:
  - home
  - product list
  - product detail
  - cart
  - checkout
- Ensure cart badge and checkout summary stay correct for guest and signed-in users.

## 4. Admin and Operations

- Create at least one production admin user.
- Seed or import production-ready categories and products.
- Define order handling workflow:
  - who confirms
  - who ships
  - who handles cancellation/refund requests
- Add low-stock monitoring or at minimum a manual daily stock review process.
- Confirm notification settings:
  - email backend
  - sender address
  - optional SMS provider credentials

## 5. Production Infrastructure

- Set production env vars from:
  - `backend/.env.example`
  - `frontend/.env.example`
  - `.env.prod.example`
- Use PostgreSQL in production.
- Run migrations on the production database.
- Build frontend with the real API base URL.
- Verify static and media serving.
- Enable HTTPS and confirm secure cookie settings.
- Confirm `ALLOWED_HOSTS`, CORS, and CSRF trusted origins are exact and not wildcard.
- Verify admin path is changed from the default if desired.

## 6. Quality Gate

- Backend tests pass.
- Frontend production build passes.
- Manual smoke-test all of:
  - browse catalog
  - add to cart as guest
  - guest checkout
  - guest order lookup
  - login
  - signed-in checkout
  - admin order status update
- Confirm no launch-blocking errors in backend logs.

## 7. Nice-to-Have But Not Launch Blocking

- coupon application flow
- better admin analytics
- saved wishlist
- marketing banners driven by admin
- WhatsApp/SMS notification improvements
