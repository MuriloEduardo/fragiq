"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { rotularModo } from "./context-filter";
import { cn } from "@/lib/utils";

/**
 * Modos que valem marcar à mão.
 *
 * As chaves são as que o rich presence do CS2 publica, iguais às que o bot
 * gravava — o rótulo sai do mesmo dicionário do filtro, para os dois lados
 * nunca divergirem. A lista é curta de propósito: modo raro marcado errado
 * suja a série mais do que ficar sem marcação.
 */
const MODOS = [
  "competitive",
  "premier",
  "casual",
  "deathmatch",
  "scrimcomp2v2",
  "gungameprogressive",
  "training",
];

export function SyncButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Não zera após sincronizar: quem joga três competitivas seguidas marca uma
  // vez só.
  const [modo, setModo] = useState("");

  const running = busy || pending;

  async function sync() {
    setBusy(true);
    setMessage(null);

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modo ? { mode: modo } : {}),
      });
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
      // refresh() revalida os Server Components sem recarregar a página.
      startTransition(() => router.refresh());
    } catch {
      setMessage("Falha de rede.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2 sm:gap-3", className)}>
      {/* No celular a mensagem desce para uma linha própria: espremida ao
          lado dos controles ela roubaria a largura do seletor. */}
      {message && (
        <span className="order-last w-full text-xs text-ink-muted sm:order-none sm:w-auto">
          {message}
        </span>
      )}
      <select
        value={modo}
        onChange={(e) => setModo(e.target.value)}
        disabled={running}
        aria-label="Modo jogado desde a última coleta"
        title="Opcional. Marca o que foi jogado desde a última coleta, para o recorte por modo."
        className="min-h-11 flex-1 rounded-lg border border-line bg-surface-2 px-2 text-sm text-ink-muted transition hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:flex-none sm:py-2"
      >
        <option value="">Sem modo</option>
        {MODOS.map((m) => (
          <option key={m} value={m}>
            {rotularModo(m)}
          </option>
        ))}
      </select>
      <button
        onClick={sync}
        disabled={running}
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-sm font-medium text-ink transition hover:border-accent/50 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:py-2"
      >
        <RefreshCw className={cn("size-4", running && "animate-spin")} />
        {running ? "Sincronizando…" : "Sincronizar"}
      </button>
    </div>
  );
}
