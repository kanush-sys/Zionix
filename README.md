# Zionix 🧠
> Your Local Brain — Offline-First Agentic AI Assistant

**Live URL:** https://zionix.vercel.app

---

## Deploy in 6 Steps

### Step 1 — Supabase Database
1. Go to supabase.com → New Project
2. SQL Editor → New Query → paste `supabase-schema.sql` → Run

### Step 2 — Get Supabase Keys
Settings → API:
- `SUPABASE_URL` = Project URL
- `SUPABASE_SERVICE_KEY` = service_role secret key

### Step 3 — Safaricom Daraja
1. developer.safaricom.co.ke → My Apps → Create Sandbox App
2. Copy Consumer Key + Consumer Secret

### Step 4 — Deploy to Vercel
1. Push this repo to GitHub
2. vercel.com → Import repo → Deploy

### Step 5 — Set Environment Variables in Vercel
| Variable | Value |
|---|---|
| `MPESA_CONSUMER_KEY` | From Daraja |
| `MPESA_CONSUMER_SECRET` | From Daraja |
| `MPESA_SHORTCODE` | `174379` (sandbox) |
| `MPESA_PASSKEY` | From Daraja |
| `MPESA_ENV` | `sandbox` → `production` when live |
| `MPESA_CALLBACK_URL` | `https://your-app.vercel.app/api/callback` |
| `SUPABASE_URL` | From Supabase |
| `SUPABASE_SERVICE_KEY` | From Supabase |
| `NODE_VERSION` | `24` |

### Step 6 — Redeploy & Test
Vercel → Deployments → Redeploy

---

## Payment Flow
User clicks "Activate" → STK Push → User enters PIN → Callback confirms → `profiles.lifetime = true` → Success screen with cryptographic token

## Receiving Money
All Ksh 500 payments go to the Till/Paybill set as `MPESA_SHORTCODE` in production.

