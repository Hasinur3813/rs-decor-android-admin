import { NextResponse } from "next/server";
import { adminDb, serverTimestamp, toErrorStatus } from "@/lib/firebaseAdmin";
import { requireSession } from "@/lib/requireSession";
import { invalidateDesignsCache } from "@/lib/designsCache";
import { newId } from "@/lib/helpers";
import { buildDesignSearchTokens } from "@/lib/designSearch";

type Incoming = {
  name?: unknown; category?: unknown; categorySlug?: unknown;
  subcategory?: unknown; subcategorySlug?: unknown;
  imageUrl?: unknown; imagePublicId?: unknown; isActive?: unknown;
};

/**
 * POST /api/designs/bulk-create — { items: Incoming[] } (max 100 per call)
 * Creates many designs with batched Firestore writes (500/chunk) instead of
 * N round-trips. Returns per-row errors without aborting the valid rows.
 */
export async function POST(req: Request) {
  try {
    await requireSession();
    const body = await req.json();
    const incoming: Incoming[] = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
    if (incoming.length === 0) {
      return NextResponse.json({ error: "No designs provided (max 100 per call)." }, { status: 400 });
    }

    const valid: Record<string, unknown>[] = [];
    const errors: { index: number; error: string }[] = [];
    incoming.forEach((b, index) => {
      const fail = (error: string) => errors.push({ index, error });
      const name = String(b.name || "").trim();
      if (name.length < 2) return fail("Name required (min 2).");
      if (!b.category || !b.categorySlug) return fail("Category + categorySlug required.");
      if (!b.subcategory || !b.subcategorySlug) return fail("Subcategory + subcategorySlug required.");
      if (!b.imageUrl) return fail("imageUrl required — upload the image first.");
      valid.push({
        id: newId("des").slice(0, 64),
        name,
        category: String(b.category),
        categorySlug: String(b.categorySlug),
        subcategory: String(b.subcategory),
        subcategorySlug: String(b.subcategorySlug),
        imageUrl: String(b.imageUrl),
        searchTokens: buildDesignSearchTokens(
          name,
          b.category,
          b.categorySlug,
          b.subcategory,
          b.subcategorySlug
        ),
        ...(b.imagePublicId ? { imagePublicId: String(b.imagePublicId) } : {}),
        isActive: b.isActive !== false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });

    const db = adminDb();
    for (let i = 0; i < valid.length; i += 450) {
      const batch = db.batch();
      for (const doc of valid.slice(i, i + 450)) {
        batch.set(db.collection("designs").doc(doc.id as string), doc);
      }
      await batch.commit();
    }
    if (valid.length > 0) invalidateDesignsCache();

    return NextResponse.json({ created: valid.length, failed: errors.length, errors }, { status: 201 });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}
