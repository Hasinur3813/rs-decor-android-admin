import { NextResponse } from "next/server";
import { adminDb, serverTimestamp, toErrorStatus } from "@/lib/firebaseAdmin";
import { requireSession } from "@/lib/requireSession";
import { DEFAULT_SETTINGS } from "@/lib/types";

const DOC = "app";

/** GET /api/settings — contact numbers + hero area (single doc `settings/app`) */
export async function GET(req: Request) {
  try {
    await requireSession();
    const snap = await adminDb().collection("settings").doc(DOC).get();
    const item = snap.exists ? { ...DEFAULT_SETTINGS, ...snap.data() } : DEFAULT_SETTINGS;
    return NextResponse.json({ item });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}

/** PUT /api/settings — partial update of contact + hero fields */
export async function PUT(req: Request) {
  try {
    await requireSession();
    const body = await req.json();
    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    for (const k of [
      "phoneNumber", "phoneDisplay", "whatsappNumber",
      "heroTitle", "heroSubtitle", "heroDescription", "heroImageUrl", "heroImagePublicId",
      "appTitle", "appSubtitle", "logoImageUrl", "logoImagePublicId"
    ]) {
      if (body[k] !== undefined) patch[k] = body[k] === null ? null : String(body[k]);
    }
    if (patch.phoneNumber && !/^\+?[0-9\- ]{8,18}$/.test(String(patch.phoneNumber))) {
      return NextResponse.json({ error: "phoneNumber looks invalid (e.g. +8801XXXXXXXXX)." }, { status: 400 });
    }
    await adminDb().collection("settings").doc(DOC).set(patch, { merge: true });
    const snap = await adminDb().collection("settings").doc(DOC).get();
    return NextResponse.json({ item: { ...DEFAULT_SETTINGS, ...snap.data() } });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}
