"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { rotularModo } from "@/lib/cs2-labels";
import { cn } from "@/lib/utils";

/**
 * O chip `modo? ▾` de uma sessão sem modo: um toque abre as cinco opções,
 * outro marca. Vive no hero e em cada linha de Sessões — é a mesma peça,
 * no lugar onde o dado falta. Sem frase explicando o bot: a linha de
 * cobertura sob as abas já diz.
 */
const MODOS = ["premier", "competitive", "casual", "scrimcomp2v2", "deathmatch"];

export function MarcarModo({ snapshotId, className }: { snapshotId: string; className?: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const raiz = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [aberto]);

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
      setAberto(false);
      router.refresh();
    } catch {
      setErro("Falha de rede.");
      setOcupado(null);
    }
  }

  return (
    <span ref={raiz} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-ink-muted transition hover:border-accent/60 hover:text-ink"
      >
        modo? <ChevronDown className="size-3" aria-hidden />
      </button>
      {aberto && (
        <span className="absolute top-full left-0 z-20 mt-1 flex min-w-40 flex-col rounded-lg bg-surface-2 p-1 shadow-lg ring-1 ring-line">
          {MODOS.map((m) => (
            <button
              key={m}
              type="button"
              disabled={ocupado !== null}
              onClick={() => marcar(m)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-left text-sm transition hover:bg-surface hover:text-ink disabled:opacity-50",
                ocupado === m ? "text-accent" : "text-ink-muted",
              )}
            >
              {rotularModo(m)}
            </button>
          ))}
          {erro && <span className="px-2.5 py-1 text-xs text-danger">{erro}</span>}
        </span>
      )}
    </span>
  );
}
