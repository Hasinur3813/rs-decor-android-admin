"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Modal, PageHeader, StateView } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { api, generateDesignMetadata, uploadImage } from "@/lib/client";
import { IMAGE_ACCEPT, isImageFile } from "@/lib/helpers";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Category = { id: string; slug: string; name: string; nameEn?: string };
type Subcategory = { id: string; slug: string; name: string; nameEn?: string };

type ItemStatus = "ready" | "queued" | "uploading" | "saving" | "done" | "error";
type AiStatus = "idle" | "queued" | "generating" | "generated" | "error";
type UploadPreferences = {
  language: "bn" | "en";
  titleLength: number;
  aiParallelism: number;
  previewWorkers: number;
};

type QueueItem = {
  key: string;
  file: File;
  preview: string | null;
  name: string;
  categorySlug: string;
  subcategorySlug: string;
  pct: number;
  status: ItemStatus;
  message?: string;
  aiStatus: AiStatus;
  aiMessage?: string;
  /** Kept after a successful upload so retries never re-upload the photo. */
  imageUrl?: string;
  imagePublicId?: string;
};

/* ------------------------------------------------------------------ */
/* Constants & helpers                                                 */
/* ------------------------------------------------------------------ */

const MAX_QUEUE = 100;
const INITIAL_VISIBLE_ITEMS = 100;
const VISIBLE_ITEMS_STEP = 100;
const MAX_FILE_MB = 50;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const MAX_NAME_LENGTH = 120;
const PARALLEL_UPLOADS = 4;
const PREVIEW_MAX_DIMENSION = 240;
const DEFAULT_UPLOAD_PREFERENCES: UploadPreferences = {
  language: "bn",
  titleLength: 80,
  aiParallelism: 2,
  previewWorkers: 2
};
const PREFERENCES_STORAGE_KEY = "rs-decor-upload-preferences";

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

