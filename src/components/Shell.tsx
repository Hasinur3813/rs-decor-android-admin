"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "./Toast";

const NAV = [
  { href: "/", label: "Overview", icon: "grid" },
  { href: "/designs", label: "Design library", icon: "image", matchChildren: true },
  { href: "/categories", label: "Categories", icon: "layers" },
  { href: "/subcategories", label: "Rooms", icon: "room" },
  { href: "/settings/integrations", label: "Integrations", icon: "cloud" },
  { href: "/settings", label: "App settings", icon: "settings" }
];

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/designs": "Design library",
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
    } catch {
      setError("Couldn't sign you in right now. Please try again in a moment.");
    } finally {
      setChecking(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 grid place-items-center text-white font-black text-lg animate-pulse">RS</div>
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <span className="w-4 h-4 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
            Preparing your workspace…
          </div>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-white lg:grid lg:grid-cols-2">
        <section className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 20% 0%, rgba(66,99,235,.5), transparent 55%), radial-gradient(ellipse at 100% 90%, rgba(45,75,160,.35), transparent 45%)" }} />
          <div className="relative flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-lg font-black text-blue-700">RS</div>
            <div><div className="font-bold tracking-tight">RS Decor</div><div className="text-xs text-slate-400">ADMIN WORKSPACE</div></div>
          </div>
          <div className="relative max-w-lg">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-blue-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Your catalog, beautifully managed
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">Everything your customers see, in one place.</h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-slate-300">Manage designs, keep your catalog organized, and publish updates straight to the RS Decor app.</p>
          </div>
          <p className="relative text-xs text-slate-500">Private access · Changes sync to your app in real time</p>
        </section>
        <section className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-12 lg:bg-white">
          <form onSubmit={login} className="w-full max-w-[410px] rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-900/[.04] sm:p-10">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-lg font-black text-white">RS</div>
              <div><div className="font-bold text-slate-900">RS Decor</div><div className="text-xs text-slate-500">Admin workspace</div></div>
            </div>
            <div className="mb-7">
              <p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-600">Welcome back</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Sign in to your account</h2>
              <p className="mt-2 text-sm text-slate-500">Enter your administrator credentials to continue.</p>
            </div>
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs font-medium text-slate-600">
              <svg aria-hidden="true" className="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
              Restricted area · Authorized access only
            </div>
            <label className="label" htmlFor="admin-user">Username</label>
            <input id="admin-user" className="input mb-4 !py-3" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your username" autoComplete="username" autoFocus />
            <label className="label" htmlFor="admin-pass">Password</label>
            <input id="admin-pass" type="password" className="input !py-3" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" />
            {error && (
              <div role="alert" className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] font-semibold text-red-700">
                <span aria-hidden="true">!</span><span>{error}</span>
              </div>
            )}
            <button className="btn-gold mt-6 w-full !py-3" disabled={!username || !password || checking}>
              {checking ? <><span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Signing in…</> : "Sign in"}
            </button>
            <p className="mt-5 text-center text-xs text-slate-400">Sessions expire after 12 hours · Sign-in is rate limited</p>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[268px] flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <Link href="/" className="flex items-center gap-3 border-b border-slate-100 px-6 py-5" onClick={() => setMobileOpen(false)}>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-sm font-black text-white shadow-sm">RS</div>
          <div><div className="font-bold leading-tight tracking-tight text-slate-900">RS Decor</div><div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-400">Admin workspace</div></div>
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-6" aria-label="Main navigation">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.15em] text-slate-400">Workspace</div>
          {NAV.slice(0, 4).map((n) => <NavLink key={n.href} n={n} pathname={pathname} onNavigate={() => setMobileOpen(false)} />)}
          <div className="px-3 pb-2 pt-7 text-[10px] font-bold uppercase tracking-[.15em] text-slate-400">Configuration</div>
          {NAV.slice(4).map((n) => <NavLink key={n.href} n={n} pathname={pathname} onNavigate={() => setMobileOpen(false)} />)}
        </nav>
        <div className="border-t border-slate-100 p-4">
          <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-800"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Live catalog sync</div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">Updates publish to your Android app automatically.</p>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">A</div>
            <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-800">Administrator</div><div className="text-[11px] text-slate-400">Secure session</div></div>
            <button onClick={() => signOut({ callbackUrl: "/" })} title="Sign out" aria-label="Sign out" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-red-50 hover:text-red-600">⏻</button>
          </div>
        </div>
      </aside>
      {mobileOpen && <button className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
          <div className="flex items-center gap-3 px-4 py-3.5 sm:px-6 lg:px-9">
            <button className="btn-ghost !px-3 !py-2 lg:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation" aria-expanded={mobileOpen}>☰</button>
            <div><div className="text-sm font-semibold text-slate-900">{prettyTitle(pathname)}</div><div className="mt-0.5 hidden text-[11px] text-slate-400 sm:block">RS Decor <span className="mx-1.5">/</span> Workspace</div></div>
            <div className="ml-auto flex items-center gap-2.5">
              <span className="hidden items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Synced</span>
              <Link href="/designs/upload" className="btn-gold !py-2">＋ <span className="hidden sm:inline">New design</span><span className="sm:hidden">New</span></Link>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-9">{children}</main>
        <footer className="mx-auto w-full max-w-[1500px] px-4 pb-5 text-[11px] text-slate-400 sm:px-6 lg:px-9">RS Decor Admin <span className="mx-1">·</span> Changes publish to the Android app in real time</footer>
      </div>
    </div>
  );
}

function NavLink({ n, pathname, onNavigate }: { n: { href: string; label: string; icon: string; matchChildren?: boolean }; pathname: string; onNavigate: () => void }) {
  const active = pathname === n.href || Boolean(n.matchChildren && pathname.startsWith(n.href + "/"));
  return (
    <Link href={n.href} onClick={onNavigate}
      className={`group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition-all ${active
        ? "bg-blue-50 text-blue-700"
        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
      <NavIcon name={n.icon} active={active} />
      {n.label}
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-600" />}
    </Link>
  );
}

function NavIcon({ name, active }: { name: string; active: boolean }) {
  const common = "h-[18px] w-[18px]";
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    room: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" /><path d="M9 9h.01M15 9h.01" /></>,
    cloud: <><path d="M20 16.2A4.8 4.8 0 0 0 17 7.5a6 6 0 0 0-11.7 1.8A4.5 4.5 0 0 0 6 18h13" /><path d="m12 12-3 3m3-3 3 3m-3-3v8" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" transform="translate(-1 -1)" /></>
  };
  return <svg aria-hidden="true" className={`${common} shrink-0 ${active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.grid}</svg>;
}
