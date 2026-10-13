import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { adminDb, serverTimestamp, toErrorStatus } from "@/lib/firebaseAdmin";
import { GEMINI_MODELS, GEMINI_PING_MODEL } from "@/lib/geminiConfig";
import { requireSession } from "@/lib/requireSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOC = "integrations";
const MAX_KEYS = 10;

function maskKey(key: string): string {
  return `••••${key.slice(-4)}`;
}

async function pingGeminiKey(key: string, selectedModel: unknown) {
  const model = typeof selectedModel === "string" &&
    (GEMINI_MODELS as readonly string[]).includes(selectedModel) &&
    selectedModel !== "auto"
    ? selectedModel
    : GEMINI_PING_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}`,
      { headers: { "x-goog-api-key": key }, signal: controller.signal, cache: "no-store" }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false as const, status: 504, error: "Gemini key check timed out. Please retry." };
    }
    console.error("Gemini API-key ping could not reach Google", error);
    return { ok: false as const, status: 502, error: "Could not reach Google to verify this key." };
  } finally {
    clearTimeout(timeout);
  }

  if (response.ok) {
    const modelInfo = await response.json();
    const methods = modelInfo?.supportedGenerationMethods;
    if (Array.isArray(methods) && !methods.includes("generateContent")) {
      return { ok: false as const, status: 400, error: `${model} is not available for content generation with this key.` };
    }
    return { ok: true as const, model };
  }
  if (response.status === 429) {
    return { ok: false as const, status: 429, error: "Google rate-limited this key check. Wait briefly and retry." };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false as const, status: 400, error: "Google rejected this API key. Check that it is valid and Gemini API is enabled." };
  }
  if (response.status === 404) {
    return { ok: false as const, status: 400, error: `Model ${model} is not available. Choose another model or Auto.` };
  }
  console.error("Gemini API-key ping returned an error", { status: response.status, model });
  return { ok: false as const, status: 502, error: "Google could not verify this key right now." };
}

export async function GET() {
  try {
    await requireSession();
    const snap = await adminDb().collection("settings").doc(DOC).get();
    const saved = snap.data()?.gemini as Record<string, unknown> | undefined;
    const storedKeys = Array.isArray(saved?.apiKeys) ? saved.apiKeys : [];
    const keys = storedKeys.flatMap((value) => {
      if (typeof value !== "object" || value === null) return [];
      const item = value as Record<string, unknown>;
      if (typeof item.id !== "string" || typeof item.key !== "string" || !item.key.trim()) return [];
      return [{
        id: item.id,
        label: typeof item.label === "string" ? item.label : "Gemini key",
        maskedKey: maskKey(item.key.trim())
      }];
    });
    const envKey = process.env.GEMINI_API_KEY?.trim();
    const hasPanelEnvDuplicate = storedKeys.some((value) =>
      typeof value === "object" && value !== null && "key" in value && value.key === envKey
    );
    if (envKey && !hasPanelEnvDuplicate) {
      keys.push({ id: "environment", label: "Server environment fallback key", maskedKey: maskKey(envKey) });
    }

    return NextResponse.json({
      keys,
      panelKeyCount: storedKeys.length,
      keySource: storedKeys.length > 0 ? "panel" : envKey ? "environment" : "none",
      model: typeof saved?.model === "string" &&
        (GEMINI_MODELS as readonly string[]).includes(saved.model) ? saved.model : "auto",
      models: GEMINI_MODELS
    });
  } catch (error) {
    const { status, message } = toErrorStatus(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    await requireSession();
    const body = await req.json();
    const ref = adminDb().collection("settings").doc(DOC);
    const snap = await ref.get();
    const existing = snap.data()?.gemini as Record<string, unknown> | undefined;
    const currentKeys = Array.isArray(existing?.apiKeys) ? existing.apiKeys : [];
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "ping-key" || action === "add-key") {
      const label = typeof body.label === "string" ? body.label.trim().slice(0, 60) : "";
      const key = typeof body.key === "string" ? body.key.trim() : "";
      if (key.length < 20 || key.length > 512 || /\s/.test(key)) {
        return NextResponse.json({ error: "Enter a valid Gemini API key." }, { status: 400 });
      }
      if (currentKeys.length >= MAX_KEYS) {
        return NextResponse.json({ error: `You can save up to ${MAX_KEYS} API keys.` }, { status: 400 });
      }
      if (currentKeys.some((value) =>
        typeof value === "object" && value !== null &&
        "key" in value && value.key === key
      )) {
        if (action === "add-key") {
          return NextResponse.json({ error: "That API key is already configured." }, { status: 409 });
        }
      }
      const ping = await pingGeminiKey(key, action === "add-key" ? "auto" : body.model);
      if (!ping.ok) return NextResponse.json({ error: ping.error }, { status: ping.status });
      if (action === "ping-key") {
        return NextResponse.json({ ok: true, model: ping.model, message: `Key verified with ${ping.model}.` });
      }
      if (currentKeys.some((value) =>
        typeof value === "object" && value !== null && "key" in value && value.key === key
      )) {
        return NextResponse.json({ error: "That API key is already configured." }, { status: 409 });
      }
      currentKeys.push({ id: randomUUID(), label: label || `Gemini key ${currentKeys.length + 1}`, key });
      await ref.set({
        gemini: { ...existing, apiKeys: currentKeys },
        updatedAt: serverTimestamp()
      }, { merge: true });
    } else if (action === "remove-key") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id || id === "environment") {
        return NextResponse.json({ error: "That key cannot be removed here." }, { status: 400 });
      }
      const nextKeys = currentKeys.filter((value) =>
        typeof value !== "object" || value === null || !("id" in value) || value.id !== id
      );
      if (nextKeys.length === currentKeys.length) {
        return NextResponse.json({ error: "API key not found." }, { status: 404 });
      }
      await ref.set({
        gemini: { ...existing, apiKeys: nextKeys },
        updatedAt: serverTimestamp()
      }, { merge: true });
    } else if (action === "save-model") {
      const model = typeof body.model === "string" ? body.model : "";
      if (!(GEMINI_MODELS as readonly string[]).includes(model)) {
        return NextResponse.json({ error: "Choose a supported Gemini model." }, { status: 400 });
      }
      await ref.set({
        gemini: { ...existing, model },
        updatedAt: serverTimestamp()
      }, { merge: true });
    } else {
      return NextResponse.json({ error: "Unknown Gemini settings action." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, message } = toErrorStatus(error);
    return NextResponse.json({ error: message }, { status });
  }
}
