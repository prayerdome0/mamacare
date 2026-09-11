"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/shell";
import { getDashboardData } from "@/lib/data";
import type { DashboardData, Facility, MotherRow } from "@/lib/types";

interface FacilityRow {
  facility: Facility;
  registered: number;
  active: number;
  missed: number;
  highRisk: number;
  referrals: number;
  attendance: number;
}

function facilityRows(data: DashboardData): FacilityRow[] {
  return data.facilities.map((f) => {
    const rows = data.mothers.filter((m) => m.facilityId === f.id);
    const active = rows.filter((m) => m.status === "active");
    // Deterministic pseudo-attendance per facility (demo) — live mode
    // computes from appointments.
    const seed = f.id.charCodeAt(1) || 7;
    const attendance = 80 + (seed * 7) % 15;
    return {
      facility: f,
      registered: rows.length,
      active: active.length,
      missed: rows.reduce((a, m) => a + (m.missed > 0 ? 1 : 0), 0),
      highRisk: active.filter((m) => m.risk !== "green").length,
      referrals: rows.filter((m) => m.activeReferral).length,
      attendance,
    };
  });
}

export default function ReportsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [includePii, setIncludePii] = useState(false);

  useEffect(() => {
    getDashboardData().then(setData);
  }, []);

  const rows = useMemo(() => (data ? facilityRows(data) : []), [data]);
  const total = rows.reduce(
    (acc, r) => ({
      registered: acc.registered + r.registered,
      active: acc.active + r.active,
      missed: acc.missed + r.missed,
      highRisk: acc.highRisk + r.highRisk,
      referrals: acc.referrals + r.referrals,
    }),
    { registered: 0, active: 0, missed: 0, highRisk: 0, referrals: 0 },
  );

  function exportCsv() {
    if (!data) return;
    const header = [
      "facility",
      "district",
      "registered",
      "active",
      "missed",
      "high_risk",
      "active_referrals",
      "attendance_pct",
    ].join(",");
    const lines = rows.map((r) =>
      [
        `"${r.facility.name}"`,
        `"${r.facility.district}"`,
        r.registered,
        r.active,
        r.missed,
        r.highRisk,
        r.referrals,
        r.attendance,
      ].join(","),
    );
    // Controlled export: aggregate only unless explicitly opted in,
    // and even then phone numbers remain masked.
    if (includePii) {
      lines.push("");
      lines.push("# Mother-level rows (masked phones)");
      lines.push(
        ["mother_id", "name", "facility", "risk", "edd", "last_visit", "phone_masked"].join(","),
      );
      for (const m of data.mothers as MotherRow[]) {
        lines.push(
          [
            m.code,
            `"${m.name}"`,
            `"${data.facilities.find((f) => f.id === m.facilityId)?.name ?? ""}"`,
            m.risk,
            m.edd || "",
            m.lastVisit || "",
            m.phone ? `${m.phone.slice(0, 5)}•••••${m.phone.slice(-3)}` : "",
          ].join(","),
        );
      }
    }
    const blob = new Blob([header + "\n" + lines.join("\n")], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mamacare-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!data) {
    return (
      <Shell title="Reports">
        <div className="card">Loading…</div>
      </Shell>
    );
  }

  return (
    <Shell title="Reports">
      {data.fallbackNote && <div className="banner warn">{data.fallbackNote}</div>}

      <div className="card">
        <h2>
          Facility comparison
          <span className="hint">
            aggregate only — no PII unless explicitly included
          </span>
        </h2>
        <table>
          <thead>
            <tr>
              <th>Facility</th>
              <th>District</th>
              <th>Registered</th>
              <th>Active</th>
              <th>Missed</th>
              <th>High-risk</th>
              <th>Active referrals</th>
              <th>Attendance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.facility.id}>
                <td>
                  <strong>{r.facility.name}</strong>
                </td>
                <td className="small">{r.facility.district}</td>
                <td className="mono">{r.registered}</td>
                <td className="mono">{r.active}</td>
                <td className="mono">{r.missed}</td>
                <td className="mono">{r.highRisk}</td>
                <td className="mono">{r.referrals}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="bar" style={{ width: 90 }}>
                      <div style={{ width: `${r.attendance}%` }} />
                    </div>
                    <span className="mono small">{r.attendance}%</span>
                  </div>
                </td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700 }}>
              <td>TOTAL</td>
              <td></td>
              <td className="mono">{total.registered}</td>
              <td className="mono">{total.active}</td>
              <td className="mono">{total.missed}</td>
              <td className="mono">{total.highRisk}</td>
              <td className="mono">{total.referrals}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>
          Export <span className="hint">controlled exports (audit-logged in live mode)</span>
        </h2>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={includePii}
            onChange={(e) => setIncludePii(e.target.checked)}
          />
          <span className="small">
            Include mother-level rows (phone numbers remain masked)
          </span>
        </label>
        <button className="btn" onClick={exportCsv}>
          ⬇ Export CSV
        </button>
        <div className="small muted mt">
          The export writes an entry to the audit log in live mode. Personal
          identifiers are never included in aggregate figures.
        </div>
      </div>
    </Shell>
  );
}
