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
KoboPay API running on port 5000
```

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
