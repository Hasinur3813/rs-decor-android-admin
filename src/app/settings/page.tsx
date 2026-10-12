"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { ImageUploader, PageHeader, StateView } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/client";
import { DEFAULT_SETTINGS } from "@/lib/types";

export default function SettingsPage() {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/settings").then((d) => setForm({ ...DEFAULT_SETTINGS, ...d.item }))
      .catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const d = await api("/api/settings", { method: "PUT", body: JSON.stringify(form) });
      setForm({ ...DEFAULT_SETTINGS, ...d.item });
      setMsg("✓ Saved — the Android app observes settings/app in real time, so its call/WhatsApp buttons and hero banner update on their own.");
      toast("success", "Header, contact and hero settings saved.");
    } catch (e: any) {
      setMsg("⚠ " + e.message);
      toast("error", e.message);
    } finally {
      setSaving(false);
    }
  }

  const waPreview = `https://wa.me/${form.whatsappNumber.replace(/\D/g, "")}`;

  return (
    <Shell>
      <PageHeader title="Contact & Hero" subtitle="App header (logo + title), call / WhatsApp buttons and the home hero banner — stored in Firestore settings/app." />

      {loading && (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <div key={i} className="card p-5 space-y-3">
                <div className="skeleton h-5 w-44" />
                <div className="skeleton h-11 w-full" />
                <div className="skeleton h-11 w-full" />
                <div className="skeleton h-11 w-2/3" />
              </div>
            ))}
          </div>
          <div className="card p-5"><div className="skeleton h-80 w-full !rounded-2xl" /></div>
        </div>
      )}
      {!loading && error && (
        <StateView icon="🔌" tone="red" title="Couldn't load settings" hint={`${error} — please check your connection and try again.`}
          action={<button className="btn-gold" onClick={() => window.location.reload()}>↻ Reload page</button>} />
      )}

      {!loading && !error && (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <div className="space-y-4">
            <div className="card p-5">
              <h3 className="font-extrabold mb-3">◈ App header (logo + title)</h3>
              <div className="space-y-3">
                <ImageUploader kind="logo" value={form.logoImageUrl} publicId={form.logoImagePublicId}
                  onDone={(url, pid) => setForm((p) => ({ ...p, logoImageUrl: url, logoImagePublicId: pid }))} label="Logo (square PNG with transparent background works best)" />
                <div>
                  <label className="label">App title</label>
                  <input className="input" value={form.appTitle} onChange={(e) => setForm({ ...form, appTitle: e.target.value })} placeholder="আর এস ৩ডি ডেকর" />
                </div>
                <div>
                  <label className="label">App subtitle</label>
                  <input className="input" value={form.appSubtitle} onChange={(e) => setForm({ ...form, appSubtitle: e.target.value })} placeholder="প্রিমিয়াম ডিজাইন শোকেস" />
                </div>
              </div>
            </div>

            <div className="card p-5">
              <h3 className="font-extrabold mb-3">📞 Contact numbers</h3>
              <div className="space-y-3">
                <div>
                  <label className="label">Call number (dial intent)</label>
                  <input className="input font-mono" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="+8801976600300" />
                </div>
                <div>
                  <label className="label">Display number (Bangla)</label>
                  <input className="input" value={form.phoneDisplay} onChange={(e) => setForm({ ...form, phoneDisplay: e.target.value })} placeholder="০১৯৭৬-৬০০৩০০" />
                </div>
                <div>
                  <label className="label">WhatsApp number (digits only, with country code)</label>
                  <input className="input font-mono" value={form.whatsappNumber} onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })} placeholder="8801976600300" />
                  <p className="text-[11px] text-slate-500 mt-1">Opens as: <code>{waPreview}</code></p>
                </div>
              </div>
            </div>

            <div className="card p-5">
              <h3 className="font-extrabold mb-3">◈ Hero banner</h3>
              <div className="space-y-3">
                <ImageUploader kind="hero" value={form.heroImageUrl} publicId={form.heroImagePublicId}
                  onDone={(url, pid) => setForm((p) => ({ ...p, heroImageUrl: url, heroImagePublicId: pid }))} label="Hero image (wide 16:9 works best)" />
                <div>
                  <label className="label">Title</label>
                  <input className="input" value={form.heroTitle} onChange={(e) => setForm({ ...form, heroTitle: e.target.value })} />
                </div>
                <div>
                  <label className="label">Subtitle</label>
                  <input className="input" value={form.heroSubtitle} onChange={(e) => setForm({ ...form, heroSubtitle: e.target.value })} />
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea className="input" rows={2} value={form.heroDescription} onChange={(e) => setForm({ ...form, heroDescription: e.target.value })} />
                </div>
              </div>
            </div>

            <button className="btn-gold w-full" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save header + contact + hero"}</button>
            {msg && <div className="card p-3 text-sm">{msg}</div>}
          </div>

          {/* Live phone-style preview */}
          <div className="card p-5 lg:sticky lg:top-20">
            <h3 className="font-extrabold mb-3">📱 Live preview (mirrors the Android home)</h3>
            <div className="mx-auto max-w-[300px] rounded-[2rem] bg-obsidian p-2.5 shadow-soft">
              <div className="rounded-[1.6rem] overflow-hidden bg-[#0c0d12]">
                <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                  {form.logoImageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={form.logoImageUrl} alt="" className="w-9 h-9 rounded-lg object-contain bg-white p-0.5" />
                    : <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-goldbright to-gold grid place-items-center text-obsidian font-black text-xs">RS</div>}
                  <div className="min-w-0">
                    <div className="text-goldbright font-extrabold text-[13px] leading-tight truncate">{form.appTitle || "—"}</div>
                    <div className="text-white/50 text-[10px] truncate">{form.appSubtitle || "—"}</div>
                  </div>
                </div>
                <div className="relative h-44">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {form.heroImageUrl ? <img src={form.heroImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 bg-gradient-to-br from-surface2 to-obsidian" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                  <div className="absolute bottom-0 p-3">
                    <div className="text-white font-extrabold text-[15px] leading-tight">{form.heroTitle || "—"}</div>
                    <div className="text-goldbright text-[11px] font-bold mt-0.5">{form.heroSubtitle || "—"}</div>
                    <div className="text-white/60 text-[10px] mt-0.5">{form.heroDescription || "—"}</div>
                  </div>
                </div>
                <div className="p-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-[#1f6feb] text-white text-center py-2 text-xs font-bold">📞 কল করুন<br /><span className="font-normal opacity-80">{form.phoneDisplay}</span></div>
                  <a href={waPreview} target="_blank" className="rounded-xl bg-[#22a35a] text-white text-center py-2 text-xs font-bold">💬 হোয়াটসঅ্যাপ<br /><span className="font-normal opacity-80">Instant message</span></a>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-3">Preview only — the Android app observes this Firestore doc live and renders the same banner, texts and buttons.</p>
          </div>
        </div>
      )}
    </Shell>
  );
}
