import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, User } from "lucide-react";
import { ATTRIBUTIONS } from "../data/attributions";
import { loadProfile, saveProfile, type Session } from "../state/session";
import { cn } from "../utils/cn";
import { Logo } from "./Logo";
import { Notice, inputCls } from "./ui";

type Tab = "signin" | "create";
interface Values {
  name: string;
  email: string;
  password: string;
  confirm: string;
  org: string;
}
type Errors = Partial<Record<"name" | "email" | "password" | "confirm", string>>;

/** Format check only. This is NOT authentication and says nothing about whether an address exists. */
const EMAIL_RE = /^[^\s@]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;
const validEmail = (v: string) => v.length <= 254 && EMAIL_RE.test(v);

function validate(tab: Tab, v: Values): Errors {
  const e: Errors = {};
  const email = v.email.trim();
  if (tab === "create" && v.name.trim().length < 2) e.name = v.name.trim() ? "Enter your full name (at least two characters)." : "Enter your full name.";
  if (!email) e.email = "Enter your email address.";
  else if (!validEmail(email)) e.email = "Enter a valid email address, for example name@example.org.";
  if (!v.password) e.password = tab === "signin" ? "Enter your password." : "Create a password.";
  else if (tab === "create" && v.password.length < 8) e.password = "Use at least 8 characters.";
  if (tab === "create") {
    if (!v.confirm) e.confirm = "Confirm your password.";
    else if (v.confirm !== v.password) e.confirm = "Passwords do not match.";
  }
  return e;
}

const QUESTIONS = [
  ["1", "Where did the flood hit?", "Detected water, suspected debris and uncertain areas from Sentinel-1 radar and Sentinel-2 optical imagery."],
  ["2", "Which buildings, roads and bridges may be affected?", "Pre-event OpenStreetMap assets intersected with the detections — with evidence and confidence."],
  ["3", "Which settlements may have lost road access?", "Road-network connectivity to the nearest town or hospital, modeled — never presented as confirmed."],
] as const;

