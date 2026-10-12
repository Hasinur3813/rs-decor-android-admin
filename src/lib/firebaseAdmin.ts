import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";

let app: App | null = null;

function privateKey(): string {
  const raw = process.env.FIREBASE_PRIVATE_KEY || "";
  return raw.replace(/\\n/g, "\n");
}

export function adminApp(): App {
  if (app) return app;
  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0];
    return app;
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const key = privateKey();
  if (!projectId || !clientEmail || !key) {
    throw new Error(
      "Missing Firebase Admin env vars. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY."
    );
  }
  app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey: key }) });
  return app;
}

export function adminDb(): Firestore {
  const dbId = process.env.FIREBASE_DATABASE_ID?.trim();
  return dbId ? getFirestore(adminApp(), dbId) : getFirestore(adminApp());
}

export function serverTimestamp() {
  return new Date().toISOString();
}

export function toErrorStatus(e: unknown): { status: number; message: string } {
  const err = e as { status?: number; message?: string };
  return { status: typeof err?.status === "number" ? err.status : 500, message: err?.message || "Internal error" };
}
