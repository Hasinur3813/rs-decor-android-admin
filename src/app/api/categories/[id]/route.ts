import { NextResponse } from "next/server";
import { adminDb, serverTimestamp, toErrorStatus } from "@/lib/firebaseAdmin";
import { requireSession } from "@/lib/requireSession";
import { cloudinaryClient } from "@/lib/cloudinary";
import { slugifyAscii } from "@/lib/helpers";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireSession();
    const body = await req.json();
    const ref = adminDb().collection("categories").doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const prev = snap.data() as any;

    const name = body.name !== undefined ? String(body.name).trim() : prev.name;
    if (!name || name.length < 2) return NextResponse.json({ error: "Name min 2 chars." }, { status: 400 });

    const patch: Record<string, unknown> = {
      name,
      title: name,
      nameEn: body.nameEn !== undefined ? String(body.nameEn) : prev.nameEn,
      slug: body.slug !== undefined ? String(body.slug) : prev.slug || slugifyAscii(name),
      imageUrl: body.imageUrl !== undefined ? String(body.imageUrl) : prev.imageUrl,
      order: body.order !== undefined ? Number(body.order) : prev.order,
      isActive: body.isActive !== undefined ? body.isActive !== false : prev.isActive,
      updatedAt: serverTimestamp()
    };
    if (body.imagePublicId !== undefined) patch.imagePublicId = body.imagePublicId || null;
    // remove old Cloudinary asset when replaced
    if (body.imagePublicId && prev.imagePublicId && body.imagePublicId !== prev.imagePublicId) {
      try { await (await cloudinaryClient()).uploader.destroy(prev.imagePublicId); } catch { /* ignore */ }
    }
    await ref.set(patch, { merge: true });
    return NextResponse.json({ item: { id: params.id, ...prev, ...patch } });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireSession();
    const ref = adminDb().collection("categories").doc(params.id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const prev = snap.data() as any;
    // Safety: refuse if designs still reference this category slug
    const slug = prev.slug as string;
    if (slug) {
      const used = await adminDb().collection("designs").where("categorySlug", "==", slug).limit(1).get();
      if (!used.empty) {
        return NextResponse.json(
          { error: `Cannot delete: ${used.size}+ design(s) still use this category. Reassign them first.` },
          { status: 409 }
        );
      }
    }
    if (prev.imagePublicId) {
      try { await (await cloudinaryClient()).uploader.destroy(prev.imagePublicId); } catch { /* ignore */ }
    }
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}
