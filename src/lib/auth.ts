import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/** username -> expected "saltHex:hashHex" (scrypt). Generate with `npm run gen-password`. */
function expectedHash(): { user: string; salt: Buffer; hash: Buffer } | null {
  const user = (process.env.ADMIN_USERNAME || "").trim();
  const raw = (process.env.ADMIN_PASSWORD_HASH || "").trim();
  if (!user || !raw || !raw.includes(":")) return null;
  const [saltHex, hashHex] = raw.split(":");
  try {
    return { user, salt: Buffer.from(saltHex, "hex"), hash: Buffer.from(hashHex, "hex") };
  } catch {
    return null;
  }
}

function verifyPassword(password: string, salt: Buffer, expected: Buffer): boolean {
  try {
    const derived = scryptSync(password, salt, expected.length, { N: 16384, r: 8, p: 1 });
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// In-memory login throttle: 8 failures per IP per 10 minutes -> 429.
const fails = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 8;

export function loginAllowed(ip: string): boolean {
  const now = Date.now();
  const rec = fails.get(ip);
  if (!rec) return true;
  if (now > rec.resetAt) {
    fails.delete(ip);
    return true;
  }
  return rec.count < MAX_FAILS;
}

export function recordLoginFail(ip: string): void {
  const now = Date.now();
  const rec = fails.get(ip);
  if (!rec || now > rec.resetAt) fails.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else rec.count += 1;
}

export function clearLoginFails(ip: string): void {
  fails.delete(ip);
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Token lifetimes (seconds).
 * - ACCESS_TTL: short-lived access token, rotated silently while active.
 * - SESSION_TTL: absolute ceiling — full re-login required after this.
 * - updateAge mirrors ACCESS_TTL so the session cookie itself slides too.
 */
const ACCESS_TTL = 15 * 60;
const SESSION_TTL = 12 * 60 * 60;

function newToken(): string {
  return randomBytes(32).toString("hex");
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Admin",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        const exp = expectedHash();
        if (!exp) throw new Error("Server auth is not configured (ADMIN_USERNAME / ADMIN_PASSWORD_HASH).");
        const forwarded = (req?.headers?.["x-forwarded-for"] as string) || "";
        const ip = forwarded.split(",")[0]?.trim() || "unknown";
        if (!loginAllowed(ip)) throw new Error("Too many failed attempts. Try again in a few minutes.");
        const user = String(credentials?.username || "").trim();
        const pass = String(credentials?.password || "");
        const userOk = user.length > 0 && user.length === exp.user.length &&
          timingSafeEqual(Buffer.from(user), Buffer.from(exp.user));
        if (userOk && pass.length > 0 && verifyPassword(pass, exp.salt, exp.hash)) {
          clearLoginFails(ip);
          return { id: "admin", name: "Administrator" };
        }
        recordLoginFail(ip);
        return null;
      }
    })
  ],
  session: { strategy: "jwt", maxAge: SESSION_TTL, updateAge: ACCESS_TTL },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/" },
  callbacks: {
    async jwt({ token, user }) {
      const now = Math.floor(Date.now() / 1000);
      if (user) {
        // Fresh sign-in: mint the initial access + refresh pair.
        return {
          ...token,
          role: "admin",
          accessToken: newToken(),
          accessTokenExpires: now + ACCESS_TTL,
          refreshToken: newToken(),
          refreshCount: 0
        };
      }
      // Sliding rotation: when the access token lapses but the session is
      // still within its absolute lifetime, rotate BOTH tokens (single-use
      // refresh semantics — a stolen refresh token is useless after rotation).
      if (
        typeof token.accessTokenExpires === "number" &&
        now > (token.accessTokenExpires as number)
      ) {
        return {
          ...token,
          accessToken: newToken(),
          accessTokenExpires: now + ACCESS_TTL,
          refreshToken: newToken(),
          refreshCount: ((token.refreshCount as number) ?? 0) + 1
        };
      }
      return token;
    },
    async session({ session, token }) {
      (session as unknown as Record<string, unknown>).role = token.role || "admin";
      // Client-visible expiry countdown only — tokens themselves stay httpOnly.
      (session as unknown as Record<string, unknown>).accessExpiresAt =
        typeof token.accessTokenExpires === "number" ? (token.accessTokenExpires as number) * 1000 : null;
      return session;
    }
  }
};
