export type GeminiFallbackResult =
  | { ok: true; model: string; response: Response }
  | {
      ok: false;
      reason: "rate-limited" | "unauthorized" | "unavailable" | "mixed";
      lastStatus: number;
      attempts: { model: string; status: number | null; reason: GeminiAttemptFailure }[];
    };

type GeminiAttemptFailure = "rate-limited" | "unauthorized" | "unavailable";

export async function requestWithGeminiFallback(
  models: string[],
  keys: string[],
  request: (model: string, key: string) => Promise<Response>
): Promise<GeminiFallbackResult> {
  let lastStatus = 0;
  const failures = new Set<GeminiAttemptFailure>();
  const attempts: { model: string; status: number | null; reason: GeminiAttemptFailure }[] = [];

  for (const model of models) {
    for (const key of keys) {
      try {
        const response = await request(model, key);
        if (response.ok) return { ok: true, model, response };

        lastStatus = response.status;
        const details = await response.text();
        if (response.status === 429) {
          failures.add("rate-limited");
          attempts.push({ model, status: response.status, reason: "rate-limited" });
          continue;
        }
        if (response.status === 401 || response.status === 403) {
          failures.add("unauthorized");
          attempts.push({ model, status: response.status, reason: "unauthorized" });
          continue;
        }
        if (response.status === 400) {
          if (/api.?key|credential|unauthorized/i.test(details)) {
            failures.add("unauthorized");
            attempts.push({ model, status: response.status, reason: "unauthorized" });
            continue;
          }
          failures.add("unavailable");
          attempts.push({ model, status: response.status, reason: "unavailable" });
          if (models.length > 1) continue;
          return { ok: false, reason: "unavailable", lastStatus, attempts };
        }
        if (response.status >= 500 || ([404, 501].includes(response.status) && models.length > 1)) {
          failures.add("unavailable");
          attempts.push({ model, status: response.status, reason: "unavailable" });
          continue;
        }
        failures.add("unavailable");
        attempts.push({ model, status: response.status, reason: "unavailable" });
        return { ok: false, reason: "unavailable", lastStatus, attempts };
      } catch (error) {
        console.error("Gemini fallback attempt failed", {
          model,
          message: error instanceof Error ? error.message : "Unknown provider/network error"
        });
        failures.add("unavailable");
        attempts.push({ model, status: null, reason: "unavailable" });
      }
    }
  }

  if (failures.size === 1 && failures.has("rate-limited")) {
    return { ok: false, reason: "rate-limited", lastStatus, attempts };
  }
  if (failures.size === 1 && failures.has("unauthorized")) {
    return { ok: false, reason: "unauthorized", lastStatus, attempts };
  }
  return {
    ok: false,
    reason: failures.size > 1 ? "mixed" : "unavailable",
    lastStatus,
    attempts
  };
}
