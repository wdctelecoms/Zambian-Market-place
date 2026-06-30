# Zambian Marketplace

This project now connects the core marketplace pages to the backend API:

- Home page links to shop, cart, chat, and auth flows
- Login and registration pages call the authentication endpoints
- Shop page loads products from the customer search API and supports add-to-cart and pre-order actions
- Seller dashboard loads seller stats and lets sellers create products
- Cart page loads the customer's cart from the API
- Chat page loads conversations and sends messages

## Run locally

1. Start the backend server:
   - `cd server && npm install`
   - `npm run dev`
2. Serve the frontend:
   - `cd .. && python3 -m http.server 8000`
3. Open `http://127.0.0.1:8000/`
