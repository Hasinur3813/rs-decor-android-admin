import { NextResponse } from "next/server";
import { adminDb, serverTimestamp, toErrorStatus } from "@/lib/firebaseAdmin";
import { requireSession } from "@/lib/requireSession";
import { invalidateDesignsCache } from "@/lib/designsCache";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireSession();
    const body = await req.json();
    const ref = adminDb().collection("subcategories").doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const prev = snap.data() as any;
    const oldSlug = prev.slug as string;

    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    for (const k of ["name", "nameEn", "slug"]) if (body[k] !== undefined) patch[k] = String(body[k]);
    if (body.order !== undefined) patch.order = Number(body.order);
    if (body.isActive !== undefined) patch.isActive = body.isActive !== false;
    await ref.set(patch, { merge: true });

    // Cascade rename: keep Android filters working — update designs using the old slug
    const newSlug = (patch.slug as string) ?? oldSlug;
    const newName = (patch.name as string) ?? prev.name;
    let cascaded = 0;
    if ((newSlug && newSlug !== oldSlug) || (newName && newName !== prev.name)) {
      const using = await adminDb().collection("designs").where("subcategorySlug", "==", oldSlug).get();
      const batch = adminDb().batch();
      using.docs.forEach((d) => {
        const upd: Record<string, unknown> = { updatedAt: serverTimestamp() };
        if (newSlug !== oldSlug) upd.subcategorySlug = newSlug;
        if (newName !== prev.name) upd.subcategory = newName;
        batch.set(d.ref, upd, { merge: true });
      });
      if (!using.empty) await batch.commit();
      cascaded = using.size;
      invalidateDesignsCache();
    }
    return NextResponse.json({ item: { id: params.id, ...prev, ...patch }, cascaded });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireSession();
    const ref = adminDb().collection("subcategories").doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const prev = snap.data() as any;
    const used = await adminDb().collection("designs").where("subcategorySlug", "==", prev.slug).limit(1).get();
    if (!used.empty) {
      return NextResponse.json(
        { error: "Cannot delete: designs still use this room. Reassign them first." },
        { status: 409 }
      );
    }
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}
