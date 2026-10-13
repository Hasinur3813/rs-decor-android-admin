import { adminDb } from "@/lib/firebaseAdmin";

export const GEMINI_MODELS = [
  "auto",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
] as const;

export type GeminiModel = (typeof GEMINI_MODELS)[number];

export type GeminiApiKey = {
  id: string;
  label: string;
  key: string;
};

export async function getGeminiConfig(): Promise<{
  model: GeminiModel;
  keys: GeminiApiKey[];
}> {
  const snap = await adminDb().collection("settings").doc("integrations").get();
  const stored = snap.data()?.gemini as Record<string, unknown> | undefined;
  const rawKeys = Array.isArray(stored?.apiKeys) ? stored.apiKeys : [];
  const keys = rawKeys.flatMap((value): GeminiApiKey[] => {
    if (typeof value !== "object" || value === null) return [];
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.key !== "string" || !item.key.trim()) return [];
    return [{
      id: item.id,
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : "Gemini key",
      key: item.key.trim()
    }];
  });

  const configuredModel = stored?.model;
  const model = typeof configuredModel === "string" &&
    (GEMINI_MODELS as readonly string[]).includes(configuredModel)
    ? configuredModel as GeminiModel
    : "auto";

  const envKey = process.env.GEMINI_API_KEY?.trim();
  if (envKey && !keys.some((item) => item.key === envKey)) {
    keys.push({ id: "environment", label: "Server environment fallback key", key: envKey });
  }
  return { model, keys };
}
