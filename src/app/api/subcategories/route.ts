import { NextResponse } from "next/server";
import { adminDb, serverTimestamp, toErrorStatus } from "@/lib/firebaseAdmin";
import { requireSession } from "@/lib/requireSession";
import { newId, slugifyAscii } from "@/lib/helpers";

export async function GET(req: Request) {
  try {
    await requireSession();
    const snap = await adminDb().collection("subcategories").get();
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
    if (name.length < 2) return NextResponse.json({ error: "Bangla name required." }, { status: 400 });
    const slug = String(body.slug || slugifyAscii(body.nameEn || name)).trim();
    if (!slug) return NextResponse.json({ error: "Slug required." }, { status: 400 });
    const id = String(body.id || newId("sub")).slice(0, 64);
    const doc = {
      id,
      name,
      nameEn: String(body.nameEn || ""),
      slug,
      order: Number(body.order ?? 999),
      isActive: body.isActive !== false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await adminDb().collection("subcategories").doc(id).set(doc, { merge: true });
    return NextResponse.json({ item: doc }, { status: 201 });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}
