# MAMA CARE — Supervisor Dashboard (Next.js)

Runs in two modes:

- **Demo mode** (default, no credentials): deterministic generated data so the
  UI is fully explorable — `npm run dev` and sign in with anything.
- **Live mode**: set `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  in `.env.local` (or Vercel env vars). Queries run through the anon key, so
  **RLS scopes everything to the signed-in user's facility/district**.

## Commands

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (Vercel does this automatically)
```

## Deploy to Vercel

1. Import this repository (root: `dashboard/` — set **Root Directory** to
   `dashboard`).
2. Framework preset: Next.js (auto-detected).
3. Add env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy. No server-side secrets are needed for the MVP dashboard.

## PII policy

- Aggregate views never show personal identifiers.
- Phone numbers are masked in every list view.
- CSV export is aggregate-only unless the supervisor explicitly opts in;
  even then phones stay masked. Live mode writes audit entries for exports.
