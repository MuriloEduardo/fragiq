"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { COOKIE_MODO, TUDO, comModo, resolverModo, type AbaDeModo } from "@/lib/modo";
import type { Cobertura } from "@/lib/modo-servidor";
import { cn } from "@/lib/utils";

/**
 * As áreas do jogo como abas e, na mesma linha, a lente de modo.
 *
 * Uma página só com tudo empilhado era uma rolagem de 12 mil pixels; as
 * abas separam por pergunta — "como foi?", "como estou?", "o que joguei?".
 * A lente fica ao lado delas, e não numa segunda barra, porque não é
 * navegação: é um recorte que vale para todas as abas de uma vez. Sem
 * contagens nas opções (o "1" e o "2" eram convite a tela vazia); a
 * contagem vive na linha de cobertura, que some quando toda sessão tem
 * modo.
 *
 * O modo ativo é resolvido aqui com a mesma regra do servidor (URL, senão
 * cookie, senão tudo); o cookie vem por prop porque o layout o lê.
 */
const ABAS = [
  { seg: "", rotulo: "Resumo" },
  { seg: "estatisticas", rotulo: "Estatísticas" },
  { seg: "sessoes", rotulo: "Sessões" },
  { seg: "partidas", rotulo: "Partidas" },
  { seg: "metricas", rotulo: "Métricas" },
  { seg: "analista", rotulo: "Análises" },
] as const;

export function NavJogo({ appId, abas, cobertura, doCookie }: { appId: number; abas: AbaDeModo[]; cobertura: Cobertura; doCookie?: string }) {
  const pathname = usePathname();
  const daUrl = useSearchParams().get("modo") ?? undefined;
  const modo = resolverModo(daUrl, doCookie, abas);
  const base = `/games/${appId}`;
  const semModo = cobertura.total - cobertura.comModo;

  return (
    <div>
      <div className="-mb-px flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <nav aria-label="Áreas" className="flex gap-1 overflow-x-auto">
          {ABAS.map(({ seg, rotulo }) => {
            const href = seg ? `${base}/${seg}` : base;
            const ativa = seg
              ? pathname === href || pathname.startsWith(`${href}/`) || (seg === "estatisticas" && pathname.startsWith(`${base}/painel/`))
              : pathname === base;
            return (
              <Link
                key={seg}
                href={comModo(href, modo)}
                className={cn(
                  "shrink-0 border-b-2 px-3 py-2.5 text-sm transition",
                  ativa ? "border-accent font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {rotulo}
              </Link>
            );
          })}
        </nav>

        {abas.length > 0 && (
          <div className="flex items-center gap-2 pb-2">
            <span className="hud">Modo</span>
            <div role="radiogroup" aria-label="Modo de jogo" className="flex overflow-x-auto rounded-lg bg-surface-2 p-0.5 ring-1 ring-line">
              {[{ modo: TUDO, rotulo: "Tudo" }, ...abas].map((o) => {
                const ativo = o.modo === modo;
                return (
                  <Link
                    key={o.modo}
                    role="radio"
                    aria-checked={ativo}
                    href={comModo(pathname, o.modo)}
                    onClick={() => {
                      document.cookie = `${COOKIE_MODO}=${encodeURIComponent(o.modo)}; path=/; max-age=${90 * 86400}; samesite=lax`;
                    }}
                    className={cn(
                      "shrink-0 rounded-md px-2.5 py-1 text-xs transition",
                      ativo ? "bg-accent-soft text-accent ring-1 ring-accent/40" : "text-ink-muted hover:text-ink",
                    )}
                  >
                    {o.rotulo}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {cobertura.total > 0 && semModo > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-xs leading-relaxed text-ink-faint">
          <span className="num">
            {cobertura.comModo} de {cobertura.total} {cobertura.total === 1 ? "sessão" : "sessões"} com modo
          </span>
          <span aria-hidden className="text-ink-faint/60">·</span>
          <Link href={`${base}#bot`} className="text-accent hover:underline">
            Adicionar o bot
          </Link>
        </p>
      )}
    </div>
  );
}
