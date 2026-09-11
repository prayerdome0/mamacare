"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    if (configured) {
      const supa = getSupabase()!;
      const { error } = await supa.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        setError("Sign-in failed. Check your credentials.");
        return;
      }
      localStorage.setItem("mc_auth", "supabase");
      router.push("/dashboard");
    } else {
      // Demo mode: any credentials open the dashboard on generated data.
      localStorage.setItem("mc_auth", "demo");
      router.push("/dashboard");
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="logo">MAMA CARE</div>
        <div className="tag">Facility supervisor dashboard</div>

        {!configured ? (
          <div className="banner info">
            Demo mode — no Supabase credentials configured. Sign in with any
            credentials to explore the dashboard on generated sample data
            (not real patient data).
          </div>
        ) : (
          <div className="banner warn">
            Live mode — you will be signed in against Supabase. RLS scopes
            what you can see to your facility/district.
          </div>
        )}

        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={configured ? "you@facility.org" : "demo@supervisor"}
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={configured ? "••••••••" : "anything"}
            autoComplete="current-password"
            onKeyDown={(e) => e.key === "Enter" && signIn()}
          />
        </div>

        {error && <div className="banner err">{error}</div>}

        <button className="btn" style={{ width: "100%" }} disabled={busy} onClick={signIn}>
          {busy ? "Signing in…" : "SIGN IN"}
        </button>

        <div className="small muted mt">
          Aggregate views mask patient identifiers. Detailed records are only
          visible within your RLS scope.
        </div>
      </div>
    </div>
  );
}
