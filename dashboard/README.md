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

**The Root Directory setting is mandatory.** Vercel's Next.js build requires
`package.json` (with `next`) inside the project's Root Directory — there is
no repository-side file (`vercel.json`, root `package.json`, …) that can
substitute for it.

## Troubleshooting Vercel deploy errors

If you see either of these, the Vercel project is building the **repository
root**, where there is no `package.json`:

- `No Next.js version detected. Make sure your package.json has "next" in
  either "dependencies" or "devDependencies". Also check your Root Directory
  setting matches the directory of your package.json file.`
- `404: NOT_FOUND` / `Code: NOT_FOUND` with an error ID like `cpt1::6hlvg-…`
  (Vercel's edge 404 — shown when the URL has no successful deployment).

**Fix — 2 minutes in the Vercel console, applies to the existing project, no
merge or code change needed:**

1. Vercel Dashboard → your project → **Settings → General**.
2. **Root Directory** → click *Edit* → enter exactly `dashboard` (no leading
   slash) → *Save*.
3. **Framework Preset** → **Next.js** (it auto-detects once Root Directory
   is `dashboard`; just make sure it isn't "Other").
4. **Deployments → latest → ⋮ → Redeploy** (untick "Use existing Build
   Cache" once).

A healthy deploy's build log ends with a route table listing `/`,
`/dashboard`, `/mothers`, `/alerts`, `/reports`.

If a route 404s while the rest of the app works (no Vercel error ID shown),
that is a normal app-level 404 and renders the app's own branded 404 page
(`app/not-found.tsx`).

## PII policy

- Aggregate views never show personal identifiers.
- Phone numbers are masked in every list view.
- CSV export is aggregate-only unless the supervisor explicitly opts in;
  even then phones stay masked. Live mode writes audit entries for exports.