async function createThumbnail(file: File): Promise<string | null> {
  if (typeof createImageBitmap === "undefined") return null;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  try {
    const scale = Math.min(1, PREVIEW_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.78);
    });
    return blob ? URL.createObjectURL(blob) : null;
  } finally {
    bitmap.close();
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
  const [preferences, setPreferences] = useState<UploadPreferences>(DEFAULT_UPLOAD_PREFERENCES);
  const [defCat, setDefCat] = useState("");
  const [defSub, setDefSub] = useState("");
  const [drag, setDrag] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [aiBatchRunning, setAiBatchRunning] = useState(false);
  const [activeAiCount, setActiveAiCount] = useState(0);
  const [visibleItems, setVisibleItems] = useState(INITIAL_VISIBLE_ITEMS);
  const [confirmClear, setConfirmClear] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<QueueItem[]>([]);
  const mountedRef = useRef(true);
  const publishingRef = useRef(false);
  const aiBatchRef = useRef(false);
  const activeAiItemsRef = useRef(new Set<string>());

  itemsRef.current = items;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PREFERENCES_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<UploadPreferences>;
      setPreferences({
        language: parsed.language === "en" ? "en" : "bn",
        titleLength: Number.isInteger(parsed.titleLength) ? Math.min(120, Math.max(10, parsed.titleLength!)) : DEFAULT_UPLOAD_PREFERENCES.titleLength,
        aiParallelism: Number.isInteger(parsed.aiParallelism) ? Math.min(8, Math.max(1, parsed.aiParallelism!)) : DEFAULT_UPLOAD_PREFERENCES.aiParallelism,
        previewWorkers: Number.isInteger(parsed.previewWorkers) ? Math.min(8, Math.max(1, parsed.previewWorkers!)) : DEFAULT_UPLOAD_PREFERENCES.previewWorkers
      });
    } catch {
      toast("error", "Could not read saved upload preferences. Default settings are active.");
    }
  }, [toast]);

  function updatePreference<K extends keyof UploadPreferences>(key: K, value: UploadPreferences[K]) {
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    try {
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      toast("error", "Preference changed for this session but could not be saved in this browser.");
    }
  }

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
      itemsRef.current.forEach((it) => {
        if (it.preview) revoke(it.preview);
      });
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
        preview: null,
        name: cleanName(file.name),
        categorySlug: defCat,
        subcategorySlug: defSub,
        pct: 0,
        status: "ready",
        aiStatus: "idle"
      }));

      itemsRef.current = [...current, ...mapped];
      setItems((prev) => [...prev, ...mapped]);
      void pool(mapped, preferences.previewWorkers, async (item) => {
        const preview = await createThumbnail(item.file);
        if (!preview) return;
        const currentItem = itemsRef.current.find((queued) => queued.key === item.key);
        if (!mountedRef.current || !currentItem) {
          revoke(preview);
          return;
        }
        if (currentItem.preview) revoke(currentItem.preview);
        patch(item.key, { preview });
      });
    },
    [defCat, defSub, patch, preferences.previewWorkers, toast]
  );

  const removeItem = useCallback((key: string) => {
    const next = itemsRef.current.filter((x) => x.key !== key);
    const target = itemsRef.current.find((x) => x.key === key);
    if (target?.preview) revoke(target.preview);
    itemsRef.current = next;
    setItems(next);
  }, []);

  const clearFinished = useCallback(() => {
    const next = itemsRef.current.filter((it) => it.status !== "done");
    itemsRef.current.filter((it) => it.status === "done").forEach((it) => {
      if (it.preview) revoke(it.preview);
    });
    itemsRef.current = next;
    setItems(next);
  }, []);

  const clearQueue = useCallback(() => {
    if (publishingRef.current) return;
    itemsRef.current.forEach((it) => {
      if (it.preview) revoke(it.preview);
    });
    itemsRef.current = [];
    setItems([]);
    setVisibleItems(INITIAL_VISIBLE_ITEMS);
    setConfirmClear(false);
    toast("success", "Upload queue cleared.");
  }, [toast]);

  /* ----------------------------- derived ----------------------------- */

  const { ready, done, failed, aiFailed, busy, overall } = useMemo(() => {
    const readyItems = items.filter(
      (it) => (it.status === "ready" || it.status === "error") &&
        it.aiStatus !== "generating" && it.aiStatus !== "queued"
    );
    const doneCount = items.filter((it) => it.status === "done").length;
    const failedCount = items.filter((it) => it.status === "error").length;
    const aiFailedCount = items.filter((it) => it.aiStatus === "error").length;
    const busyCount = items.filter(
      (it) => it.status === "queued" || it.status === "uploading" || it.status === "saving" ||
        it.aiStatus === "generating" || it.aiStatus === "queued"
    ).length;
    const total = items.reduce((sum, it) => {
      if (it.status === "done" || it.status === "error") return sum + 100;
      if (it.status === "uploading") return sum + it.pct;
      if (it.status === "saving") return sum + 95;
      return sum;
    }, 0);
    return {
      ready: readyItems,
      done: doneCount,
      failed: failedCount,
      aiFailed: aiFailedCount,
      busy: busyCount,
      overall: items.length === 0 ? 0 : Math.round(total / items.length)
    };
  }, [items]);

  const aiEligible = useMemo(
    () => items.filter(
      (it) =>
        (it.status === "ready" || it.status === "error") &&
        it.aiStatus !== "generated" &&
        it.aiStatus !== "generating" &&
        it.aiStatus !== "queued"
    ),
    [items]
  );

  /* ----------------------------- publish ----------------------------- */

  async function generateMetadataForItem(key: string, quiet = false): Promise<boolean> {
    if (activeAiItemsRef.current.has(key) || activeAiItemsRef.current.size >= preferences.aiParallelism) return false;
    const item = itemsRef.current.find((queued) => queued.key === key);
    if (!item || (item.status !== "ready" && item.status !== "error")) return false;
    if (item.aiStatus !== "queued" && item.aiStatus !== "error" && item.aiStatus !== "idle" && item.aiStatus !== "generated") return false;

    activeAiItemsRef.current.add(key);
    setActiveAiCount(activeAiItemsRef.current.size);
    patch(key, { aiStatus: "generating", aiMessage: undefined });

    try {
      const suggestion = await generateDesignMetadata(item.file, {
        language: preferences.language,
        titleLength: preferences.titleLength
      });
      if (!itemsRef.current.some((queued) => queued.key === key)) return false;
      patch(key, {
        name: suggestion.name,
        categorySlug: suggestion.categorySlug,
        subcategorySlug: suggestion.subcategorySlug,
        aiStatus: "generated",
        aiMessage: undefined
      });
      if (!quiet) toast("success", `AI suggestions added for "${suggestion.name}". Review them before publishing.`);
      return true;
    } catch (error: unknown) {
      const message = getErrorMessage(error, "AI could not analyze this design.");
      patch(key, { aiStatus: "error", aiMessage: message });
      if (!quiet) toast("error", `AI suggestions failed: ${message}`);
      return false;
    } finally {
      activeAiItemsRef.current.delete(key);
      setActiveAiCount(activeAiItemsRef.current.size);
    }
  }

  async function generateAllMetadata() {
    if (aiBatchRef.current || aiEligible.length === 0) return;
    const queue = aiEligible.slice();
    aiBatchRef.current = true;
    setAiBatchRunning(true);
    queue.forEach((item) => patch(item.key, { aiStatus: "queued", aiMessage: undefined }));
    toast("info", `Generating suggestions for ${queue.length} design(s).`);

    let generated = 0;
    let failedCount = 0;
    await pool(queue, preferences.aiParallelism, async (item) => {
      const succeeded = await generateMetadataForItem(item.key, true);
      if (succeeded) generated++;
      else failedCount++;
    });

    aiBatchRef.current = false;
    setAiBatchRunning(false);
    if (failedCount > 0) {
      toast("error", `${generated} design(s) updated; ${failedCount} failed. Review failed rows and retry them individually.`);
    } else {
      toast("success", `AI suggestions added to ${generated} design(s). Review them before publishing.`);
    }
  }

  async function publishAll() {
    if (publishingRef.current || ready.length === 0) return;

    if (cats.length === 0) {
      toast("error", "Please create a category first, then set it for these files.");
      return;
    }

    // Validate locally so one bad row can't waste uploads.
    const queue: QueueItem[] = [];
    let validationFailures = 0;
    for (const it of ready) {
      if (!it.categorySlug || !it.subcategorySlug) {
        validationFailures++;
        patch(it.key, { status: "error", message: "Pick category + room." });
      } else if (!it.name.trim()) {
        validationFailures++;
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
    toast("info", `Publishing ${queue.length} design(s). Each one will save as soon as its image finishes uploading.`);

    try {
      queue.forEach((it) => patch(it.key, { status: "queued", message: undefined }));

      const buildPayload = (it: QueueItem, imageUrl: string, imagePublicId: string) => ({
        id: it.key,
        name: it.name.trim().slice(0, MAX_NAME_LENGTH),
        category: catName(it.categorySlug),
        categorySlug: it.categorySlug,
        subcategory: subName(it.subcategorySlug),
        subcategorySlug: it.subcategorySlug,
        imageUrl,
        imagePublicId
      });

      let created = 0;
      let failedCount = validationFailures;
      await pool(queue, PARALLEL_UPLOADS, async (it) => {
        let imageUrl = it.imageUrl;
        let imagePublicId = it.imagePublicId;
        try {
          if (!imageUrl || !imagePublicId) {
            patch(it.key, { status: "uploading", pct: 0, message: "Uploading image…" });
            let lastProgressUpdate = 0;
            const up = await uploadImage(it.file, "designs", (pct: number) => {
              const now = Date.now();
              if (pct === 100 || now - lastProgressUpdate >= 100) {
                lastProgressUpdate = now;
                patch(it.key, { pct });
              }
            });
            if (!up?.secure_url || !up?.public_id) {
              throw new Error("Upload finished but no image URL was returned.");
            }
            imageUrl = up.secure_url;
            imagePublicId = up.public_id;
            patch(it.key, { imageUrl, imagePublicId, pct: 100 });
          }

          patch(it.key, { status: "saving", pct: 100, message: "Saving design…" });
          await api("/api/designs", {
            method: "POST",
            body: JSON.stringify(buildPayload(it, imageUrl, imagePublicId))
          });
          created++;
          patch(it.key, { status: "done", message: "Saved to the app", pct: 100 });
        } catch (e: unknown) {
          failedCount++;
          patch(it.key, {
            status: "error",
            pct: imageUrl && imagePublicId ? 100 : 0,
            imageUrl,
            imagePublicId,
            message: getErrorMessage(e, "Upload or save failed")
          });
        }
      });

      if (failedCount > 0) {
        toast("error", `${created} saved, ${failedCount} failed. Review the failed items and retry.`);
      } else {
        toast("success", `${created} design(s) saved and published.`);
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
    setDrag(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    // Ignore leave events fired when moving over child elements.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDrag(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    addFiles(e.dataTransfer?.files ?? null);
  }

  function openPicker() {
    inputRef.current?.click();
  }

  function onDropzoneKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  }

  /* ------------------------------ render ----------------------------- */

  const locked = (it: QueueItem) => it.status === "done" || it.status === "queued" || it.status === "uploading" || it.status === "saving";

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
          <div className="card p-4 mb-4">
            <div className="mb-3">
              <h3 className="text-sm font-extrabold">AI & preview controls</h3>
              <p className="mt-1 text-xs text-slate-500">These preferences are saved in this browser. Category and room matching always uses catalog meaning, even when the catalog labels are in Bangla.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="label" htmlFor="ai-language">Generated title language</label>
                <select id="ai-language" className="input" value={preferences.language} onChange={(event) => updatePreference("language", event.target.value === "en" ? "en" : "bn")} disabled={publishing || aiBatchRunning || activeAiCount > 0}>
                  <option value="bn">Bangla</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="ai-title-length">Maximum title length: {preferences.titleLength}</label>
                <input id="ai-title-length" className="w-full accent-violet-600" type="range" min={10} max={120} step={1} value={preferences.titleLength} onChange={(event) => updatePreference("titleLength", Number(event.target.value))} disabled={publishing || aiBatchRunning || activeAiCount > 0} />
                <div className="flex justify-between text-[10px] text-slate-400"><span>10 chars</span><span>120 chars</span></div>
              </div>
              <div>
                <label className="label" htmlFor="ai-parallelism">AI parallelism</label>
                <select id="ai-parallelism" className="input" value={preferences.aiParallelism} onChange={(event) => updatePreference("aiParallelism", Number(event.target.value))} disabled={publishing || aiBatchRunning || activeAiCount > 0}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count} concurrent request{count === 1 ? "" : "s"}</option>)}
                </select>
                <p className="mt-1 text-[10px] text-slate-400">Higher values may hit provider rate limits sooner.</p>
              </div>
              <div>
                <label className="label" htmlFor="preview-workers">Thumbnail preview workers</label>
                <select id="preview-workers" className="input" value={preferences.previewWorkers} onChange={(event) => updatePreference("previewWorkers", Number(event.target.value))}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count} worker{count === 1 ? "" : "s"}</option>)}
                </select>
                <p className="mt-1 text-[10px] text-slate-400">Lower values reduce CPU and memory pressure for large batches.</p>
              </div>
            </div>
          </div>

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
            <div className="pb-1 text-xs text-slate-500" aria-live="polite">
              <b>{items.length}</b> in queue · <b className="text-emerald-600">{done} saved</b>
              {failed > 0 && <> · <b className="text-red-600">{failed} failed</b></>}
              {aiFailed > 0 && <> · <b className="text-amber-700">{aiFailed} AI errors</b></>}
              {items.length > 0 && (
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={overall}
                  aria-label={`Queue progress: ${overall}%`}
                >
                  <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${overall}%` }} />
                </div>
              )}
            </div>
          </div>

          {/* Dropzone */}
          <div
            role="button"
            tabIndex={0}
            aria-label={publishing ? "Add more photos to the queue" : "Add photos: drop files here or press Enter to browse"}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={openPicker}
            onKeyDown={onDropzoneKey}
            className={`mb-4 rounded-2xl border-2 border-dashed p-8 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-gold sm:p-10 ${
              drag
                ? "scale-[1.005] cursor-pointer border-gold bg-gold/10"
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
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-bold">Upload queue <span className="font-medium text-slate-400">({items.length})</span></h3>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={generateAllMetadata}
                  disabled={publishing || aiBatchRunning || activeAiCount > 0 || aiEligible.length === 0}
                  aria-busy={aiBatchRunning}
                >
                  {aiBatchRunning ? (
                    <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700" /> Generating {activeAiCount ? `(${activeAiCount} active)` : "…"}</>
                  ) : <>✦ Generate missing with AI ({aiEligible.length})</>}
                </button>
                {done > 0 && (
                  <button type="button" className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50" onClick={clearFinished} disabled={publishing}>
                    Clear completed
                  </button>
                )}
                <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 shadow-sm transition hover:border-red-300 hover:bg-red-100 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setConfirmClear(true)} disabled={publishing || busy > 0}>
                  <span aria-hidden="true">×</span> Clear queue
                </button>
                <span className="ml-auto text-right text-xs text-slate-500" aria-live="polite">
                  {busy > 0 ? `${busy} in progress · ${ready.length} waiting` : ready.length > 0 ? `${ready.length} ready` : items.length > 0 ? "All items processed" : "Queue is empty"}
                </span>
              </div>
              {publishing && <p className="mb-3 rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-2.5 text-xs leading-relaxed text-blue-800" role="status">Each photo is saved to the catalog as soon as its upload finishes. You can add more photos above; they will be ready for the next publish.</p>}
              <p className="mb-3 text-[11px] leading-relaxed text-slate-500">The original image uploads directly to Cloudinary. For AI suggestions, a resized and compressed copy is prepared in your browser and sent to Google Gemini; review suggestions before publishing.</p>

              <div className="space-y-2.5 max-h-[70vh] overflow-y-auto scroll-thin pr-1">
                {items.slice(0, visibleItems).map((it) => {
                  const isLocked = locked(it);
                  const inFlight = it.status === "uploading" || it.status === "saving" || it.status === "queued" ||
                    it.aiStatus === "generating" || it.aiStatus === "queued";
                  const aiEligibleForRow = it.status === "ready" || it.status === "error";
                  const statusLabel: Record<ItemStatus, string> = {
                    ready: "Ready",
                    queued: "Waiting",
                    uploading: `Uploading ${it.pct}%`,
                    saving: "Saving",
                    done: "Saved",
                    error: "Failed"
                  };
                  const statusStyle: Record<ItemStatus, string> = {
                    ready: "bg-slate-100 text-slate-600",
                    queued: "bg-amber-50 text-amber-700",
                    uploading: "bg-blue-50 text-blue-700",
                    saving: "bg-indigo-50 text-indigo-700",
                    done: "bg-emerald-50 text-emerald-700",
                    error: "bg-red-50 text-red-700"
                  };
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
                      {it.preview ? (
                        // This small generated preview is separate from the original File uploaded below.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.preview}
                          alt={it.name || "Selected photo thumbnail"}
                          loading="lazy"
                          decoding="async"
                          width={72}
                          height={72}
                          className="h-[72px] w-[72px] shrink-0 rounded-xl border border-slate-200 object-cover"
                        />
                      ) : (
                        <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-100 text-[10px] font-medium text-slate-400" aria-label="Thumbnail loading">
                          Preview
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            className="input min-w-[160px] flex-1 !py-1.5 !text-[13px] font-semibold"
                            value={it.name}
                            maxLength={MAX_NAME_LENGTH}
                            disabled={isLocked}
                            aria-label="Design name"
                            onChange={(e) => patch(it.key, { name: e.target.value })}
                            placeholder="Design name (Bangla)"
                          />
                          <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyle[it.status]}`} aria-label={`Status: ${statusLabel[it.status]}`}>
                            {statusLabel[it.status]}
                          </span>
                        </div>
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

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => { void generateMetadataForItem(it.key); }}
                            disabled={!aiEligibleForRow || publishing || aiBatchRunning || it.aiStatus === "generating" || it.aiStatus === "queued" || activeAiCount >= preferences.aiParallelism}
                            aria-busy={it.aiStatus === "generating" || it.aiStatus === "queued"}
                          >
                            {it.aiStatus === "generating" ? (
                              <><span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700" /> Preparing image & analyzing…</>
                            ) : it.aiStatus === "queued" ? "Waiting for AI…" : it.aiStatus === "generated" ? "Regenerate with AI" : "✦ Generate title & category"}
                          </button>
                          {it.aiStatus === "generated" && <span className="text-[11px] font-medium text-emerald-700">AI suggestions added · review before publishing</span>}
                          {it.aiStatus === "error" && <span className="text-[11px] font-medium text-red-700" role="alert">AI failed: {it.aiMessage}</span>}
                        </div>

                        {it.status === "queued" && <div className="mt-2 text-[11px] text-slate-500">Waiting for a free upload slot…</div>}

                        {(it.status === "uploading" || it.status === "saving") && (
                          <div className="mt-2">
                            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${it.status === "saving" ? "bg-indigo-500" : "bg-blue-600"}`} style={{ width: `${it.status === "saving" ? 100 : it.pct}%` }} />
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {it.status === "saving" ? "Image uploaded · saving design…" : `Uploading image · ${it.pct}%`}
                            </div>
                          </div>
                        )}

                        {it.status === "done" && <div className="mt-1.5 text-xs font-semibold text-emerald-700">Saved and live on the app</div>}
                        {it.status === "error" && <div className="text-xs font-bold text-red-600 mt-1.5" role="alert">⚠ {it.message}</div>}
                        {it.status === "ready" && it.message && <div className="text-[11px] text-slate-500 mt-1">{it.message}</div>}
                      </div>

                      {!inFlight && (
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
              {items.length > visibleItems && (
                <button type="button" className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-100 hover:shadow focus-visible:outline-blue-600" onClick={() => setVisibleItems((count) => Math.min(items.length, count + VISIBLE_ITEMS_STEP))}>
                  Show {Math.min(VISIBLE_ITEMS_STEP, items.length - visibleItems)} more
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">{items.length - visibleItems} remaining</span>
                </button>
              )}
            </div>
          )}

          {/* Footer actions */}
          <div className="card p-4 flex flex-wrap items-center gap-2 sticky bottom-4 shadow-soft">
            <div className="text-sm text-slate-600" aria-live="polite">
              {publishing ? (
                <b>Publishing… {done} saved, {busy} in progress{failed > 0 ? `, ${failed} failed` : ""}.</b>
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
      {confirmClear && (
        <Modal title="Clear upload queue?" onClose={() => setConfirmClear(false)}>
          <p className="text-sm leading-relaxed text-slate-600">Remove all {items.length} queued items and their local previews? Designs already saved will remain in your catalog. Uploaded images from failed saves may remain in Cloudinary.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setConfirmClear(false)}>Keep queue</button>
            <button type="button" className="btn-danger" disabled={publishing || busy > 0} onClick={clearQueue}>Clear queue</button>
          </div>
        </Modal>
      )}
    </Shell>
  );
}