"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Um gesto por botão; depois do gesto, a página recarrega o estado novo. */
export function SeguirBotao({
  steamId,
  acao,
  rotulo,
  primario,
  className,
}: {
  steamId: string;
  acao: "seguir" | "deixar" | "remover";
  rotulo: string;
  primario?: boolean;
  className?: string;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function agir() {
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch("/api/seguir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steamId, acao }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErro(d.error ?? "Não deu.");
        setOcupado(false);
        return;
      }
      window.location.reload();
    } catch {
      setErro("Falha de rede.");
      setOcupado(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={agir}
        disabled={ocupado}
        className={cn(
          "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50",
          primario ? "bg-accent text-canvas hover:brightness-110" : "bg-surface text-ink-muted ring-1 ring-line hover:text-ink hover:ring-accent/60",
          className,
        )}
      >
        {ocupado ? "…" : rotulo}
      </button>
      {erro && <span className="text-xs text-danger">{erro}</span>}
    </span>
  );
}
