"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "./Toast";

const NAV = [
  { href: "/", label: "Dashboard", icon: "◈" },
  { href: "/designs", label: "Designs", icon: "▦" },
  { href: "/categories", label: "Categories", icon: "❖" },
  { href: "/subcategories", label: "Rooms", icon: "⬣" },
  { href: "/settings/integrations", label: "Integrations", icon: "◉" },
  { href: "/settings", label: "Contact & Hero", icon: "⚙" }
];

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/designs": "Designs",
  "/categories": "Categories",
  "/subcategories": "Rooms",
  "/settings": "Contact & Hero",
  "/settings/integrations": "Integrations"
};

function prettyTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  const seg = pathname.split("/").filter(Boolean).pop() || "";
  return seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Dashboard";
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status, update } = useSession();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const expiryHandled = useRef(false);

  // Clean expiry handling: exactly one polite notice, then the session is
  // cleared and the user lands on the login screen. Fires at most once per
  // sign-in so concurrent failing requests can't stack toasts or sign-outs.
  useEffect(() => {
    if (status !== "authenticated") return;
    const onExpired = () => {
      if (expiryHandled.current) return;
      expiryHandled.current = true;
      toast("error", "Your session has expired. You've been signed out — please sign in again.");
      signOut({ callbackUrl: "/" });
    };
    window.addEventListener("rs:session-expired", onExpired);
    return () => window.removeEventListener("rs:session-expired", onExpired);
  }, [status, toast]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setChecking(true);
    try {
      const res = await signIn("credentials", { username, password, redirect: false });
      if (res?.error) {
        const friendly = res.error === "CredentialsSignin"
          ? "Wrong username or password. Please check and try again."
          : "Couldn't sign you in right now. Please try again in a moment.";
        setError(friendly);
        return;
      }
      if (!res?.ok) {
        setError("Couldn't sign you in right now. Please try again in a moment.");
        return;
      }
      // Race-free entry: wait until the session is provably readable
      // (cookie-backed) before rendering the panel. Without this, the first
      // dashboard fetch can outrun session propagation and show a bogus
      // "session expired" error that a refresh would clear.
      const session = await update();
      if (!session) {
        setError("Signed in, but the session didn't settle. Please try again.");
        return;
      }
      expiryHandled.current = false;
      toast("success", "Welcome back — you're signed in.");
      setPassword("");
    } finally {
      setChecking(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen grid place-items-center bg-obsidian">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-goldbright to-gold grid place-items-center text-obsidian font-black text-lg animate-pulse">RS</div>
          <div className="flex items-center gap-2 text-ink/60 text-sm">
            <span className="w-4 h-4 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
            Preparing your workspace…
          </div>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen grid place-items-center px-4 py-10 bg-obsidian relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(700px 380px at 50% -80px, rgba(201,162,39,.22), transparent), radial-gradient(500px 300px at 90% 110%, rgba(201,162,39,.10), transparent)"
        }} />
        <form onSubmit={login} className="relative w-full max-w-sm rounded-3xl bg-white/95 backdrop-blur p-8 shadow-soft border border-white/40">
          <div className="flex items-center gap-3 mb-1.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-goldbright to-gold grid place-items-center text-obsidian font-black text-xl shadow-soft ring-1 ring-gold/40">RS</div>
            <div>
              <h1 className="font-bold text-[19px] leading-tight tracking-tight">RS Decor Admin</h1>
              <p className="text-xs text-slate-500">Catalog control panel</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 bg-[#faf8f2] border border-[#eee9da] rounded-xl px-3 py-2 mb-5">
            🔒 Restricted area — authorized access only
          </div>
          <label className="label" htmlFor="admin-user">Username</label>
          <input id="admin-user" className="input mb-3.5" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" autoComplete="username" autoFocus />
          <label className="label" htmlFor="admin-pass">Password</label>
          <input id="admin-pass" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" autoComplete="current-password" />
          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] font-semibold text-red-700 flex gap-2">
              <span>⚠</span><span>{error}</span>
            </div>
          )}
          <button className="btn-gold w-full mt-4 !py-3" disabled={!username || !password || checking}>
            {checking ? (
              <><span className="w-4 h-4 rounded-full border-2 border-obsidian/30 border-t-obsidian animate-spin" /> Signing in…</>
            ) : "Sign in securely"}
          </button>
          <p className="text-[11px] text-slate-400 mt-4 text-center">Rate-limited sign-in · sessions last 12 hours</p>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar */}
      <aside className={`fixed lg:static z-40 inset-y-0 left-0 w-[260px] bg-obsidian text-ink flex flex-col transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex items-center gap-3 px-5 pt-6 pb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-goldbright to-gold grid place-items-center text-obsidian font-black shadow-soft">RS</div>
          <div>
            <div className="font-bold leading-tight tracking-tight">RS Decor</div>
            <div className="text-[10px] text-goldbright tracking-[0.2em] uppercase font-semibold">Admin Panel</div>
          </div>
        </div>
        <nav className="px-3 space-y-1 flex-1 overflow-y-auto scroll-thin">
          <div className="px-4 pt-1 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-ink/40">Manage</div>
          {NAV.slice(0, 4).map((n) => (
            <NavLink key={n.href} n={n} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          ))}
          <div className="px-4 pt-4 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-ink/40">Configure</div>
          {NAV.slice(4).map((n) => (
            <NavLink key={n.href} n={n} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          ))}
        </nav>
        <div className="p-4 space-y-3">
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3.5 text-xs leading-relaxed text-ink/60">
            <span className="text-goldbright font-bold">● Live sync</span><br />Panel → Firestore → Android app, instantly.
          </div>
          <div className="flex items-center gap-2.5 rounded-2xl bg-white/[0.04] border border-white/10 px-3 py-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-goldbright to-gold grid place-items-center text-obsidian text-xs font-black">A</div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold truncate">Administrator</div>
              <div className="text-[11px] text-ink/50">Signed in securely</div>
            </div>
            <button onClick={() => signOut({ callbackUrl: "/" })} title="Sign out"
              className="w-8 h-8 rounded-xl border border-white/15 grid place-items-center text-ink/60 hover:text-white hover:border-gold transition text-sm">⏻</button>
          </div>
        </div>
      </aside>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 backdrop-blur-md bg-[#f4f2ec]/85 border-b border-[#e7e2d5]">
          <div className="flex items-center gap-3 px-4 lg:px-8 py-3">
            <button className="lg:hidden btn-ghost !px-3 !py-2" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">☰</button>
            <div>
              <div className="font-bold text-[15px] lg:text-base tracking-tight leading-tight">{prettyTitle(pathname)}</div>
              <div className="text-[11px] text-slate-500 hidden sm:block">RS Decor · Admin Panel</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="pill bg-emerald-100 text-emerald-700 border border-emerald-200">● Live</span>
              <Link href="/designs" className="btn-gold !py-2 hidden sm:inline-flex">＋ New design</Link>
            </div>
          </div>
        </header>
        <main className="p-4 lg:p-8 max-w-7xl mx-auto w-full flex-1">{children}</main>
        <footer className="px-4 lg:px-8 pb-6 text-[11px] text-slate-400 max-w-7xl mx-auto w-full">
          RS Decor Admin · Changes publish to the Android app in real time
        </footer>
      </div>
    </div>
  );
}

function NavLink({ n, pathname, onNavigate }: { n: { href: string; label: string; icon: string }; pathname: string; onNavigate: () => void }) {
  const active = n.href === "/" ? pathname === "/" : pathname === n.href || pathname.startsWith(n.href + "/");
  return (
    <Link href={n.href} onClick={onNavigate}
      className={`group flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${active
        ? "bg-gradient-to-r from-goldbright to-gold text-obsidian shadow-soft"
        : "text-ink/65 hover:bg-white/[0.06] hover:text-ink hover:translate-x-px"}`}>
      <span className={`w-5 text-center transition-transform ${active ? "" : "group-hover:scale-110"}`}>{n.icon}</span>
      {n.label}
      {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-obsidian/60" />}
    </Link>
  );
}
