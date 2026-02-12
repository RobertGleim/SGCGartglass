# Product Requirements Document

## Overview
SGCG Art Glass needs a branded web experience that mirrors the Etsy seller page while giving full control of featured items and presentation. The site must begin with a home page, a product spotlight page, and an admin page for syncing Etsy listings.

## Users
- Owner/Admin: manages featured listings and presentation.
- Visitors: browse featured glass art and click through to Etsy.

## User journeys
1. Visitor lands on home page, views featured items, and selects a product.
2. Visitor reviews a product detail page and proceeds to Etsy to purchase.
3. Admin logs in, links Etsy listings, and verifies featured items are updated.

## Functional requirements
- Home page contains header, navigation, hero, featured items, and footer.
- Product page shows image, description, price, and Etsy link for a selected listing.
- Admin page supports JWT login and listing sync by Etsy URL or ID.
- Backend stores listings in a local database and exposes read-only endpoints for the client.

## Non-functional requirements
- Tech stack: Vite/React, Flask/Python, JavaScript, JWT auth.
- Neutral, light theme with white and gray surfaces and a royal blue accent.
- Environment variables stored in .env, excluded from version control.
- Deployable on Vercel (frontend) and Render (backend).
- Prepared for GitHub Pages with configurable base path.
- Hostinger will be used as the client share portal.

## Data requirements
- Store Etsy listing ID, title, description, price, image URL, and Etsy URL.
- Allow refresh by re-linking the listing if needed.

## Risks and considerations
- Etsy API credentials are required for live data sync.
- Rate limits and API errors must be handled gracefully.
- JWT secret and admin credentials must remain in .env.

## Open questions
- Do we need support for multiple featured sections or categories?
- Should admin see last sync timestamps and error logs?
