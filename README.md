# KoboPay

Simple, secure banking — a beginner-friendly full-stack banking app built with Node.js, Express, PostgreSQL (Sequelize), and Next.js.

---

## Prerequisites

- Node.js 18+
- PostgreSQL running locally
- `npm` or `yarn`

---

## 1. Create the Database

Sequelize creates the tables automatically on first start. You only need an empty database:

```bash
createdb kobopay_db
```

Or using `psql`:

```sql
CREATE DATABASE kobopay_db;
```

---

## 2. Configure Environment Variables

### Backend

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in your values:

```
DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/kobopay_db
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

> **Important:** Environment variables are loaded at startup. Restart the backend server and run `npm run dev` again for the frontend after changing any value.

---

## 3. Install & Start the Backend

```bash
cd backend
npm install
node src/server.js
```

The server starts on port `5000` by default. You should see:

```
KoboPay API running on port 5000
Database connected successfully
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
3. Restart `npm run dev` — Next.js inlines `NEXT_PUBLIC_` values at build time, so a restart is required.

The name propagates to the browser tab title, the header, the login/register headings, and the dashboard footer automatically.

---

## Notes

- Sequelize's `sync()` creates tables if they don't exist. It will not modify or drop columns on an existing database.
- **For production**, use [Sequelize migrations](https://sequelize.org/docs/v6/other-topics/migrations/) instead of `sync()` to manage schema changes safely.
- Never commit `.env` files. The `.env.example` files are safe to commit (they contain no secrets).
