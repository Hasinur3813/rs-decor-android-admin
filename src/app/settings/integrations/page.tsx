"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { PageHeader, StateView } from "@/components/ui";
import { StatusPill } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/client";

export default function IntegrationsPage() {
  const { toast } = useToast();
  const [form, setForm] = useState({ cloudName: "", apiKey: "", apiSecret: "", folder: "rs-decor" });
  const [status, setStatus] = useState<any>(null);
  const [hasSecret, setHasSecret] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [armingRemove, setArmingRemove] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const d = await api("/api/integrations/cloudinary");
      setStatus(d.status);
      if (d.saved) {
        setForm({ cloudName: d.saved.cloudName || "", apiKey: d.saved.apiKey || "", apiSecret: "", folder: d.saved.folder || "rs-decor" });
        setHasSecret(!!d.saved.hasSecret);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const d = await api("/api/integrations/cloudinary", {
        method: "PUT",
        body: JSON.stringify(form)
      });
      setStatus(d.status);
      setHasSecret(true);
      setForm((p) => ({ ...p, apiSecret: "" }));
      const ok = d.status.connected;
      setMsg(ok ? "✓ Connected — uploads will use these credentials." : `⚠ ${d.warning || "Saved but unreachable."}`);
      toast(ok ? "success" : "error", ok ? "Cloudinary connected and saved." : (d.warning || "Saved, but the connection test failed."));
    } catch (e: any) {
      setMsg("⚠ " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function retest() {
    setSaving(true);
    try {
      const d = await api("/api/integrations/cloudinary");
      setStatus(d.status);
      setMsg(d.status.connected ? "✓ Connection is live." : `⚠ ${d.status.message}`);
    } catch (e: any) {
      setMsg("⚠ " + e.message);
      toast("error", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    // Two-tap inline confirm — no blocking browser dialog.
    if (!armingRemove) {
      setArmingRemove(true);
      toast("info", "Tap “Remove override” once more to confirm.");
      setTimeout(() => setArmingRemove(false), 5000);
      return;
    }
    setArmingRemove(false);
    setSaving(true);
    try {
      const d = await api("/api/integrations/cloudinary", { method: "DELETE" });
      setStatus(d.status);
      setForm({ cloudName: "", apiKey: "", apiSecret: "", folder: "rs-decor" });
      setHasSecret(false);
      setMsg("Override removed — using .env values now.");
      toast("success", "Panel override removed. Server .env values are active.");
    } catch (e: any) {
      setMsg("⚠ " + e.message);
      toast("error", e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Shell>
      <PageHeader title="Integrations" subtitle="Cloudinary credentials live in the private Firestore doc settings/integrations — never public, never returned to the browser." />

      {loading && (
        <div className="grid lg:grid-cols-5 gap-4 items-start">
          <div className="card p-5 lg:col-span-3 space-y-3">
            <div className="skeleton h-6 w-52" />
            <div className="skeleton h-11 w-full" />
            <div className="skeleton h-11 w-full" />
            <div className="skeleton h-11 w-full" />
          </div>
          <div className="card p-5 lg:col-span-2 space-y-3">
            <div className="skeleton h-6 w-32" />
            <div className="skeleton h-5 w-full" />
            <div className="skeleton h-5 w-full" />
          </div>
        </div>
      )}
      {!loading && error && (
        <StateView icon="🔌" tone="red" title="Couldn't load integrations" hint={`${error} — please check your connection and try again.`}
          action={<button className="btn-gold" onClick={load}>↻ Try again</button>} />
      )}

      {!loading && !error && (
        <div className="grid lg:grid-cols-5 gap-4 items-start">
          <div className="card p-5 lg:col-span-3">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="font-extrabold">☁️ Cloudinary — image storage</h3>
              <span className="ml-auto">{status && <StatusPill status={status} />}</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Cloud name</label>
                <input className="input font-mono" value={form.cloudName} onChange={(e) => setForm({ ...form, cloudName: e.target.value })} placeholder="e.g. rs-decor-cloud" />
              </div>
              <div>
                <label className="label">API key</label>
                <input className="input font-mono" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="e.g. 123456789012345" />
              </div>
              <div>
                <label className="label">API secret {hasSecret && <span className="normal-case font-normal text-emerald-600">· saved ✓ (leave blank to keep)</span>}</label>
                <div className="relative">
                  <input type={showSecret ? "text" : "password"} className="input font-mono pr-16" value={form.apiSecret} onChange={(e) => setForm({ ...form, apiSecret: e.target.value })} placeholder={hasSecret ? "•••••••• (unchanged)" : "paste secret"} />
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500 hover:text-obsidian" onClick={() => setShowSecret(!showSecret)}>{showSecret ? "Hide" : "Show"}</button>
                </div>
              </div>
              <div>
                <label className="label">Upload folder prefix</label>
                <input className="input font-mono" value={form.folder} onChange={(e) => setForm({ ...form, folder: e.target.value })} placeholder="rs-decor" />
                <p className="text-[11px] text-slate-500 mt-1">Images land in <code>{form.folder || "rs-decor"}/designs|​categories|​hero|​logo</code></p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <button className="btn-gold flex-1" disabled={saving} onClick={save}>{saving ? "Testing…" : "Save & test connection"}</button>
              <button className="btn-ghost" disabled={saving} onClick={retest}>↻ Re-test</button>
              <button className="btn-ghost hover:!border-red-400 hover:text-red-600" disabled={saving} onClick={remove}>{armingRemove ? "Tap again to confirm" : "Remove override"}</button>
            </div>
            {msg && <div className="card p-3 text-sm mt-3 !bg-[#faf8f2]">{msg}</div>}
            <p className="text-[11px] text-slate-400 mt-3">Find these in Cloudinary → Dashboard → API keys. Leaving all fields to server <code>.env</code> also works — the panel override simply wins when complete.</p>
          </div>

          <div className="card p-5 lg:col-span-2">
            <h3 className="font-extrabold mb-2">Live status</h3>
            {status && (
              <div className="space-y-2 text-sm">
                <Row k="State" v={status.connected ? "Connected ✓" : status.configured ? "Configured, unreachable" : "Not connected"} />
                <Row k="Cloud" v={status.cloudName || "—"} mono />
                <Row k="API key" v={status.apiKeyMasked || "—"} mono />
                <Row k="Source" v={status.source === "panel" ? "Panel settings" : status.source === "env" ? "Server .env" : "None"} />
                <Row k="Folder" v={status.folder || "—"} mono />
                <p className="text-xs text-slate-500 pt-1">{status.message}</p>
                <Link href="/" className="btn-ghost w-full !py-2 text-xs">View on overview →</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#f0ece0] pb-1.5">
      <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">{k}</span>
      <span className={`text-right font-semibold ${mono ? "font-mono text-[13px]" : ""}`}>{v}</span>
    </div>
  );
}
