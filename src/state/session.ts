/**
 * IMPORTANT: FloodLens has no authentication backend. A "session" here is a convenience label kept in
 * this browser only. No password is ever stored or sent, and nothing here is secure authentication.
 */
export type Session = { kind: "demo"; name: string } | { kind: "local"; name: string; email?: string; org?: string };

const SESSION_KEY = "floodlens.session";
const PROFILE_KEY = "floodlens.profile";

export interface LocalProfile {
  name: string;
  /** Stored lower-case. Used only to find the local profile again — it is not verified. */
  email?: string;
  org?: string;
}

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
export function saveSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable */
  }
}
export function loadProfile(): LocalProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as LocalProfile) : null;
  } catch {
    return null;
  }
}
export function saveProfile(p: LocalProfile): boolean {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}
