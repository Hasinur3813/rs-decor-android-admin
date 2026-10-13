import { v2 as cloudinary } from "cloudinary";
import { randomUUID } from "node:crypto";
import { adminDb } from "./firebaseAdmin";

export type CloudinaryCreds = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
  /** Where the active credentials came from. */
  source: "panel" | "env";
};

export type CloudinaryStatus = {
  /** All three fields present (from panel and/or env). */
  configured: boolean;
  /** A live `ping` against Cloudinary succeeded. */
  connected: boolean;
  cloudName: string;
  apiKeyMasked: string;
  folder: string;
  source: "panel" | "env" | "none";
  message: string;
};

const INTEGRATIONS_DOC = "integrations";

let cache: { key: string } | null = null;

function envCreds(): Omit<CloudinaryCreds, "source"> {
  return {
    cloudName: (process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
    apiKey: (process.env.CLOUDINARY_API_KEY || "").trim(),
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
    folder: (process.env.CLOUDINARY_FOLDER || "rs-decor").replace(/\/+$/, "")
  };
}

function missingFields(c: { cloudName: string; apiKey: string; apiSecret: string }): string[] {
  const missing: string[] = [];
  if (!c.cloudName) missing.push("cloud name");
  if (!c.apiKey) missing.push("API key");
  if (!c.apiSecret) missing.push("API secret");
  return missing;
}

/**
 * Effective credentials: panel-saved override (Firestore
 * `settings/integrations`, Admin-SDK-only) wins when complete,
 * otherwise the server `.env` values are used.
 */
export async function getCloudinaryCreds(): Promise<CloudinaryCreds & { missing: string[] }> {
  const env = envCreds();
  try {
    const snap = await adminDb().collection("settings").doc(INTEGRATIONS_DOC).get();
    const saved = snap.exists ? (snap.data()?.cloudinary as Record<string, unknown> | undefined) : undefined;
    const panel = {
      cloudName: String(saved?.cloudName || "").trim(),
      apiKey: String(saved?.apiKey || "").trim(),
      apiSecret: String(saved?.apiSecret || ""),
      folder: String(saved?.folder || "").trim().replace(/\/+$/, "") || env.folder
    };
    if (!missingFields(panel).length) {
      return { ...panel, source: "panel", missing: [] };
    }
    // Partial panel config is treated as "not configured" rather than
    // silently mixing panel + env values (avoids cross-account confusion).
    if (panel.cloudName || panel.apiKey || panel.apiSecret) {
      return { ...panel, source: "panel", missing: missingFields(panel) };
    }
  } catch {
    // Firestore unreachable — fall through to env.
  }
  return { ...env, source: "env", missing: missingFields(env) };
}

function cacheKey(c: CloudinaryCreds): string {
  return [c.cloudName, c.apiKey, c.apiSecret].join("|");
}

/** Configured SDK client. Throws a user-friendly error when not configured. */
export async function cloudinaryClient() {
  const creds = await getCloudinaryCreds();
  if (creds.missing.length > 0) {
    throw new Error(`Cloudinary is not configured (missing: ${creds.missing.join(", ")}). Set it in Integrations or .env.`);
  }
  const key = cacheKey(creds);
  if (!cache || cache.key !== key) {
    cloudinary.config({
      cloud_name: creds.cloudName,
      api_key: creds.apiKey,
      api_secret: creds.apiSecret,
      secure: true
    });
    cache = { key };
  }
  return cloudinary;
}

export async function uploadFolder(kind: string): Promise<string> {
  const creds = await getCloudinaryCreds();
  const base = (creds.folder || "rs-decor").replace(/\/+$/, "");
  return `${base}/${kind}`;
}

export async function createDirectUploadSignature(kind: string) {
  const creds = await getCloudinaryCreds();
  if (creds.missing.length > 0) {
    throw new Error(`Cloudinary is not configured (missing: ${creds.missing.join(", ")}). Set it in Integrations or .env.`);
  }

  const folder = `${(creds.folder || "rs-decor").replace(/\/+$/, "")}/${kind}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = randomUUID();
  const params = { folder, overwrite: true, public_id: publicId, timestamp };
  const client = await cloudinaryClient();
  const signature = client.utils.api_sign_request(params, creds.apiSecret);

  return {
    cloudName: creds.cloudName,
    apiKey: creds.apiKey,
    folder,
    overwrite: true,
    publicId,
    timestamp,
    signature
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Connection timed out.")), ms))
  ]);
}

/** Live check + safe status for the UI (the secret is never returned). */
export async function cloudinaryStatus(): Promise<CloudinaryStatus> {
  const creds = await getCloudinaryCreds();
  const base = {
    configured: creds.missing.length === 0,
    cloudName: creds.cloudName,
    apiKeyMasked: creds.apiKey ? `••••${creds.apiKey.slice(-4)}` : "",
    folder: creds.folder,
    source: creds.source as CloudinaryStatus["source"]
  };
  if (!base.configured) {
    return {
      ...base,
      source: creds.cloudName || creds.apiKey || creds.apiSecret ? creds.source : "none",
      connected: false,
      message: `Not configured (missing: ${creds.missing.join(", ")}).`
    };
  }
  try {
    const c = await cloudinaryClient();
    const res = (await withTimeout(c.api.ping(), 10000)) as { status?: string };
    const ok = res?.status === "ok";
    return { ...base, connected: ok, message: ok ? `Connected to "${creds.cloudName}" via ${creds.source === "panel" ? "panel settings" : ".env"}.` : "Unexpected ping response." };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Connection failed.";
    return { ...base, connected: false, message: `Configured but unreachable: ${msg}` };
  }
}

export async function uploadBufferToCloudinary(
  buf: Buffer,
  opts: { folder: string; publicId?: string }
): Promise<{ secure_url: string; public_id: string; width: number; height: number; format: string }> {
  const c = await cloudinaryClient();
  return new Promise((resolve, reject) => {
    const stream = c.uploader.upload_stream(
      {
        folder: opts.folder,
        public_id: opts.publicId,
        overwrite: true,
        resource_type: "image",
        transformation: [{ quality: "auto", fetch_format: "auto" }]
      },
      (err, result) => {
        if (err || !result) return reject(err || new Error("Cloudinary upload failed"));
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format
        });
      }
    );
    stream.end(buf);
  });
}
