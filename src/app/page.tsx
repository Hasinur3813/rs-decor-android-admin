"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { PageHeader, SkeletonStats, StateView, StatusPill } from "@/components/ui";
import { api } from "@/lib/client";

type DashboardData = {
  counts: {
    designs: number;
    hidden: number;
    categories: number;
    subcategories: number;
    heroConfigured: boolean;
  };
  integrations?: {
    cloudinary?: {
      connected?: boolean;
      configured?: boolean;
      cloudName?: string;
      source?: string;
      message?: string;
    };
  };
  perCategory?: Record<string, number>;
  recent?: Array<{
    id: string;
    name: string;
    category: string;
    subcategory: string;
    imageUrl: string;
  }>;
};

export default function DashboardPage() {
  const { status } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<DashboardData>("/api/dashboard"));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") void load();
    else if (status === "unauthenticated") setLoading(false);
  }, [status, load]);

  return (
    <Shell>
      <PageHeader title="Overview" subtitle="A clear view of your catalog and what customers see in the app.">
        <Link href="/designs/upload" className="btn-gold">＋ Add designs</Link>
      </PageHeader>

      {loading && <SkeletonStats count={4} />}

      {!loading && error && (
        <StateView icon="!" tone="red" title="We couldn't load your overview"
          hint={`${error} — check your connection and try again.`}
          action={<button className="btn-gold" onClick={() => void load()}>Try again</button>} />
      )}

      {!loading && !error && data && (
        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-2xl bg-slate-950 p-6 text-white shadow-lg shadow-slate-900/10 sm:p-8">
            <div className="pointer-events-none absolute -right-16 -top-32 h-80 w-80 rounded-full border-[44px] border-blue-500/10" />
            <div className="pointer-events-none absolute -bottom-44 right-32 h-80 w-80 rounded-full border-[44px] border-indigo-400/[.08]" />
            <div className="relative flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-xl">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-1.5 text-xs font-medium text-blue-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Workspace is live
                </div>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Your catalog, at a glance.</h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-slate-300">Keep your designs organized and publish updates directly to the RS Decor app.</p>
              </div>
              <Link href="/settings" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[.07] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[.12]">
                Manage app settings <span aria-hidden="true">→</span>
              </Link>
            </div>
          </section>

          <section aria-label="Catalog summary" className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
            <Stat label="Designs" description={`${data.counts.hidden || 0} hidden from the app`} value={data.counts.designs} href="/designs" icon="image" />
            <Stat label="Categories" description="Catalog collections" value={data.counts.categories} href="/categories" icon="layers" />
            <Stat label="Rooms" description="Browse filters" value={data.counts.subcategories} href="/subcategories" icon="room" />
            <Stat label="Home banner" description={data.counts.heroConfigured ? "Visible in the app" : "Add an image to publish"} value={data.counts.heroConfigured ? "Published" : "Needs attention"} href="/settings" icon="spark" alert={!data.counts.heroConfigured} />
          </section>

          {data.integrations?.cloudinary && (
            <Link href="/settings/integrations" className={`card card-hover flex flex-wrap items-center gap-4 p-4 sm:px-5 ${!data.integrations.cloudinary.connected ? "border-amber-200" : ""}`}>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 16.2A4.8 4.8 0 0 0 17 7.5a6 6 0 0 0-11.7 1.8A4.5 4.5 0 0 0 6 18h13" /><path d="m12 12-3 3m3-3 3 3m-3-3v8" /></svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900">Cloudinary image storage</div>
                <div className="mt-0.5 truncate text-xs text-slate-500">
                  {data.integrations.cloudinary.connected
                    ? `${data.integrations.cloudinary.cloudName || "Cloud account"} · managed via ${data.integrations.cloudinary.source === "panel" ? "panel settings" : "server configuration"}`
                    : data.integrations.cloudinary.message || "Connect Cloudinary to enable image uploads."}
                </div>
              </div>
              <span className="flex items-center gap-3">
                <StatusPill status={data.integrations.cloudinary} />
                <span aria-hidden="true" className="text-slate-400">→</span>
              </span>
            </Link>
          )}

          <div className="grid gap-4 xl:grid-cols-5">
            <section className="card p-5 sm:p-6 xl:col-span-2" aria-labelledby="category-breakdown">
              <div className="mb-5">
                <h2 id="category-breakdown" className="text-sm font-semibold text-slate-900">Designs by category</h2>
                <p className="mt-1 text-xs text-slate-500">How your catalog is distributed</p>
              </div>
              {Object.keys(data.perCategory || {}).length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Your category breakdown will appear after you add designs.</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(data.perCategory || {}).map(([slug, count]) => (
                    <div key={slug}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-medium text-slate-600">{slug}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-800">{count.toLocaleString()}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-blue-600 transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(0, (count / Math.max(1, data.counts.designs)) * 100))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card p-5 sm:p-6 xl:col-span-3" aria-labelledby="recent-designs">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 id="recent-designs" className="text-sm font-semibold text-slate-900">Recently added</h2>
                  <p className="mt-1 text-xs text-slate-500">The latest additions to your catalog</p>
                </div>
                <Link href="/designs" className="text-xs font-semibold text-blue-700 hover:text-blue-800">View library <span aria-hidden="true">→</span></Link>
              </div>
              {(data.recent || []).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                  <p className="text-sm font-medium text-slate-700">No designs yet</p>
                  <p className="mt-1 text-xs text-slate-500">Upload your first design to bring your catalog to life.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(data.recent || []).slice(0, 4).map((design) => (
                    <Link key={design.id} href="/designs" className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-blue-200 hover:shadow-md">
                      <div className="aspect-[4/3] overflow-hidden bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {design.imageUrl ? <img src={design.imageUrl} alt={design.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : <div className="grid h-full place-items-center text-xs text-slate-400">No preview</div>}
                      </div>
                      <div className="p-2.5">
                        <div className="truncate text-xs font-semibold text-slate-800">{design.name}</div>
                        <div className="mt-1 truncate text-[10px] text-slate-500">{design.category} · {design.subcategory}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Stat({ label, description, value, href, icon, alert }: {
  label: string;
  description: string;
  value: number | string;
  href: string;
  icon: "image" | "layers" | "room" | "spark";
  alert?: boolean;
}) {
  const symbols: Record<typeof icon, React.ReactNode> = {
    image: <><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /></>,
    room: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" /></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></>
  };

  return (
    <Link href={href} className={`card card-hover group p-4 sm:p-5 ${alert ? "border-amber-200" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${alert ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
          <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{symbols[icon]}</svg>
        </span>
        {alert && <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Action needed</span>}
      </div>
      <div className={`mt-4 truncate text-2xl font-bold tracking-tight ${typeof value === "string" && value.length > 8 ? "text-lg" : ""} ${alert ? "text-amber-700" : "text-slate-900"}`}>{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="mt-1 text-xs font-semibold text-slate-700">{label}</div>
      <div className="mt-1 truncate text-[11px] text-slate-500">{description}</div>
    </Link>
  );
}
