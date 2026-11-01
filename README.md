# KoboPay

Simple, secure banking — a beginner-friendly full-stack banking app built with Node.js, Express, PostgreSQL (Aiven), Sequelize, and Next.js.

---

## About

KoboPay is a simple, secure banking app. Create an account in seconds and get your own 10-digit account number. Deposit money, set a 4-digit PIN, and send money to anyone by account number. You see the recipient's name before you confirm, and every transaction is recorded in your history.

---

## Prerequisites

- Node.js 18+
- `npm` or `yarn`
- An [Aiven](https://aiven.io) account (free tier works)

---

## 1. Create an Aiven PostgreSQL Service

1. Sign in at [console.aiven.io](https://console.aiven.io).
2. Click **Create service** → choose **PostgreSQL**.
3. Pick the free plan and a region close to you.
4. Wait for the service to reach **Running** status.
5. On the **Overview** tab, copy these values into `backend/.env`:
   - **Host** → `DB_HOST`
   - **Port** → `DB_PORT`
   - **User** → `DB_USER` (usually `avnadmin`)
   - **Password** → `DB_PASSWORD`
6. Click **Download CA cert** and save the file as `backend/certs/ca.pem`.

> **No need to create a database manually.** The app creates `kobopay_db` automatically on first start.

---

## 2. Configure Environment Variables

### Backend

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in your Aiven values:

```
DB_HOST=your-service-yourproject.aivencloud.com
DB_PORT=12345
DB_USER=avnadmin
DB_PASSWORD=your_aiven_password
DB_NAME=kobopay_db
DB_SSL=true
DB_SSL_CA_PATH=./certs/ca.pem
JWT_SECRET=<generate one below>
```

Add your Paystack configuration (see [Paystack Payments](#paystack-payments) below):

```
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxx
PAYSTACK_CALLBACK_URL=http://localhost:3000/payment/callback
PAYSTACK_WEBHOOK_SECRET=
```

`PAYSTACK_PUBLIC_KEY` is not used by the redirect checkout flow but is kept for
future Paystack Inline support. `PAYSTACK_WEBHOOK_SECRET` is optional: Paystack
signs webhooks with the secret key, so leave it blank unless you intentionally
use a separate signing value. Never expose the secret key to the frontend.

Generate a strong JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Frontend

```bash
cp frontend/.env.example frontend/.env
```

The defaults work for local development. Edit `NEXT_PUBLIC_APP_NAME` to rename the app (see [Renaming the App](#renaming-the-app)).

> **Important:** Environment variables are loaded at startup. Restart the backend server and run `npm run dev` again for the frontend after changing any `.env` value.

---

## 3. Install & Start the Backend

```bash
cd backend
npm install
node src/server.js
```

On a successful start you will see:

```
Database "kobopay_db" already exists   (or "created" on first run)
Connected to database
Applied migration 20261101000000-create-payments-and-ledger-link.js
Migrations up to date.
KoboPay API running on port 5000
```

To apply or roll back migrations manually (recommended before a production
deploy), use `npm run migrate`, `npm run migrate:status`, or
`npm run migrate:undo`. Migrations are additive; they do not drop user data.

---

## 4. Install & Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The app runs on [http://localhost:3000](http://localhost:3000).

---

## 5. Test the API

### Health check

```bash
curl http://localhost:5000/api/health
```

Expected:
```json
{ "success": true, "data": { "app": "KoboPay", "status": "ok" } }
```

### Register a user

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"full_name":"John Smith","email":"john@example.com","password":"secret123"}'
```

### Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"secret123"}'
```

Save the returned token and use it as `TOKEN` below:

```bash
TOKEN=<paste token here>
```

### Get balance

```bash
curl http://localhost:5000/api/account/balance \
  -H "Authorization: Bearer $TOKEN"
```

### Look up an account

```bash
curl http://localhost:5000/api/account/lookup/1234567890 \
  -H "Authorization: Bearer $TOKEN"
```

Expected:
```json
{ "success": true, "data": { "account_number": "1234567890", "full_name": "Jane Doe" } }
```

### Deposit

```bash
curl -X POST http://localhost:5000/api/account/deposit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_number":"<10-digit number>","amount":5000}'
```

### Start a Paystack wallet deposit

```bash
curl -X POST http://localhost:5000/api/payments/paystack/initialize \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(node -e "console.log(require('crypto').randomUUID())")" \
  -d '{"amount":"1000"}'
```

Response data contains `authorization_url`, `access_code`, and `reference`.
Redirect the user to `authorization_url`. The wallet is **not** credited at
this point. Send the same `Idempotency-Key` to safely replay a request.

### Verify a Paystack deposit

```bash
curl http://localhost:5000/api/payments/paystack/verify/KP_REFERENCE \
  -H "Authorization: Bearer $TOKEN"
```

The backend checks the reference belongs to the authenticated user, verifies it
with Paystack, validates amount/currency, and credits the wallet at most once.

### Create a PIN

```bash
curl -X POST http://localhost:5000/api/account/pin \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pin":"1234"}'
```

### Change a PIN

```bash
curl -X PUT http://localhost:5000/api/account/pin \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"current_pin":"1234","new_pin":"5678"}'
```

### Transfer

```bash
curl -X POST http://localhost:5000/api/account/transfer \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to_account_number":"<recipient 10-digit number>","amount":1000,"pin":"1234"}'
```

### Transaction history

```bash
# Page 1, 10 per page (defaults)
curl "http://localhost:5000/api/account/transactions" \
  -H "Authorization: Bearer $TOKEN"

# Page 2, 5 per page
curl "http://localhost:5000/api/account/transactions?page=2&limit=5" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Paystack Payments

KoboPay uses Paystack's hosted checkout (redirect flow). Card details are never
collected or stored by KoboPay.

### Backend endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/payments/paystack/initialize` | Bearer JWT | Create a pending payment and return a Paystack checkout URL |
| `GET` | `/api/payments/paystack/verify/:reference` | Bearer JWT | Verify with Paystack and credit the wallet once |
| `POST` | `/api/payments/paystack/webhook` | Paystack signature | Process `charge.success` events |

Initialization accepts `{ "amount": "1000.00" }` in NGN. The amount is converted
to integer kobo on the server and is checked against `PAYMENT_MIN_NGN` /
`PAYMENT_MAX_NGN`. The authenticated user always comes from the JWT; a
client-supplied user ID or status is ignored. An optional `Idempotency-Key`
header makes retries safe.

### Get Paystack test credentials

1. Sign in at [dashboard.paystack.com](https://dashboard.paystack.com).
2. Switch the dashboard to **Test mode**.
3. Open **Settings → API Keys & Webhooks**.
4. Copy the **Test Secret Key** (`sk_test_...`) into `PAYSTACK_SECRET_KEY`.
5. Copy the **Test Public Key** (`pk_test_...`) into `PAYSTACK_PUBLIC_KEY`.
6. Keep test and live keys in separate environments. Never use `sk_live_...`
   locally or commit either key.

### Configure the callback URL

`PAYSTACK_CALLBACK_URL` is a **frontend** URL, not the backend API URL:

- Local: `http://localhost:3000/payment/callback`
- Production: `https://<your-frontend-domain>/payment/callback`

Paystack redirects the customer there with `?reference=...&trxref=...`. The
callback page asks the backend to verify the reference; query parameters alone
are never treated as proof of payment.

### Configure the webhook URL

In the Paystack Dashboard open **Settings → API Keys & Webhooks → Webhook URL**
and set:

```
https://kobopay-production.up.railway.app/api/payments/paystack/webhook
```

Paystack signs each request with `x-paystack-signature`, an HMAC-SHA512 of the
exact raw body using your secret key. The backend validates this signature before
processing anything, then independently verifies `charge.success` with Paystack
before crediting a wallet. Repeated deliveries are idempotent.

### Configure Railway

In the Railway backend service **Variables**, add (do not commit them):

```
PAYSTACK_SECRET_KEY=sk_test_or_live_...
PAYSTACK_PUBLIC_KEY=pk_test_or_live_...
PAYSTACK_CALLBACK_URL=https://<your-frontend-domain>/payment/callback
PAYSTACK_WEBHOOK_SECRET=            # optional; leave blank to use the secret key
CORS_ORIGIN=https://<your-frontend-domain>
NODE_ENV=production
```

`NODE_ENV=production` makes the backend refuse to start if
`PAYSTACK_SECRET_KEY` or `PAYSTACK_CALLBACK_URL` is missing. The frontend needs
no Paystack key at all.

### Run migrations safely

```bash
cd backend
npm run migrate:status     # inspect
npm run migrate            # apply additive changes
npm run migrate:undo       # roll back the most recent migration only
```

The server also applies pending migrations on startup after `sequelize.sync()`.
That combination adds the `paymentId` ledger column to an existing database
without dropping or rewriting existing tables.

### Run automated tests

```bash
cd backend
npm test
```

Tests use Node's built-in test runner and mocked Paystack responses. They never
make real charges.

### Test a deposit in Paystack test mode

1. Use `sk_test_...`/`pk_test_...` keys and restart the backend.
2. Log in to KoboPay and use **Add money** on the dashboard.
3. On Paystack checkout use test card `4084 0840 8408 4081`, any future expiry,
   CVV `408`, and PIN `0000` (or the OTP Paystack shows).
4. You are redirected to `/payment/callback`; the backend verifies the payment
   and the wallet is credited exactly once.
5. In the Paystack Dashboard, the test transaction appears under **Transactions**.
6. You can resend the webhook from the dashboard to confirm duplicate deliveries
   do not double-credit the wallet.

### Switch to live mode safely

1. Complete test-mode testing and confirm wallet credits/ledger entries.
2. In Paystack, complete any required business/KYC activation and switch the
   dashboard to **Live mode**.
3. Copy the live secret/public keys into the Railway **production** environment
   only. Keep test keys in staging/local.
4. Update `PAYSTACK_CALLBACK_URL` to the production frontend URL and update the
   live-mode Paystack webhook URL.
5. Deploy, then make a small real deposit and confirm the credit and ledger row
   before announcing availability.

> Never log or expose `PAYSTACK_SECRET_KEY` or `PAYSTACK_WEBHOOK_SECRET`, and
> never put either in a `NEXT_PUBLIC_` variable.

---

## Renaming the App

The app name is read from `NEXT_PUBLIC_APP_NAME` in `frontend/.env`. To rename it:

1. Open `frontend/.env`
2. Change the value: `NEXT_PUBLIC_APP_NAME=MyBank`
3. Also update the `title` string in `frontend/app/layout.js` to match.
4. Restart `npm run dev` — Next.js inlines `NEXT_PUBLIC_` values at build time, so a restart is required.

The name propagates to the browser tab title, the header wordmark, the login/register headings, the dashboard footer, and the About page automatically.

---

## Deploying (Render, Railway, etc.)

- Set all `DB_*` environment variables in the hosting dashboard instead of using a `.env` file.
- Include `backend/certs/ca.pem` in the repository (it is a public certificate, not a secret).
- Set `DB_SSL=true` and `DB_SSL_CA_PATH=./certs/ca.pem`.
- Set `NODE_ENV=production`.
- Set the `PAYSTACK_*` variables and `CORS_ORIGIN` to your deployed frontend.
- Run `npm run migrate` (or let startup apply pending migrations) before
  enabling the payment endpoints. The migration is additive.
- In the Paystack Dashboard, set the webhook URL to
  `https://kobopay-production.up.railway.app/api/payments/paystack/webhook`.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `self-signed certificate in certificate chain` | Wrong or missing CA certificate | Check `DB_SSL_CA_PATH` and make sure `ca.pem` was downloaded from your Aiven service |
| `password authentication failed` | Wrong `DB_PASSWORD` | Re-copy the password from the Aiven Overview tab |
| `ENOTFOUND` | Wrong `DB_HOST` | Re-copy the host from the Aiven Overview tab |
| Connection timeout | Aiven service is off or wrong port | Check that the service is running in the Aiven console; verify `DB_PORT` |
| `permission denied to create database` | Free plan restriction | Create the database in the Aiven console (Databases tab), then set `DB_NAME` to match |

---

## Notes

- Sequelize's `sync()` creates tables if they don't exist. It will not modify or drop columns on an existing database.
- **For production**, use [Sequelize migrations](https://sequelize.org/docs/v6/other-topics/migrations/) instead of `sync()` to manage schema changes safely.
- Never commit `.env` files. The `.env.example` files and `backend/certs/ca.pem` are safe to commit.
