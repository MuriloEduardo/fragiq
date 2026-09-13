"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sincronizar, e só.
 *
 * Havia um seletor de modo ao lado: pedia, antes da coleta, o que a pessoa
 * tinha jogado. Ninguém preenchia — zero de quinze coletas — e o bot de
 * presença agora marca mapa e modo sozinho, inclusive quando a coleta foi
 * manual. O que sobra para marcar à mão vive na própria sessão, depois de
 * ela existir.
 */
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
      const res = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error ?? "Falha ao sincronizar.");
        return;
      }

      // "Nada novo" sozinho parece falha. Como os contadores da Steam só são
      // gravados no fim da partida, a ação certa é explícita.
      setMessage(
        data.snapshotsCreated > 0
          ? data.snapshotsCreated === 1
            ? "1 novo ponto na série."
            : `${data.snapshotsCreated} novos pontos na série.`
          : "Nada mudou desde a última coleta — jogue uma partida e sincronize.",
      );
      startTransition(() => router.refresh());
    } catch {
      setMessage("Falha de rede.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2 sm:gap-3", className)}>
      {message && (
        <span className="order-last w-full text-xs text-ink-muted sm:order-none sm:w-auto">
          {message}
        </span>
      )}
      <button
        onClick={sync}
        disabled={running}
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-surface-2 px-3 text-sm font-medium text-ink ring-1 ring-line transition hover:text-accent hover:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:py-2"
      >
        <RefreshCw className={cn("size-4", running && "animate-spin")} />
        {running ? "Sincronizando…" : "Sincronizar"}
      </button>
    </div>
  );
}
