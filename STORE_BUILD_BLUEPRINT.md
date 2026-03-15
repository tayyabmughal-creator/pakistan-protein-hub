# Store Build Blueprint

This document turns the current `PakNutrition` project into a reusable reference for future e-commerce builds where:

- a partial Lovable-generated frontend is provided
- the rest of the store must be engineered properly
- frontend and backend must be bound together into a production-capable store

It has two purposes:

1. capture the actual frontend/backend logic and implementation patterns used in this project
2. provide a reusable prompt/spec for building a new store of any niche from a lightweight prebuilt UI

## 1. Project Snapshot

### Current Stack

#### Frontend
- React 18
- TypeScript
- Vite
- React Router
- TanStack React Query
- Axios
- Tailwind CSS
- shadcn/Radix UI
- Recharts for admin analytics

#### Backend
- Django
- Django REST Framework
- SimpleJWT
- django-filter
- drf-spectacular
- WhiteNoise
- PostgreSQL or SQLite

### Store Type
- Full-stack e-commerce
- Public storefront + staff admin panel
- Guest checkout + authenticated customer flows
- Promotions and homepage merchandising controls

## 2. Frontend Notes

### App Shell

Main frontend entry:
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/App.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/App.tsx)

Shared app behavior:
- `QueryClientProvider` for app-wide data fetching
- `AuthProvider` for user session state
- lazy-loaded route modules
- `Layout` wrapping storefront pages
- `ProtectedRoute` guarding account/admin pages

### Public Storefront Routes

- `/` home page
- `/products` product listing
- `/products/:slug` product detail
- `/categories` category browser
- `/deals` public deals/promotions page
- `/about`
- `/contact`
- `/faq`
- `/shipping`
- `/returns`
- `/cart`
- `/checkout`
- `/guest-orders`
- `/guest-order-confirmation`

### Authenticated Customer Routes

- `/orders`
- `/orders/:id`
- `/profile`

### Admin Routes

- `/admin`
- `/admin/analytics`
- `/admin/products`
- `/admin/products/add`
- `/admin/products/edit/:id`
- `/admin/categories`
- `/admin/promotions`
- `/admin/orders`
- `/admin/users`
- `/admin/customers`
- `/admin/homepage`
- `/admin/reports`

### Important Frontend Components

#### Storefront Shell
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/components/Navbar.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/components/Navbar.tsx)
  - branding
  - live product search
  - auth menu
  - guest order lookup entry
  - cart counter for both guest and logged-in users
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/components/Footer.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/components/Footer.tsx)
  - support details
  - admin-managed social links
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/components/Layout.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/components/Layout.tsx)

#### Homepage
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/Index.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/Index.tsx)
  - composes hero, features, featured products, categories, deals
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/components/Hero.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/components/Hero.tsx)
  - driven by admin homepage settings
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/components/FeaturedProducts.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/components/FeaturedProducts.tsx)
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/components/DealBanner.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/components/DealBanner.tsx)
  - homepage campaign visibility depends on admin settings and linked promotion

#### Product Discovery
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/components/ProductCard.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/components/ProductCard.tsx)
  - sale sticker
  - stock indicator
  - add to cart
  - supports guest and logged-in usage
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/ProductList.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/ProductList.tsx)
  - category/search filtering via URL params
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/ProductDetails.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/ProductDetails.tsx)
  - image gallery
  - reviews
  - stock-aware quantity
  - respects admin sale sticker toggle

#### Cart and Checkout
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/Cart.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/Cart.tsx)
  - guest/local cart and user/server cart support
  - coupon input shown only when active promotions exist
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/Checkout.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/Checkout.tsx)
  - guest checkout form
  - inline validation
  - order summary with promo discount
  - promo code submission to backend
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/lib/guestCart.ts`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/lib/guestCart.ts)
  - local guest cart persistence
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/lib/promoSession.ts`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/lib/promoSession.ts)
  - applied promo persistence between cart and checkout

#### Auth and Session
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/context/AuthContext.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/context/AuthContext.tsx)
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/lib/apiClient.ts`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/lib/apiClient.ts)
  - bearer token injection
  - refresh token retry logic
  - protected-route redirection behavior

#### Admin Surface
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/components/admin/AdminSidebar.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/components/admin/AdminSidebar.tsx)
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/admin/Dashboard.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/admin/Dashboard.tsx)
  - KPI cards
  - charts
  - recent orders
  - low-stock inventory watch
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/admin/HomepageSettings.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/admin/HomepageSettings.tsx)
  - hero content
  - homepage stats
  - sale banner control
  - linked featured promotion
  - support info
  - social handles
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/admin/Promotions.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/admin/Promotions.tsx)
  - deals CRUD
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/admin/ProductForm.tsx`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/frontend/src/pages/admin/ProductForm.tsx)
  - includes:
    - price/discount
    - sale sticker toggle
    - active visibility toggle

