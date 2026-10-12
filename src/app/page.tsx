"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { PageHeader, SkeletonStats, StateView } from "@/components/ui";
import { StatusPill } from "@/components/ui";
import { api } from "@/lib/client";

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await api("/api/dashboard"));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <Shell>
      <PageHeader title="Good to see you 👋" subtitle="Here's what's live on your Android app right now.">
        <Link href="/designs" className="btn-gold !py-2">＋ Add design</Link>
        <Link href="/settings" className="btn-ghost !py-2">Edit hero</Link>
      </PageHeader>

      {loading && <SkeletonStats count={4} />}

      {!loading && error && (
        <StateView icon="🔌" tone="red" title="Couldn't load the overview"
          hint={`${error} — please check your connection and try again.`}
          action={<button className="btn-gold" onClick={load}>↻ Try again</button>} />
      )}

      {!loading && !error && data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Designs" sub={`${data.counts.hidden || 0} hidden`} value={data.counts.designs} href="/designs" icon="▦" />
            <Stat label="Categories" sub="filter pills" value={data.counts.categories} href="/categories" icon="❖" />
            <Stat label="Rooms" sub="room filters" value={data.counts.subcategories} href="/subcategories" icon="⬣" />
            <Stat label="Hero banner" sub={data.counts.heroConfigured ? "live on home" : "needs an image"} value={data.counts.heroConfigured ? "Ready ✓" : "Missing!"} href="/settings" icon="◈" alert={!data.counts.heroConfigured} />
          </div>

          {data.integrations?.cloudinary && (
            <Link href="/settings/integrations" className={`card card-hover p-4 sm:p-5 flex flex-wrap items-center gap-3 ${!data.integrations.cloudinary.connected ? "ring-2 ring-red-300" : ""}`}>
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-gold/15 to-goldbright/10 border border-gold/25 grid place-items-center text-xl">☁️</div>
              <div className="min-w-0">
                <div className="font-bold text-[15px]">Cloudinary image storage</div>
                <div className="text-xs text-slate-500 truncate">
                  {data.integrations.cloudinary.connected
                    ? `"${data.integrations.cloudinary.cloudName}" · via ${data.integrations.cloudinary.source === "panel" ? "panel settings" : "server .env"}`
                    : data.integrations.cloudinary.message}
                </div>
              </div>
              <span className="ml-auto flex items-center gap-2">
                <StatusPill status={data.integrations.cloudinary} />
                <span className="text-gold font-black">→</span>
              </span>
            </Link>
          )}

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="card p-5 lg:col-span-1">
              <h3 className="font-bold text-[15px] mb-1">Designs per category</h3>
              <p className="text-xs text-slate-500 mb-4">Where your catalog lives</p>
              {Object.keys(data.perCategory || {}).length === 0 && (
                <p className="text-sm text-slate-500 rounded-xl bg-[#faf8f2] border border-[#eee9da] p-3">No designs yet — publish your first one to see the split.</p>
              )}
              {Object.entries(data.perCategory || {}).map(([slug, n]: any) => (
                <div key={slug} className="mb-3">
                  <div className="flex justify-between text-xs font-semibold mb-1.5"><span className="font-mono">{slug}</span><span className="tabular-nums">{n}</span></div>
                  <div className="h-2 rounded-full bg-[#f0ece0] overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-goldbright to-gold transition-all" style={{ width: `${Math.min(100, (n / Math.max(1, data.counts.designs)) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="card p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-[15px]">Recently added</h3>
                <Link href="/designs" className="text-xs font-bold text-[#8a6d00] hover:underline">View all →</Link>
              </div>
              <p className="text-xs text-slate-500 mb-4">Fresh from your catalog</p>
              {(data.recent || []).length === 0 && (
                <p className="text-sm text-slate-500 rounded-xl bg-[#faf8f2] border border-[#eee9da] p-3">Upload your first design — it appears on the Android app instantly.</p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(data.recent || []).map((d: any) => (
                  <Link key={d.id} href="/designs" className="group rounded-2xl overflow-hidden border border-[#eee9da] bg-white hover:shadow-soft hover:-translate-y-0.5 transition-all">
                    <div className="overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {d.imageUrl
                        ? <img src={d.imageUrl} alt={d.name} loading="lazy" className="h-24 w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        : <div className="h-24 bg-slate-100" />}
                    </div>
                    <div className="p-2.5">
                      <div className="text-xs font-bold truncate">{d.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{d.category} · {d.subcategory}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="card p-5 sm:p-6">
            <h3 className="font-bold text-[15px] mb-2">⚡ How sync works</h3>
            <ol className="text-[13px] text-slate-600 space-y-1.5 list-decimal ml-5 leading-relaxed">
              <li>Upload images here → stored on <b>Cloudinary</b> (fast CDN URLs).</li>
              <li>Save → written to <b>Firestore</b> with the exact fields the app reads.</li>
              <li>The Android app observes Firestore in real time — no app update needed.</li>
              <li>Contact numbers, hero banner, logo and rooms live in <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">settings/app</code>.</li>
            </ol>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Stat({ label, sub, value, href, icon, alert }: any) {
  return (
    <Link href={href} className={`card card-hover p-5 ${alert ? "ring-2 ring-red-300" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gold/15 to-goldbright/10 border border-gold/25 grid place-items-center text-lg">{icon}</div>
        {alert && <span className="pill bg-red-100 text-red-700">Action needed</span>}
      </div>
      <div className="text-[26px] font-bold mt-2 tabular-nums tracking-tight">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </Link>
  );
}
