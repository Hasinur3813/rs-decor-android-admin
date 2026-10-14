import { NextResponse } from "next/server";
import { adminDb, serverTimestamp, toErrorStatus } from "@/lib/firebaseAdmin";
import { requireSession } from "@/lib/requireSession";
import { cloudinaryClient } from "@/lib/cloudinary";
import { invalidateDesignsCache } from "@/lib/designsCache";
import { buildDesignSearchTokens } from "@/lib/designSearch";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireSession();
    const body = await req.json();
    const ref = adminDb().collection("designs").doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const prev = snap.data() as any;

    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    for (const k of ["name", "category", "categorySlug", "subcategory", "subcategorySlug", "imageUrl"]) {
      if (body[k] !== undefined) patch[k] = String(body[k]);
    }
    if (body.imagePublicId !== undefined) patch.imagePublicId = body.imagePublicId || null;
    if (body.isActive !== undefined) patch.isActive = body.isActive !== false;
    if (patch.name && String(patch.name).trim().length < 2) {
      return NextResponse.json({ error: "Name min 2 chars." }, { status: 400 });
    }
    patch.searchTokens = buildDesignSearchTokens(
      patch.name ?? prev.name,
      patch.category ?? prev.category,
      patch.categorySlug ?? prev.categorySlug,
      patch.subcategory ?? prev.subcategory,
      patch.subcategorySlug ?? prev.subcategorySlug
    );
    if (body.imagePublicId && prev.imagePublicId && body.imagePublicId !== prev.imagePublicId) {
      try { await (await cloudinaryClient()).uploader.destroy(prev.imagePublicId); } catch { /* ignore */ }
    }
    await ref.set(patch, { merge: true });
    invalidateDesignsCache();
    return NextResponse.json({ item: { id: params.id, ...prev, ...patch } });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireSession();
    const ref = adminDb().collection("designs").doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const prev = snap.data() as any;
    if (prev.imagePublicId) {
      try { await (await cloudinaryClient()).uploader.destroy(prev.imagePublicId); } catch { /* ignore */ }
    }
    await ref.delete();
    invalidateDesignsCache();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}
