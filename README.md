# SGCG Art Glass MVP

A lightweight React + Flask MVP that mirrors the Etsy seller experience with a home page, product spotlight, and admin listing sync.

**Live site:** https://sgcgartglass.vercel.app

## Project layout
- frontend: Vite + React client
- backend: Flask API with JWT auth and Etsy listing sync

## Local setup
1. Copy .env.example to .env and fill in values.
2. Install frontend dependencies:
   - cd frontend
   - npm install
   - npm run dev
3. Install backend dependencies:
   - python -m venv .venv
   - .venv\Scripts\activate
   - pip install -r requirements.txt
   - python -m backend.app

## Etsy sync
- Admin uses email/password from .env to get a JWT.
- Paste an Etsy listing URL or ID in the admin page.
- Backend pulls image, description, and price using Etsy API credentials.

## Environment profiles
- Production dependencies are listed under "Production" in requirements.txt.
- Development and test dependencies are listed under "Development" and "Testing" in requirements.txt.

## Deployment notes
- **Vercel (frontend):** https://sgcgartglass.vercel.app - Set VITE_API_BASE_URL to your Render backend URL in environment variables.
- **Render (backend):** Start command uses "gunicorn backend.wsgi:app". Set all environment variables from .env.example.
- **GitHub Pages:** set VITE_BASE_PATH before building if the site is served from a subpath.

## Branding
- Replace frontend/public/brand-logo.svg with your uploaded logo for accurate styling.
