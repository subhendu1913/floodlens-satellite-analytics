import { useCallback, useEffect, useRef, useState } from "react";
import { CopilotDrawer } from "./components/CopilotDrawer";
import { Footer } from "./components/Footer";
import { Sidebar } from "./components/Sidebar";
import { ToastHost } from "./components/Toast";
import { TopBar } from "./components/TopBar";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { AnalysisPage } from "./pages/AnalysisPage";
import { DataPage } from "./pages/DataPage";
import { ImpactAccessPage } from "./pages/ImpactAccessPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PrioritiesPage } from "./pages/PrioritiesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { isWelcomeHash } from "./state/routes";
import { loadSession, saveSession, type Session } from "./state/session";
import { AppProvider, useApp } from "./state/store";

function Page() {
  const { route } = useApp();
  switch (route) {
    case "analysis":
      return <AnalysisPage />;
    case "impact":
      return <ImpactAccessPage />;
    case "priorities":
      return <PrioritiesPage />;
    case "reports":
      return <ReportsPage />;
    case "data":
      return <DataPage />;
    default:
      return <OverviewPage />;
  }
}

interface ShellProps {
  /** The public landing page is showing on top of the (still mounted) dashboard. */
  landing: boolean;
  onEnter: (s: Session) => void;
  onResume: () => void;
}

/**
 * The dashboard stays mounted underneath the landing page, so going Home and coming back keeps the
 * analysis, map position, selection, simulator and any open report exactly as they were.
 */
function Shell({ landing, onEnter, onResume }: ShellProps) {
  const { session, signOut } = useApp();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem("floodlens.nav");
      return v ? v === "collapsed" : window.innerWidth < 1360;
    } catch {
      return false;
    }
  });
  const [mobileNav, setMobileNav] = useState(false);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("floodlens.nav", next ? "collapsed" : "expanded");
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <>
      <div className="flex h-full flex-col bg-white text-navy" inert={landing} aria-hidden={landing || undefined}>
        <TopBar onMenu={() => setMobileNav(true)} />
        <div className="flex min-h-0 flex-1">
          <Sidebar collapsed={collapsed} onToggle={toggle} mobileOpen={mobileNav} onCloseMobile={() => setMobileNav(false)} />
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <Page />
          </main>
          <CopilotDrawer />
        </div>
        <Footer onProvenance={() => window.location.assign("#/data/sources")} />
        <ToastHost />
      </div>
      {landing && (
        <div className="fixed inset-0 z-[3000] bg-white">
          <WelcomeScreen onEnter={onEnter} resume={{ name: session.name, kind: session.kind }} onResume={onResume} onEndSession={signOut} />
        </div>
      )}
    </>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [hash, setHash] = useState(() => window.location.hash);
  const lastApp = useRef(isWelcomeHash(window.location.hash) || !window.location.hash ? "#/overview" : window.location.hash);

  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  // Remember the last dashboard page so "Return to dashboard" restores it.
  useEffect(() => {
    if (hash && !isWelcomeHash(hash)) lastApp.current = hash;
  }, [hash]);

  const landing = !session || isWelcomeHash(hash);

  // True when the landing page was opened from inside the dashboard, so the entry just before it in the
  // browser history is the dashboard page: stepping back resumes it without leaving a dead history entry.
  const fromApp = useRef(false);
  const leaveLanding = useCallback(() => {
    if (fromApp.current && isWelcomeHash(window.location.hash)) {
      fromApp.current = false;
      window.history.back();
    } else window.location.replace(lastApp.current);
  }, []);

  const enterApp = useCallback(
    (s: Session) => {
      saveSession(s);
      setSession(s);
      leaveLanding();
    },
    [leaveLanding],
  );
  const goHome = useCallback(() => {
    fromApp.current = true;
    window.location.hash = "#/welcome";
  }, []);
  const endSession = useCallback(() => {
    saveSession(null);
    setSession(null);
    lastApp.current = "#/overview";
    window.location.replace("#/welcome");
  }, []);

  if (!session) return <WelcomeScreen onEnter={enterApp} />;
  return (
    <AppProvider session={session} onSignOut={endSession} onHome={goHome}>
      <Shell landing={landing} onEnter={enterApp} onResume={leaveLanding} />
    </AppProvider>
  );
}