function FieldShell({ id, label, error, icon, hint, right, children }: { id: string; label: string; error?: string; icon: ReactNode; hint?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={id} className="block text-[12px] font-medium text-slate-200">
          {label}
        </label>
        {right}
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>
        {children}
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1 flex items-start gap-1 text-[11.5px] text-crit">
          <AlertCircle className="mt-px size-3 shrink-0" /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

const inp = (error?: string) => cn(inputCls, "h-10 pl-9", error && "border-crit focus:border-crit focus:ring-crit/20");

interface WelcomeProps {
  onEnter: (s: Session) => void;
  /** Present when a session already exists (the user came back to the landing page from the dashboard). */
  resume?: { name: string; kind: Session["kind"] } | null;
  onResume?: () => void;
  onEndSession?: () => void;
}

export function WelcomeScreen({ onEnter, resume, onResume, onEndSession }: WelcomeProps) {
  const [tab, setTab] = useState<Tab>("signin");
  const [loading, setLoading] = useState<string | null>(null);
  const [v, setV] = useState<Values>({ name: "", email: "", password: "", confirm: "", org: "" });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [forgot, setForgot] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const errors = validate(tab, v);
  const err = (k: keyof Errors) => (touched[k] || submitted ? errors[k] : undefined);
  const set = (k: keyof Values) => (e: { target: { value: string } }) => {
    setV((s) => ({ ...s, [k]: e.target.value }));
    setFormError(null);
  };
  const blur = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));

  const enter = (s: Session, label: string) => {
    setLoading(label);
    window.setTimeout(() => onEnter(s), 700);
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    setSubmitted(false);
    setTouched({});
    setFormError(null);
    setForgot(false);
    setShowPw(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const email = v.email.trim().toLowerCase();
    if (tab === "signin") {
      const p = loadProfile();
      if (!p || p.email !== email) {
        setFormError("No local FloodLens profile exists for this email on this device. Create an account first, or use Continue as Demo.");
        return;
      }
      enter({ kind: "local", name: p.name, email: p.email, org: p.org }, "signin");
    } else {
      const org = v.org.trim() || undefined;
      const ok = saveProfile({ name: v.name.trim(), email, org });
      if (!ok) setFormError("Browser storage is unavailable — the profile will only last for this tab.");
      enter({ kind: "local", name: v.name.trim(), email, org }, "create");
    }
  };

  const busy = !!loading;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-white lg:flex-row lg:overflow-hidden">
      {/* ---------- brand panel ---------- */}
      <aside className="navy-surface relative flex shrink-0 flex-col justify-between overflow-hidden bg-navy px-7 py-7 text-on-navy lg:w-[46%] lg:max-w-[580px] lg:overflow-y-auto lg:px-12 lg:py-10">
        <svg aria-hidden className="pointer-events-none absolute -bottom-28 -right-28 size-[440px] text-white opacity-[0.07]" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.6">
          <circle cx="100" cy="100" r="95" />
          <circle cx="100" cy="100" r="70" />
          <circle cx="100" cy="100" r="45" />
          <circle cx="100" cy="100" r="20" />
          <path d="M5 100h190M100 5v190M33 33l134 134M167 33 33 167" />
        </svg>
        <div className="relative">
          <Logo tone="navy" size={40} textClass="text-[24px]" tagline />
          <h1 className="mt-8 max-w-[460px] text-[26px] font-semibold leading-tight tracking-tight text-on-navy lg:mt-12 lg:text-[30px]">Satellite-powered flood intelligence for rescue coordinators</h1>
          <p className="mt-3 max-w-[460px] text-[13.5px] leading-relaxed text-on-navy-muted">Track B — Mapping Flood Damage from Space · Multimodal AI Hackathon 2026. FloodLens turns Sentinel imagery and a pre-event OpenStreetMap snapshot into an evidence-based picture of where to look next.</p>
          <ol className="mt-6 hidden space-y-3.5 sm:block">
            {QUESTIONS.map(([n, t, d]) => (
              <li key={n} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded border border-white/20 font-mono text-[11px] text-brand-soft">{n}</span>
                <div>
                  <div className="text-[13px] font-medium text-on-navy">{t}</div>
                  <div className="text-[11.5px] leading-snug text-on-navy-muted">{d}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="relative mt-8 space-y-3">
          <p className="max-w-[460px] border-l-2 border-warn-soft pl-3 text-[11.5px] leading-relaxed text-on-navy-muted">
            <span className="font-bold uppercase tracking-wide text-warn-soft">Demo mode.</span> All results are a clearly labelled sample dataset for the Trishuli Valley, Nepal — not verified satellite analysis. Imagery alone never confirms structural damage.
          </p>
          <p className="hidden max-w-[470px] text-[9.5px] leading-snug text-on-navy-muted/70 lg:block">{ATTRIBUTIONS.join(" ")}</p>
        </div>
      </aside>

      {/* ---------- sign-in panel ---------- */}
      <main className="flex flex-1 px-5 py-8 sm:px-8 lg:overflow-y-auto lg:py-10">
        <div className="m-auto w-full max-w-[420px]">
          {resume && (
            <div className="mb-5 rounded-lg border border-water/30 bg-water/5 p-3">
              <p className="text-[12.5px] font-medium text-slate-100">You have an active FloodLens session{resume.kind === "demo" ? " (demo)" : ` as ${resume.name}`}.</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-slate-400">This is the public landing page. Your analysis, map position and reports are kept — the dashboard is one click away.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={onResume} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-water px-3 text-[12px] font-semibold text-on-navy transition hover:bg-cyan-300">
                  Return to dashboard <ArrowRight className="size-3.5" />
                </button>
                <button type="button" onClick={onEndSession} className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[12px] text-slate-300 transition hover:border-slate-500">
                  End session
                </button>
              </div>
            </div>
          )}
          <h2 className="text-[20px] font-semibold tracking-tight text-slate-100">{tab === "signin" ? "Sign in to FloodLens" : "Create your FloodLens account"}</h2>
          <p className="mt-1 text-[12.5px] text-slate-400">Open the Trishuli Valley workspace — no registration needed for the demo.</p>

          <button
            type="button"
            onClick={() => enter({ kind: "demo", name: "Demo user" }, "demo")}
            disabled={busy}
            className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-water text-[14px] font-semibold text-on-navy shadow-sm transition hover:bg-cyan-300 disabled:opacity-80"
          >
            {loading === "demo" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Loading the FloodLens demo…
              </>
            ) : (
              <>
                Continue as Demo <ArrowRight className="size-4" />
              </>
            )}
          </button>
          <p className="mt-1.5 text-center text-[11px] text-slate-500">Opens the dashboard immediately · flood date 26 August 2026 · sample data</p>

          <div className="my-5 flex items-center gap-3 text-[10.5px] uppercase tracking-wider text-slate-500">
            <span className="h-px flex-1 bg-line" /> or use your email <span className="h-px flex-1 bg-line" />
          </div>

          <div className="mb-4 flex rounded-md border border-line bg-ink-850 p-0.5" role="tablist" aria-label="Sign in or create account">
            {(
              [
                ["signin", "Sign In"],
                ["create", "Create Account"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => switchTab(id)} disabled={busy} className={cn("h-8 flex-1 rounded text-[12.5px] font-medium transition", tab === id ? "bg-navy text-on-navy" : "text-slate-400 hover:text-slate-100")}>
                {label}
              </button>
            ))}
          </div>

          <Notice tone="info" title="Prototype — no authentication server">
            Your email and password are checked for format only. The password is <span className="font-medium text-slate-100">never sent or stored</span>, and a local profile is just a label kept in this browser. This is <span className="font-medium text-slate-100">not secure sign-in</span>.
          </Notice>

          <form ref={formRef} noValidate onSubmit={submit} aria-label={tab === "signin" ? "Sign in" : "Create account"} className="mt-4 space-y-3.5">
            {formError && (
              <div role="alert" className="flex gap-2 rounded-md border border-crit/40 bg-crit/5 p-2.5 text-[12px] leading-snug text-crit">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {formError}
              </div>
            )}

            {tab === "create" && (
              <FieldShell id="fl-name" label="Full name" error={err("name")} icon={<User className="size-4" />}>
                <input id="fl-name" className={inp(err("name"))} value={v.name} onChange={set("name")} onBlur={blur("name")} disabled={busy} autoComplete="name" placeholder="e.g. A. Gurung" aria-invalid={!!err("name")} aria-describedby={err("name") ? "fl-name-err" : undefined} />
              </FieldShell>
            )}

            <FieldShell id="fl-email" label="Email address" error={err("email")} icon={<Mail className="size-4" />}>
              <input
                id="fl-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                className={inp(err("email"))}
                value={v.email}
                onChange={set("email")}
                onBlur={blur("email")}
                disabled={busy}
                placeholder="name@example.org"
                aria-invalid={!!err("email")}
                aria-describedby={err("email") ? "fl-email-err" : undefined}
              />
            </FieldShell>

            <FieldShell
              id="fl-password"
              label="Password"
              error={err("password")}
              icon={<Lock className="size-4" />}
              hint={tab === "create" ? "At least 8 characters. It is not stored by this prototype." : undefined}
              right={
                tab === "signin" ? (
                  <button type="button" onClick={() => setForgot(!forgot)} aria-expanded={forgot} className="text-[11.5px] font-medium text-water hover:underline">
                    Forgot password?
                  </button>
                ) : undefined
              }
            >
              <input
                id="fl-password"
                type={showPw ? "text" : "password"}
                autoComplete={tab === "signin" ? "current-password" : "new-password"}
                className={cn(inp(err("password")), "pr-10")}
                value={v.password}
                onChange={set("password")}
                onBlur={blur("password")}
                disabled={busy}
                aria-invalid={!!err("password")}
                aria-describedby={err("password") ? "fl-password-err" : undefined}
              />
              <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? "Hide password" : "Show password"} aria-pressed={showPw} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-500 transition hover:bg-slate-500/10 hover:text-slate-100">
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </FieldShell>

            {tab === "signin" && forgot && (
              <Notice tone="neutral" title="Password reset is not available">
                FloodLens has no authentication service, and this prototype never stores passwords, so there is nothing to reset. Create a new local profile, or use <span className="font-medium text-slate-100">Continue as Demo</span>.
              </Notice>
            )}

            {tab === "create" && (
              <>
                <FieldShell id="fl-confirm" label="Confirm password" error={err("confirm")} icon={<Lock className="size-4" />}>
                  <input id="fl-confirm" type={showPw ? "text" : "password"} autoComplete="new-password" className={inp(err("confirm"))} value={v.confirm} onChange={set("confirm")} onBlur={blur("confirm")} disabled={busy} aria-invalid={!!err("confirm")} aria-describedby={err("confirm") ? "fl-confirm-err" : undefined} />
                </FieldShell>
                <FieldShell id="fl-org" label="Organisation (optional)" icon={<User className="size-4 opacity-0" />}>
                  <input id="fl-org" className={cn(inputCls, "h-10")} value={v.org} onChange={set("org")} disabled={busy} autoComplete="organization" placeholder="e.g. District Emergency Operations Centre" />
                </FieldShell>
              </>
            )}

            <button type="submit" disabled={busy} className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-navy bg-navy text-[13px] font-semibold text-on-navy transition hover:bg-navy-800 disabled:opacity-70">
              {loading === "signin" || loading === "create" ? <Loader2 className="size-4 animate-spin" /> : null}
              {tab === "signin" ? "Sign In" : "Create Account"}
            </button>
            <p className="text-center text-[11.5px] text-slate-500">
              {tab === "signin" ? (
                <>
                  New to FloodLens?{" "}
                  <button type="button" onClick={() => switchTab("create")} className="font-medium text-water hover:underline">
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have a local profile?{" "}
                  <button type="button" onClick={() => switchTab("signin")} className="font-medium text-water hover:underline">
                    Sign in
                  </button>
                </>
              )}
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
