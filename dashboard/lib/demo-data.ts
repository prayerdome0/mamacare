import type { DashboardData, Facility, MotherRow, RiskLevel } from "./types";

/**
 * Deterministic demo dataset (seeded PRNG — same data every load).
 * Used when Supabase env vars are absent, so the dashboard is fully
 * explorable without credentials. Figures mirror the design spec:
 * 1,248 registered • 386 visits this month • 47 missed • 63 high-risk
 * • 12 active referrals • 91 deliveries • 86% attendance.
 *
 * This is NOT real patient data.
 */

const FIRST = [
  "Mary", "Ruth", "Chipo", "Mutinta", "Bwalya", "Neema", "Thandiwe", "Mwape",
  "Lendy", "Zainab", "Alice", "Grace", "Mercy", "Rebecca", "Esther", "Judith",
  "Naomi", "Tendai", "Kgomotso", "Bina", "Precious", "Vulavula", "Chisenga",
  "Mumba", "Lombe", "Sakombe", "Katembo", "Zikomo", "Luyando", "Amayi",
];
const LAST = [
  "Phiri", "Banda", "Mwale", "Tembo", "Chanda", "Daka", "Mulenga", "Zulu",
  "Kamanga", "Nyirenda", "Mwanza", "Sitali", "Chilufya", "Mumba", "Sakala",
  "Bwalya", "Njenga", "Chileshe", "Kasonde", "Lumba", "Seshumba", "Temba",
  "Phala", "Ng'andu", "Kalaba", "Sinyanga",
];

const FACILITIES: Facility[] = [
  { id: "f1", name: "Chongwe Urban Health Centre", district: "Chongwe", type: "health_centre" },
  { id: "f2", name: "Kafue District Hospital", district: "Kafue", type: "district_hospital" },
  { id: "f3", name: "Chadiza Health Post", district: "Goryea", type: "health_post" },
  { id: "f4", name: "Lundazi District Hospital", district: "Lundazi", type: "district_hospital" },
  { id: "f5", name: "Sinazongwe Rural Hospital", district: "Sinazongwe", type: "district_hospital" },
  { id: "f6", name: "Chirundu Mission Hospital", district: "Chirundu", type: "district_hospital" },
];

// Facility weights (bigger facilities carry more of the caseload).
const FACILITY_WEIGHTS = [0.26, 0.2, 0.12, 0.18, 0.12, 0.12];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => n.toString().padStart(2, "0");

function isoDay(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function buildDemoData(): DashboardData {
  const rnd = mulberry32(20260911);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const mothers: MotherRow[] = [];

  // Status mix sums to 1,248: active 800, postnatal 110, delivered 91,
  // closed 160, lost 87.
  const statuses: Array<{ s: MotherRow["status"]; n: number }> = [
    { s: "active", n: 800 },
    { s: "postnatal", n: 110 },
    { s: "delivered", n: 91 },
    { s: "closed", n: 160 },
    { s: "lost_to_followup", n: 87 },
  ];

  let code = 100;
  for (const { s, n } of statuses) {
    for (let i = 0; i < n; i++) {
      code += Math.floor(rnd() * 3) + 1;

      // Facility by weight
      let f = FACILITIES[0];
      let r = rnd();
      for (let j = 0; j < FACILITY_WEIGHTS.length; j++) {
        r -= FACILITY_WEIGHTS[j];
        if (r <= 0) {
          f = FACILITIES[j];
          break;
        }
      }

      const age = 16 + Math.floor(rnd() * 30);
      let gaWeeks = 4 + Math.floor(rnd() * 38);
      const gaDays = Math.floor(rnd() * 7);
      if (s !== "active") gaWeeks = 0;

      // EDD from "LMP" implied by GA
      const lmpDays = gaWeeks * 7 + gaDays;
      const lmp = new Date(today.getTime() - lmpDays * 86400000);
      const edd = new Date(lmp.getTime() + 280 * 86400000);

      // Risk: 5 red + ~58 amber = 63 high-risk total (design spec)
      let risk: RiskLevel = "green";
      if (s === "active") {
        const r = rnd();
        if (i < 5) risk = "red";
        else if (r < 58 / 795) risk = "amber";
      }

      // Missed appointments: exactly 47 mothers (active only) are overdue;
      // "lost to follow-up" is a separate, broader category.
      let missed = 0;
      if (s === "active" && i < 47) missed = i < 23 ? 1 : 2;

      // Last visit within last 21 days for actives
      const lastVisit =
        s === "active"
          ? isoDay(new Date(today.getTime() - Math.floor(rnd() * 21) * 86400000))
          : isoDay(new Date(today.getTime() - (30 + Math.floor(rnd() * 300)) * 86400000));

      // Next appointment (some overdue → drives the "overdue" today count)
      let nextAppt: string | null = null;
      if (s === "active") {
        const delta = Math.floor(rnd() * 21) - 4; // -4..+17 days
        nextAppt = isoDay(new Date(today.getTime() + delta * 86400000));
      }

      mothers.push({
        id: `m${code}`,
        code: `MC-${code.toString().padStart(6, "0")}`,
        name: `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`,
        age,
        phone: `+260 9${Math.floor(rnd() * 9) + 1} ${Math.floor(rnd() * 900) + 100} ${Math.floor(rnd() * 9000) + 1000}`,
        facilityId: f.id,
        status: s,
        gaWeeks,
        gaDays,
        edd: s === "active" ? isoDay(edd) : null as unknown as string,
        risk,
        lastVisit,
        nextAppt,
        activeReferral: s === "active" && risk === "red",
        missed,
      });
    }
  }

  // Pin the design-spec hero figures on top of the generated base.
  const active = mothers.filter((m) => m.status === "active");

  // Exactly 12 active referrals.
  const REFERRALS = 12;
  let flagged = 0;
  for (const m of active) {
    if (flagged >= REFERRALS) break;
    if (m.activeReferral) {
      flagged++;
    } else {
      m.activeReferral = true;
      flagged++;
    }
  }
  const activeReferrals = flagged;

  const missedTotal = mothers.reduce((acc, m) => acc + (m.missed > 0 ? 1 : 0), 0);

  // "Today" view per the design: 12 appointments (2 urgent, 4 overdue, 6 routine)
  const todayAppts = active.filter((m) => m.nextAppt === isoDay(today)).length;
  const overdueToday = active.filter(
    (m) => m.nextAppt && m.nextAppt < isoDay(today),
  ).length;

  return {
    source: "demo",
    fallbackNote: null,
    facilities: FACILITIES,
    mothers,
    counts: {
      registered: mothers.length,
      visitsThisMonth: 386,
      missed: missedTotal,
      highRisk: active.filter((m) => m.risk !== "green").length,
      activeReferrals,
      deliveries: 91,
    },
    alerts: {
      red: 5,
      amber: 18,
      green: active.length - 5 - 18,
    },
    attendance: 86,
    today: {
      urgent: 2,
      overdue: Math.min(4, overdueToday),
      routine: Math.max(0, 12 - 2 - Math.min(4, overdueToday)),
    },
    generatedAt: now.toISOString(),
  };
}

/** Mask a phone number for aggregate views (PII minimization). */
export function maskPhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `${p.slice(0, 5)}•••••${p.slice(-3)}`;
}
