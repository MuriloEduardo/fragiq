"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function SyncButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const running = busy || pending;

  async function sync() {
    setBusy(true);
    setMessage(null);

    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error ?? "Falha ao sincronizar.");
        return;
      }

      setMessage(
        data.snapshotsCreated > 0
          ? `${data.snapshotsCreated} novo(s) registro(s).`
          : "Tudo em dia — nada novo desde a última coleta.",
      );
      // refresh() revalida os Server Components sem recarregar a página.
      startTransition(() => router.refresh());
    } catch {
      setMessage("Falha de rede.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {message && <span className="text-xs text-ink-muted">{message}</span>}
      <button
        onClick={sync}
        disabled={running}
        className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-medium text-ink transition hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RefreshCw className={cn("size-4", running && "animate-spin")} />
        {running ? "Sincronizando…" : "Sincronizar"}
      </button>
    </div>
  );
}
