// MAMA CARE — SMS reminder Edge Function
//
// Deploys to: Supabase → Edge Functions (Deno runtime)
//   supabase functions deploy sms-reminders --no-verify-jwt
//
// Access:  internal only. The caller must send
//          Authorization: Bearer <SMS_INTERNAL_TOKEN>
// (set that secret with `supabase functions secret set SMS_INTERNAL_TOKEN`).
//
// Secrets (all in the Edge Function — never in the mobile app):
//   SMS_PROVIDER        "twilio" | "http"
//   TWILIO_ACCOUNT_SID  TWILIO_AUTH_TOKEN  TWILIO_FROM_NUMBER   (provider=twilio)
//   HTTP_SMS_ENDPOINT   HTTP_SMS_API_KEY                             (provider=http)
//
// Body: { "windowHours": 48, "dryRun": false }
//   - Finds 'scheduled' appointments falling inside the next `windowHours`.
//   - Sends one reminder per appointment to the mother's phone.
//   - Logs every attempt to the `sms_logs` table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // ── Access control ──────────────────────────────────────────────────────
  const expected = Deno.env.get("SMS_INTERNAL_TOKEN");
  const header = req.headers.get("authorization") ?? "";
  if (!expected || header !== `Bearer ${expected}`) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: { windowHours?: number; dryRun?: boolean };
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }
  const windowHours = Math.min(Math.max(payload.windowHours ?? 48, 1), 72);
  const dryRun = payload.dryRun ?? false;

  // ── Supabase (service role — this function runs with it) ───────────────
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceKey);

  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowHours * 3600 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const { data: appointments, error } = await supabase
    .from("appointments")
    .select(
      "id, scheduled_date, reminder_days, pregnancies(mother_id, mothers(id, full_name, phone))",
    )
    .eq("status", "scheduled")
    .gte("scheduled_date", iso(now))
    .lte("scheduled_date", iso(windowEnd));

  if (error) return json({ error: "db_query_failed", detail: error.message }, 500);

  const provider = Deno.env.get("SMS_PROVIDER") ?? "twilio";
  const sent: string[] = [];
  const failed: Array<{ appointment: string; reason: string }> = [];

  for (const appt of appointments ?? []) {
    const mother = appt.pregnancies?.mothers;
    const phone = mother?.phone;
    if (!phone) {
      failed.push({ appointment: appt.id, reason: "no_phone" });
      continue;
    }

    const apptDate = new Date(appt.scheduled_date).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const firstName = (mother?.full_name ?? "there").split(" ")[0];
    const message =
      `MAMA CARE reminder: ${firstName}, your ANC appointment is on ` +
      `${apptDate}. Please come early to avoid a queue. If you feel unwell ` +
      `or have any danger signs, go to your health facility immediately.`;

    let status = "dry_run";
    let providerRef: string | null = null;

    if (!dryRun) {
      try {
        if (provider === "twilio") {
          const r = await sendTwilioSms(phone, message);
          status = r ? "sent" : "failed";
          providerRef = r;
        } else {
          const r = await sendHttpSms(phone, message);
          status = r ? "sent" : "failed";
          providerRef = r;
        }
      } catch (e) {
        status = "failed";
        providerRef = String(e);
      }
    }

    if (status === "sent") sent.push(phone);
    if (status === "failed") failed.push({ appointment: appt.id, reason: providerRef ?? "send_error" });

    const { error: logErr } = await supabase.from("sms_logs").insert({
      appointment_id: appt.id,
      mother_id: mother?.id,
      phone,
      provider,
      status,
      message,
      provider_ref: providerRef,
    });
    if (logErr) console.error("sms_log insert failed:", logErr.message);
  }

  return json({
    windowHours,
    dryRun,
    provider,
    found: (appointments ?? []).length,
    sent: sent.length,
    failed: failed.length,
    failed_detail: failed,
  });
});

// ── Providers ─────────────────────────────────────────────────────────────

async function sendTwilioSms(to: string, body: string): Promise<string | null> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) throw new Error("twilio secrets missing");

  const creds = btoa(`${sid}:${token}`);
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    },
  );
  if (!res.ok) throw new Error(`twilio http ${res.status}`);
  const data = (await res.json()) as { sid?: string };
  return data.sid ?? "sent";
}

async function sendHttpSms(to: string, body: string): Promise<string | null> {
  const endpoint = Deno.env.get("HTTP_SMS_ENDPOINT");
  const apiKey = Deno.env.get("HTTP_SMS_API_KEY");
  if (!endpoint) throw new Error("http sms endpoint missing");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ to, message: body }),
  });
  if (!res.ok) throw new Error(`http sms ${res.status}`);
  const text = await res.text();
  return text.slice(0, 200) || "sent";
}
