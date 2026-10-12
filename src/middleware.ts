import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Hard gate in front of every page and API route.
 * - API without a valid session  -> 401 JSON (never a redirect, never data)
 * - Page without a valid session -> the lock screen at "/"
 * The UI lock screen is cosmetic; this middleware + requireSession() in each
 * route handler is the real enforcement.
 */
export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (token) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized: admin sign-in required." }, { status: 401 });
  }
  if (pathname !== "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/designs/:path*",
    "/categories/:path*",
    "/subcategories/:path*",
    "/settings/:path*",
    "/api/designs/:path*",
    "/api/categories/:path*",
    "/api/subcategories/:path*",
    "/api/settings/:path*",
    "/api/upload/:path*",
    "/api/dashboard/:path*",
    "/api/integrations/:path*"
  ]
};
