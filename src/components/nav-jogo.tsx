"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * As áreas do jogo, como abas.
 *
 * Uma página só com tudo empilhado era uma rolagem de 12 mil pixels em que
 * o painel, as leituras e a tabela de 178 métricas disputavam a mesma
 * atenção. Separar por pergunta — "como foi?", "como estou?", "o que
 * joguei?", "o contador X", "pergunte" — é o que deixa cada tela curta.
 */
const ABAS = [
  { seg: "", rotulo: "Resumo" },
  { seg: "estatisticas", rotulo: "Estatísticas" },
  { seg: "sessoes", rotulo: "Sessões" },
  { seg: "metricas", rotulo: "Métricas" },
  { seg: "analista", rotulo: "Analista" },
] as const;

export function NavJogo({ appId }: { appId: number }) {
  const pathname = usePathname();
  const base = `/games/${appId}`;

  return (
    <nav aria-label="Áreas" className="-mb-px flex gap-1 overflow-x-auto">
      {ABAS.map(({ seg, rotulo }) => {
        const href = seg ? `${base}/${seg}` : base;
        const ativa = seg
          ? pathname === href || pathname.startsWith(`${href}/`) || (seg === "estatisticas" && pathname.startsWith(`${base}/painel/`))
          : pathname === base;
        return (
          <Link
            key={seg}
            href={href}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2.5 text-sm transition",
              ativa
                ? "border-accent font-medium text-ink"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
