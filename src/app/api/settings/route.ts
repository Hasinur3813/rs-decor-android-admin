import { NextResponse } from "next/server";
import { adminDb, serverTimestamp, toErrorStatus } from "@/lib/firebaseAdmin";
import { requireSession } from "@/lib/requireSession";
import { cloudinaryClient } from "@/lib/cloudinary";
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
    const ref = adminDb().collection("settings").doc(DOC);
    const previousSnapshot = await ref.get();
    const previous = previousSnapshot.data() || {};
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
    await ref.set(patch, { merge: true });
    const replacedAssets = [
      { oldId: previous.logoImagePublicId, newId: patch.logoImagePublicId },
      { oldId: previous.heroImagePublicId, newId: patch.heroImagePublicId }
    ].filter(({ oldId, newId }) =>
      typeof oldId === "string" &&
      oldId.length > 0 &&
      typeof newId === "string" &&
      newId.length > 0 &&
      oldId !== newId
    );
    const cleanupWarnings: string[] = [];
    if (replacedAssets.length > 0) {
      try {
        const cloudinary = await cloudinaryClient();
        const results = await Promise.allSettled(
          replacedAssets.map(({ oldId }) => cloudinary.uploader.destroy(String(oldId), { resource_type: "image" }))
        );
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            cleanupWarnings.push(String(replacedAssets[index].oldId));
            console.warn("Could not remove replaced settings image from Cloudinary.", result.reason);
          } else if (result.value.result !== "ok" && result.value.result !== "not found") {
            cleanupWarnings.push(String(replacedAssets[index].oldId));
            console.warn("Cloudinary did not confirm deletion of replaced settings image.", result.value);
          }
        });
      } catch (cleanupError) {
        cleanupWarnings.push(...replacedAssets.map(({ oldId }) => String(oldId)));
        console.warn("Could not initialize Cloudinary cleanup after saving settings.", cleanupError);
      }
    }
    const snap = await ref.get();
    return NextResponse.json({
      item: { ...DEFAULT_SETTINGS, ...snap.data() },
      ...(cleanupWarnings.length > 0
        ? { cleanupWarning: `Could not delete ${cleanupWarnings.length} replaced Cloudinary image(s).` }
        : {})
    });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}
