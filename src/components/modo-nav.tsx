"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { COOKIE_MODO, TUDO, comModo, resolverModo, type AbaDeModo, type Modo } from "@/lib/modo";
import { cn } from "@/lib/utils";

/**
 * O submenu de modos, logo abaixo das abas.
 *
 * Um clique troca o modo na URL e o guarda num cookie por 90 dias, para
 * que a aba seguinte (e a visita de amanhã) abra no mesmo recorte. A aba
 * atual é mantida: quem está em Sessões e escolhe Premier continua em
 * Sessões.
 *
 * O modo ativo é resolvido aqui, no cliente, com a mesma regra que as
 * páginas usam no servidor (URL, senão cookie, senão tudo): o layout, que
 * renderiza este menu, não enxerga a URL.
 */
export function ModoNav({ abas, doCookie }: { abas: AbaDeModo[]; doCookie?: string }) {
  const pathname = usePathname();
  const daUrl = useSearchParams().get("modo") ?? undefined;
  if (abas.length === 0) return null;
  const atual = resolverModo(daUrl, doCookie, abas);

  const opcoes: { modo: Modo; rotulo: string; sessoes: number | null }[] = [
    { modo: TUDO, rotulo: "Tudo", sessoes: null },
    ...abas,
  ];

  return (
    <nav aria-label="Modo de jogo" className="flex gap-1.5 overflow-x-auto py-3">
      {opcoes.map((o) => {
        const ativo = o.modo === atual;
        return (
          <Link
            key={o.modo}
            href={comModo(pathname, o.modo)}
            onClick={() => {
              document.cookie = `${COOKIE_MODO}=${encodeURIComponent(o.modo)}; path=/; max-age=${90 * 86400}; samesite=lax`;
            }}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs transition ring-1",
              ativo
                ? "bg-accent-soft text-accent ring-accent/40"
                : "text-ink-muted ring-line hover:text-ink hover:ring-accent/40",
            )}
            aria-current={ativo ? "page" : undefined}
          >
            {o.rotulo}
            {o.sessoes !== null && <span className={cn("num", ativo ? "text-accent/80" : "text-ink-faint")}>{o.sessoes}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
