import { NextResponse } from "next/server";
import { toErrorStatus } from "@/lib/firebaseAdmin";
import { requireSession } from "@/lib/requireSession";
import { cloudinaryClient, uploadBufferToCloudinary, uploadFolder } from "@/lib/cloudinary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_BYTES = 12 * 1024 * 1024;

/**
 * POST /api/upload — multipart form: file (required), kind (designs|categories|hero), publicId?
 * Uploads server-side to Cloudinary, returns { secure_url, public_id, ... }.
 */
export async function POST(req: Request) {
  try {
    await requireSession();
    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "designs");
    const publicId = form.get("publicId") ? String(form.get("publicId")) : undefined;
    if (!(file instanceof Blob)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image too large (max 12 MB)." }, { status: 400 });
    if (file.type && !ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: "Only JPG, PNG, WEBP, AVIF allowed." }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const folder = await uploadFolder(["designs", "categories", "hero", "logo"].includes(kind) ? kind : "designs");
    const out = await uploadBufferToCloudinary(buf, { folder, publicId });
    return NextResponse.json(out, { status: 201 });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}

/** DELETE /api/upload?publicId=… — remove an orphaned Cloudinary asset */
export async function DELETE(req: Request) {
  try {
    await requireSession();
    const publicId = new URL(req.url).searchParams.get("publicId");
    if (!publicId) return NextResponse.json({ error: "publicId required." }, { status: 400 });
    await (await cloudinaryClient()).uploader.destroy(publicId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}
