# Setting up MAMA CARE v2 — credentials & configuration

Two external configurations are deliberately left for you to supply:

1. **Your Supabase project** (URL + anon key, plus service-role for the SMS function)
2. **An approved SMS gateway** (Twilio, or any HTTP endpoint)

Nothing is hard-coded. Every secret lives exactly once, in the least-privileged place.

## 1. Create the Supabase project

1. Supabase → **New project**.
2. Settings → **API** → copy the **Project URL** and **anon public key**.
3. (Keep the **service_role** key secret — it is only injected into the Edge
   Function environment by Supabase; never ship it in the app or dashboard.)

## 2. Apply the schema

```bash
# from repo root, with the Supabase CLI logged in and linked
supabase link --project-ref <your-project-ref>
supabase db push
supabase db seed            # optional demo data
```

Create your staff users in Supabase → Authentication → Users (email + password).
The `profiles` row is created automatically on first login with role `chp`;
an admin then sets role/facility (admin panel or direct SQL for now).

## 3. Dashboard (Vercel)

`dashboard/.env.local` (local dev) / Vercel project env vars (production):

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |

Deploy:

```bash
# Vercel CLI
vercel --prod            # Root Directory: dashboard/

# or in the Vercel dashboard: New Project → import repo →
#    Framework: Next.js → Root Directory: dashboard → add the two env vars
```

Without those variables the dashboard runs in demo mode (no real data).

## 4. Flutter app

Credentials are passed at build time (never committed), e.g. `run.sh`:

```bash
#!/usr/bin/env bash
flutter run \
  --dart-define=SUPABASE_URL="https://<ref>.supabase.co" \
  --dart-define=SUPABASE_ANON_KEY="<anon-key>"
```

Release build:

```bash
flutter build apk --release \
  --dart-define=SUPABASE_URL="https://<ref>.supabase.co" \
  --dart-define=SUPABASE_ANON_KEY="<anon-key>"
```

The app validates configuration at startup and shows a clear "not configured"
state instead of failing obscurely.

## 5. SMS reminders (Edge Function)

```bash
supabase functions deploy sms-reminders --no-verify-jwt

# Shared secret so only cron (or you) can invoke it
supabase functions secret set SMS_INTERNAL_TOKEN "$(openssl rand -hex 32)"

# Provider — pick ONE
supabase functions secret set SMS_PROVIDER twilio
supabase functions secret set TWILIO_ACCOUNT_SID AC...
supabase functions secret set TWILIO_AUTH_TOKEN ...
supabase functions secret set TWILIO_FROM_NUMBER +260970000000

# or a generic HTTP gateway
# supabase functions secret set SMS_PROVIDER http
# supabase functions secret set HTTP_SMS_ENDPOINT https://...
# supabase functions secret set HTTP_SMS_API_KEY ...
```

Schedule it (Supabase Dashboard → Cron, or SQL):

```sql
select cron.schedule('sms-reminders-daily', '0 7 * * *',
  $$ select net.http_post(
       url: 'https://<ref>.supabase.co/functions/v1/sms-reminders',
       headers: jsonb '{"Authorization":"Bearer <SMS_INTERNAL_TOKEN>","Content-Type":"application/json"}',
       body: jsonb '{"windowHours":48}') $$);
```

Test it:

```bash
curl -X POST 'https://<ref>.supabase.co/functions/v1/sms-reminders' \
  -H "Authorization: Bearer <SMS_INTERNAL_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"windowHours":48,"dryRun":true}'
```

## 6. Where each secret lives (summary)

| Secret | Lives in |
|---|---|
| Supabase URL + anon key | Dashboard env vars, Flutter `--dart-define` |
| Supabase service-role key | Supabase Edge Function environment only |
| SMS gateway credentials | Supabase Edge Function secrets only — **never** in the app |
| `SMS_INTERNAL_TOKEN` | Edge Function secret + cron job |
| User passwords | Supabase Auth (hashed) — the app stores only the session |
