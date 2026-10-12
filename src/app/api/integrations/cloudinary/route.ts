import { NextResponse } from "next/server";
import { adminDb, serverTimestamp, toErrorStatus } from "@/lib/firebaseAdmin";
import { requireSession } from "@/lib/requireSession";
import { cloudinaryStatus } from "@/lib/cloudinary";

const DOC = "integrations";

/**
 * GET /api/integrations/cloudinary
 * Safe status + editable (non-secret) fields. The API secret is never returned.
 */
export async function GET(req: Request) {
  try {
    await requireSession();
    const [status, snap] = await Promise.all([
      cloudinaryStatus(),
      adminDb().collection("settings").doc(DOC).get()
    ]);
    const saved = snap.exists ? (snap.data()?.cloudinary as Record<string, unknown> | undefined) : undefined;
    return NextResponse.json({
      status,
      saved: saved
        ? { cloudName: saved.cloudName || "", apiKey: saved.apiKey || "", folder: saved.folder || "", hasSecret: Boolean(saved.apiSecret) }
        : null
    });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PUT /api/integrations/cloudinary — { cloudName, apiKey, apiSecret?, folder? }
 * Saves the override, then live-tests it and reports the result.
 * Omit apiSecret (or send "") to keep the previously saved secret.
 */
export async function PUT(req: Request) {
  try {
    await requireSession();
    const body = await req.json();
    const ref = adminDb().collection("settings").doc(DOC);
    const prev = await ref.get();
    const prevSaved = prev.exists ? (prev.data()?.cloudinary as Record<string, unknown> | undefined) : undefined;

    const cloudName = String(body.cloudName || "").trim();
    const apiKey = String(body.apiKey || "").trim();
    const folder = String(body.folder || "rs-decor").trim().replace(/\/+$/, "") || "rs-decor";
    const apiSecret = body.apiSecret !== undefined && String(body.apiSecret) !== ""
      ? String(body.apiSecret)
      : String(prevSaved?.apiSecret || "");

    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "cloudName, apiKey and apiSecret are all required." },
        { status: 400 }
      );
    }

    await ref.set(
      { cloudinary: { cloudName, apiKey, apiSecret, folder }, updatedAt: serverTimestamp() },
      { merge: true }
    );
    const status = await cloudinaryStatus();
    return NextResponse.json({
      saved: { cloudName, apiKey, folder, hasSecret: true },
      status,
      warning: status.connected ? undefined : "Saved, but the live connection test failed — uploads will fail until the credentials are corrected."
    });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}

/** DELETE /api/integrations/cloudinary — remove the panel override, fall back to .env */
export async function DELETE(req: Request) {
  try {
    await requireSession();
    const ref = adminDb().collection("settings").doc(DOC);
    const snap = await ref.get();
    if (snap.exists) {
      const data = { ...(snap.data() as Record<string, unknown>) };
      delete data.cloudinary;
      if (Object.keys(data).length === 0) await ref.delete();
      else await ref.set(data);
    }
    return NextResponse.json({ status: await cloudinaryStatus() });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}
