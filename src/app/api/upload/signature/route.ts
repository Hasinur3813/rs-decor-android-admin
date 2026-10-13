import { NextResponse } from "next/server";
import { toErrorStatus } from "@/lib/firebaseAdmin";
import { createDirectUploadSignature } from "@/lib/cloudinary";
import { requireSession } from "@/lib/requireSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_KINDS = new Set(["designs", "categories", "hero", "logo"]);

export async function POST(req: Request) {
  try {
    await requireSession();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid upload signature request." }, { status: 400 });
    }
    const kind =
      typeof body === "object" && body !== null && "kind" in body && typeof body.kind === "string"
        ? body.kind
        : "";
    if (!ALLOWED_KINDS.has(kind)) {
      return NextResponse.json({ error: "Invalid upload destination." }, { status: 400 });
    }

    return NextResponse.json(await createDirectUploadSignature(kind), {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    const { status, message } = toErrorStatus(error);
    return NextResponse.json({ error: message }, { status });
  }
}
