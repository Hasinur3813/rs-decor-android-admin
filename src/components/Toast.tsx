"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

export type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; text: string };

const ToastCtx = createContext<{ toast: (kind: ToastKind, text: string) => void }>({ toast: () => {} });

export const useToast = () => useContext(ToastCtx);

const STYLE: Record<ToastKind, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-slate-200 bg-white text-slate-800"
};

const ICON: Record<ToastKind, string> = { success: "✓", error: "⚠", info: "ℹ" };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(1);

  const toast = useCallback((kind: ToastKind, text: string) => {
    const id = idRef.current++;
    setToasts((prev) => [...prev.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] space-y-2 w-[calc(100%-2.5rem)] max-w-sm">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-soft flex gap-2.5 items-start animate-[slidein_.25s_ease-out] ${STYLE[t.kind]}`}>
            <span className="mt-px">{ICON[t.kind]}</span>
            <span className="flex-1">{t.text}</span>
            <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} className="opacity-50 hover:opacity-100">✕</button>
          </div>
        ))}
      </div>
      <style>{`@keyframes slidein{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}`}</style>
    </ToastCtx.Provider>
  );
}
