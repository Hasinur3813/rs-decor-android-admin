"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/client";

type SavedKey = { id: string; label: string; maskedKey: string };
type GeminiSettingsData = {
  keys: SavedKey[];
  panelKeyCount: number;
  keySource: "panel" | "environment" | "none";
  model: string;
  models: string[];
};

export function GeminiSettings() {
  const { toast } = useToast();
  const [data, setData] = useState<GeminiSettingsData | null>(null);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("auto");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await api<GeminiSettingsData>("/api/integrations/gemini");
      setData(result);
      setSelectedModel(result.model);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Gemini settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function addKey() {
    setSaving(true);
    try {
      await api("/api/integrations/gemini", {
        method: "PUT",
        body: JSON.stringify({ action: "add-key", label, key })
      });
      setLabel("");
      setKey("");
      await load();
      toast("success", "Gemini API key added.");
    } catch (cause) {
      toast("error", cause instanceof Error ? cause.message : "Could not add Gemini API key.");
    } finally {
      setSaving(false);
    }
  }

  async function removeKey(id: string) {
    setSaving(true);
    try {
      await api("/api/integrations/gemini", {
        method: "PUT",
        body: JSON.stringify({ action: "remove-key", id })
      });
      await load();
      toast("success", "Gemini API key removed.");
    } catch (cause) {
      toast("error", cause instanceof Error ? cause.message : "Could not remove Gemini API key.");
    } finally {
      setSaving(false);
    }
  }

  async function saveModel() {
    setSaving(true);
    try {
      await api("/api/integrations/gemini", {
        method: "PUT",
        body: JSON.stringify({ action: "save-model", model: selectedModel })
      });
      await load();
      toast("success", "Gemini model preference saved.");
    } catch (cause) {
      toast("error", cause instanceof Error ? cause.message : "Could not save Gemini model.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card mt-4 p-5" aria-labelledby="gemini-settings-title">
      <div className="mb-4">
        <h2 id="gemini-settings-title" className="font-extrabold">✦ Gemini — AI metadata</h2>
        <p className="mt-1 text-xs text-slate-500">Keys are stored server-side in the private integrations document and are never returned to the browser. Requests rotate through configured keys and fall back on rate limits.</p>
      </div>

      {loading && <div className="skeleton h-16 w-full" aria-label="Loading Gemini settings" />}
      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error} <button type="button" className="ml-2 font-bold underline" onClick={() => { void load(); }}>Retry</button>
        </div>
      )}

      {!loading && !error && data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold">API keys ({data.panelKeyCount}/10)</h3>
              <span className="text-[11px] text-slate-500">
                {data.keySource === "panel" ? "Panel keys" : data.keySource === "environment" ? "Using server environment key" : "No key configured"}
              </span>
            </div>
            {data.keys.length > 0 ? (
              <ul className="mb-3 space-y-2">
                {data.keys.map((saved) => (
                  <li key={saved.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{saved.label}</span>
                      <span className="font-mono text-[11px] text-slate-500">{saved.maskedKey}</span>
                    </span>
                    {saved.id !== "environment" && (
                      <button type="button" className="rounded-lg px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50" disabled={saving} onClick={() => { void removeKey(saved.id); }}>
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Add a Gemini API key to enable metadata suggestions.</p>
            )}
            {data.keys.filter((saved) => saved.id !== "environment").length < 10 && (
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                <input className="input" aria-label="API key label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Label (optional)" maxLength={60} disabled={saving} />
                <input className="input font-mono" aria-label="Gemini API key" type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Paste Gemini API key" autoComplete="new-password" disabled={saving} />
                <button type="button" className="btn-gold !px-4" disabled={saving || !key.trim()} onClick={() => { void addKey(); }}>
                  {saving ? "Saving…" : "Add key"}
                </button>
              </div>
            )}
            {data.keySource === "environment" && <p className="text-[11px] text-slate-500">The environment key is kept as a fallback and cannot be removed from this page. Add panel keys above to enable key rotation.</p>}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold">Generation model</h3>
            <label className="label" htmlFor="gemini-model">Model selection</label>
            <select id="gemini-model" className="input" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} disabled={saving}>
              {data.models.map((model) => (
                <option key={model} value={model}>{model === "auto" ? "Auto — fallback across supported models" : model}</option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Auto tries the preferred Flash model, then compatible fallback models. Manual selection uses that model and rotates through keys when a key is rate-limited or unavailable.
            </p>
            <button type="button" className="btn-ghost mt-3" disabled={saving || selectedModel === data.model} onClick={() => { void saveModel(); }}>
              Save model
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
