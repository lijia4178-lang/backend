Backend for AI Chat Desktop. Provides chat streaming via OpenRouter, Supabase-backed auth/usage, and PayPal subscription management. Built on Next.js App Router.

## Endpoints
- `POST /api/chat` – SSE streaming chat proxy; enforces free daily quota and Pro eligibility before calling OpenRouter.
- `GET /api/user` – returns subscription status, usage, available models, default model.
- `GET /api/models` – public model catalog.
- `POST /api/paypal/checkout` – creates a PayPal subscription.
- `POST /api/paypal/portal` – returns a PayPal customer portal link.
- `POST /api/paypal/webhook` – handles subscription lifecycle webhooks (configure PayPal endpoint to point here).

## Environment
Copy `.env.example` to `.env.local` and fill:
- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- OpenRouter: `OPENROUTER_API_KEY`, optional `OPENROUTER_BASE_URL`.
- PayPal: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_PLAN_ID`, `PAYPAL_ENV`.
- App: `FRONTEND_URL` (CORS origin), `NEXT_PUBLIC_APP_URL`.
- Limits: `FREE_DAILY_MESSAGES`, `FREE_INITIAL_CREDITS`, `PRO_MONTHLY_PRICE`.

## Run locally
```bash
npm install
PORT=3001 npm run dev
```
(Default Vite frontend expects `http://localhost:3001`; change `VITE_API_URL` if you pick another port.)

## Local webhook testing (PayPal)

Expose your local backend so PayPal can reach it:

- **ngrok**
	- Run: `ngrok http 3001`
	- Set the webhook URL to `https://<your-ngrok-domain>/api/paypal/webhook`

- **PayPal CLI** (if installed)
	- Forward to: `http://localhost:3001/api/paypal/webhook`

## Production
```bash
npm run build
PORT=3001 npm run start
```
Set the same env vars as in dev and point your host to expose the chosen port. Configure PayPal webhook ID for `/api/paypal/webhook`.
