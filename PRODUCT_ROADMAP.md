# Product Roadmap

This roadmap is ordered by business value and launch leverage rather than technical neatness.

## Phase 0: Launch Readiness

Goal: make the store safe to launch and operate manually.

### Must ship

- Stable guest checkout
- Stable signed-in checkout
- Guest order confirmation and lookup
- Order confirmation email
- Admin order processing
- Reliable catalog browsing and search
- Production deployment with PostgreSQL and HTTPS

### Should ship

- Real review rendering or removal of fake review UI
- Better catalog filters and sorting
- Guest order tracking link visible in the UI
- Basic support/contact workflow

## Phase 1: Conversion Improvements

Goal: reduce friction and improve trust.

### Customer-facing

- real product reviews and rating summaries
- price filters and sorting controls
- recently viewed products
- related products / upsells
- better delivery estimate messaging
- improved checkout validation and inline errors

### Trust and retention

- branded HTML emails for all order states
- optional WhatsApp or SMS order updates
- clearer returns/refunds messaging
- FAQ and support surfaced during checkout

## Phase 2: Revenue and Payments

Goal: increase conversion beyond COD-only commerce.

### Payments

- card gateway integration
- Easypaisa / JazzCash support
- payment failure and retry flow
- payment reconciliation in admin

### Promotions

- apply coupon code in cart/checkout
- category / product / threshold-based discounts
- first-order and bundle offers
- free-shipping rules

## Phase 3: Operations and Admin Maturity

Goal: reduce manual overhead and improve control.

### Admin

- dashboard with revenue, orders, low-stock, top products
- bulk import/export of products
- better order detail screen for admin
- audit logging for admin changes
- notification resend actions

### Fulfillment

- shipment tracking numbers
- courier workflow integration
- printable packing slips / invoices
- refund / return workflow

## Phase 4: Customer Account Depth

Goal: improve repeat purchase behavior.

### Account features

- email verification
- saved wishlist
- reorder from past order
- password change and security settings
- notification preferences

### Support features

- support ticket or help center integration
- self-service cancellation where allowed
- order issue reporting

## Phase 5: Platform Quality

Goal: scale more safely and efficiently.

### Engineering

- background jobs for email/SMS
- monitoring and error tracking
- caching hot catalog endpoints
- stronger API pagination
- end-to-end browser tests
- dependency pruning and frontend dead code cleanup

### Analytics

- conversion funnel tracking
- search analytics
- abandoned cart measurement
- campaign attribution
