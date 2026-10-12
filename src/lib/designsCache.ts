import { adminDb } from "./firebaseAdmin";

/**
 * Server-side designs index for scale.
 *
 * Firestore has no full-text search and every where+orderBy combo needs a
 * composite index, so for catalogs up to tens of thousands of rows we keep
 * one lightweight in-memory snapshot (single collection read, no indexes
 * required) and do filter/sort/paginate in Node. The browser only ever
 * receives one page of rows.
 *
 * Freshness: 30s TTL + explicit invalidation on every panel mutation, so
 * the admin always sees their own writes immediately.
 */
type Cache = { at: number; items: Record<string, unknown>[] };

let cache: Cache | null = null;
const TTL_MS = 30_000;

export function invalidateDesignsCache(): void {
  cache = null;
}

export async function allDesigns(): Promise<Record<string, unknown>[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.items;
  const snap = await adminDb().collection("designs").get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  cache = { at: Date.now(), items };
  return items;
}
