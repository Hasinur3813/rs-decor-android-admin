"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { PageHeader, StateView } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api, uploadImage } from "@/lib/client";
import { DEFAULT_SETTINGS } from "@/lib/types";

type SettingsImageKind = "logo" | "hero";
type SettingsImageFiles = Record<SettingsImageKind, File | null>;
type SettingsImageProgress = Record<SettingsImageKind, number | null>;

const MAX_SETTINGS_IMAGE_BYTES = 12 * 1024 * 1024;
const ACCEPTED_SETTINGS_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export default function SettingsPage() {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...DEFAULT_SETTINGS });
  const [imageFiles, setImageFiles] = useState<SettingsImageFiles>({ logo: null, hero: null });
  const [imageProgress, setImageProgress] = useState<SettingsImageProgress>({ logo: null, hero: null });
  const [imageError, setImageError] = useState<Partial<Record<SettingsImageKind, string>>>({});
  const [stagedPreview, setStagedPreview] = useState<Record<SettingsImageKind, string>>({ logo: "", hero: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/settings").then((d) => setForm({ ...DEFAULT_SETTINGS, ...d.item }))
      .catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const logoUrl = imageFiles.logo ? URL.createObjectURL(imageFiles.logo) : "";
    const heroUrl = imageFiles.hero ? URL.createObjectURL(imageFiles.hero) : "";
    setStagedPreview({ logo: logoUrl, hero: heroUrl });
    return () => {
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      if (heroUrl) URL.revokeObjectURL(heroUrl);
    };
  }, [imageFiles.hero, imageFiles.logo]);

  function stageImage(kind: SettingsImageKind, file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_SETTINGS_IMAGE_TYPES.has(file.type)) {
      const message = "Choose a JPG, PNG, WEBP, or AVIF image.";
      setImageFiles((current) => ({ ...current, [kind]: null }));
      setImageError((current) => ({ ...current, [kind]: message }));
      toast("error", message);
      return;
    }
    if (file.size > MAX_SETTINGS_IMAGE_BYTES) {
      const message = "Image is too large. Maximum size is 12 MB.";
      setImageFiles((current) => ({ ...current, [kind]: null }));
      setImageError((current) => ({ ...current, [kind]: message }));
      toast("error", message);
      return;
    }
    setImageFiles((current) => ({ ...current, [kind]: file }));
    setImageProgress((current) => ({ ...current, [kind]: null }));
    setImageError((current) => ({ ...current, [kind]: undefined }));
    setMsg("");
  }

  function clearStagedImage(kind: SettingsImageKind) {
    setImageFiles((current) => ({ ...current, [kind]: null }));
    setImageProgress((current) => ({ ...current, [kind]: null }));
    setImageError((current) => ({ ...current, [kind]: undefined }));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setMsg("");
    setError("");
    let nextForm = { ...form };
    let uploadingKind: SettingsImageKind | null = null;
    try {
      for (const kind of ["logo", "hero"] as const) {
        const file = imageFiles[kind];
        if (!file) continue;

        uploadingKind = kind;
        setImageProgress((current) => ({ ...current, [kind]: 0 }));
        const uploaded = await uploadImage(file, kind, (pct) => {
          setImageProgress((current) => ({ ...current, [kind]: pct }));
        });
        nextForm = kind === "logo"
          ? { ...nextForm, logoImageUrl: uploaded.secure_url, logoImagePublicId: uploaded.public_id }
          : { ...nextForm, heroImageUrl: uploaded.secure_url, heroImagePublicId: uploaded.public_id };
        setForm(nextForm);
        setImageFiles((current) => ({ ...current, [kind]: null }));
        setImageProgress((current) => ({ ...current, [kind]: null }));
        uploadingKind = null;
      }

      const d = await api("/api/settings", { method: "PUT", body: JSON.stringify(nextForm) });
      setForm({ ...DEFAULT_SETTINGS, ...d.item });
      setImageFiles({ logo: null, hero: null });
      setImageError({});
      setMsg("✓ Saved — the Android app observes settings/app in real time, so its call/WhatsApp buttons and hero banner update on their own.");
      toast(d.cleanupWarning ? "info" : "success", d.cleanupWarning
        ? `Settings saved. Old image cleanup needs attention: ${d.cleanupWarning}`
        : "Header, contact and hero settings saved.");
    } catch (e: any) {
      if (uploadingKind) {
        const failedKind = uploadingKind;
        setImageError((current) => ({ ...current, [failedKind]: e.message || "Cloudinary upload failed. Please retry." }));
      }
      setMsg(`⚠ Save failed: ${e.message}`);
      toast("error", e.message);
    } finally {
      setImageProgress({ logo: null, hero: null });
      setSaving(false);
    }
  }

  const waPreview = `https://wa.me/${form.whatsappNumber.replace(/\D/g, "")}`;
  const logoPreview = stagedPreview.logo || form.logoImageUrl;
  const heroPreview = stagedPreview.hero || form.heroImageUrl;

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
                <SettingsImagePicker
                  kind="logo"
                  label="Logo (square PNG with transparent background works best)"
                  preview={logoPreview}
                  file={imageFiles.logo}
                  progress={imageProgress.logo}
                  error={imageError.logo}
                  disabled={saving}
                  onSelect={(file) => stageImage("logo", file)}
                  onClear={() => clearStagedImage("logo")}
                />
                <div>
                  <label className="label">App title</label>
                  <input className="input" disabled={saving} value={form.appTitle} onChange={(e) => setForm({ ...form, appTitle: e.target.value })} placeholder="আর এস ৩ডি ডেকর" />
                </div>
                <div>
                  <label className="label">App subtitle</label>
                  <input className="input" disabled={saving} value={form.appSubtitle} onChange={(e) => setForm({ ...form, appSubtitle: e.target.value })} placeholder="প্রিমিয়াম ডিজাইন শোকেস" />
                </div>
              </div>
            </div>

            <div className="card p-5">
              <h3 className="font-extrabold mb-3">📞 Contact numbers</h3>
              <div className="space-y-3">
                <div>
                  <label className="label">Call number (dial intent)</label>
                  <input className="input font-mono" disabled={saving} value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} placeholder="+8801976600300" />
                </div>
                <div>
                  <label className="label">Display number (Bangla)</label>
                  <input className="input" disabled={saving} value={form.phoneDisplay} onChange={(e) => setForm({ ...form, phoneDisplay: e.target.value })} placeholder="০১৯৭৬-৬০০৩০০" />
                </div>
                <div>
                  <label className="label">WhatsApp number (digits only, with country code)</label>
                  <input className="input font-mono" disabled={saving} value={form.whatsappNumber} onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })} placeholder="8801976600300" />
                  <p className="text-[11px] text-slate-500 mt-1">Opens as: <code>{waPreview}</code></p>
                </div>
              </div>
            </div>

            <div className="card p-5">
              <h3 className="font-extrabold mb-3">◈ Hero banner</h3>
              <div className="space-y-3">
                <SettingsImagePicker
                  kind="hero"
                  label="Hero image (wide 16:9 works best)"
                  preview={heroPreview}
                  file={imageFiles.hero}
                  progress={imageProgress.hero}
                  error={imageError.hero}
                  disabled={saving}
                  onSelect={(file) => stageImage("hero", file)}
                  onClear={() => clearStagedImage("hero")}
                />
                <div>
                  <label className="label">Title</label>
                  <input className="input" disabled={saving} value={form.heroTitle} onChange={(e) => setForm({ ...form, heroTitle: e.target.value })} />
                </div>
                <div>
                  <label className="label">Subtitle</label>
                  <input className="input" disabled={saving} value={form.heroSubtitle} onChange={(e) => setForm({ ...form, heroSubtitle: e.target.value })} />
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea className="input" disabled={saving} rows={2} value={form.heroDescription} onChange={(e) => setForm({ ...form, heroDescription: e.target.value })} />
                </div>
              </div>
            </div>

            <button className="btn-gold w-full" disabled={saving} onClick={save}>
              {saving
                ? imageProgress.logo !== null || imageProgress.hero !== null
                  ? "Uploading images and saving…"
                  : "Saving…"
                : imageFiles.logo || imageFiles.hero
                  ? "Upload images and save settings"
                  : "Save header + contact + hero"}
            </button>
            {msg && <div className="card p-3 text-sm">{msg}</div>}
          </div>

          {/* Live phone-style preview */}
          <div className="card p-5 lg:sticky lg:top-20">
            <h3 className="font-extrabold mb-3">📱 Live preview (mirrors the Android home)</h3>
            <div className="mx-auto max-w-[300px] rounded-[2rem] bg-obsidian p-2.5 shadow-soft">
              <div className="rounded-[1.6rem] overflow-hidden bg-[#0c0d12]">
                <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                  {logoPreview
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={logoPreview} alt="" className="w-9 h-9 rounded-lg object-contain bg-white p-0.5" />
                    : <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-goldbright to-gold grid place-items-center text-obsidian font-black text-xs">RS</div>}
                  <div className="min-w-0">
                    <div className="text-goldbright font-extrabold text-[13px] leading-tight truncate">{form.appTitle || "—"}</div>
                    <div className="text-white/50 text-[10px] truncate">{form.appSubtitle || "—"}</div>
                  </div>
                </div>
                <div className="relative h-44">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {heroPreview ? <img src={heroPreview} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 bg-gradient-to-br from-surface2 to-obsidian" />}
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

function SettingsImagePicker({
  kind,
  label,
  preview,
  file,
  progress,
  error,
  disabled,
  onSelect,
  onClear
}: {
  kind: SettingsImageKind;
  label: string;
  preview: string;
  file: File | null;
  progress: number | null;
  error?: string;
  disabled: boolean;
  onSelect: (file: File | undefined) => void;
  onClear: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const uploadState = progress === null
    ? file ? "Selected — uploads when you save." : preview ? "Saved image" : "No image selected"
    : progress >= 100 ? "Upload complete — saving settings…" : `Uploading ${progress}%`;

  return (
    <div>
      <label className="label">{label}</label>
      <label
        className={`block overflow-hidden rounded-2xl border-2 border-dashed transition ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-gold"} ${error ? "border-red-400" : dragging ? "border-gold bg-amber-50" : "border-slate-200"}`}
        onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled) onSelect(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          disabled={disabled}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            onSelect(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={`${kind} preview`} className={`w-full ${kind === "logo" ? "h-36 object-contain bg-slate-100 p-3" : "h-44 object-cover"}`} />
            {file && <span className="absolute left-2 top-2 rounded-lg bg-amber-500 px-2 py-1 text-[11px] font-bold text-white">Pending save</span>}
          </div>
        ) : (
          <div className="px-4 py-8 text-center">
            <div className="mb-2 text-2xl text-blue-600">↑</div>
            <div className="text-sm font-bold text-slate-800">Choose or drop an image</div>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="truncate">{file?.name || uploadState}</span>
          <span className={error ? "text-red-600" : file ? "font-semibold text-amber-700" : "text-emerald-700"}>{error ? "Error" : uploadState}</span>
        </div>
        {progress !== null && (
          <div className="h-1.5 bg-slate-200">
            <div className="h-full bg-gradient-to-r from-goldbright to-gold transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </label>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>JPG / PNG / WEBP / AVIF · max 12 MB · uploads when saved</span>
        {file && !disabled && <button type="button" className="font-semibold text-red-600 hover:underline" onClick={onClear}>Remove selection</button>}
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
