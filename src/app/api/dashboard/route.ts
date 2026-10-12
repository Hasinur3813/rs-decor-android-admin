import { NextResponse } from "next/server";
import { adminDb, toErrorStatus } from "@/lib/firebaseAdmin";
import { requireSession } from "@/lib/requireSession";
import { cloudinaryStatus } from "@/lib/cloudinary";
import { allDesigns } from "@/lib/designsCache";

/** GET /api/dashboard — counts + recent designs for the overview page */
export async function GET(req: Request) {
  try {
    await requireSession();
    const db = adminDb();
    const [cats, subs, settings, designs] = await Promise.all([
      db.collection("categories").get(),
      db.collection("subcategories").get(),
      db.collection("settings").doc("app").get(),
      allDesigns()
    ]);
    const perCategory: Record<string, number> = {};
    let hidden = 0;
    for (const d of designs as any[]) {
      const s = String(d.categorySlug || "unknown");
      perCategory[s] = (perCategory[s] || 0) + 1;
      if (d.isActive === false) hidden++;
    }
    const recent = [...(designs as any[])]
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 8);
    return NextResponse.json({
      counts: {
        categories: cats.size,
        designs: designs.length,
        hidden,
        subcategories: subs.size,
        heroConfigured: settings.exists && Boolean((settings.data() as any)?.heroImageUrl)
      },
      integrations: { cloudinary: await cloudinaryStatus() },
      perCategory,
      recent
    });
  } catch (e) {
    const { status, message } = toErrorStatus(e);
    return NextResponse.json({ error: message }, { status });
  }
}
