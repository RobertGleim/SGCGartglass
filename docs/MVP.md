# MVP

## Goals
- Mirror the Etsy seller experience with a branded landing page and a product spotlight page.
- Allow the admin to link Etsy listings and automatically populate image, description, and price.
- Provide a simple JWT-protected admin flow for managing featured items.

## Scope
- Home page with hero, featured items, and footer.
- Product page that spotlights a single Etsy listing with key details.
- Admin page that authenticates and links listings by URL or ID.
- Basic SQLite storage to cache linked listings.

## Out of scope (for now)
- Multi-user roles, analytics, or inventory management.
- Custom checkout or payment processing.
- Complex CMS or batch sync automation.

## Success criteria
- Admin can sign in and link at least one Etsy listing.
- Home page renders a featured grid sourced from the Etsy-linked items.
- Product page shows full details for a selected listing.
