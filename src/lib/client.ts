"use client";

import { getSession } from "next-auth/react";

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
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status === 401) {
          // Same loop-proofing as api(): revalidate once, retry the upload,
          // otherwise surface the error without navigating.
          getSession()
            .then((s) => {
              if (s) {
                const retry = new XMLHttpRequest();
                retry.open("POST", "/api/upload");
                retry.upload.onprogress = (e) => {
                  if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
                };
                retry.onload = () => {
                  try {
                    const d = JSON.parse(retry.responseText);
                    if (retry.status >= 200 && retry.status < 300) resolve(d);
                    else reject(new Error(d.error || "Upload failed"));
                  } catch {
                    reject(new Error("Upload failed"));
                  }
                };
                retry.onerror = () => reject(new Error("Network error during upload"));
                retry.send(form);
              } else {
                broadcastSessionExpired();
                reject(new Error("Session expired — please sign in again."));
              }
            })
            .catch(() => {
              broadcastSessionExpired();
              reject(new Error("Session expired — please sign in again."));
            });
        } else if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || "Upload failed"));
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}
