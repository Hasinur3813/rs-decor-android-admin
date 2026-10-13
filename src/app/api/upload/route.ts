import { NextResponse } from "next/server";
import { toErrorStatus } from "@/lib/firebaseAdmin";
import { requireSession } from "@/lib/requireSession";
import { cloudinaryClient, uploadBufferToCloudinary, uploadFolder } from "@/lib/cloudinary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_EXTS = ["jpg", "jpeg", "png", "webp", "avif", "heic", "heif", "jfif", "bmp", "tif", "tiff", "svg", "ico"];
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
    if (file.size === 0) return NextResponse.json({ error: "That file is empty (0 bytes) — please pick another photo." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image too large (max 12 MB)." }, { status: 400 });
    // Phones report unpredictable MIME types, so reject only files that are
    // definitely not photos. Anything uncertain goes to Cloudinary, which
    // validates the actual content (see catch below).
    const fname = (file as File).name || "";
    const dot = fname.lastIndexOf(".");
    const ext = (dot >= 0 ? fname.slice(dot + 1) : "").toLowerCase();
    const ftype = (file.type || "").toLowerCase();
    const definitelyNotPhoto = ftype !== "" && !ftype.startsWith("image/") && !ALLOWED_EXTS.includes(ext);
    if (definitelyNotPhoto) {
      return NextResponse.json({ error: `“${fname || "That file"}” doesn't look like a photo. Please choose a JPG, PNG, WEBP, AVIF or HEIC image.` }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const folder = await uploadFolder(["designs", "categories", "hero", "logo"].includes(kind) ? kind : "designs");
    try {
      const out = await uploadBufferToCloudinary(buf, { folder, publicId });
      return NextResponse.json(out, { status: 201 });
    } catch (e) {
      // Cloudinary inspected the bytes and refused them (corrupt download,
      // unsupported format, DRM-wrapped file, …) — say so plainly.
      return NextResponse.json(
        { error: "The image host couldn't process this photo — it may be corrupt or an unsupported format. Try re-saving it as JPG and uploading again." },
        { status: 400 }
      );
    }
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
