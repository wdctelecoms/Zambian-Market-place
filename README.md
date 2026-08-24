# Zambian Marketplace

The production branch connects the customer-facing marketplace to the Express/Prisma backend and Supabase authentication instead of relying on demo marketplace data.

## Live marketplace behaviour

- Home statistics and featured products/categories are database-backed.
- Shop search, category and price filters use live products and stock.
- Cart, quantities, delivery addresses and checkout use the customer account and database.
- Customer order tracking is available at `client/orders.html`.
- Seller dashboard metrics and product inventory are database-backed.
- Chat uses the existing authenticated Socket.IO implementation.
- Product ratings/reviews are stored in the database and displayed with product details.
- A public Server-Sent Events stream refreshes marketplace pages when catalog/inventory data changes.
- Demo Unsplash product-image fallback is removed from the live shop presentation; products without an image show a neutral placeholder instead.
- Supabase authentication remains the source of user authentication, while Prisma/Postgres stores marketplace records.

## Production branch

Changes are being prepared on `production-marketplace` so they can be reviewed before merging into `main`.

## Run locally

1. Copy the example environment file and fill in your real Supabase/Postgres values:
   - `cd server && cp .env.example .env`
2. Install and build the backend:
   - `npm install`
   - `npm run build`
3. Start the backend:
   - `npm start`
4. Open the site from the Express server:
   - `http://127.0.0.1:5000/`

The frontend is statically served by the backend, so browser requests, API routes, Supabase authentication, Socket.IO chat, and the marketplace event stream share the same origin.