## 3. Backend Notes

### Root Configuration

- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/config/settings.py`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/config/settings.py)
  - env-driven config
  - JWT auth
  - CORS/CSRF
  - static/media
  - SMTP/Twilio settings
  - PostgreSQL fallback to SQLite
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/config/urls.py`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/config/urls.py)
  - mounts all app URLs under `/api/`
  - schema and swagger endpoints

### Domain Apps and Models

#### Users
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/users/models.py`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/users/models.py)
  - custom user uses `email` as login identifier
  - address model supports default address behavior

Core logic:
- register
- login/logout
- profile
- password reset
- addresses CRUD

#### Products
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/products/models.py`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/products/models.py)
  - category
  - product
  - price
  - discount price
  - stock
  - active visibility
  - sale sticker toggle
  - computed `final_price`
  - computed `sale_percentage`
  - computed `should_show_sale_badge`

Core logic:
- public listing/filter/search
- public product detail
- admin CRUD

#### Cart
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/cart/models.py`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/cart/models.py)
  - user-owned cart
  - cart item
  - price snapshot at add time

Core logic:
- authenticated cart read/update
- cart sync after login
- stock-aware cart quantity checks

#### Orders
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/orders/models.py`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/orders/models.py)
  - user or guest orders
  - subtotal
  - discount amount
  - total amount
  - applied promo code
  - linked promotion
  - order item snapshots

Core logic:
- create order from user cart
- create guest order from submitted items
- order history/detail
- order cancellation with stock restoration
- guest order lookup
- promo preview endpoint

#### Reviews
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/reviews/models.py`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/reviews/models.py)
  - one review per user per product
  - rating + comment

Core logic:
- public review listing
- verified review posting rules

#### Promotions
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/promotions/models.py`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/promotions/models.py)
  - code
  - discount percentage
  - validity window
  - active flag
  - usage limit
  - used count

Core logic:
- public live deals listing
- admin CRUD
- checkout promo validation
- order discount enforcement

#### Storefront
- [`/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/storefront/models.py`](/Users/user/Desktop/ProteinHub/pakistan-protein-hub/backend/storefront/models.py)
  - singleton homepage settings
  - hero copy
  - stats
  - support info
  - announcement
  - social links
  - featured promotion for homepage campaign

Core logic:
- public homepage settings read
- admin homepage settings update
- linked homepage sale/promotion sync

## 4. Core Business Logic Extracted From This Project

### Catalog
- only `is_active=True` products appear publicly
- stock is visible publicly
- discounted price is computed server-side via `final_price`
- sale sticker appears only when:
  - discount is valid
  - admin toggle allows sticker

### Authentication
- JWT with refresh tokens
- local storage persistence
- auth endpoints excluded from forced redirect loops

### Guest vs Registered Commerce
- guest users can add to cart locally
- logged-in users use server cart
- guest cart can sync to server cart after login
- guest checkout creates orders without account creation
- guest order lookup uses order ID + email or phone

### Promotions
- active promotions are date-window and usage-limit aware
- frontend does not trust pricing; backend enforces discount at order creation
- homepage featured banner should reference a real promotion rather than a fake coupon string
- coupon input should only appear when at least one active promotion exists

### Admin
- admin is a proper SPA, not just Django admin
- staff APIs exist separately from public APIs
- homepage content is CMS-like and editable
- analytics use aggregated order/product/customer data
- reports are downloadable CSVs

### Notifications
- order confirmation supports email and optional SMS
- notification failure should not block order creation

### Deployment
- env-driven config
- main-branch deploy flow should reset server code to `origin/main`
- migrations must be part of normal deploy

## 5. Reusable Requirements Template For Any New Store

Use this checklist whenever building a new store from a partial Lovable UI.

### Must-Have Frontend Requirements
- preserve and improve the provided visual direction instead of replacing it with generic boilerplate
- wire every visible button, CTA, nav item, form, and badge to real logic
- create a coherent route map
- build:
  - home
  - products
  - categories
  - product detail
  - cart
  - checkout
  - auth
  - orders
  - profile
  - deals
  - support/static pages
  - admin dashboard
- implement proper loading, empty, success, and error states
- use real query caching and invalidation
- support guest cart and guest checkout unless business explicitly forbids it
- keep storefront branding configurable

### Must-Have Backend Requirements
- create proper domain models instead of mock JSON
- expose real REST APIs with serializers and permissions
- implement:
  - auth
  - products
  - categories
  - cart
  - orders
  - reviews
  - promotions
  - homepage settings/CMS
  - admin reporting
