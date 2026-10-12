import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

/** Throws 401 when there is no valid admin session. Call FIRST in every API route. */
export async function requireSession(): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session) {
    const err = new Error("Unauthorized: admin sign-in required.") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
}
