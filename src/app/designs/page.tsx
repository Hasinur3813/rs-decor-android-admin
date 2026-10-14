"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { Modal, PageHeader, StateView } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api, uploadImage } from "@/lib/client";
import Link from "next/link";

type Design = any;
const LIMITS = [12, 24, 48, 100];

function thumbnailUrl(url: string): string {
  if (!url.includes("res.cloudinary.com/") || !url.includes("/image/upload/")) return url;
  return url.replace("/image/upload/", "/image/upload/w_112,h_112,c_fill,g_auto,f_auto,q_auto/");
}

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
  const [editing, setEditing] = useState<Design | null>(null);
  const [deleting, setDeleting] = useState<Design[] | null>(null);
  const [bulkAction, setBulkAction] = useState<"" | "publish" | "unpublish" | "delete">("");
  const [busy, setBusy] = useState(false);
  const [searchIndexBusy, setSearchIndexBusy] = useState(false);
  const [searchIndexProgress, setSearchIndexProgress] = useState(0);
  const searchIndexStarted = useRef(false);
  const [statusUpdating, setStatusUpdating] = useState<Set<string>>(new Set());

  // Debounce search so 6000-row catalogs aren't queried per keystroke
  useEffect(() => {
    const t = setTimeout(() => { setQLive(q); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
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
      if (showLoading) setLoading(false);
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
    if (statusUpdating.has(row.id)) return;
    const nextIsActive = row.isActive === false;
    setStatusUpdating((current) => new Set(current).add(row.id));
    setRows((current) => current.map((item) =>
      item.id === row.id ? { ...item, isActive: nextIsActive } : item
    ));
    try {
      await api(`/api/designs/${row.id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive: nextIsActive })
      });
      toast("success", nextIsActive ? `"${row.name}" is now live on the app.` : `"${row.name}" is now hidden from the app.`);
      await load(false);
    } catch (e: any) {
      setRows((current) => current.map((item) =>
        item.id === row.id ? { ...item, isActive: row.isActive } : item
      ));
      toast("error", e.message);
    } finally {
      setStatusUpdating((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
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

  const prepareAndroidSearch = useCallback(async () => {
    if (searchIndexBusy) return;
    setSearchIndexBusy(true);
    setSearchIndexProgress(0);
    let processed = 0;
    let totalSearchable = 0;
    try {
      do {
        const result: {
          processed: number;
          updated: number;
          searchable: number;
          totalProcessed: number;
          totalSearchable: number;
          hasMore: boolean;
        } = await api("/api/designs/search-index", {
          method: "POST",
          body: JSON.stringify({ limit: 400 })
        });
        processed += result.processed || 0;
        totalSearchable = result.totalSearchable || totalSearchable;
        setSearchIndexProgress(result.totalProcessed || processed);
        if (!result.hasMore) break;
      } while (true);
      if (processed > 0) {
        toast("success", `Android search ready: ${totalSearchable.toLocaleString()} searchable designs indexed.`);
      }
    } catch (e: any) {
      toast("error", `Search index stopped after ${processed.toLocaleString()} designs: ${e.message}`);
    } finally {
      setSearchIndexBusy(false);
    }
  }, [searchIndexBusy, toast]);

  useEffect(() => {
    if (searchIndexStarted.current) return;
    searchIndexStarted.current = true;
    void prepareAndroidSearch();
  }, [prepareAndroidSearch]);

  const pages = pageWindow(page, totalPages);

  return (
    <Shell>
      <PageHeader title="Designs" subtitle={`${totals.all.toLocaleString()} total · ${totals.active.toLocaleString()} live · ${totals.hidden.toLocaleString()} hidden`}>
        <button className="btn-ghost !py-2" onClick={() => { load(); toast("info", "Catalog reloaded."); }}>Refresh</button>
        {searchIndexBusy && <span className="text-xs text-[var(--muted)]">Preparing Android search index ({searchIndexProgress.toLocaleString()}…)</span>}
        <Link href="/designs/upload" className="btn-gold !py-2">+ Upload designs</Link>
      </PageHeader>

      {/* Toolbar: search + filters + sort */}
      <div className="card p-3 mb-3">
        <div className="flex flex-wrap gap-2">
          <input className="input !w-64" placeholder="Search name, category, room..." value={q} onChange={(e) => { setQ(e.target.value); }} />
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
            <option value="name">Name A-Z</option>
          </select>
          {(q || fCat || fSub || fStatus !== "all" || sort !== "newest") && (
            <button className="btn-ghost !py-2" onClick={resetFilters}>Clear</button>
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
          }}>Publish</button>
          <button className="btn-ghost !py-1.5 !text-xs" onClick={() => {
            setBulkAction("unpublish");
            setDeleting(rows.filter((r) => selected.has(r.id)));
          }}>Unpublish</button>
          <button className="btn-ghost !py-1.5 !text-xs hover:!border-red-400 hover:text-red-600" onClick={() => {
            setBulkAction("delete");
            setDeleting(rows.filter((r) => selected.has(r.id)));
          }}>Delete</button>
          <button className="text-xs font-bold text-slate-500 hover:text-obsidian ml-auto px-2" onClick={() => setSelected(new Set())}>Deselect all</button>
        </div>
      )}

      {error && (
        <div className="mb-3">
          <StateView icon="!" tone="red" title="Couldn't load designs" hint={`${error} - please check your connection and try again.`}
            action={<button className="btn-gold" onClick={() => load()}>Try again</button>} />
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
                  <tr key={d.id} className={`transition hover:bg-slate-50 ${selected.has(d.id) ? "!bg-gold/5" : ""}`}>
                    <td><input type="checkbox" checked={selected.has(d.id)} onChange={() => {
                      const next = new Set(selected);
                      if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                      setSelected(next);
                    }} className="w-4 h-4 accent-[#c9a227]" /></td>
                    <td>
                      <div className="flex items-center gap-3 min-w-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {d.imageUrl
                          ? <img src={thumbnailUrl(d.imageUrl)} alt={d.name} width={56} height={56} loading="lazy" decoding="async" className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0" />
                          : <div className="w-14 h-14 rounded-xl bg-slate-100 grid place-items-center text-xs text-slate-400 shrink-0">No image</div>}
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
                        type="button"
                        title={live ? "Click to unpublish" : "Click to publish"}
                        aria-label={`${statusUpdating.has(d.id) ? "Updating status for" : live ? "Unpublish" : "Publish"} ${d.name}`}
                        aria-busy={statusUpdating.has(d.id)}
                        disabled={statusUpdating.has(d.id)}
                        onClick={() => togglePublish(d)}
                        className={`pill min-w-[84px] justify-center border transition disabled:cursor-wait disabled:opacity-70 ${live ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"}`}
                      >
                        {statusUpdating.has(d.id) ? (
                          <><span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" /> Saving</>
                        ) : live ? "Live" : "Hidden"}
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
          <StateView icon="+" tone="gold"
            title={total === 0 && !q && !fCat && !fSub ? "No designs yet" : "No designs match"}
            hint={total === 0 && !q && !fCat && !fSub
              ? "Upload your first designs - they'll appear on the Android app instantly."
              : "Try a different search term, or clear your filters to see everything."}
            action={total === 0 && !q && !fCat && !fSub
              ? <Link href="/designs/upload" className="btn-gold">+ Upload designs</Link>
              : <button className="btn-ghost" onClick={resetFilters}>Clear filters</button>} />
        )}

        {/* Pagination footer */}
        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">
              {total === 0 ? "0 results" : `${((page - 1) * limit) + 1}-${Math.min(page * limit, total)} of ${total.toLocaleString()}`}
            </span>
            <label className="flex items-center gap-2">
              <span>Rows per page</span>
              <select aria-label="Rows per page" className="input !w-auto !py-1.5 !text-xs" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
                {LIMITS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          </div>
          <nav className="flex items-center justify-between gap-2 sm:ml-auto sm:justify-end" aria-label="Design table pages">
            <PageBtn label="Previous" disabled={page <= 1} onClick={() => setPage(page - 1)} />
            <div className="flex items-center gap-1">
              {pages.map((entry) => typeof entry === "object" ? (
                <button
                  key={`ellipsis-${entry.from}-${entry.to}`}
                  type="button"
                  title={`Jump to page ${entry.targetPage}`}
                  aria-label={`Jump to page ${entry.targetPage}, skipping pages ${entry.from} to ${entry.to}`}
                  onClick={() => setPage(entry.targetPage)}
                  className="grid h-8 min-w-8 place-items-center rounded-lg px-1.5 text-xs font-semibold text-slate-400 transition hover:bg-white hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  …
                </button>
              ) : (
                <button key={entry} type="button" onClick={() => setPage(entry)} aria-label={`Go to page ${entry}`} aria-current={entry === page ? "page" : undefined}
                  className={`grid h-8 min-w-8 place-items-center rounded-lg px-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${entry === page ? "bg-blue-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"}`}>
                  {entry}
                </button>
              ))}
            </div>
            <span className="hidden whitespace-nowrap text-xs text-slate-500 md:block">Page {page} of {totalPages}</span>
            <PageBtn label="Next" disabled={page >= totalPages} onClick={() => setPage(page + 1)} />
          </nav>
        </div>
      </div>

      {editing && <EditDesign design={editing} cats={cats} subs={subs} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); toast("success", "Design updated."); await load(); }} />}
      {deleting && (
        <Modal title={bulkAction === "delete" ? `Delete ${deleting.length} design(s)?` : `${bulkAction === "publish" ? "Publish" : "Unpublish"} ${deleting.length} design(s)?`} onClose={() => { setDeleting(null); setBulkAction(""); }}>
          <p className="text-sm text-slate-600">
            {bulkAction === "delete"
              ? <>This removes {deleting.length} design(s) from Firestore{deleting.length === 1 ? " and deletes its Cloudinary image" : " and their Cloudinary images"}. The app updates immediately. This cannot be undone.</>
              : <>These designs will become <b>{bulkAction === "publish" ? "visible" : "hidden"}</b> on the Android app immediately.</>}
          </p>
          {bulkAction === "delete" && deleting.length === 1 && (
            <p className="mt-2 text-sm font-bold">"{deleting[0].name}"</p>
          )}
          <div className="flex gap-2 mt-5 justify-end">
            <button className="btn-ghost" onClick={() => { setDeleting(null); setBulkAction(""); }}>Cancel</button>
            <button className={bulkAction === "delete" ? "btn-danger" : "btn-gold"} disabled={busy} onClick={runBulk}>
              {busy ? "Working..." : bulkAction === "delete" ? "Delete forever" : "Confirm"}
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
      className="min-w-[32px] h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 hover:border-blue-300 disabled:opacity-40">
      {label}
    </button>
  );
}

type PageWindowEntry = number | { from: number; to: number; targetPage: number };

function pageWindow(page: number, totalPages: number): PageWindowEntry[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = new Set([1, totalPages, page, page - 1, page + 1]);
  const sorted = Array.from(pages).filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  const out: PageWindowEntry[] = [];

  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) {
      const from = sorted[index - 1] + 1;
      const to = value - 1;
      const targetPage = to < page ? Math.max(from, page - 5) : Math.min(to, page + 5);
      out.push({ from, to, targetPage });
    }
    out.push(value);
  });
  return out;
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
      toast("success", "New photo uploaded - save to apply it.");
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
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {form.imageUrl && <img src={form.imageUrl} alt="" className="w-full h-48 object-cover" />}
            {reuploadPct !== null && <div className="h-1.5 bg-slate-100"><div className="h-full bg-gold" style={{ width: `${reuploadPct}%` }} /></div>}
          </div>
          <label className="btn-ghost w-full mt-2 cursor-pointer">
            {reuploadPct !== null ? `Uploading ${reuploadPct}%...` : "Replace photo"}
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
              <option value="">Select a category</option>
              {cats.map((c: any) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Room</label>
            <select className="input" value={form.subcategorySlug} onChange={(e) => setForm({ ...form, subcategorySlug: e.target.value })}>
              <option value="">Select a room</option>
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
          <button className="btn-gold" disabled={saving} onClick={save}>{saving ? "Saving..." : "Save changes"}</button>
        </div>
      </div>
    </Modal>
  );
}