- enforce pricing, stock, and promotions on the backend
- provide admin-only endpoints separate from public endpoints
- support production env configuration

### Must-Have Commerce Requirements
- product listing and search
- stock handling
- sale/discount handling
- cart CRUD
- checkout
- order creation
- order status tracking
- promotion validation
- guest order tracking or confirmation flow

### Must-Have Admin Requirements
- dashboard
- products CRUD
- categories CRUD
- customers list
- orders management
- promotions/deals CRUD
- homepage customizations
- analytics charts
- downloadable reports

## 6. Reusable Prompt For Future Store Builds

Copy and adapt the prompt below.

---

# Master Prompt: Build a Full Store From Lovable UI

You are given a partially prebuilt Lovable frontend for a new e-commerce store in a specific niche.  
The UI is only a starting point. Your job is to turn it into a polished, fully functional, production-capable store with a real backend, real business logic, real admin tools, and a cohesive frontend.

## Inputs
- A lightweight Lovable-generated frontend UI
- The niche and brand direction for the new store
- Optional existing assets such as logos, copy, colors, and product/category ideas

## What You Must Do

### 1. Read the existing codebase first
- inspect the frontend structure before changing architecture
- keep whatever is usable from the provided UI
- remove mock logic, placeholders, and broken or disconnected flows

### 2. Build a real full-stack store

Create and wire:
- public storefront
- customer auth
- guest checkout
- server-backed cart for logged-in users
- local cart for guest users
- order placement and order history
- product reviews
- promotions/coupons
- homepage CMS settings
- admin panel
- analytics and CSV reports

### 3. Frontend expectations

Use:
- React + TypeScript
- a clean route map
- query caching and invalidation
- robust loading, error, and empty states
- modular reusable components

The final frontend must include:
- home page
- categories page
- products page
- product detail page
- deals page
- cart page
- checkout page
- login/register/forgot/reset password
- profile page
- orders and order details
- guest order lookup
- admin dashboard
- admin products/categories/orders/customers/promotions/homepage/reports

Every visible UI element must do real work.  
No dead buttons. No fake counters. No hardcoded fake ratings, fake prices, or fake promo logic.

### 4. Backend expectations

Use Django + DRF or an equivalent production-sensible backend stack.

Implement real models and APIs for:
- users
- addresses
- categories
- products
- carts
- orders
- order items
- reviews
- promotions
- homepage/storefront settings

Enforce all business rules on the backend:
- stock validation
- pricing
- promo code validation
- order totals
- cancellation rules
- review rules

### 5. Admin expectations

Create a linked admin panel with:
- dashboard KPIs
- analytics charts
- products CRUD
- categories CRUD
- customers list
- orders management
- promotions CRUD
- homepage customization
- CSV reports

The admin panel should feel like a real management interface, not a placeholder.

### 6. Design and UX expectations

- preserve the strongest parts of the provided Lovable design
- improve weak areas instead of replacing everything with generic templates
- make the store feel intentional and brand-specific
- avoid AI-generic ecommerce patterns when better composition is possible
- ensure desktop and mobile usability

### 7. Technical quality expectations

- environment-driven config
- production-aware API base URL handling
- proper auth refresh handling
- route protection
- consistent API helpers
- test core backend flows
- document deployment requirements

### 8. Deliverables

Produce:
- finished code
- bound frontend/backend flows
- working admin panel
- production env templates
- deployment notes
- concise explanation of key implementation decisions

## Non-Negotiables
- do not leave placeholder business logic
- do not rely on frontend-only pricing logic
- do not force signup if guest checkout is acceptable for the store
- do not leave admin pages disconnected from real APIs
- do not hardcode promo systems that are not enforced on the backend

## Build Style
- move fast, but keep architecture coherent
- prefer real working implementation over speculative planning
- keep the code modular and reusable for future niche stores
- when something is configurable, put it in admin if it belongs there

---

## 7. What To Reuse From This Project In Future Builds

Reuse these patterns:

- guest cart + server cart dual model
- backend-enforced order pricing
- promotion preview before checkout
- homepage CMS/settings singleton
- featured homepage campaign linked to a real promotion
- admin SPA backed by dedicated admin APIs
- React Query cache invalidation after admin edits
- environment-based deployment setup

## 8. Practical Rule For Future Niche Stores

If a new niche store starts with only a Lovable UI:

- keep the usable visual shell
- replace dummy content and fake interactions with real domain logic
- build the backend around commerce, not around pages
- let admin control content that merchants will actually need to update
- keep promotions, pricing, inventory, and orders enforced on the backend
- treat the supplied UI as a skin, not as the actual product

