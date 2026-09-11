"use client";

import { useEffect, useMemo, useState } from "react";
import Shell from "@/components/shell";
import { getDashboardData } from "@/lib/data";
import { maskPhone } from "@/lib/demo-data";
import type { DashboardData } from "@/lib/types";

export default function MothersPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [q, setQ] = useState("");
  const [facility, setFacility] = useState("all");
  const [status, setStatus] = useState("all");
  const [referral, setReferral] = useState("all");
  const [page, setPage] = useState(0);
  const PER = 25;

  useEffect(() => {
    getDashboardData().then(setData);
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const t = q.trim().toLowerCase();
    return data.mothers.filter(
      (m) =>
        (facility === "all" || m.facilityId === facility) &&
        (status === "all" || m.status === status) &&
        (referral === "all" ||
          (referral === "active" ? m.activeReferral : !m.activeReferral)) &&
        (t === "" ||
          m.name.toLowerCase().includes(t) ||
          m.code.toLowerCase().includes(t) ||
          (m.phone && m.phone.includes(t))),
    );
  }, [data, q, facility, status, referral]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER));
  const slice = filtered.slice(page * PER, page * PER + PER);

  if (!data) {
    return (
      <Shell title="Mothers">
        <div className="card">Loading…</div>
      </Shell>
    );
  }

  return (
    <Shell title="Mothers">
      {data.fallbackNote && <div className="banner warn">{data.fallbackNote}</div>}

      <div className="filters card">
        <div className="field" style={{ flex: 2 }}>
          <label>Search</label>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Name, ID or phone…"
          />
        </div>
        <div className="field">
          <label>Facility</label>
          <select
            value={facility}
            onChange={(e) => {
              setFacility(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All</option>
            {data.facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="postnatal">Postnatal</option>
            <option value="delivered">Delivered</option>
            <option value="closed">Closed</option>
            <option value="lost_to_followup">Lost to follow-up</option>
          </select>
        </div>
        <div className="field">
          <label>Referral</label>
          <select
            value={referral}
            onChange={(e) => {
              setReferral(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">All</option>
            <option value="active">Active referral</option>
            <option value="none">No referral</option>
          </select>
        </div>
      </div>

      <div className="card">
        <h2>
          {filtered.length.toLocaleString()} mothers
          <span className="hint">
            identifiers shown are within your RLS scope; phones masked
          </span>
        </h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Facility</th>
              <th>GA</th>
              <th>EDD</th>
              <th>Status</th>
              <th>Risk</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((m) => (
              <tr key={m.id}>
                <td className="mono small">{m.code}</td>
                <td>
                  <strong>{m.name}</strong>
                  <div className="small muted">age {m.age}</div>
                </td>
                <td className="small">
                  {data.facilities.find((f) => f.id === m.facilityId)?.name ??
                    "—"}
                </td>
                <td className="mono small">
                  {m.gaWeeks > 0 ? `${m.gaWeeks}w ${m.gaDays}d` : "—"}
                </td>
                <td className="mono small">{m.edd || "—"}</td>
                <td>
                  <span className="badge gray">
                    {m.status.replaceAll("_", " ")}
                  </span>
                </td>
                <td>
                  <span className={`badge ${m.risk}`}>
                    {m.risk === "red"
                      ? "URGENT"
                      : m.risk === "amber"
                        ? "REVIEW"
                        : "STABLE"}
                  </span>
                </td>
                <td className="mono small">{maskPhone(m.phone)}</td>
              </tr>
            ))}
            {slice.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  No mothers match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            className="btn ghost"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ← Prev
          </button>
          <span className="small muted">
            Page {page + 1} / {pages}
          </span>
          <button
            className="btn ghost"
            disabled={page >= pages - 1}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
          >
            Next →
          </button>
        </div>
      </div>
    </Shell>
  );
}
