"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/shell";
import { getDashboardData } from "@/lib/data";
import { maskPhone } from "@/lib/demo-data";
import type { DashboardData } from "@/lib/types";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [facility, setFacility] = useState("all");
  const [risk, setRisk] = useState("all");
  const [month, setMonth] = useState("all");

  useEffect(() => {
    getDashboardData().then(setData);
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.mothers.filter(
      (m) =>
        (facility === "all" || m.facilityId === facility) &&
        (risk === "all" || m.risk === risk) &&
        (month === "all" || m.status === month),
    );
  }, [data, facility, risk, month]);

  if (!data) {
    return (
      <Shell title="Overview">
        <div className="card">Loading facility data…</div>
      </Shell>
    );
  }

  const c = data.counts;
  const activeMothers = data.mothers.filter((m) => m.status === "active");
  const missedRows = data.mothers
    .filter((m) => m.missed > 0)
    .sort((a, b) => b.missed - a.missed)
    .slice(0, 8);
  const urgent = filtered
    .filter((m) => m.risk === "red")
    .slice(0, 8);
  const recentVisits = filtered
    .filter((m) => m.lastVisit)
    .sort((a, b) => (a.lastVisit! < b.lastVisit! ? 1 : -1))
    .slice(0, 8);

  return (
    <Shell title="Overview">
      {data.fallbackNote && (
        <div className="banner warn">{data.fallbackNote}</div>
      )}

      <div className="stat-grid">
        <div className="stat teal">
          <div className="label">Registered pregnancies</div>
          <div className="value">{c.registered.toLocaleString()}</div>
          <div className="sub">across {data.facilities.length} facilities</div>
        </div>
        <div className="stat">
          <div className="label">ANC visits this month</div>
          <div className="value">{c.visitsThisMonth.toLocaleString()}</div>
        </div>
        <div className="stat amber">
          <div className="label">Missed appointments</div>
          <div className="value">{c.missed}</div>
        </div>
        <div className="stat red">
          <div className="label">High-risk / review cases</div>
          <div className="value">{c.highRisk}</div>
        </div>
        <div className="stat">
          <div className="label">Active referrals</div>
          <div className="value">{c.activeReferrals}</div>
        </div>
        <div className="stat green">
          <div className="label">Deliveries (YTD)</div>
          <div className="value">{c.deliveries}</div>
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
          <label>Risk category</label>
          <select value={risk} onChange={(e) => setRisk(e.target.value)}>
            <option value="all">All</option>
            <option value="red">RED — urgent</option>
            <option value="amber">AMBER — review</option>
            <option value="green">GREEN — stable</option>
          </select>
        </div>
        <div className="field">
          <label>Pregnancy status</label>
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="postnatal">Postnatal</option>
            <option value="delivered">Delivered</option>
            <option value="lost_to_followup">Lost to follow-up</option>
          </select>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <h2>
            ANC attendance <span className="hint">last 30 days</span>
          </h2>
          <div
            className="bar"
            style={{ marginBottom: 10 }}
            title={`${data.attendance}% of scheduled visits attended`}
          >
            <div style={{ width: `${data.attendance}%` }} />
          </div>
          <div className="small muted">
            {data.attendance}% of scheduled visits attended ({activeMothers.length}{" "}
            active pregnancies)
          </div>

          <h2 className="mt">
            Alerts <span className="hint">open, facility-wide</span>
          </h2>
          <div className="stat-grid" style={{ marginBottom: 0, gridTemplateColumns: "repeat(3,1fr)" }}>
            <div className="stat red">
              <div className="label">Urgent</div>
              <div className="value">{data.alerts.red}</div>
            </div>
            <div className="stat amber">
              <div className="label">Review</div>
              <div className="value">{data.alerts.amber}</div>
            </div>
            <div className="stat green">
              <div className="label">No open alert</div>
              <div className="value">{data.alerts.green || "—"}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>
            Today <span className="hint">appointments & follow-ups</span>
          </h2>
          <div className="list-row">
            <span className="dot" style={{ background: "var(--red)" }} />
            <div className="grow">
              <div className="name">{data.today.urgent} urgent follow-ups</div>
              <div className="sub">RED alerts with appointments today</div>
            </div>
            <span className="badge red">{data.today.urgent}</span>
          </div>
          <div className="list-row">
            <span className="dot" style={{ background: "var(--amber)" }} />
            <div className="grow">
              <div className="name">{data.today.overdue} overdue</div>
              <div className="sub">Expected earlier — CHW follow-up due</div>
            </div>
            <span className="badge amber">{data.today.overdue}</span>
          </div>
          <div className="list-row">
            <span className="dot" style={{ background: "var(--green)" }} />
            <div className="grow">
              <div className="name">{data.today.routine} routine</div>
              <div className="sub">Scheduled ANC visits</div>
            </div>
            <span className="badge green">{data.today.routine}</span>
          </div>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <h2>
            Urgent cases <span className="hint">filtered</span>
          </h2>
          {urgent.length === 0 ? (
            <div className="small muted">
              No RED cases in the current filter.
            </div>
          ) : (
            urgent.map((m) => (
              <div className="list-row" key={m.id}>
                <span className="dot" style={{ background: "var(--red)" }} />
                <div className="grow">
                  <div className="name">{m.name}</div>
                  <div className="sub">
                    {m.code} • {m.gaWeeks}w {m.gaDays}d • EDD {m.edd || "—"}
                  </div>
                </div>
                <span className="badge red">URGENT</span>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h2>
            Missed visits — top follow-ups <span className="hint">PII masked</span>
          </h2>
          {missedRows.length === 0 ? (
            <div className="small muted">No overdue mothers. Well done.</div>
          ) : (
            missedRows.map((m) => (
              <div className="list-row" key={m.id}>
                <span
                  className="dot"
                  style={{
                    background: m.missed > 1 ? "var(--red)" : "var(--amber)",
                  }}
                />
                <div className="grow">
                  <div className="name">{m.name}</div>
                  <div className="sub">
                    {m.code} • {maskPhone(m.phone)} • {m.missed}× missed
                  </div>
                </div>
                <span
                  className={`badge ${m.missed > 1 ? "red" : "amber"}`}
                >
                  {m.missed > 1 ? "FOLLOW-UP" : "CONTACT"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <h2>
          Recent activity <span className="hint">latest visits, filtered</span>
        </h2>
        <table>
          <thead>
            <tr>
              <th>Mother</th>
              <th>Facility</th>
              <th>GA</th>
              <th>EDD</th>
              <th>Last visit</th>
              <th>Risk</th>
              <th>Referral</th>
            </tr>
          </thead>
          <tbody>
            {recentVisits.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{m.name}</strong>
                  <div className="small muted mono">{m.code}</div>
                </td>
                <td className="small">
                  {data.facilities.find((f) => f.id === m.facilityId)?.name ??
                    "—"}
                </td>
                <td className="mono">
                  {m.gaWeeks > 0 ? `${m.gaWeeks}w ${m.gaDays}d` : "—"}
                </td>
                <td className="mono">{m.edd || "—"}</td>
                <td className="mono">{m.lastVisit || "—"}</td>
                <td>
                  <span className={`badge ${m.risk}`}>
                    {m.risk === "red"
                      ? "URGENT"
                      : m.risk === "amber"
                        ? "REVIEW"
                        : "STABLE"}
                  </span>
                </td>
                <td>
                  {m.activeReferral ? (
                    <span className="badge red">ACTIVE</span>
                  ) : (
                    <span className="badge gray">—</span>
                  )}
                </td>
              </tr>
            ))}
            {recentVisits.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No rows match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
