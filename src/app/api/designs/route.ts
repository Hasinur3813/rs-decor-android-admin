import { NextResponse } from "next/server";
import { adminDb, serverTimestamp, toErrorStatus } from "@/lib/firebaseAdmin";
import { requireSession } from "@/lib/requireSession";
import { allDesigns, invalidateDesignsCache } from "@/lib/designsCache";
import { newId } from "@/lib/helpers";
import { buildDesignSearchTokens } from "@/lib/designSearch";

export async function GET(req: Request) {
  try {
    await requireSession();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const categorySlug = url.searchParams.get("categorySlug") || "";
    const subcategorySlug = url.searchParams.get("subcategorySlug") || "";
    const status = url.searchParams.get("status") || "all"; // all | active | hidden
    const sort = url.searchParams.get("sort") || "newest"; // newest | oldest | name
    const num = (v: string | null, fallback: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.floor(n) : fallback;
    };
    const page = Math.max(1, num(url.searchParams.get("page"), 1));
    const limit = Math.min(100, Math.max(10, num(url.searchParams.get("limit"), 24)));

    let items = await allDesigns();
    const totals = { all: items.length, active: 0, hidden: 0 };
    for (const d of items) {
      if ((d as any).isActive === false) totals.hidden++;
      else totals.active++;
    }

    if (categorySlug) items = items.filter((d) => (d as any).categorySlug === categorySlug);
    if (subcategorySlug) items = items.filter((d) => (d as any).subcategorySlug === subcategorySlug);
    if (status === "active") items = items.filter((d) => (d as any).isActive !== false);
    if (status === "hidden") items = items.filter((d) => (d as any).isActive === false);
    if (q) {
      items = items.filter((d) => {
        const hay = [(d as any).name, (d as any).category, (d as any).subcategory, (d as any).categorySlug, (d as any).subcategorySlug]
          .join(" ").toLowerCase();
        return q.split(/\s+/).every((w) => hay.includes(w));
      });
    }

    const sorted = [...items].sort((a: any, b: any) => {
      if (sort === "name") return String(a.name || "").localeCompare(String(b.name || ""));
      if (sort === "oldest") return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });

    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const pageItems = sorted.slice((safePage - 1) * limit, safePage * limit);

    return NextResponse.json({ items: pageItems, total, page: safePage, totalPages, limit, totals });
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
    if (name.length < 2) return NextResponse.json({ error: "Design name required (min 2)." }, { status: 400 });
    if (!body.category || !body.categorySlug) return NextResponse.json({ error: "Category + categorySlug required." }, { status: 400 });
    if (!body.subcategory || !body.subcategorySlug) return NextResponse.json({ error: "Subcategory + subcategorySlug required." }, { status: 400 });
    if (!body.imageUrl) return NextResponse.json({ error: "imageUrl required — upload an image first." }, { status: 400 });

    const id = String(body.id || newId("des")).slice(0, 64);
    const doc: Record<string, unknown> = {
      id,
      name,
      category: String(body.category),
      categorySlug: String(body.categorySlug),
      subcategory: String(body.subcategory),
      subcategorySlug: String(body.subcategorySlug),
      imageUrl: String(body.imageUrl),
      searchTokens: buildDesignSearchTokens(
        name,
        body.category,
        body.categorySlug,
        body.subcategory,
        body.subcategorySlug
      ),
      isActive: body.isActive !== false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    // NOTE: never store `undefined` — Firestore rejects it. Only add when present.
    if (body.imagePublicId) doc.imagePublicId = String(body.imagePublicId);
    await adminDb().collection("designs").doc(id).set(doc, { merge: true });
    invalidateDesignsCache();
    return NextResponse.json({ item: doc }, { status: 201 });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}
