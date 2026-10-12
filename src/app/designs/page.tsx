"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { Modal, PageHeader, StateView } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api, uploadImage } from "@/lib/client";

type Design = any;
const LIMITS = [12, 24, 48, 100];

export default function DesignsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Design[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totals, setTotals] = useState({ all: 0, active: 0, hidden: 0 });

  const [q, setQ] = useState("");
  const [qLive, setQLive] = useState("");
  const [fCat, setFCat] = useState("");
  const [fSub, setFSub] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [limit, setLimit] = useState(24);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showUpload, setShowUpload] = useState(false);
  const [editing, setEditing] = useState<Design | null>(null);
  const [deleting, setDeleting] = useState<Design[] | null>(null);
  const [bulkAction, setBulkAction] = useState<"" | "publish" | "unpublish" | "delete">("");
  const [busy, setBusy] = useState(false);

  // Debounce search so 6000-row catalogs aren't queried per keystroke
  useEffect(() => {
    const t = setTimeout(() => { setQLive(q); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        q: qLive, categorySlug: fCat, subcategorySlug: fSub,
        status: fStatus, sort, page: String(page), limit: String(limit)
      });
      const [d, c, s] = await Promise.all([
        api(`/api/designs?${params}`),
        cats.length || subs.length ? null : api("/api/categories"),
        cats.length || subs.length ? null : api("/api/subcategories")
      ]);
      setRows(d.items || []);
      setTotal(d.total || 0);
      setPage(d.page || 1);
      setTotalPages(d.totalPages || 1);
      setTotals(d.totals || { all: 0, active: 0, hidden: 0 });
      if (c) setCats(c.items || []);
      if (s) setSubs(s.items || []);
      setSelected(new Set());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLive, fCat, fSub, fStatus, sort, page, limit]);

  useEffect(() => { load(); }, [load]);

  function resetFilters() {
    setQ(""); setQLive(""); setFCat(""); setFSub(""); setFStatus("all"); setSort("newest"); setPage(1);
  }

  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  function toggleAll() {
    const next = new Set(selected);
    if (allOnPage) rows.forEach((r) => next.delete(r.id));
    else rows.forEach((r) => next.add(r.id));
    setSelected(next);
  }

  async function togglePublish(row: Design) {
    try {
      await api(`/api/designs/${row.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: row.isActive === false })
      });
      toast("success", row.isActive === false ? `"${row.name}" is now live on the app.` : `"${row.name}" is now hidden from the app.`);
      await load();
    } catch (e: any) {
      toast("error", e.message);
    }
  }

  async function runBulk() {
    if (!deleting || deleting.length === 0) return;
    setBusy(true);
    try {
      if (bulkAction === "delete" && deleting.length === 1 && !selected.size) {
        await api(`/api/designs/${deleting[0].id}`, { method: "DELETE" });
        toast("success", "Design deleted permanently.");
      } else {
        const ids = deleting.map((d) => d.id);
        const r = await api("/api/designs/bulk", { method: "POST", body: JSON.stringify({ action: bulkAction || "delete", ids }) });
        const verb = bulkAction === "delete" ? "deleted" : bulkAction === "publish" ? "published" : "hidden";
        toast("success", `${r.affected} design(s) ${verb}.`);
      }
      setDeleting(null);
      setBulkAction("");
      await load();
    } catch (e: any) {
      toast("error", e.message);
    } finally {
      setBusy(false);
    }
  }

  const pages = pageWindow(page, totalPages);

  return (
    <Shell>
      <PageHeader title="Designs" subtitle={`${totals.all.toLocaleString()} total · ${totals.active.toLocaleString()} live · ${totals.hidden.toLocaleString()} hidden`}>
        <button className="btn-ghost !py-2" onClick={() => { load(); toast("info", "Catalog reloaded."); }}>↻ Refresh</button>
        <button className="btn-gold !py-2" onClick={() => setShowUpload(true)}>＋ Upload designs</button>
      </PageHeader>

      {/* Toolbar: search + filters + sort */}
      <div className="card p-3 mb-3">
        <div className="flex flex-wrap gap-2">
          <input className="input !w-64" placeholder="🔍 Search name, category, room…" value={q} onChange={(e) => { setQ(e.target.value); }} />
          <select className="input !w-48" value={fCat} onChange={(e) => { setFCat(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {cats.map((c: any) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
          <select className="input !w-44" value={fSub} onChange={(e) => { setFSub(e.target.value); setPage(1); }}>
            <option value="">All rooms</option>
            {subs.map((s: any) => <option key={s.id} value={s.slug}>{s.name}</option>)}
          </select>
          <select className="input !w-36" value={fStatus} onChange={(e) => { setFStatus(e.target.value); setPage(1); }}>
            <option value="all">All statuses</option>
            <option value="active">Live only</option>
            <option value="hidden">Hidden only</option>
          </select>
          <select className="input !w-36" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
          </select>
          {(q || fCat || fSub || fStatus !== "all" || sort !== "newest") && (
            <button className="btn-ghost !py-2" onClick={resetFilters}>Clear ✕</button>
          )}
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="card p-2.5 mb-3 flex flex-wrap items-center gap-2 !border-gold/60 bg-gold/5">
          <span className="text-sm font-bold px-1">{selected.size} selected</span>
          <button className="btn-ghost !py-1.5 !text-xs" onClick={async () => {
            setBulkAction("publish");
            setDeleting(rows.filter((r) => selected.has(r.id)));
          }}>✓ Publish</button>
          <button className="btn-ghost !py-1.5 !text-xs" onClick={() => {
            setBulkAction("unpublish");
            setDeleting(rows.filter((r) => selected.has(r.id)));
          }}>◌ Unpublish</button>
          <button className="btn-ghost !py-1.5 !text-xs hover:!border-red-400 hover:text-red-600" onClick={() => {
            setBulkAction("delete");
            setDeleting(rows.filter((r) => selected.has(r.id)));
          }}>🗑 Delete</button>
          <button className="text-xs font-bold text-slate-500 hover:text-obsidian ml-auto px-2" onClick={() => setSelected(new Set())}>Deselect all ✕</button>
        </div>
      )}

      {error && (
        <div className="mb-3">
          <StateView icon="🔌" tone="red" title="Couldn't load designs" hint={`${error} — please check your connection and try again.`}
            action={<button className="btn-gold" onClick={load}>↻ Try again</button>} />
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="table w-full min-w-[860px]">
            <thead>
              <tr>
                <th className="!py-2.5 w-10"><input type="checkbox" checked={allOnPage} onChange={toggleAll} className="w-4 h-4 accent-[#c9a227]" /></th>
                <th>Design</th>
                <th>Category</th>
                <th>Room</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && [0, 1, 2, 3, 4].map((i) => (
                <tr key={i}>
                  <td colSpan={6}>
                    <div className="flex items-center gap-3 animate-pulse">
                      <div className="w-14 h-14 rounded-xl bg-slate-100" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 rounded bg-slate-100 w-1/3" />
                        <div className="h-2.5 rounded bg-slate-100 w-1/4" />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && rows.map((d) => {
                const live = d.isActive !== false;
                return (
                  <tr key={d.id} className={`hover:bg-[#faf8f2] transition ${selected.has(d.id) ? "!bg-gold/5" : ""}`}>
                    <td><input type="checkbox" checked={selected.has(d.id)} onChange={() => {
                      const next = new Set(selected);
                      if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                      setSelected(next);
                    }} className="w-4 h-4 accent-[#c9a227]" /></td>
                    <td>
                      <div className="flex items-center gap-3 min-w-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {d.imageUrl
                          ? <img src={d.imageUrl} alt="" loading="lazy" className="w-14 h-14 rounded-xl object-cover border border-[#eee9da] shrink-0" />
                          : <div className="w-14 h-14 rounded-xl bg-slate-100 grid place-items-center text-lg shrink-0">🖼️</div>}
                        <div className="min-w-0">
                          <div className="font-bold truncate max-w-[260px]" title={d.name}>{d.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono truncate">{d.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{d.category}<div className="text-[11px] text-slate-400 font-mono">{d.categorySlug}</div></td>
                    <td><span className="pill bg-[#faf3dd] text-[#7a5c00] border border-gold/30">{d.subcategory}</span></td>
                    <td>
                      <button
                        title={live ? "Click to unpublish" : "Click to publish"}
                        onClick={() => togglePublish(d)}
                        className={`pill border transition ${live ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"}`}
                      >
                        {live ? "● Live" : "◌ Hidden"}
                      </button>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn-ghost !py-1 !px-3 !text-xs mr-1.5" onClick={() => setEditing(d)}>Edit</button>
                      <button className="btn-ghost !py-1 !px-3 !text-xs hover:!border-red-400 hover:text-red-600" onClick={() => { setBulkAction("delete"); setDeleting([d]); }}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && rows.length === 0 && !error && (
          <StateView icon="▦" tone="gold"
            title={total === 0 && !q && !fCat && !fSub ? "No designs yet" : "No designs match"}
            hint={total === 0 && !q && !fCat && !fSub
              ? "Upload your first designs — they'll appear on the Android app instantly."
              : "Try a different search term, or clear your filters to see everything."}
            action={total === 0 && !q && !fCat && !fSub
              ? <button className="btn-gold" onClick={() => setShowUpload(true)}>＋ Upload designs</button>
              : <button className="btn-ghost" onClick={resetFilters}>Clear filters ✕</button>} />
        )}

        {/* Pagination footer */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-[#faf8f2] border-t border-[#e7e2d5]">
          <span className="text-xs text-slate-500 font-semibold">
            {total === 0 ? "0 results" : `Showing ${((page - 1) * limit) + 1}–${Math.min(page * limit, total)} of ${total.toLocaleString()}`}
          </span>
          <select className="input !w-auto !py-1.5 !text-xs ml-1" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
            {LIMITS.map((l) => <option key={l} value={l}>{l} / page</option>)}
          </select>
          <div className="ml-auto flex items-center gap-1">
            <PageBtn label="‹" disabled={page <= 1} onClick={() => setPage(page - 1)} />
            {pages.map((p) => (
              <button key={p} onClick={() => setPage(p)}
                className={`min-w-[32px] h-8 rounded-lg text-xs font-bold transition ${p === page ? "bg-obsidian text-goldbright" : "bg-white border border-[#ddd6c4] hover:border-gold"}`}>
                {p}
              </button>
            ))}
            <PageBtn label="›" disabled={page >= totalPages} onClick={() => setPage(page + 1)} />
          </div>
        </div>
      </div>

      {showUpload && <BulkUploader cats={cats} subs={subs} onClose={() => setShowUpload(false)} onDone={() => { load(); }} />}
      {editing && <EditDesign design={editing} cats={cats} subs={subs} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); toast("success", "Design updated."); await load(); }} />}
      {deleting && (
        <Modal title={bulkAction === "delete" ? `Delete ${deleting.length} design(s)?` : `${bulkAction === "publish" ? "Publish" : "Unpublish"} ${deleting.length} design(s)?`} onClose={() => { setDeleting(null); setBulkAction(""); }}>
          <p className="text-sm text-slate-600">
            {bulkAction === "delete"
              ? <>This removes {deleting.length} design(s) from Firestore{deleting.length === 1 ? " and deletes its Cloudinary image" : " and their Cloudinary images"}. The app updates immediately. This cannot be undone.</>
              : <>These designs will become <b>{bulkAction === "publish" ? "visible" : "hidden"}</b> on the Android app immediately.</>}
          </p>
          {bulkAction === "delete" && deleting.length === 1 && (
            <p className="text-sm font-bold mt-2">“{deleting[0].name}”</p>
          )}
          <div className="flex gap-2 mt-5 justify-end">
            <button className="btn-ghost" onClick={() => { setDeleting(null); setBulkAction(""); }}>Cancel</button>
            <button className={bulkAction === "delete" ? "btn-danger" : "btn-gold"} disabled={busy} onClick={runBulk}>
              {busy ? "Working…" : bulkAction === "delete" ? "Delete forever" : "Confirm"}
            </button>
          </div>
        </Modal>
      )}
    </Shell>
  );
}

function PageBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className="min-w-[32px] h-8 rounded-lg text-sm font-bold bg-white border border-[#ddd6c4] hover:border-gold disabled:opacity-40">
      {label}
    </button>
  );
}

function pageWindow(page: number, totalPages: number): number[] {
  const out: number[] = [];
  const from = Math.max(1, Math.min(page - 2, totalPages - 4));
  const to = Math.min(totalPages, from + 4);
  for (let p = from; p <= to; p++) out.push(p);
  return out;
}

/* ---------------- Upload studio (unchanged flow, toast feedback) ---------------- */

type QueueItem = {
  key: string;
  file: File;
  preview: string;
  name: string;
  categorySlug: string;
  subcategorySlug: string;
  pct: number;
  status: "ready" | "uploading" | "saving" | "done" | "error";
  message?: string;
};

function BulkUploader({ cats, subs, onClose, onDone }: { cats: any[]; subs: any[]; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [defCat, setDefCat] = useState(cats[0]?.slug || "");
  const [defSub, setDefSub] = useState(subs.find((s: any) => s.slug !== "all")?.slug || subs[0]?.slug || "");
  const [publishing, setPublishing] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = items.filter((i) => i.status === "done").length;

  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 30);
    const mapped: QueueItem[] = arr.map((file, idx) => ({
      key: `${Date.now()}-${idx}-${file.name}`,
      file,
      preview: URL.createObjectURL(file),
      name: file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "),
      categorySlug: defCat,
      subcategorySlug: defSub,
      pct: 0,
      status: "ready"
    }));
    setItems((prev) => [...prev, ...mapped]);
  }

  function patch(key: string, p: Partial<QueueItem>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...p } : i)));
  }

  function catName(slug: string) {
    return cats.find((c: any) => c.slug === slug)?.name || "";
  }
  function subName(slug: string) {
    return subs.find((s: any) => s.slug === slug)?.name || "";
  }

  async function publishAll() {
    const pending = items.filter((i) => i.status === "ready" || i.status === "error");
    if (pending.length === 0) return;
    if (!defCat && !pending[0]?.categorySlug) { toast("error", "Please select a category first (or add one in Categories)."); return; }
    setPublishing(true);
    let okCount = 0;
    for (const item of pending) {
      if (!item.categorySlug || !item.subcategorySlug) {
        patch(item.key, { status: "error", message: "Pick category + room." });
        continue;
      }
      if (!item.name.trim()) {
        patch(item.key, { status: "error", message: "Name required." });
        continue;
      }
      try {
        patch(item.key, { status: "uploading", message: "Uploading to Cloudinary…" });
        const up = await uploadImage(item.file, "designs", (pct) => patch(item.key, { pct }));
        patch(item.key, { status: "saving", pct: 100, message: "Saving to Firestore…" });
        await api("/api/designs", {
          method: "POST",
          body: JSON.stringify({
            name: item.name.trim(),
            category: catName(item.categorySlug),
            categorySlug: item.categorySlug,
            subcategory: subName(item.subcategorySlug),
            subcategorySlug: item.subcategorySlug,
            imageUrl: up.secure_url,
            imagePublicId: up.public_id
          })
        });
        patch(item.key, { status: "done", message: "Live ✓" });
        okCount++;
      } catch (e: any) {
        patch(item.key, { status: "error", message: e.message || "Failed" });
      }
    }
    setPublishing(false);
    if (okCount > 0) {
      toast("success", `${okCount} design(s) published — live on the app.`);
      await onDone();
    } else {
      toast("error", "Nothing published. Please fix the highlighted rows.");
    }
  }

  return (
    <Modal title={`Upload studio — ${items.length} file(s), ${done} live`} onClose={onClose} wide>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="label">Default category for new files</label>
          <select className="input" value={defCat} onChange={(e) => { setDefCat(e.target.value); setItems((prev) => prev.map((i) => i.status === "ready" ? { ...i, categorySlug: e.target.value } : i)); }}>
            <option value="">— select —</option>
            {cats.map((c: any) => <option key={c.id} value={c.slug}>{c.name} ({c.nameEn})</option>)}
          </select>
        </div>
        <div>
          <label className="label">Default room for new files</label>
          <select className="input" value={defSub} onChange={(e) => { setDefSub(e.target.value); setItems((prev) => prev.map((i) => i.status === "ready" ? { ...i, subcategorySlug: e.target.value } : i)); }}>
            <option value="">— select —</option>
            {subs.map((s: any) => <option key={s.id} value={s.slug}>{s.name} ({s.nameEn})</option>)}
          </select>
        </div>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition ${drag ? "border-gold bg-gold/10" : "border-[#ddd6c4] bg-[#faf8f2] hover:border-gold"}`}
      >
        <div className="text-3xl">☁️⬆️</div>
        <div className="font-extrabold mt-1">Drop up to 30 images here, or click to browse</div>
        <div className="text-xs text-slate-500">Each file becomes one design · JPG/PNG/WEBP · 12 MB max · uploads show live progress</div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />

      {items.length > 0 && (
        <div className="mt-4 space-y-3 max-h-[46vh] overflow-y-auto scroll-thin pr-1">
          {items.map((it) => (
            <div key={it.key} className="rounded-2xl border border-[#eee9da] p-3 flex gap-3 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.preview} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <input className="input !py-1.5 !text-[13px] font-semibold" value={it.name} onChange={(e) => patch(it.key, { name: e.target.value })} placeholder="Design name (Bangla)" />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <select className="input !py-1.5 !text-xs" value={it.categorySlug} onChange={(e) => patch(it.key, { categorySlug: e.target.value })}>
                    <option value="">Category…</option>
                    {cats.map((c: any) => <option key={c.id} value={c.slug}>{c.name}</option>)}
                  </select>
                  <select className="input !py-1.5 !text-xs" value={it.subcategorySlug} onChange={(e) => patch(it.key, { subcategorySlug: e.target.value })}>
                    <option value="">Room…</option>
                    {subs.map((s: any) => <option key={s.id} value={s.slug}>{s.name}</option>)}
                  </select>
                </div>
                {(it.status === "uploading" || it.status === "saving") && (
                  <div className="mt-2">
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-goldbright to-gold transition-all" style={{ width: `${it.status === "saving" ? 100 : it.pct}%` }} />
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{it.message} {it.status === "uploading" ? `${it.pct}%` : ""}</div>
                  </div>
                )}
                {it.status === "done" && <div className="text-xs font-bold text-emerald-600 mt-1.5">✓ Live on the app</div>}
                {it.status === "error" && <div className="text-xs font-bold text-red-600 mt-1.5">⚠ {it.message}</div>}
              </div>
              <button className="self-start text-slate-400 hover:text-red-600" onClick={() => setItems((prev) => prev.filter((x) => x.key !== it.key))}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-4">
        <div className="text-xs text-slate-500">{done}/{items.length} published</div>
        <div className="ml-auto flex gap-2">
          <button className="btn-ghost" onClick={onClose}>Close</button>
          <button className="btn-gold" disabled={publishing || items.length === 0} onClick={publishAll}>
            {publishing ? "Publishing…" : `Publish ${items.filter((i) => i.status !== "done").length} design(s)`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditDesign({ design, cats, subs, onClose, onSaved }: { design: any; cats: any[]; subs: any[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: design.name || "",
    categorySlug: design.categorySlug || "",
    subcategorySlug: design.subcategorySlug || "",
    imageUrl: design.imageUrl || "",
    imagePublicId: design.imagePublicId || "",
    isActive: design.isActive !== false
  });
  const [saving, setSaving] = useState(false);
  const [reuploadPct, setReuploadPct] = useState<number | null>(null);

  async function replaceFile(f: File | undefined) {
    if (!f) return;
    setReuploadPct(0);
    try {
      const up = await uploadImage(f, "designs", setReuploadPct);
      setForm((p) => ({ ...p, imageUrl: up.secure_url, imagePublicId: up.public_id }));
      toast("success", "New photo uploaded — save to apply it.");
    } catch (e: any) {
      toast("error", e.message);
    } finally {
      setReuploadPct(null);
    }
  }

  async function save() {
    const cat = cats.find((c: any) => c.slug === form.categorySlug);
    const sub = subs.find((s: any) => s.slug === form.subcategorySlug);
    if (!form.name.trim() || !cat || !sub || !form.imageUrl) {
      toast("error", "Name, category, room and image are all required.");
      return;
    }
    setSaving(true);
    try {
      await api(`/api/designs/${design.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: form.name.trim(),
          category: cat.name,
          categorySlug: cat.slug,
          subcategory: sub.name,
          subcategorySlug: sub.slug,
          imageUrl: form.imageUrl,
          imagePublicId: form.imagePublicId,
          isActive: form.isActive
        })
      });
      onSaved();
    } catch (e: any) {
      toast("error", e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit design" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Photo (Cloudinary)</label>
          <div className="rounded-2xl overflow-hidden border border-[#eee9da]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {form.imageUrl && <img src={form.imageUrl} alt="" className="w-full h-48 object-cover" />}
            {reuploadPct !== null && <div className="h-1.5 bg-slate-100"><div className="h-full bg-gold" style={{ width: `${reuploadPct}%` }} /></div>}
          </div>
          <label className="btn-ghost w-full mt-2 cursor-pointer">
            {reuploadPct !== null ? `Uploading ${reuploadPct}%…` : "Replace photo"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => replaceFile(e.target.files?.[0])} />
          </label>
        </div>
        <div>
          <label className="label">Design name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.categorySlug} onChange={(e) => setForm({ ...form, categorySlug: e.target.value })}>
              <option value="">—</option>
              {cats.map((c: any) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Room</label>
            <select className="input" value={form.subcategorySlug} onChange={(e) => setForm({ ...form, subcategorySlug: e.target.value })}>
              <option value="">—</option>
              {subs.map((s: any) => <option key={s.id} value={s.slug}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
          Visible on the app
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-gold" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </Modal>
  );
}
