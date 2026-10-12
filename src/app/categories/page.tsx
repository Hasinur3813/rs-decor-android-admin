"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { ImageUploader, Modal, PageHeader, StateView } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/client";
import { slugifyAscii } from "@/lib/helpers";

export default function CategoriesPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<null | { mode: "create" } | { mode: "edit"; item: any }>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const d = await api("/api/categories");
      setItems(d.items || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/categories/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      toast("success", "Category deleted.");
      await load();
    } catch (e: any) {
      toast("error", e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageHeader title="Categories" subtitle="Main showcase groups — the app's filter pills read these slugs.">
        <button className="btn-gold !py-2" onClick={() => setModal({ mode: "create" })}>＋ New category</button>
      </PageHeader>

      {loading && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card overflow-hidden">
              <div className="skeleton h-40 !rounded-none" />
              <div className="p-4 space-y-2.5">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-1/2" />
                <div className="flex gap-2 pt-1">
                  <div className="skeleton h-8 flex-1" />
                  <div className="skeleton h-8 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && error && (
        <StateView icon="🔌" tone="red" title="Couldn't load categories" hint={`${error} — please check your connection and try again.`}
          action={<button className="btn-gold" onClick={load}>↻ Try again</button>} />
      )}
      {!loading && !error && items.length === 0 && (
        <StateView icon="❖" tone="gold" title="No categories yet"
          hint="Create your showcase groups (e.g. 3D Wallpaper, 3D Ceiling Paper, 3D Epoxy Floor) — designs attach to these."
          action={<button className="btn-gold" onClick={() => setModal({ mode: "create" })}>＋ New category</button>} />
      )}

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((c) => (
          <div key={c.id} className="card card-hover overflow-hidden group">
            <div className="relative overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.imageUrl
                ? <img src={c.imageUrl} alt={c.name} loading="lazy" className="h-40 w-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
                : <div className="h-40 bg-slate-100 grid place-items-center text-3xl">🖼️</div>}
              {c.isActive === false && <span className="absolute right-2.5 top-2.5 pill bg-black/70 text-white backdrop-blur">Hidden</span>}
            </div>
            <div className="p-4">
              <div className="font-bold text-[15px] truncate" title={c.name}>{c.name}</div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">{c.nameEn} · <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{c.slug}</code></div>
              <div className="flex gap-2 mt-3">
                <button className="btn-ghost !py-1.5 !text-xs flex-1" onClick={() => setModal({ mode: "edit", item: c })}>Edit</button>
                <button className="btn-ghost !py-1.5 !text-xs hover:!border-red-400 hover:text-red-600" onClick={() => setDeleting(c)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modal && <CategoryForm key={modal.mode === "edit" ? modal.item.id : "new"} initial={modal.mode === "edit" ? modal.item : null}
        onClose={() => setModal(null)} onSaved={async () => { setModal(null); await load(); }} />}

      {deleting && (
        <Modal title="Delete category?" onClose={() => setDeleting(null)}>
          <p className="text-sm text-slate-600">Delete <b>{deleting.name}</b>? Blocked automatically if any design still uses it.</p>
          <div className="flex justify-end gap-2 mt-5">
            <button className="btn-ghost" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn-danger" disabled={busy} onClick={confirmDelete}>{busy ? "Deleting…" : "Delete"}</button>
          </div>
        </Modal>
      )}
    </Shell>
  );
}

function CategoryForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: initial?.name || "",
    nameEn: initial?.nameEn || "",
    slug: initial?.slug || "",
    imageUrl: initial?.imageUrl || "",
    imagePublicId: initial?.imagePublicId || "",
    order: initial?.order ?? 999,
    isActive: initial?.isActive !== false
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initial && !form.slug && form.nameEn) setForm((p) => ({ ...p, slug: slugifyAscii(form.nameEn) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.nameEn]);

  async function save() {
    if (form.name.trim().length < 2 || !form.slug.trim() || !form.imageUrl) {
      toast("error", "Please add a Bangla name, a slug and an image.");
      return;
    }
    setSaving(true);
    try {
      if (initial) {
        await api(`/api/categories/${initial.id}`, { method: "PUT", body: JSON.stringify(form) });
      } else {
        await api("/api/categories", { method: "POST", body: JSON.stringify(form) });
      }
      toast("success", initial ? "Category updated." : "Category created.");
      onSaved();
    } catch (e: any) {
      toast("error", e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? "Edit category" : "New category"} onClose={onClose}>
      <div className="space-y-3">
        <ImageUploader kind="categories" value={form.imageUrl} publicId={form.imagePublicId}
          onDone={(url, pid) => setForm((p) => ({ ...p, imageUrl: url, imagePublicId: pid }))} label="Category banner" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Name (Bangla)</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="৩ডি ওয়ালপেপার" />
          </div>
          <div>
            <label className="label">Name (English)</label>
            <input className="input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} placeholder="3D Wallpaper" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Slug (app filter key)</label>
            <input className="input font-mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="3d-wallpaper" />
          </div>
          <div>
            <label className="label">Sort order</label>
            <input type="number" className="input" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Visible on the app</label>
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-gold" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save category"}</button>
        </div>
      </div>
    </Modal>
  );
}
