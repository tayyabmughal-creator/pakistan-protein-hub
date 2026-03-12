# Implementation Plan

This is the recommended execution order if you want to keep momentum and avoid rework.

## Track 1: Before Real Launch

### Step 1

Harden the customer-facing buying path.

- verify all guest checkout scenarios
- verify signed-in checkout scenarios
- remove fake review counts or replace them with real data
- expose guest order tracking from the main UI

### Step 2

Finish production setup.

- populate production env files
- move production database to PostgreSQL
- verify SMTP sender setup
- verify optional SMS provider setup if needed
- perform deployment smoke tests

### Step 3

Make operations usable.

- create admin user(s)
- confirm order handling workflow
- confirm stock handling workflow
- confirm support contact process

## Track 2: First Revenue Improvements

### Step 4

Improve product discovery.

- add frontend sorting
- add price range filter UI
- add brand filter UI
- improve no-results UX

### Step 5

Improve trust and conversion.

- real review components
- order support links
- stronger delivery/returns messaging
- related products / cross-sell blocks

## Track 3: Payments and Promotions

### Step 6

Expand payment methods.

- decide gateway strategy
- implement gateway backend flow
- update checkout UI
- add admin visibility for payment state

### Step 7

Turn promotions into a real revenue tool.

- coupon input in cart and checkout
- promotion validation and discount application
- admin promotion controls and analytics

## Track 4: Platform and Scale

### Step 8

Reduce operational risk.

- move notifications to background jobs
- add monitoring / error tracking
- add low-stock alerts
- add logging around checkout, guest lookup, and admin actions

### Step 9

Increase test depth.

- add frontend integration tests
- add end-to-end checkout tests
- add guest-order lookup tests at the UI level

## Recommended Next 5 Tickets

1. Replace fake review stars/counts with backend-backed reviews or hide them.
2. Add visible guest order tracking link in navbar/footer and checkout confirmation.
3. Add catalog sort/filter UI for price and brand.
4. Add inline checkout field validation and clearer error states.
5. Move order email/SMS sending to a background job worker.
