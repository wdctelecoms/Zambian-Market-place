# Zambian Marketplace

This project now connects the core marketplace pages to the backend API:

- Home page links to shop, cart, chat, and auth flows
- Login and registration pages call the authentication endpoints
- Shop page loads products from the customer search API and supports add-to-cart and pre-order actions
- Seller dashboard loads seller stats and lets sellers create products
- Cart page loads the customer's cart from the API
- Chat page loads conversations and sends messages

## Authentication

- Login, registration, and Google OAuth use Supabase Auth.
- Protected marketplace pages require an active authenticated session.
- Direct access to protected pages redirects unauthenticated users to `login.html`.
- The authentication session is refreshed through Supabase and mirrored into the marketplace session storage.

## Run locally

1. Copy the example environment file and fill in your real Supabase/Postgres values:
   - `cd server && cp .env.example .env`
2. Install and start the backend server:
   - `npm install`
   - `npm run dev`
3. Open the site from the same Express server that now serves the client assets:
   - `http://127.0.0.1:5000/`

> The frontend is statically served by the backend, so the browser, API routes, and Supabase-auth token flow all run on the same origin.
