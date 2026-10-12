"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Modal, PageHeader, SkeletonTable, StateView } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/client";
import { ROOM_DEFAULTS } from "@/lib/helpers";

export default function RoomsPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<null | { mode: "create" } | { mode: "edit"; item: any }>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const d = await api("/api/subcategories");
      setItems(d.items || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function seedDefaults() {
    setSeeding(true);
    try {
      for (let i = 0; i < ROOM_DEFAULTS.length; i++) {
        const r = ROOM_DEFAULTS[i];
        if (items.some((x) => x.slug === r.slug)) continue;
        await api("/api/subcategories", { method: "POST", body: JSON.stringify({ ...r, order: i }) });
      }
      await load();
      toast("success", "Default rooms are ready.");
    } catch (e: any) {
      toast("error", e.message);
    } finally {
      setSeeding(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/subcategories/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      toast("success", "Room deleted.");
      await load();
    } catch (e: any) {
      toast("error", e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <PageHeader title="Rooms" subtitle="Room filters on the app — renames cascade to all designs automatically.">
        <button className="btn-ghost !py-2" disabled={seeding} onClick={seedDefaults}>{seeding ? "Seeding…" : "Seed default rooms"}</button>
        <button className="btn-gold !py-2" onClick={() => setModal({ mode: "create" })}>＋ New room</button>
      </PageHeader>

      {loading && <SkeletonTable rows={6} cols={4} />}
      {!loading && error && (
        <StateView icon="🔌" tone="red" title="Couldn't load rooms" hint={`${error} — please check your connection and try again.`}
          action={<button className="btn-gold" onClick={load}>↻ Try again</button>} />
      )}

      {!loading && !error && (
        <div className="card overflow-x-auto">
          <table className="table w-full min-w-[640px]">
            <thead><tr><th>Order</th><th>Bangla</th><th>English</th><th>Slug</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono">{s.order ?? "—"}</td>
                  <td className="font-bold">{s.name}</td>
                  <td className="text-slate-500">{s.nameEn}</td>
                  <td><code className="text-xs bg-slate-100 px-2 py-0.5 rounded">{s.slug}</code></td>
                  <td>{s.isActive === false ? <span className="pill bg-red-100 text-red-700">Hidden</span> : <span className="pill bg-emerald-100 text-emerald-700">Live</span>}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn-ghost !py-1 !px-3 !text-xs mr-1.5" onClick={() => setModal({ mode: "edit", item: s })}>Edit</button>
                    <button className="btn-ghost !py-1 !px-3 !text-xs hover:!border-red-400 hover:text-red-600" onClick={() => setDeleting(s)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No rooms yet — click “Seed default rooms”.</div>}
        </div>
      )}

      {modal && <RoomForm key={modal.mode === "edit" ? (modal as any).item.id : "new"} initial={modal.mode === "edit" ? (modal as any).item : null}
        onClose={() => setModal(null)} onSaved={async () => { setModal(null); await load(); }} />}

      {deleting && (
        <Modal title="Delete room?" onClose={() => setDeleting(null)}>
          <p className="text-sm text-slate-600">Delete <b>{deleting.name}</b>? Blocked if any design still uses it — reassign those designs first.</p>
          <div className="flex justify-end gap-2 mt-5">
            <button className="btn-ghost" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn-danger" disabled={busy} onClick={confirmDelete}>{busy ? "Deleting…" : "Delete"}</button>
          </div>
        </Modal>
      )}
    </Shell>
  );
}

function RoomForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: initial?.name || "",
    nameEn: initial?.nameEn || "",
    slug: initial?.slug || "",
    order: initial?.order ?? 99,
    isActive: initial?.isActive !== false
  });
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  async function save() {
    if (form.name.trim().length < 2 || !form.slug.trim()) { toast("error", "Please add a Bangla name and a slug."); return; }
    setSaving(true);
    setNote("");
    try {
      const res = initial
        ? await api(`/api/subcategories/${initial.id}`, { method: "PUT", body: JSON.stringify(form) })
        : await api("/api/subcategories", { method: "POST", body: JSON.stringify(form) });
      if ((res as any).cascaded) setNote(`Updated ${(res as any).cascaded} design(s) to the new name/slug.`);
      else toast("success", initial ? "Room updated." : "Room created.");
      setTimeout(onSaved, res.cascaded ? 1200 : 0);
      if (!res.cascaded) onSaved();
    } catch (e: any) {
      toast("error", e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? "Edit room" : "New room"} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Name (Bangla)</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="বেডরুম" /></div>
          <div><label className="label">Name (English)</label><input className="input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} placeholder="Bedroom" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Slug (app filter key)</label><input className="input font-mono" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="bedroom" /></div>
          <div><label className="label">Order</label><input type="number" className="input" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Visible on the app</label>
        {initial && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5">Renaming updates every design with this room automatically (cascade).</p>}
        {note && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">{note}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-gold" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save room"}</button>
        </div>
      </div>
    </Modal>
  );
}
