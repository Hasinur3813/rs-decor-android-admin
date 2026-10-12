import { NextResponse } from "next/server";
import { adminDb, serverTimestamp, toErrorStatus } from "@/lib/firebaseAdmin";
import { requireSession } from "@/lib/requireSession";
import { cloudinaryClient } from "@/lib/cloudinary";
import { invalidateDesignsCache } from "@/lib/designsCache";

/**
 * POST /api/designs/bulk — { action: "publish"|"unpublish"|"delete", ids: string[] }
 * Batch operation for large catalogs (max 200 ids per call).
 */
export async function POST(req: Request) {
  try {
    await requireSession();
    const body = await req.json();
    const action = String(body.action || "");
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 200) : [];
    if (!["publish", "unpublish", "delete"].includes(action)) {
      return NextResponse.json({ error: "action must be publish, unpublish or delete." }, { status: 400 });
    }
    if (ids.length === 0) return NextResponse.json({ error: "No designs selected." }, { status: 400 });

    const db = adminDb();
    const pubIds: string[] = [];
    if (action === "delete") {
      // Collect Cloudinary assets first so images don't orphan.
      for (const id of ids) {
        const snap = await db.collection("designs").doc(id).get();
        const pid = snap.exists ? (snap.data() as any)?.imagePublicId : null;
        if (pid) pubIds.push(String(pid));
      }
    }

    const batch = db.batch();
    for (const id of ids) {
      const ref = db.collection("designs").doc(id);
      if (action === "delete") batch.delete(ref);
      else batch.set(ref, { isActive: action === "publish", updatedAt: serverTimestamp() }, { merge: true });
    }
    await batch.commit();

    if (pubIds.length > 0) {
      try {
        const c = await cloudinaryClient();
        await Promise.all(pubIds.map((p) => c.uploader.destroy(p).catch(() => null)));
      } catch { /* image cleanup is best-effort */ }
    }

    invalidateDesignsCache();
    return NextResponse.json({ ok: true, affected: ids.length });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}
