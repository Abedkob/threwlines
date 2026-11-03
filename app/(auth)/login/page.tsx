"use client";

import { FormEvent, useState } from "react";
import {
  ArrowUpRight,
  CircleAlert,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { DocumentWave } from "@/components/billing/shared/DocumentWave";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !result?.ok) {
        setLoading(false);
        setError(result?.message ?? "Unable to sign in.");
        return;
      }
    } catch {
      setLoading(false);
      setError("Unable to reach the server.");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="login-page">
      <DocumentWave className="login-ambient-wave" />

      <header className="login-topbar">
        <div className="login-brand">
          <span className="brand-logo-frame login-logo-frame p-1" aria-hidden="true">
            <img src="/threwlines-bars.svg" alt="" className="scale-100 object-contain" />
          </span>
          <span className="login-brand-copy">
            <strong>ThrewLines</strong>
            <small>Internal operations</small>
          </span>
        </div>
      </header>

      <div className="login-stage">
        <section className="login-context" aria-label="Workspace introduction">
          <div className="login-coordinate"><span>01</span><i /> Workspace access</div>
          <div className="login-copy">
            <p className="eyebrow">The operating layer for the whole studio</p>
            <h1>One place for<br /><em>the whole operation.</em></h1>
            <p>Client relationships, delivery, billing, and team priorities—connected in one private view.</p>
          </div>

          <div className="login-workspace-map" aria-label="Workspace areas">
            <span><small>01</small><strong>Relationships</strong><em>Contacts and pipeline</em></span>
            <span><small>02</small><strong>Delivery</strong><em>Tasks and contracts</em></span>
            <span><small>03</small><strong>Finance</strong><em>Invoices and expenses</em></span>
          </div>
        </section>

        <section className="login-panel" aria-label="Sign in">
          <form className="login-form" onSubmit={signIn} noValidate>
            <header className="login-form-header">
              <div className="login-lock" aria-hidden="true"><KeyRound size={19} /></div>
              <div>
                <p className="eyebrow">Authenticated access</p>
                <h2>Sign in to ThrewLines</h2>
              </div>
              <span className="login-form-code">TL / 01</span>
            </header>

            <p className="form-intro">Use the credentials assigned to this shared workspace.</p>

            <div className="login-fields">
              <label className="login-field">
                <span>Email address</span>
                <span className="login-input-shell">
                  <Mail size={16} aria-hidden="true" />
                  <input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@threwlines.com"
                    required
                    autoFocus
                  />
                </span>
              </label>

              <label className="login-field">
                <span>Password</span>
                <span className="login-input-shell login-password-shell">
                  <KeyRound size={16} aria-hidden="true" />
                  <input
                    type={passwordVisible ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter workspace password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setPasswordVisible((visible) => !visible)}
                    aria-label={passwordVisible ? "Hide password" : "Show password"}
                    aria-pressed={passwordVisible}
                  >
                    {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
              </label>
            </div>

            <div className="login-feedback" aria-live="polite">
              {error && <p className="login-error" role="alert"><CircleAlert size={15} />{error}</p>}
            </div>

            <button
              className="login-submit"
              type="submit"
              disabled={loading}
            >
              <span>{loading ? "Opening workspace" : "Enter workspace"}<small>{loading ? "Validating secure session" : "Continue to your dashboard"}</small></span>
              {loading ? <LoaderCircle className="login-spinner" size={18} /> : <ArrowUpRight size={18} />}
            </button>

            <footer className="login-form-footer">
              <span><ShieldCheck size={14} /> Protected session</span>
              <span>Secure session</span>
            </footer>
          </form>
        </section>
      </div>

      <footer className="login-page-footer">
        <span><i /> Shared operating view</span>
        <span>THREWLINES / INTERNAL SYSTEM</span>
        <span>BEIRUT · LB</span>
      </footer>
    </main>
  );
}
