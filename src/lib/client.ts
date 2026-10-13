"use client";

import { getSession } from "next-auth/react";
import { imagePrepForGemini } from "@/lib/imagePrepForGemini";

function broadcastSessionExpired() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("rs:session-expired"));
  }
}

/** Same-origin JSON API. Auth travels in the httpOnly session cookie. */
export async function api<T = any>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) }
  });
  if (res.status === 401 && retry) {
    // A 401 right after sign-in can mean the session hasn't propagated to
    // this request yet. Revalidate once and retry before giving up — this
    // also guarantees api() can never trigger redirect loops by itself.
    const session = await getSession().catch(() => null);
    if (session) return api<T>(path, init, false);
  }
  if (res.status === 401) {
    // No signIn() call here by design: navigation side-effects belong to
    // explicit user actions (lock screen / "sign in again" button), so a
    // failing request can never cascade into redirect loops. Instead we
    // broadcast — the Shell turns this into a polite toast + lock screen.
    broadcastSessionExpired();
    throw new Error("Session expired — please sign in again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Request failed (${res.status})`);
  return data as T;
}

export async function uploadImage(file: File, kind: string, onProgress?: (pct: number) => void): Promise<{ secure_url: string; public_id: string }> {
  if (file.size > 50 * 1024 * 1024) {
    throw new Error("Image too large (max 50 MB).");
  }
  const signed = await api<{
    cloudName: string;
    apiKey: string;
    folder: string;
    overwrite: boolean;
    publicId: string;
    timestamp: number;
    signature: string;
  }>("/api/upload/signature", {
    method: "POST",
    body: JSON.stringify({ kind })
  });
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signed.apiKey);
  form.append("timestamp", String(signed.timestamp));
  form.append("folder", signed.folder);
  form.append("overwrite", String(signed.overwrite));
  form.append("public_id", signed.publicId);
  form.append("signature", signed.signature);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/image/upload`);
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.secure_url && data.public_id) resolve(data);
        else reject(new Error(data.error?.message || data.error || `Cloudinary upload failed (${xhr.status}).`));
      } catch {
        reject(new Error(`Cloudinary returned an unreadable response (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading to Cloudinary."));
    xhr.ontimeout = () => reject(new Error("Cloudinary upload timed out. Please retry."));
    xhr.send(form);
  });
}

export type GeneratedDesignMetadata = {
  name: string;
  categorySlug: string;
  subcategorySlug: string;
};

/** Sends a resized AI-only copy; the original queued photo remains unchanged for Cloudinary. */
export async function generateDesignMetadata(
  file: File,
  options: { language: "bn" | "en"; titleLength: number },
  retry = true
): Promise<GeneratedDesignMetadata> {
  const aiFile = await imagePrepForGemini(file);
  const form = new FormData();
  form.append("file", aiFile);
  form.append("language", options.language);
  form.append("titleLength", String(options.titleLength));
  const send = () => fetch("/api/designs/generate-metadata", {
    method: "POST",
    body: form
  });
  let res = await send();

  if (res.status === 401 && retry) {
    const session = await getSession().catch(() => null);
    if (session) res = await send();
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    broadcastSessionExpired();
    throw new Error("Session expired — please sign in again.");
  }
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `AI request failed (${res.status})`);
  }
  if (
    typeof data.name !== "string" ||
    typeof data.categorySlug !== "string" ||
    typeof data.subcategorySlug !== "string"
  ) {
    throw new Error("The AI response was incomplete. Please try again.");
  }
  return data as GeneratedDesignMetadata;
}
