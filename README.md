# CastleWatch Phase One Frontend

This is a clean Next.js starter frontend for CastleWatch.

It is designed for:

- Vercel frontend hosting
- Railway backend API
- Railway Postgres behind the backend
- Mobile-first use during a Disney trip
- Phase One testing before advanced heat maps and predictions

---

## What this filepack gives you

- A working Next.js app structure
- A homepage dashboard
- Backend status check
- API connection test
- Ride data fetch test
- Placeholder heat map cards
- Clear environment variable setup

---

## Recommended architecture

```txt
Phone / Browser
  ↓
Vercel Next.js frontend
  ↓
Railway backend API
  ↓
Railway Postgres database
```

Vercel should display the website.

Railway should handle:
- API routes
- database connection
- ride wait-time collection
- future prediction logic
- future heat-map calculations

---

## Step 1: Create a new GitHub frontend repo

Create a new repo such as:

```txt
castlewatch-frontend
```

Upload these files into that repo.

Do not mix this into your backend repo unless you intentionally want a monorepo.

---

## Step 2: Install locally, optional

If using a computer:

```bash
npm install
npm run dev
```

Then open:

```txt
http://localhost:3000
```

---

## Step 3: Add the Railway backend URL locally

Copy `.env.example` to `.env.local`.

Then add your public Railway backend URL:

```env
NEXT_PUBLIC_API_BASE_URL=https://YOUR-RAILWAY-BACKEND.up.railway.app
```

Important:

Use the public Railway app URL, not the private Postgres URL.

Wrong:

```txt
postgresql://...
postgres.railway.internal
```

Correct:

```txt
https://your-backend-name.up.railway.app
```

---

## Step 4: Deploy to Vercel

In Vercel:

1. Add New Project
2. Import your GitHub frontend repo
3. Framework Preset should detect Next.js
4. Add this environment variable:

```txt
NEXT_PUBLIC_API_BASE_URL
```

Value:

```txt
https://YOUR-RAILWAY-BACKEND.up.railway.app
```

5. Deploy

---

## Step 5: Backend endpoints this frontend tries

This filepack checks several common endpoint names so it is forgiving while you are still building.

Status checks try:

```txt
/
 /health
 /api/health
 /status
```

Ride data checks try:

```txt
/api/rides
/rides
/api/wait-times
/wait-times
```

If your backend uses different routes, edit:

```txt
app/lib/api.ts
```

---

## Phase One goal

Phase One is successful when:

- Vercel site loads
- Backend status says connected
- API test succeeds
- Ride data loads or shows a clear missing-endpoint message
- You understand where frontend ends and backend begins

---

## What Phase Two should add

After Phase One works:

- Real park selector
- Magic Kingdom / Hollywood Studios / Epcot / Animal Kingdom views
- Historical wait-time charting
- Area demand scores
- Forecasted ride demand
- Real heat map visual layer
- Mobile recommendations while inside the parks

---

## Troubleshooting

### Backend says not connected

Check that your Vercel environment variable is:

```txt
NEXT_PUBLIC_API_BASE_URL
```

Not:

```txt
DATABASE_URL
```

Not:

```txt
POSTGRES_URL
```

Not:

```txt
RAILWAY_PRIVATE_DOMAIN
```

### Ride data does not load

That is okay if the backend does not yet expose a rides endpoint.

The frontend will still prove whether the backend is reachable.

### Vercel deploy fails

Make sure your repo contains:

```txt
package.json
app/page.tsx
app/layout.tsx
```

---

## Suggested next prompt for ChatGPT

After uploading this to GitHub and deploying to Vercel, ask:

```txt
My CastleWatch Phase One frontend is deployed. Here is my Vercel URL and Railway backend URL. Help me test each connection step.
```
