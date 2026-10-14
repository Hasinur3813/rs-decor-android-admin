import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb, toErrorStatus } from "@/lib/firebaseAdmin";
import { requireSession } from "@/lib/requireSession";
import { buildDesignSearchTokens } from "@/lib/designSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_BATCH_SIZE = 400;
const MAX_BATCH_SIZE = 400;
const SEARCH_INDEX_VERSION = 2;

function timestampString(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" && value ? value : null;
}

export async function POST(req: Request) {
  try {
    await requireSession();
    const parsedBody = await req.json();
    const body = typeof parsedBody === "object" && parsedBody !== null ? parsedBody : {};
    const rawLimit = Number(body.limit);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(rawLimit)))
      : DEFAULT_BATCH_SIZE;
    const db = adminDb();
    const progressRef = db.collection("systemTasks").doc("androidSearchIndex");
    const progress = await progressRef.get();
    const progressData = progress.data();
    const sameVersion = progressData?.version === SEARCH_INDEX_VERSION;
    const totalProcessed = sameVersion ? Number(progressData?.processed) || 0 : 0;
    const totalSearchable = sameVersion ? Number(progressData?.searchable) || 0 : 0;

    if (sameVersion && progressData?.complete === true) {
      return NextResponse.json({
        processed: 0,
        updated: 0,
        searchable: 0,
        totalProcessed,
        totalSearchable,
        hasMore: false,
        complete: true
      });
    }

    let query = db.collection("designs")
      .orderBy(FieldPath.documentId())
      .limit(limit);
    const cursor = sameVersion && typeof progressData?.cursor === "string" ? progressData.cursor : "";
    if (cursor) query = query.startAfter(cursor);

    const snapshot = await query.get();
    const batch = db.batch();
    let updated = 0;
    let searchable = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const searchTokens = buildDesignSearchTokens(
        data.name,
        data.category,
        data.categorySlug,
        data.subcategory,
        data.subcategorySlug
      );
      if (searchTokens.length > 0) searchable++;
      const patch: Record<string, unknown> = {};
      const existingTokens = Array.isArray(data.searchTokens) ? data.searchTokens : [];
      if (JSON.stringify(existingTokens) !== JSON.stringify(searchTokens)) patch.searchTokens = searchTokens;
      const createdAt = timestampString(data.createdAt)
        ?? timestampString(data.updatedAt)
        ?? "1970-01-01T00:00:00.000Z";
      if (data.createdAt !== createdAt) patch.createdAt = createdAt;
      if (Object.keys(patch).length === 0) continue;
      batch.set(doc.ref, patch, { merge: true });
      updated++;
    }

    if (updated) await batch.commit();
    const lastDocumentId = snapshot.docs.at(-1)?.id ?? null;
    const hasMore = snapshot.size === limit;
    const processedSoFar = totalProcessed + snapshot.size;
    const searchableSoFar = totalSearchable + searchable;
    await progressRef.set({
      version: SEARCH_INDEX_VERSION,
      cursor: hasMore ? lastDocumentId : null,
      complete: !hasMore,
      processed: processedSoFar,
      searchable: searchableSoFar,
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({
      processed: snapshot.size,
      updated,
      searchable,
      totalProcessed: processedSoFar,
      totalSearchable: searchableSoFar,
      hasMore,
      complete: !hasMore
    });
  } catch (error) {
    const { status, message } = toErrorStatus(error);
    return NextResponse.json({ error: message }, { status });
  }
}
