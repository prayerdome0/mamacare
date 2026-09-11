import { getSupabase, isSupabaseConfigured } from "./supabase";
import { buildDemoData } from "./demo-data";
import type { DashboardData, MotherRow } from "./types";

/**
 * Data source: live Supabase when configured (anon key + RLS), otherwise
 * the deterministic demo dataset. Live mode failures fall back to demo
 * with a visible note rather than showing a broken page.
 */
export async function getDashboardData(): Promise<DashboardData> {
  if (!isSupabaseConfigured()) return buildDemoData();
  const supa = getSupabase();
  if (!supa) return buildDemoData();

  try {
    const demo = buildDemoData();
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const [registered, visits, missed, referrals, deliveries, mothersRes, alertsRes, facilitiesRes] =
      await Promise.all([
        supa.from("mothers").select("*", { count: "exact", head: true }),
        supa
          .from("anc_visits")
          .select("*", { count: "exact", head: true })
          .gte("visit_date", monthStart),
        supa
          .from("appointments")
          .select("*", { count: "exact", head: true })
          .eq("status", "scheduled")
          .lt("scheduled_date", todayIso),
        supa
          .from("referrals")
          .select("*", { count: "exact", head: true })
          .neq("status", "closed"),
        supa.from("deliveries").select("*", { count: "exact", head: true }),
        supa
          .from("mothers")
          .select(
            "id, mother_code, full_name, age, phone, registration_facility_id, created_at",
          )
          .limit(500),
        supa.from("alerts").select("level, status").limit(1000),
        supa.from("facilities").select("*"),
      ]);

    if (mothersRes.error) throw mothersRes.error;

    const mothers: MotherRow[] = (mothersRes.data ?? []).map(
      (m: Record<string, unknown>) =>
        ({
          id: String(m.id),
          code: String(m.mother_code ?? m.id).slice(0, 12),
          name: String(m.full_name ?? "—"),
          age: Number(m.age ?? 0),
          phone: String(m.phone ?? ""),
          facilityId: String(m.registration_facility_id ?? ""),
          status: "active",
          gaWeeks: 0,
          gaDays: 0,
          edd: "",
          risk: "green",
          lastVisit: null,
          nextAppt: null,
          activeReferral: false,
          missed: 0,
        } satisfies MotherRow),
    );

    const alerts = (alertsRes.data ?? []) as Array<{ level: string; status: string }>;
    const open = alerts.filter((a) => a.status === "open");

    return {
      ...demo,
      source: "supabase",
      facilities:
        (facilitiesRes.data ?? []).map((f: Record<string, unknown>) => ({
          id: String(f.id),
          name: String(f.name),
          district: String(f.district ?? ""),
          type: String(f.facility_type ?? ""),
        })) || demo.facilities,
      mothers,
      counts: {
        registered: registered.count ?? mothers.length,
        visitsThisMonth: visits.count ?? 0,
        missed: missed.count ?? 0,
        highRisk: open.filter((a) => a.level !== "green").length,
        activeReferrals: referrals.count ?? 0,
        deliveries: deliveries.count ?? 0,
      },
      alerts: {
        red: open.filter((a) => a.level === "red").length,
        amber: open.filter((a) => a.level === "amber").length,
        green: 0,
      },
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      ...buildDemoData(),
      fallbackNote: `Live query failed (${String(e)}). Showing demo data.`,
    };
  }
}
