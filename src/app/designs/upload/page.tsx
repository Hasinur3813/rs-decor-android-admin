"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { PageHeader, StateView } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api, uploadImage } from "@/lib/client";
import { IMAGE_ACCEPT, isImageFile } from "@/lib/helpers";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Category = { id: string; slug: string; name: string; nameEn?: string };
type Subcategory = { id: string; slug: string; name: string; nameEn?: string };

type ItemStatus = "ready" | "queued" | "uploading" | "saving" | "done" | "error";

type QueueItem = {
  key: string;
  file: File;
  preview: string;
  name: string;
  categorySlug: string;
  subcategorySlug: string;
  pct: number;
  status: ItemStatus;
  message?: string;
  /** Kept after a successful upload so retries never re-upload the photo. */
  imageUrl?: string;
  imagePublicId?: string;
};

type BulkCreateResponse = {
  created?: number;
  failed?: number;
  errors?: { index: number; error: string }[];
};

type UploadedEntry = { key: string; payload: Record<string, unknown> };

/* ------------------------------------------------------------------ */
/* Constants & helpers                                                 */
/* ------------------------------------------------------------------ */

const MAX_QUEUE = 100;
const MAX_FILE_MB = 12;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const MAX_NAME_LENGTH = 120;
const PARALLEL_UPLOADS = 4;

function getErrorMessage(e: unknown, fallback = "Something went wrong"): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return fallback;
}

function makeKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function fingerprint(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function cleanName(fileName: string): string {
  return fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

function listNames(files: File[], max = 3): string {
  const shown = files.slice(0, max).map((f) => f.name || "unnamed file").join(", ");
  return files.length > max ? `${shown}…` : shown;
}

function revoke(url: string) {
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* noop */
  }
}

/** Limited-parallelism pool: fast bulk uploads without hammering the server. */
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch {
        /* fn is responsible for its own error state; never break the pool */
      }
    }
  });
  await Promise.all(workers);
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function UploadDesignsPage() {
  const { toast } = useToast();

  const [cats, setCats] = useState<Category[]>([]);
  const [subs, setSubs] = useState<Subcategory[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState("");
  const [metaReloadKey, setMetaReloadKey] = useState(0);

  const [items, setItems] = useState<QueueItem[]>([]);
  const [defCat, setDefCat] = useState("");
  const [defSub, setDefSub] = useState("");
  const [drag, setDrag] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<QueueItem[]>([]);
  const mountedRef = useRef(true);
  const publishingRef = useRef(false);

  itemsRef.current = items;

  /** Rooms users can actually assign to ("all" is a filter, not a room). */
  const rooms = useMemo(() => {
    const real = subs.filter((s) => s.slug !== "all");
    return real.length > 0 ? real : subs;
  }, [subs]);

  /* ---------------------------- lifecycle ---------------------------- */

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      itemsRef.current.forEach((it) => revoke(it.preview));
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingMeta(true);
    setMetaError("");

    Promise.all([api("/api/categories"), api("/api/subcategories")])
      .then(([c, s]) => {
        if (cancelled) return;
        const catList: Category[] = Array.isArray(c?.items) ? c.items : [];
        const subList: Subcategory[] = Array.isArray(s?.items) ? s.items : [];
        setCats(catList);
        setSubs(subList);
        setDefCat((cur) => cur || catList[0]?.slug || "");
        setDefSub((cur) => cur || subList.find((r) => r.slug !== "all")?.slug || subList[0]?.slug || "");
      })
      .catch((e: unknown) => {
        if (!cancelled) setMetaError(getErrorMessage(e, "Network error"));
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });

    return () => {
      cancelled = true;
    };
  }, [metaReloadKey]);

  // Warn before leaving while uploads are in flight.
  useEffect(() => {
    if (!publishing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [publishing]);

  /* ----------------------------- helpers ----------------------------- */

  const patch = useCallback((key: string, p: Partial<QueueItem>) => {
    if (!mountedRef.current) return;
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...p } : it)));
  }, []);

  const catName = useCallback((slug: string) => cats.find((c) => c.slug === slug)?.name || "", [cats]);
  const subName = useCallback((slug: string) => subs.find((s) => s.slug === slug)?.name || "", [subs]);

  const addFiles = useCallback(
    (incoming: FileList | File[] | null) => {
      const picked = incoming ? Array.from(incoming) : [];
      if (picked.length === 0) return; // dialog cancelled — stay silent

      const current = itemsRef.current;
      const room = MAX_QUEUE - current.length;
      if (room <= 0) {
        toast("info", `Queue is full (${MAX_QUEUE}). Publish or remove some first.`);
        return;
      }

      const seen = new Set(current.map((it) => fingerprint(it.file)));
      const notImages: File[] = [];
      const tooBig: File[] = [];
      const dupes: File[] = [];
      const accepted: File[] = [];

      for (const f of picked) {
        if (!isImageFile(f)) notImages.push(f);
        else if (f.size > MAX_FILE_BYTES) tooBig.push(f);
        else if (seen.has(fingerprint(f))) dupes.push(f);
        else {
          seen.add(fingerprint(f));
          accepted.push(f);
        }
      }

      const batch = accepted.slice(0, room);
      const overflow = accepted.length - batch.length;

      if (notImages.length > 0) {
        toast(
          "error",
          `Skipped ${notImages.length} file(s) that aren't photos (${listNames(notImages)}). JPG, PNG, WEBP, AVIF or HEIC expected.`
        );
      }
      if (tooBig.length > 0) {
        toast("error", `Skipped ${tooBig.length} file(s) over ${MAX_FILE_MB} MB (${listNames(tooBig)}).`);
      }
      if (dupes.length > 0) {
        toast("info", `Skipped ${dupes.length} duplicate file(s) already in the queue.`);
      }
      if (overflow > 0) {
        toast("info", `Queue limit is ${MAX_QUEUE} — ${overflow} file(s) were not added.`);
      }
      if (batch.length === 0) return;

      const mapped: QueueItem[] = batch.map((file) => ({
        key: makeKey(),
        file,
        preview: URL.createObjectURL(file),
        name: cleanName(file.name),
        categorySlug: defCat,
        subcategorySlug: defSub,
        pct: 0,
        status: "ready"
      }));

      itemsRef.current = [...current, ...mapped];
      setItems((prev) => [...prev, ...mapped]);
    },
    [defCat, defSub, toast]
  );

  const removeItem = useCallback((key: string) => {
    setItems((prev) => {
      const target = prev.find((x) => x.key === key);
      if (target) revoke(target.preview);
      return prev.filter((x) => x.key !== key);
    });
  }, []);

  const clearFinished = useCallback(() => {
    setItems((prev) => {
      prev.filter((it) => it.status === "done").forEach((it) => revoke(it.preview));
      return prev.filter((it) => it.status !== "done");
    });
  }, []);

  /* ----------------------------- derived ----------------------------- */

  const { ready, done, busy, overall } = useMemo(() => {
    const readyItems = items.filter((it) => it.status === "ready" || it.status === "error");
    const doneCount = items.filter((it) => it.status === "done").length;
    const busyCount = items.filter(
      (it) => it.status === "queued" || it.status === "uploading" || it.status === "saving"
    ).length;
    const total = items.reduce((sum, it) => {
      if (it.status === "done") return sum + 100;
      if (it.status === "uploading") return sum + it.pct;
      if (it.status === "saving") return sum + 90;
      return sum;
    }, 0);
    return {
      ready: readyItems,
      done: doneCount,
      busy: busyCount,
      overall: items.length === 0 ? 0 : Math.round(total / items.length)
    };
  }, [items]);

  /* ----------------------------- publish ----------------------------- */

  async function publishAll() {
    if (publishingRef.current || ready.length === 0) return;

    if (cats.length === 0) {
      toast("error", "Please create a category first, then set it for these files.");
      return;
    }

    // Validate locally so one bad row can't waste uploads.
    const queue: QueueItem[] = [];
    for (const it of ready) {
      if (!it.categorySlug || !it.subcategorySlug) {
        patch(it.key, { status: "error", message: "Pick category + room." });
      } else if (!it.name.trim()) {
        patch(it.key, { status: "error", message: "Name required." });
      } else {
        queue.push(it);
      }
    }
    if (queue.length === 0) {
      toast("error", "Nothing valid to publish — please fix the highlighted rows.");
      return;
    }

    publishingRef.current = true;
    setPublishing(true);

    try {
      queue.forEach((it) => patch(it.key, { status: "queued", message: undefined }));

      const buildPayload = (it: QueueItem, imageUrl: string, imagePublicId: string) => ({
        name: it.name.trim().slice(0, MAX_NAME_LENGTH),
        category: catName(it.categorySlug),
        categorySlug: it.categorySlug,
        subcategory: subName(it.subcategorySlug),
        subcategorySlug: it.subcategorySlug,
        imageUrl,
        imagePublicId
      });

      // Phase 1 — upload with bounded parallelism. Results collect in a LOCAL
      // array (race-free); rendered state is never trusted for what uploaded.
      const uploaded: UploadedEntry[] = [];

      await pool(queue, PARALLEL_UPLOADS, async (it) => {
        try {
          // Already uploaded in an earlier attempt → reuse, zero re-upload.
          if (it.imageUrl && it.imagePublicId) {
            patch(it.key, { status: "saving", pct: 100 });
            uploaded.push({ key: it.key, payload: buildPayload(it, it.imageUrl, it.imagePublicId) });
            return;
          }

          patch(it.key, { status: "uploading", pct: 0, message: "Uploading…" });
          const up = await uploadImage(it.file, "designs", (pct: number) => patch(it.key, { pct }));
          if (!up?.secure_url || !up?.public_id) {
            throw new Error("Upload finished but no image URL was returned.");
          }

          uploaded.push({ key: it.key, payload: buildPayload(it, up.secure_url, up.public_id) });
          patch(it.key, {
            status: "saving",
            pct: 100,
            message: undefined,
            imageUrl: up.secure_url,
            imagePublicId: up.public_id
          });
        } catch (e: unknown) {
          patch(it.key, { status: "error", pct: 0, message: getErrorMessage(e, "Upload failed") });
        }
      });

      if (uploaded.length === 0) {
        toast("error", "All uploads failed — nothing was saved. Check your connection and retry.");
        return;
      }

      // Phase 2 — ONE batched save for everything that uploaded.
      try {
        const res: BulkCreateResponse = (await api("/api/designs/bulk-create", {
          method: "POST",
          body: JSON.stringify({ items: uploaded.map((u) => u.payload) })
        })) || {};

        const errors = Array.isArray(res.errors) ? res.errors : [];
        const failedByIndex = new Map<number, string>(errors.map((e) => [e.index, e.error]));
        const indexByKey = new Map<string, number>(uploaded.map((u, i) => [u.key, i]));

        if (mountedRef.current) {
          setItems((prev) =>
            prev.map((it) => {
              const idx = indexByKey.get(it.key);
              if (idx === undefined || it.status !== "saving") return it;
              const err = failedByIndex.get(idx);
              if (err) return { ...it, status: "error" as const, message: `Rejected: ${err}` };
              return { ...it, status: "done" as const, message: "Live ✓", pct: 100 };
            })
          );
        }

        const failed = res.failed ?? errors.length;
        const created = res.created ?? Math.max(0, uploaded.length - failed);

        if (failed > 0) {
          toast("error", `${created} published, ${failed} rejected — see details in the queue.`);
        } else {
          toast("success", `${created} design(s) published — live on the app.`);
        }
      } catch (e: unknown) {
        // Images are uploaded but rows weren't saved: keep them retryable
        // with their URLs so a retry costs zero re-uploads.
        const msg = getErrorMessage(e);
        if (mountedRef.current) {
          setItems((prev) =>
            prev.map((it) =>
              it.status === "saving"
                ? {
                    ...it,
                    status: "error" as const,
                    pct: 0,
                    message: `Save failed (${msg}) — retry keeps the uploaded photo.`
                  }
                : it
            )
          );
        }
        toast("error", `Saving failed: ${msg}`);
      }
    } catch (e: unknown) {
      // Defensive: never leave rows stuck in a busy state.
      const msg = getErrorMessage(e);
      if (mountedRef.current) {
        setItems((prev) =>
          prev.map((it) =>
            it.status === "queued" || it.status === "uploading" || it.status === "saving"
              ? { ...it, status: "error" as const, pct: 0, message: msg }
              : it
          )
        );
      }
      toast("error", `Publishing stopped: ${msg}`);
    } finally {
      publishingRef.current = false;
      if (mountedRef.current) setPublishing(false);
    }
  }

  /* ------------------------------ events ----------------------------- */

  function onDefCatChange(e: ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    setDefCat(value);
    setItems((prev) => prev.map((it) => (it.status === "ready" ? { ...it, categorySlug: value } : it)));
  }

  function onDefSubChange(e: ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    setDefSub(value);
    setItems((prev) => prev.map((it) => (it.status === "ready" ? { ...it, subcategorySlug: value } : it)));
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!publishing) setDrag(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    // Ignore leave events fired when moving over child elements.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDrag(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    if (publishing) {
      toast("info", "Please wait for the current publish to finish.");
      return;
    }
    addFiles(e.dataTransfer?.files ?? null);
  }

  function openPicker() {
    if (!publishing) inputRef.current?.click();
  }

  function onDropzoneKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  }

  /* ------------------------------ render ----------------------------- */

  const locked = (it: QueueItem) => publishing || it.status === "done" || it.status === "queued" || it.status === "uploading" || it.status === "saving";

  return (
    <Shell>
      <PageHeader
        title="Upload designs"
        subtitle="Drop many photos at once — uploads run 4-in-parallel, then everything saves in one batch."
      >
        <Link href="/designs" className="btn-ghost !py-2">← Back to catalog</Link>
      </PageHeader>

      {loadingMeta && (
        <div className="card p-5 space-y-3 mb-4" aria-busy="true">
          <div className="skeleton h-6 w-52" />
          <div className="skeleton h-11 w-full" />
        </div>
      )}

      {!loadingMeta && metaError && (
        <div className="mb-4">
          <StateView
            icon="🔌"
            tone="red"
            title="Couldn't load categories & rooms"
            hint={`${metaError} — uploads need them, so please retry.`}
            action={<button className="btn-gold" onClick={() => setMetaReloadKey((k) => k + 1)}>↻ Retry</button>}
          />
        </div>
      )}

      {!loadingMeta && !metaError && cats.length === 0 && (
        <div className="mb-4">
          <StateView
            icon="❖"
            tone="gold"
            title="Create a category first"
            hint="Designs must attach to a category. It takes 30 seconds."
            action={<Link href="/categories" className="btn-gold">＋ New category</Link>}
          />
        </div>
      )}

      {!loadingMeta && !metaError && cats.length > 0 && (
        <>
          {/* Defaults */}
          <div className="card p-4 mb-4 grid sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="label" htmlFor="def-cat">Default category for new files</label>
              <select id="def-cat" className="input" value={defCat} onChange={onDefCatChange} disabled={publishing}>
                {cats.map((c) => (
                  <option key={c.id} value={c.slug}>{c.name}{c.nameEn ? ` (${c.nameEn})` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="def-sub">Default room for new files</label>
              <select id="def-sub" className="input" value={defSub} onChange={onDefSubChange} disabled={publishing}>
                {rooms.map((s) => (
                  <option key={s.id} value={s.slug}>{s.name}{s.nameEn ? ` (${s.nameEn})` : ""}</option>
                ))}
              </select>
            </div>
            <div className="text-xs text-slate-500 pb-1" aria-live="polite">
              <b>{items.length}</b> in queue · <b className="text-emerald-600">{done} live</b>
              {items.length > 0 && (
                <div
                  className="h-2 rounded-full bg-slate-100 overflow-hidden mt-1.5"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={overall}
                  aria-label="Overall progress"
                >
                  <div className="h-full bg-gradient-to-r from-goldbright to-gold transition-all" style={{ width: `${overall}%` }} />
                </div>
              )}
            </div>
          </div>

          {/* Dropzone */}
          <div
            role="button"
            tabIndex={publishing ? -1 : 0}
            aria-disabled={publishing}
            aria-label="Add photos: drop files here or press Enter to browse"
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={openPicker}
            onKeyDown={onDropzoneKey}
            className={`rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center transition mb-4 outline-none focus-visible:ring-2 focus-visible:ring-gold ${
              publishing
                ? "cursor-not-allowed border-slate-200 bg-white opacity-60"
                : drag
                  ? "cursor-pointer border-gold bg-gold/10 scale-[1.005]"
                  : "cursor-pointer border-slate-200 bg-white hover:border-gold hover:shadow-soft"
            }`}
          >
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-gold/20 to-goldbright/10 border border-gold/30 grid place-items-center text-2xl" aria-hidden="true">☁️</div>
            <div className="font-bold text-[16px] mt-2">Drop photos here, or click to browse</div>
            <div className="text-xs text-slate-500 mt-1">
              JPG / PNG / WEBP / AVIF / HEIC · {MAX_FILE_MB} MB max each · up to {MAX_QUEUE} per batch · {PARALLEL_UPLOADS} uploads at a time
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = ""; // allow re-selecting the same files
            }}
          />

          {/* Queue */}
          {items.length > 0 && (
            <div className="card p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-bold text-[15px]">Queue ({items.length})</h3>
                {done > 0 && !publishing && (
                  <button className="text-xs font-bold text-slate-500 hover:text-obsidian" onClick={clearFinished}>
                    Clear finished ✕
                  </button>
                )}
                <span className="ml-auto text-xs text-slate-500" aria-live="polite">
                  {busy > 0 ? `${busy} in progress…` : ready.length > 0 ? `${ready.length} ready` : "all done ✓"}
                </span>
              </div>

              <div className="space-y-2.5 max-h-[52vh] overflow-y-auto scroll-thin pr-1">
                {items.map((it) => {
                  const isLocked = locked(it);
                  const inFlight = it.status === "uploading" || it.status === "saving" || it.status === "queued";
                  return (
                    <div
                      key={it.key}
                      className={`rounded-2xl border p-3 flex gap-3 transition ${
                        it.status === "error"
                          ? "border-red-200 bg-red-50/50"
                          : it.status === "done"
                            ? "border-emerald-200 bg-emerald-50/40"
                            : "border-slate-200 bg-white"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={it.preview}
                        alt={it.name || "Selected photo preview"}
                        className="w-[72px] h-[72px] rounded-xl object-cover shrink-0 border border-slate-200"
                      />
                      <div className="flex-1 min-w-0">
                        <input
                          className="input !py-1.5 !text-[13px] font-semibold"
                          value={it.name}
                          maxLength={MAX_NAME_LENGTH}
                          disabled={isLocked}
                          aria-label="Design name"
                          onChange={(e) => patch(it.key, { name: e.target.value })}
                          placeholder="Design name (Bangla)"
                        />
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <select
                            className="input !py-1.5 !text-xs"
                            value={it.categorySlug}
                            disabled={isLocked}
                            aria-label="Category"
                            onChange={(e) => patch(it.key, { categorySlug: e.target.value })}
                          >
                            {cats.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
                          </select>
                          <select
                            className="input !py-1.5 !text-xs"
                            value={it.subcategorySlug}
                            disabled={isLocked}
                            aria-label="Room"
                            onChange={(e) => patch(it.key, { subcategorySlug: e.target.value })}
                          >
                            {rooms.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
                          </select>
                        </div>

                        {it.status === "queued" && <div className="text-[11px] text-slate-500 mt-2">Waiting for a free upload slot…</div>}

                        {(it.status === "uploading" || it.status === "saving") && (
                          <div className="mt-2">
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-goldbright to-gold transition-all"
                                style={{ width: `${it.status === "saving" ? 100 : it.pct}%` }}
                              />
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {it.status === "saving" ? "Uploaded — waiting to save…" : `Uploading ${it.pct}%`}
                            </div>
                          </div>
                        )}

                        {it.status === "done" && <div className="text-xs font-bold text-emerald-600 mt-1.5">✓ Live on the app</div>}
                        {it.status === "error" && <div className="text-xs font-bold text-red-600 mt-1.5" role="alert">⚠ {it.message}</div>}
                        {it.status === "ready" && it.message && <div className="text-[11px] text-slate-500 mt-1">{it.message}</div>}
                      </div>

                      {!inFlight && !publishing && (
                        <button
                          type="button"
                          className="self-start w-7 h-7 rounded-full grid place-items-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                          onClick={() => removeItem(it.key)}
                          title="Remove"
                          aria-label={`Remove ${it.name || "photo"}`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="card p-4 flex flex-wrap items-center gap-2 sticky bottom-4 shadow-soft">
            <div className="text-sm text-slate-600" aria-live="polite">
              {publishing ? (
                <b>Working… {busy} in progress, saving in one batch at the end.</b>
              ) : ready.length > 0 ? (
                <><b>{ready.length}</b> ready to publish</>
              ) : done > 0 ? (
                <><b className="text-emerald-600">{done} live</b> — add more or head back</>
              ) : (
                "Add photos above to begin"
              )}
            </div>
            <div className="ml-auto flex gap-2">
              <Link href="/designs" className="btn-ghost">View catalog</Link>
              <button
                type="button"
                className="btn-gold min-w-[220px]"
                disabled={publishing || ready.length === 0}
                onClick={publishAll}
              >
                {publishing ? `Publishing… ${overall}%` : `Publish ${ready.length} design(s)`}
              </button>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}