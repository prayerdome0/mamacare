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

> A root-level `vercel.json` in this repository also makes the repo deploy
> correctly if the project's Root Directory is left at the repository root:
> it builds `dashboard/` and serves `dashboard/.next`. You do not need to
> change anything when Root Directory is set to `dashboard`.

## Troubleshooting: `404: NOT_FOUND` / `Code: NOT_FOUND`

The error page with an ID like `cpt1::6hlvg-…` is served by **Vercel's edge**,
before your app runs. It means the URL is not backed by a successful
deployment — with this repo layout the cause is almost always the project
pointing at the wrong directory or framework. Fix in the Vercel console:

1. **Project → Settings → General → Root Directory** — must be `dashboard`
   (the only folder with a `package.json` / `next.config.mjs`).
2. **Settings → General → Framework Preset** — must be **Next.js**, not
   "Other".
3. Trigger a fresh deploy: **Deployments → latest → ⋮ → Redeploy** (untick
   "Use existing Build Cache" once).
4. Check the build logs of that deploy — a healthy build lists
   `/`, `/dashboard`, `/mothers`, `/alerts`, `/reports` in the route table.

If a route 404s while the rest of the app works (no Vercel error ID shown),
that is a normal app-level 404 and renders the app's own branded 404 page
(`app/not-found.tsx`).

## PII policy

- Aggregate views never show personal identifiers.
- Phone numbers are masked in every list view.
- CSV export is aggregate-only unless the supervisor explicitly opts in;
  even then phones stay masked. Live mode writes audit entries for exports.
