"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ExternalLink, X } from "lucide-react";
import type { Pendencia } from "@/lib/pendencias";

/**
 * O aviso do que falta compartilhar, em toda aba do jogo.
 *
 * No Resumo não aparece: lá o onboarding já conta a mesma história com
 * mais espaço. Cada linha pode ser dispensada por uma semana — o aviso
 * volta, porque o dado continua faltando, mas não a cada clique.
 */
const SILENCIO_MS = 7 * 86_400_000;

export function PendenciasBanner({ pendencias, base }: { pendencias: Pendencia[]; base: string }) {
  const pathname = usePathname();
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const guardado = JSON.parse(localStorage.getItem("fragiq_pendencias") ?? "{}") as Record<string, number>;
      const agora = Date.now();
      setOcultas(new Set(Object.entries(guardado).filter(([, ate]) => ate > agora).map(([id]) => id)));
    } catch {
      /* sem localStorage: o aviso aparece sempre, que é o pior caso aceitável */
    }
  }, []);

  if (pathname === base) return null;
  const visiveis = pendencias.filter((p) => !ocultas.has(p.id));
  if (visiveis.length === 0) return null;

  function dispensar(id: string) {
    const proximas = new Set(ocultas).add(id);
    setOcultas(proximas);
    try {
      const guardado = JSON.parse(localStorage.getItem("fragiq_pendencias") ?? "{}") as Record<string, number>;
      guardado[id] = Date.now() + SILENCIO_MS;
      localStorage.setItem("fragiq_pendencias", JSON.stringify(guardado));
    } catch {
      /* idem */
    }
  }

  return (
    <div className="mb-6 space-y-2">
      {visiveis.map((p) => (
        <div
          key={p.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm"
        >
          <AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{p.titulo}</p>
            <p className="text-ink-muted">{p.texto}</p>
          </div>
          {p.acao.externa ? (
            <a
              href={p.acao.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-canvas transition hover:brightness-110"
            >
              {p.acao.rotulo} <ExternalLink className="size-3" />
            </a>
          ) : (
            <Link
              href={p.acao.href}
              className="inline-flex items-center rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-canvas transition hover:brightness-110"
            >
              {p.acao.rotulo}
            </Link>
          )}
          <button
            type="button"
            onClick={() => dispensar(p.id)}
            className="rounded-md p-1 text-ink-faint transition hover:text-ink"
            aria-label="Dispensar por uma semana"
            title="Dispensar por uma semana"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
