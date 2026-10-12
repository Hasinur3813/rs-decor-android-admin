import { NextResponse } from "next/server";
import { adminDb, serverTimestamp, toErrorStatus } from "@/lib/firebaseAdmin";
import { requireSession } from "@/lib/requireSession";
import { newId, slugifyAscii } from "@/lib/helpers";

export async function GET(req: Request) {
  try {
    await requireSession();
    const snap = await adminDb().collection("categories").get();
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999));
    return NextResponse.json({ items });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requireSession();
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (name.length < 2) return NextResponse.json({ error: "Name is required (min 2 chars)." }, { status: 400 });
    const slug = String(body.slug || slugifyAscii(body.nameEn || name)).trim();
    if (!slug) return NextResponse.json({ error: "Slug is required." }, { status: 400 });
    if (!body.imageUrl) return NextResponse.json({ error: "imageUrl is required — upload an image first." }, { status: 400 });

    const id = String(body.id || newId("cat")).slice(0, 64);
    const doc: Record<string, unknown> = {
      id,
      name,
      title: name, // keep Android fallback field in sync
      nameEn: String(body.nameEn || "").trim(),
      slug,
      imageUrl: String(body.imageUrl),
      order: Number(body.order ?? 999),
      isActive: body.isActive !== false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    // NOTE: never store `undefined` — Firestore rejects it. Only add when present.
    if (body.imagePublicId) doc.imagePublicId = String(body.imagePublicId);
    await adminDb().collection("categories").doc(id).set(doc, { merge: true });
    return NextResponse.json({ item: doc }, { status: 201 });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}
