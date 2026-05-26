# SGCG Art Glass — Webpage Reference

> Living document. Update whenever routes, APIs, or environment variables change.  
> Last reviewed: 2026-05-26

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Frontend Routes](#3-frontend-routes)
4. [Backend API Endpoints](#4-backend-api-endpoints)
5. [Environment Variables](#5-environment-variables)
6. [File Upload System](#6-file-upload-system)
7. [Key Component Tree](#7-key-component-tree)
8. [Caching Strategy](#8-caching-strategy)
9. [Deployment](#9-deployment)
10. [Known Gotchas](#10-known-gotchas)

---

## 1. Project Overview

SGCG Art Glass is a full-stack e-commerce + design SaaS for custom stained glass art.

**Core features:**
- Interactive canvas designer (Fabric.js) — customers build stained glass patterns
- Work order submission — submit custom designs for production quotes
- E-commerce shop — digital pattern downloads and physical products
- Customer portal — track orders, saved projects, invoices
- Admin dashboard — manage templates, glass types, gallery, products, orders
- Gallery — community photo submissions with moderation
- Review system — invite-code–gated customer reviews

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | React | 18.3.1 |
| Build tool | Vite | 7.3.2 |
| Routing | React Router DOM (hash-based) | 6.28.0 |
| Canvas / designer | Fabric.js | 7.2.0 |
| PDF generation | jsPDF | 4.2.1 |
| PDF rendering | pdfjs-dist | 5.4.624 |
| Drag-and-drop | @hello-pangea/dnd | 18.0.1 |
| XSS prevention | DOMPurify | 3.2.6 |
| HTTP client | Axios | 1.15.0 |
| Backend framework | Flask | 3.1.3 |
| ORM | Flask-SQLAlchemy | 3.1.1 |
| Database | PostgreSQL (via psycopg 3.3.3) | — |
| Auth | JWT (PyJWT 2.12.0) | — |
| Image processing | Pillow | 12.2.0 |
| Payments | Stripe SDK | 11.1.0 |
| Email | Flask-Mail (Hostinger SMTP) | 0.9.1 |
| Production server | Gunicorn | 22.0.0 |
| Hosting (backend) | Render | — |
| Hosting (frontend) | Hostinger / static | — |

**CSS approach:** Plain CSS with CSS Modules (component-scoped). CSS variables in `frontend/src/index.css`. No Tailwind or SCSS.

---

## 3. Frontend Routes

All routing is **hash-based** (`/#/path`). Managed by custom `useHashRoute` hook in `frontend/src/hooks/useHashRoute.js`. All page components are **lazy-loaded** via `React.lazy()`.

| Hash Route | Component File | Auth Required | Purpose |
|-----------|---------------|---------------|---------|
| `#/` | `pages/home/HomePage.jsx` | None | Landing page with featured products carousel |
| `#/product` | `pages/shop/ProductPage.jsx` | None | Full product catalog (shop) |
| `#/product?id=<id>` | `pages/shop/ProductDetail.jsx` | None | Single product detail view |
| `#/reviews` | `pages/shop/ReviewsPage.jsx` | None | All customer reviews |
| `#/public-review` | `pages/shop/PublicReviewPage.jsx` | None (invite code) | Submit a review via invite code |
| `#/checkout` | `pages/shop/CheckoutPage.jsx` | None (guest OK) | Stripe checkout |
| `#/checkout/success` | `pages/shop/CheckoutSuccessPage.jsx` | None | Order confirmation |
| `#/admin` | `pages/admin/AdminDashboard.jsx` | Admin JWT | Admin control panel |
| `#/account/login` | `pages/auth/UnifiedLogin.jsx` | None | Customer or admin login |
| `#/account/signup` | `pages/customer/CustomerSignup.jsx` | None | Customer registration |
| `#/account/reset-password` | `pages/auth/CustomerResetPassword.jsx` | None | Password reset flow |
| `#/account` | `pages/customer/CustomerPortal.jsx` | Customer JWT | Profile, orders, invoices |
| `#/designer` | `pages/DesignerPage.jsx` | None (save requires customer) | Fabric.js stained glass designer |
| `#/gallery` | `pages/PhotoGalleryPage.jsx` | None | Community photo gallery |
| `#/my-projects` | `pages/MyProjectsPage.jsx` | Customer JWT | Saved designer projects |
| `#/my-work-orders` | `pages/MyWorkOrdersPage.jsx` | Customer JWT | Submitted work orders |
| `#/diagnostics` | `pages/DiagnosticsPage.jsx` | None | Backend health / debug info |
| `#/terms` | `pages/legal/TermsPage.jsx` | None | Terms of service |
| `#/privacy` | `pages/legal/PrivacyPolicyPage.jsx` | None | Privacy policy |
| `#/custom-order-terms` | `pages/legal/CustomOrderTermsPage.jsx` | None | Custom order terms |
| `#/repair-warranty` | `pages/legal/RepairWarrantyPage.jsx` | None | Repair & warranty info |
| `#/faq` | `pages/legal/FaqPage.jsx` | None | FAQ |

**Auth tokens:**
- Admin: JWT stored in `sessionStorage` key `sgcg_token`
- Customer: JWT stored in `sessionStorage` key `sgcg_customer_token`  
  *(previously also mirrored to `localStorage` — should be sessionStorage-only)*

---

## 4. Backend API Endpoints

Base URL in production: `https://api.sgcgart.com` (or configured via `VITE_API_BASE_URL`).

### Public endpoints (no auth)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check — returns `{"status": "ok"}` |
| GET | `/` | Root probe for Render uptime checks |
| GET | `/api/templates` | List published templates (paginated) |
| GET | `/api/templates/<id>` | Single template detail |
| GET | `/api/glass-types` | List active glass types |
| GET | `/api/gallery/photos` | List approved gallery photos |
| POST | `/api/gallery/photos` | Submit a gallery photo (public) |
| GET | `/api/items` | Legacy Etsy-linked product catalog |
| GET | `/api/manual-products` | Manual product list (summary) |
| GET | `/api/manual-products/<id>` | Single manual product detail |
| GET | `/api/texture-proxy` | SSRF-guarded external texture proxy |
| GET | `/uploads/textures/<filename>` | Serve glass type texture images |
| GET | `/uploads/templates/<filename>` | Serve template images (DB fallback) |
| GET | `/uploads/gallery/<filename>` | Serve gallery images (DB fallback) |
| GET | `/uploads/products/<filename>` | Serve product images (DB fallback) |
| GET | `/uploads/reviews/<filename>` | Serve review images |

### Customer endpoints (require `role=customer` JWT)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/account/login` | Customer login → returns JWT |
| POST | `/api/account/signup` | Customer registration |
| POST | `/api/account/reset-password/request` | Send reset email |
| POST | `/api/account/reset-password/confirm` | Set new password |
| GET | `/api/projects` | List customer's saved designs |
| POST | `/api/projects` | Save a designer project |
| DELETE | `/api/projects/<id>` | Delete a saved project |
| GET | `/api/work-orders` | List customer's work orders |
| POST | `/api/work-orders` | Submit a new work order |
| GET | `/api/invoices` | List customer's invoices |

### Admin endpoints (require admin JWT)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/login` | Admin login → returns JWT |
| GET | `/api/admin/templates` | All templates (including private) |
| POST | `/api/admin/templates` | Create template |
| PUT | `/api/admin/templates/<id>` | Update template |
| DELETE | `/api/admin/templates/<id>` | Soft-delete template |
| GET | `/api/admin/glass-types` | All glass types (active + inactive) |
| POST | `/api/admin/glass-types` | Create glass type |
| PUT | `/api/admin/glass-types/<id>` | Update glass type |
| GET | `/api/admin/gallery/photos` | All gallery submissions |
| PUT | `/api/admin/gallery/photos/<id>` | Approve / reject / update photo |
| DELETE | `/api/admin/gallery/photos/<id>` | Delete gallery photo |
| GET | `/api/admin/work-orders` | All work orders |
| PUT | `/api/admin/work-orders/<id>` | Update work order status |
| GET | `/api/admin/invoices` | All invoices |
| POST | `/api/admin/invoices` | Create invoice |
| PUT | `/api/admin/invoices/<id>` | Update invoice |
| POST | `/api/items` | Create legacy catalog item |
| PUT | `/api/items/<id>` | Update legacy catalog item |
| DELETE | `/api/items/<id>` | Delete legacy catalog item |
| POST | `/api/manual-products` | Create manual product |
| PUT | `/api/manual-products/<id>` | Update manual product |
| DELETE | `/api/manual-products/<id>` | Delete manual product |

---

## 5. Environment Variables

### Frontend (build-time, prefixed `VITE_`)

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_API_BASE_URL` | Backend API base URL | `https://api.sgcgart.com` |
| `VITE_BASE_PATH` | Subpath prefix if any | `/` |

### Backend (runtime)

| Variable | Required | Purpose | Default |
|----------|----------|---------|---------|
| `APP_ENV` | Yes | Config profile: `development` / `production` | `production` |
| `FLASK_DEBUG` | No | Enable Flask debug mode | `false` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | — |
| `POSTGRES_URL` | Dev | Dev PostgreSQL override | — |
| `JWT_SECRET` | Prod | JWT signing secret (256-bit minimum) | `dev-secret` in dev |
| `JWT_TTL_SECONDS` | No | Customer token lifetime (seconds) | `3600` |
| `JWT_ADMIN_TTL_SECONDS` | No | Admin token lifetime; `0` = no server expiry | `0` |
| `ADMIN_EMAIL` | Yes | Admin login email | `sgcgartglass@gmail.com` (insecure default) |
| `ADMIN_PASSWORD_HASH` | Yes | Werkzeug-hashed admin password | — |
| `MAIL_SERVER` | Yes | SMTP server hostname | `smtp.hostinger.com` |
| `MAIL_PORT` | No | SMTP port | `465` |
| `MAIL_USE_SSL` | No | Use SSL for SMTP | `true` |
| `MAIL_USE_TLS` | No | Use STARTTLS for SMTP | `false` |
| `MAIL_USERNAME` | Yes | SMTP login username | — |
| `MAIL_PASSWORD` | Yes | SMTP login password | — |
| `SUPPORT_EMAIL` | No | Reply-to address for emails | `customersupport@sgcgart.com` |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (`sk_live_...`) | — |
| `STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key (`pk_live_...`) | — |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signature secret | — |
| `CHECKOUT_TAX_RATE` | No | Sales tax rate as decimal | `0.0825` |
| `CORS_ORIGINS` | Prod | Comma-separated allowed origins | `http://localhost:5173,...` |
| `UPLOAD_FOLDER` | No | Absolute path for uploaded files | `backend/uploads/` |
| `TEXTURE_PROXY_ALLOWED_HOSTS` | No | Comma-separated external texture hosts | (empty = allow all non-private) |
| `SECRET_KEY` | No | Flask session secret (falls back to JWT_SECRET) | `dev-secret` |
| `PORT` | No | Gunicorn bind port | `5000` |

---

## 6. File Upload System

All uploads land in `backend/uploads/` (ephemeral on Render — blobs are mirrored to the DB).

| Category | Path | Max Size | DB Fallback | Notes |
|----------|------|----------|-------------|-------|
| Glass textures | `uploads/textures/` | 5 MB | No | 256×256 PNG/JPG |
| Template images | `uploads/templates/` | 50 MB | Yes (image_data column) | PNG; re-cached to disk on first request |
| Gallery photos | `uploads/gallery/` | 20 MB per file | Yes (image_data column) | Up to 120 MB per batch |
| Product images | `uploads/products/` | 150 MB total | Yes | Served DB-first |
| Review images | `uploads/reviews/` | — | No | — |

**Global upload limit:** `MAX_CONTENT_LENGTH = 150 MB` (supports short videos).

---

## 7. Key Component Tree

### App shell (`frontend/src/App.jsx`)
```
App
├── Header          (layout/header/Header.jsx)
├── Suspense fallback → LoadingMessage
│   ├── HomePage
│   │   ├── HeroSection        (hero/HeroSection.jsx) — /logo.png, banner
│   │   └── FeaturedCarousel   (featured/FeaturedCarousel.jsx)
│   ├── ProductPage
│   │   └── ProductCard        (shop/components/ProductCard.jsx)
│   ├── ProductDetail
│   ├── AdminDashboard
│   │   ├── TemplateManager
│   │   ├── GlassTypeManager
│   │   ├── GalleryManager
│   │   ├── WorkOrderManager
│   │   └── ColoredDesignPreview  ← dangerouslySetInnerHTML (SVG)
│   ├── CustomerPortal
│   │   ├── OrderHistory
│   │   └── InvoiceList
│   ├── DesignerPage            (Fabric.js canvas, lazy chunk vendor-fabric)
│   ├── PhotoGalleryPage
│   ├── CheckoutPage            (Stripe.js)
│   └── … (legal, auth, diagnostics pages)
└── Footer          (layout/footer/Footer.jsx)
```

### Auth contexts (`frontend/src/contexts/`)
- `AdminAuthContext.jsx` — admin JWT, stored in `sessionStorage`
- `CustomerAuthContext.jsx` — customer JWT, 1-hour inactivity timeout

### API client (`frontend/src/services/api.js`)
- Single Axios instance with Bearer-token interceptor
- Multi-layer cache: `sessionStorage` (catalog) + `localStorage` (public endpoints, 5-min TTL)
- Stale-while-revalidate: returns cached data then fetches fresh in background
- Auto-retry (1.2 s backoff) for dev proxy failures

---

## 8. Caching Strategy

| Data | Storage | TTL | Key pattern |
|------|---------|-----|-------------|
| Full product catalog (items + manual) | `sessionStorage` | 5 min | `sgcg_catalog_cache_v2` |
| Public endpoint responses (templates, glass types, gallery) | `localStorage` | 5 min | `sgcg_public_get_cache_v2:{path}:{params}` |
| Individual manual product card images | `localStorage` | indefinite | `sgcg_manual_card_image_v1:{id}` |
| Product detail view | `sessionStorage` | 5 min | `sgcg_product_view_cache_v1` |
| Backend uploaded images | HTTP `Cache-Control` | 86 400 s (1 day) | set in `send_*` route handlers |

Cache is **busted** when the user navigates away from `/product`.

---

## 9. Deployment

### Backend — Render

- **Start command:** `gunicorn -w 4 -b 0.0.0.0:$PORT "backend.app:create_app()"`
- **Filesystem:** Ephemeral — uploaded files must survive via DB blob fallback
- **Config:** `render.yaml` in project root
- **Health check:** `GET /api/health`
- **CORS origins:** Set `CORS_ORIGINS` env var to `https://sgcgart.com,https://www.sgcgart.com`

### Frontend — Hostinger (static)

- **Build command:** `cd frontend && npm run build` → outputs to `dist/`
- **Deploy:** Upload `dist/` to Hostinger static hosting
- **Routing:** All non-asset paths must rewrite to `index.html` (SPA, hash routing)

### Vite code splitting (vendor chunks)

| Chunk | Libraries |
|-------|-----------|
| `vendor-fabric` | fabric.js |
| `vendor-pdfjs` | pdfjs-dist |
| `vendor-jspdf` | jspdf |
| `vendor-html2canvas` | html2canvas |
| `vendor-network` | axios |

---

## 10. Known Gotchas

- **Ephemeral FS on Render:** Any file uploaded to `backend/uploads/` is lost on dyno restart. The DB fallback routes re-cache on first request, but there's a brief miss window. Always ensure `image_data` is saved to DB alongside disk.
- **Hash routing:** The app uses `/#/route` hash-based routing, not HTML5 history. Deep-link URLs (e.g., `/#/product?id=5`) work without server-side rewrites.
- **Admin token expiry:** By default `JWT_ADMIN_TTL_SECONDS=0` means admin tokens never expire server-side. Set this to `3600` in production.
- **Stripe live keys in dev:** `.env.local` contains live Stripe keys — never commit this file. Use test keys (`pk_test_...`) for local development.
- **Texture proxy SSRF guard:** If `TEXTURE_PROXY_ALLOWED_HOSTS` is unset, any non-private external host is permitted. Set it explicitly in production.
- **Image sizes:** `banner.png` (2 MB) and `logo.png` (1.6 MB) in `frontend/public/` are uncompressed — convert to WebP for production.
- **DOMPurify not applied to SVG:** `ColoredDesignPreview.jsx` renders raw SVG via `dangerouslySetInnerHTML` — SVG content from DB should be sanitized with DOMPurify before rendering.
- **Custom cursor on `*`:** `index.css` applies `cursor: url(...)` to every element with `!important`. This forces a network fetch of the cursor SVG on every page — ensure the file is cached aggressively.
