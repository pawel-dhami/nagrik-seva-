# Nagrik Seva Portal Backend

This repository contains a static front‑end (`index.html`) and a simple Node.js/Express backend that provides authentication APIs and complaint reporting persistence.

## Setup

```bash
# install dependencies
npm install

# start server (defaults to port 3000)
npm start
```

The server will create a `data.db` SQLite database file in the project root.

## Available APIs

- `POST /api/auth/citizen` – body `{ aadhaar, otp }`. OTP is currently hard‑coded to `123456` for development.
- `POST /api/auth/authority` – body `{ email, password }`. A default authority account is seeded (`admin@municipalcorp.gov.in` / `password`).
- `POST /api/reports` – citizen‑only; submits a new complaint. Requires `Authorization: Bearer <token>` header obtained from login.
- `GET /api/reports` – authority‑only; lists all stored reports.

The front end is served from `/` and will automatically call these endpoints where appropriate.

## Deploying to Vercel

This project can be deployed as a single Vercel project using their serverless functions feature. To do so:

1. **Install the Vercel CLI** (if you don’t have it):
   ```bash
   npm i -g vercel
   ```
2. **Add the API handler** (see the `api/index.js` file in this repo). Vercel will turn anything under `/api` into a serverless function.
3. **Push your repository to GitHub** (or another Git provider).
4. **Create a new Vercel project**, linking it to the repo. Vercel will detect Node.js and install dependencies automatically.

By default, requests to `/api/*` will be handled by the Express app. The static frontend (`index.html`) is served from the root.

Local testing still works with `npm start` which uses `server.js`; Vercel ignores that file.

Once deployed you’ll have a live URL such as `https://<your-project>.vercel.app` where the portal is accessible.

### Using the Vercel CLI

If you prefer to deploy from the command‑line:

```bash
# from project root
vercel login           # sign in with your account
vercel                 # follow prompts to create a project
``` 

Every time you run `vercel` it will upload your code and provision new instances. Use `vercel --prod` to deploy to production.

> **Note:** serverless functions have a cold-start latency; for heavy traffic you may want a dedicated Node host or migrate the API to Vercel's "Edge Functions" or another platform.

