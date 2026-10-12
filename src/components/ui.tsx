"use client";

import { useRef, useState } from "react";
import { uploadImage } from "@/lib/client";

/** Modern drag-and-drop single image uploader → Cloudinary via /api/upload */
export function ImageUploader({
  kind, value, publicId, onDone, label = "Image"
}: {
  kind: string;
  value: string;
  publicId?: string;
  onDone: (url: string, pid: string) => void;
  label?: string;
}) {
  const [drag, setDrag] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    setError("");
    setPct(0);
    try {
      const out = await uploadImage(file, kind, setPct);
      onDone(out.secure_url, out.public_id);
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally {
      setPct(null);
    }
  }

  return (
    <div>
      <div className="label">{label}</div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files?.[0]); }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed transition overflow-hidden ${drag ? "border-gold bg-gold/10" : "border-[#ddd6c4] bg-[#faf8f2] hover:border-gold"}`}
      >
        {value ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="preview" className="w-full h-44 object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-[11px] text-white flex justify-between">
              <span>Click or drop to replace</span>
              {publicId && <span className="opacity-70">Cloudinary ✓</span>}
            </div>
          </div>
        ) : (
          <div className="py-8 text-center px-4">
            <div className="text-3xl mb-1">🖼️</div>
            <div className="text-sm font-bold">Drop image here or click to browse</div>
            <div className="text-xs text-slate-500 mt-1">JPG / PNG / WEBP / AVIF · max 12 MB · auto-optimized to Cloudinary</div>
          </div>
        )}
        {pct !== null && (
          <div className="h-1.5 bg-black/10">
            <div className="h-full bg-gradient-to-r from-goldbright to-gold transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden"
        onChange={(e) => handle(e.target.files?.[0])} />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className={`card w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[92vh] overflow-y-auto scroll-thin`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#eee9da] sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-extrabold">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <StateView icon={icon} tone="gold" title={title} hint={hint} />
  );
}

export function StatusPill({ status }: { status: { connected?: boolean; configured?: boolean } }) {
  if (status.connected) return <span className="pill bg-emerald-100 text-emerald-700">● Connected</span>;
  if (status.configured) return <span className="pill bg-amber-100 text-amber-700">● Unreachable</span>;
  return <span className="pill bg-red-100 text-red-700">● Not connected</span>;
}

/** Consistent premium page header: title + subtitle + right-side actions. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-3 mb-5">
      <div>
        <h1 className="text-[22px] leading-tight font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-[13px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children && <div className="ml-auto flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

type Tone = "gold" | "red" | "slate" | "green";

/**
 * One premium state surface for loading / error / empty:
 * soft tinted illustration, clear title, helpful hint, optional action.
 */
export function StateView({ icon, tone, title, hint, action, testId }: {
  icon: string; tone: Tone; title: string; hint?: string;
  action?: React.ReactNode; testId?: string;
}) {
  const tones: Record<Tone, string> = {
    gold: "bg-gradient-to-br from-gold/15 to-goldbright/10 text-[#8a6d00] border border-gold/25",
    red: "bg-red-50 text-red-500 border border-red-100",
    slate: "bg-slate-100 text-slate-400 border border-slate-200",
    green: "bg-emerald-50 text-emerald-500 border border-emerald-100"
  };
  return (
    <div className="card p-10 sm:p-12 text-center" data-testid={testId}>
      <div className={`state-blob ${tones[tone]}`}>{icon}</div>
      <div className="font-bold text-[17px] mt-4">{title}</div>
      {hint && <div className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto leading-relaxed">{hint}</div>}
      {action && <div className="mt-5 flex justify-center gap-2 flex-wrap">{action}</div>}
    </div>
  );
}

/** Shimmering table placeholder that mirrors real row layout. */
export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="card overflow-hidden" aria-busy="true" aria-label="Loading">
      <div className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton w-14 h-14 !rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3.5" style={{ width: `${55 - (i % 3) * 12}%` }} />
              <div className="skeleton h-2.5 w-1/4" />
            </div>
            {Array.from({ length: Math.max(1, cols - 2) }).map((_, j) => (
              <div key={j} className="skeleton h-6 w-20 hidden md:block" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Shimmering stat-card placeholder for dashboards. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5 space-y-3">
          <div className="skeleton w-9 h-9 !rounded-xl" />
          <div className="skeleton h-7 w-16" />
          <div className="skeleton h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
