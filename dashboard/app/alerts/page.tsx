"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/shell";
import { getDashboardData } from "@/lib/data";
import type { DashboardData } from "@/lib/types";

export default function AlertsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [facility, setFacility] = useState("all");
  const [level, setLevel] = useState("all");

  useEffect(() => {
    getDashboardData().then(setData);
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.mothers
      .filter(
        (m) =>
          m.risk !== "green" &&
          (facility === "all" || m.facilityId === facility) &&
          (level === "all" || m.risk === level),
      )
      .sort((a, b) =>
        a.risk === b.risk
          ? 0
          : a.risk === "red"
            ? -1
            : b.risk === "red"
              ? 1
              : 0,
      );
  }, [data, facility, level]);

  if (!data) {
    return (
      <Shell title="Alerts">
        <div className="card">Loading…</div>
      </Shell>
    );
  }

  const redCount = rows.filter((r) => r.risk === "red").length;
  const amberCount = rows.filter((r) => r.risk === "amber").length;

  return (
    <Shell title="Alerts">
      {data.fallbackNote && <div className="banner warn">{data.fallbackNote}</div>}

      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="stat red">
          <div className="label">Urgent (RED)</div>
          <div className="value">{redCount}</div>
          <div className="sub">immediate clinical assessment</div>
        </div>
        <div className="stat amber">
          <div className="label">Review (AMBER)</div>
          <div className="value">{amberCount}</div>
          <div className="sub">clinical review / follow-up</div>
        </div>
        <div className="stat green">
          <div className="label">No open alert</div>
          <div className="value">{data.alerts.green || "—"}</div>
          <div className="sub">stable pregnancies</div>
        </div>
      </div>

      <div className="filters card">
        <div className="field">
          <label>Facility</label>
          <select value={facility} onChange={(e) => setFacility(e.target.value)}>
            <option value="all">All facilities</option>
            {data.facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Level</label>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="all">All</option>
            <option value="red">RED — urgent</option>
            <option value="amber">AMBER — review</option>
          </select>
        </div>
      </div>

      <div className="card">
        <h2>
          Flagged cases <span className="hint">
            flags only — the system never diagnoses
          </span>
        </h2>
        <table>
          <thead>
            <tr>
              <th>Level</th>
              <th>Mother</th>
              <th>Facility</th>
              <th>GA</th>
              <th>EDD</th>
              <th>Last visit</th>
              <th>Referral</th>
              <th>Next step</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 60).map((m) => (
              <tr key={m.id}>
                <td>
                  <span className={`badge ${m.risk}`}>
                    {m.risk === "red" ? "🔴 URGENT" : "🟠 REVIEW"}
                  </span>
                </td>
                <td>
                  <strong>{m.name}</strong>
                  <div className="small muted mono">{m.code}</div>
                </td>
                <td className="small">
                  {data.facilities.find((f) => f.id === m.facilityId)?.name ??
                    "—"}
                </td>
                <td className="mono small">
                  {m.gaWeeks > 0 ? `${m.gaWeeks}w ${m.gaDays}d` : "—"}
                </td>
                <td className="mono small">{m.edd || "—"}</td>
                <td className="mono small">{m.lastVisit || "—"}</td>
                <td>
                  {m.activeReferral ? (
                    <span className="badge red">ACTIVE</span>
                  ) : (
                    <span className="badge gray">—</span>
                  )}
                </td>
                <td className="small">
                  {m.risk === "red"
                    ? "Immediate clinical assessment"
                    : "Clinical review / follow-up"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  No flagged cases in the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
