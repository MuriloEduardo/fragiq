"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rotularModo } from "@/lib/cs2-labels";
import { cn } from "@/lib/utils";

/**
 * "Essa sessão foi…" — a pergunta no lugar certo: depois da sessão, na
 * própria sessão, só quando o bot não marcou. Um toque e o recorte por modo
 * passa a valer para ela.
 */
const MODOS = ["competitive", "premier", "casual", "deathmatch", "scrimcomp2v2"];

export function MarcarModo({ snapshotId }: { snapshotId: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function marcar(mode: string) {
    setOcupado(mode);
    setErro(null);
    try {
      const res = await fetch("/api/sessoes/contexto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId, mode }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErro(d.error ?? "Não deu para marcar.");
        setOcupado(null);
        return;
      }
      router.refresh();
    } catch {
      setErro("Falha de rede.");
      setOcupado(null);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-ink-muted">Essa sessão foi…</span>
      {MODOS.map((m) => (
        <button
          key={m}
          type="button"
          disabled={ocupado !== null}
          onClick={() => marcar(m)}
          className={cn(
            "rounded-full px-3 py-1 text-xs ring-1 ring-line transition hover:ring-accent/60 hover:text-ink disabled:opacity-50",
            ocupado === m ? "bg-accent-soft text-accent" : "text-ink-muted",
          )}
        >
          {rotularModo(m)}
        </button>
      ))}
      <span className="text-xs text-ink-faint">o bot marca sozinho quando é seu amigo</span>
      {erro && <span className="text-xs text-danger">{erro}</span>}
    </div>
  );
}
