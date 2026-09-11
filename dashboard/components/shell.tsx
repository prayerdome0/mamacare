"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "▦" },
  { href: "/mothers", label: "Mothers", icon: "👥" },
  { href: "/alerts", label: "Alerts", icon: "🚨" },
  { href: "/reports", label: "Reports", icon: "📊" },
];

export default function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const ok = typeof window !== "undefined" && Boolean(localStorage.getItem("mc_auth"));
    setAuthed(ok);
    if (!ok) router.replace("/");
  }, [router]);

  if (authed === null || !authed) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="logo">MAMA CARE</div>
          <div className="tag">Redirecting to sign-in…</div>
        </div>
      </div>
    );
  }

  const source = isSupabaseConfigured() ? "live" : "demo";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          MAMA CARE
          <small>Facility Dashboard</small>
        </div>
        <nav>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={pathname.startsWith(n.href) ? "active" : ""}
            >
              <span aria-hidden>{n.icon}</span> <span>{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <button
            className="btn ghost"
            style={{ color: "#fff", borderColor: "rgba(255,255,255,.4)" }}
            onClick={() => {
              localStorage.removeItem("mc_auth");
              router.replace("/");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <h1>{title}</h1>
          <div className="meta">
            <span
              className={`badge ${source === "live" ? "teal" : "amber"}`}
            >
              {source === "live" ? "LIVE DATA" : "DEMO DATA"}
            </span>
            <span>{new Date().toDateString()}</span>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
