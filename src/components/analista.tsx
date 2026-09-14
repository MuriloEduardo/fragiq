"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AnaliseDTO } from "@/lib/analises";
import { lerAnalise } from "@/lib/analise-texto";
import { formatarQuando } from "@/lib/formato";
import { cn } from "@/lib/utils";

/**
 * A análise de cada sessão, um cartão por sessão.
 *
 * Toda coleta que fecha uma sessão dispara uma leitura do analista — no
 * sync, no cron, no bot, e quando o scoreboard da partida chega do GC.
 * Não há caixa de pergunta: as análises são disparadas por nós.
 *
 * O cartão responde "por quê, e o que fazer"; "quanto?" é do hero. Por
 * isso não há números em bloco aqui: contexto numa linha, a manchete
 * quando o analista a marcou, o corpo (duas linhas no Resumo, com "ler
 * análise"; aberto na aba Análises) e a ação em destaque. Sem `glow`: o
 * da tela é o hero.
 *
 * A resposta vem por callback, então a lista é consultada enquanto há algo
 * em aberto e para quando não há.
 */

const INTERVALO_MS = 2500;

export function Analista({
  appId,
  iniciais,
  sessaoSemAnalise,
  apresentacao = "completa",
  modo,
}: {
  appId: number;
  iniciais: AnaliseDTO[];
  /** A sessão mais recente ainda não tem análise: pedir ao montar. */
  sessaoSemAnalise: boolean;
  /** "resumo" mostra só a mais recente, colapsada, com o atalho para o histórico. */
  apresentacao?: "resumo" | "completa";
  /** O modo do submenu, para a consulta de atualização trazer a mesma lista. */
  modo?: string;
}) {
  const [analises, setAnalises] = useState<AnaliseDTO[]>(iniciais);
  const pediuSessao = useRef(false);

  useEffect(() => setAnalises(iniciais), [iniciais]);

  const emAberto = analises.some((a) => a.status === "PENDING" || a.status === "ACKNOWLEDGED");

  const recarregar = useCallback(async () => {
    const query = new URLSearchParams({ appId: String(appId) });
    if (modo && modo !== "tudo") query.set("modo", modo);
    const res = await fetch(`/api/analises?${query}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { analyses: AnaliseDTO[] };
    setAnalises(data.analyses);
  }, [appId, modo]);

  const pedir = useCallback(async () => {
    await fetch("/api/analises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId }),
    }).catch(() => {});
    await recarregar();
  }, [appId, recarregar]);

  useEffect(() => {
    if (!sessaoSemAnalise || pediuSessao.current) return;
    pediuSessao.current = true;
    void pedir();
  }, [sessaoSemAnalise, pedir]);

  useEffect(() => {
    if (!emAberto) return;
    const id = setInterval(recarregar, INTERVALO_MS);
    return () => clearInterval(id);
  }, [emAberto, recarregar]);

  const sessoes = analises.filter((a) => a.kind === "SESSION");
  const [ultima, ...anteriores] = sessoes;
  const aguardandoSessao = !ultima && sessaoSemAnalise;

  return (
    <div>
      {ultima ? (
        <Cartao analise={ultima} colapsado={apresentacao === "resumo"} pedir={pedir} />
      ) : (
        <div className="rounded-2xl bg-surface p-5 ring-1 ring-line">
          {aguardandoSessao ? <Skeleton /> : <p className="text-sm text-ink-faint">Sem sessão para analisar ainda.</p>}
        </div>
      )}

      {apresentacao === "resumo" ? (
        anteriores.length > 0 && (
          <Link
            href={`/games/${appId}/analista${modo && modo !== "tudo" ? `?modo=${modo}` : ""}`}
            className="mt-3 inline-flex items-center gap-2 text-sm text-ink-faint transition hover:text-ink"
          >
            Análises anteriores ({anteriores.length}) <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )
      ) : (
        anteriores.length > 0 && (
          <>
            <p className="hud mt-8 mb-3">Anteriores</p>
            <ol className="space-y-3">
              {anteriores.map((a) => (
                <li key={a.id}>
                  <Cartao analise={a} colapsado pedir={pedir} />
                </li>
              ))}
            </ol>
          </>
        )
      )}
    </div>
  );
}

/* --------------------------------- cartão -------------------------------- */

function Cartao({ analise, colapsado, pedir }: { analise: AnaliseDTO; colapsado: boolean; pedir: () => Promise<void> }) {
  const data = new Date(analise.sessaoEm ?? analise.createdAt);
  const s = analise.sessao;

  return (
    <article className="rounded-2xl bg-surface p-5 ring-1 ring-line">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {s?.modoRotulo && <Chip forte>● {s.modoRotulo}</Chip>}
        {s?.mapa && <Chip>{s.mapa}</Chip>}
        {s?.placar && <Chip>{s.placar}</Chip>}
        {s && (
          <span className="tnum text-xs text-ink-faint">
            {s.partidas ? `${s.partidas} ${s.partidas === 1 ? "partida" : "partidas"} · ` : ""}
            {s.rounds} r
          </span>
        )}
        <time className="tnum ml-auto text-xs text-ink-faint" dateTime={data.toISOString()} suppressHydrationWarning>
          {formatarQuando(data)}
        </time>
      </header>

      <div className="mt-3">
        <Corpo analise={analise} colapsado={colapsado} pedir={pedir} />
      </div>
    </article>
  );
}

function Chip({ children, forte = false }: { children: React.ReactNode; forte?: boolean }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs ring-1", forte ? "bg-accent-soft text-accent ring-accent/40" : "text-ink-muted ring-line")}>
      {children}
    </span>
  );
}

function Corpo({ analise, colapsado, pedir }: { analise: AnaliseDTO; colapsado: boolean; pedir: () => Promise<void> }) {
  switch (analise.status) {
    case "PENDING":
    case "ACKNOWLEDGED":
      return <Skeleton />;
    case "FAILED":
      return <Falhou pedir={pedir} />;
    case "ANSWERED":
      return <Resposta texto={analise.answer ?? ""} colapsado={colapsado} />;
  }
}

function Skeleton() {
  return (
    <div className="space-y-2" aria-label="Lendo a sua série…" role="status">
      <div className="h-6 w-1/2 animate-pulse rounded bg-surface-2" />
      <div className="h-3 w-4/5 animate-pulse rounded bg-surface-2" />
      <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-surface-2" />
    </div>
  );
}

function Falhou({ pedir }: { pedir: () => Promise<void> }) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="hud">Sem análise desta vez</p>
      <button
        type="button"
        disabled={ocupado}
        onClick={() => {
          setOcupado(true);
          void pedir().finally(() => setOcupado(false));
        }}
        className="text-sm text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent disabled:opacity-50"
      >
        Pedir de novo
      </button>
    </div>
  );
}

/**
 * Manchete quando marcada, parágrafos com ar, ação em destaque. O agente
 * escreve com, no máximo, negrito e listas; um renderizador de markdown
 * inteiro traria tabelas e cabeçalhos que não cabem num cartão.
 */
function Resposta({ texto, colapsado }: { texto: string; colapsado: boolean }) {
  const { manchete, paragrafos, acao } = lerAnalise(texto);
  const [aberto, setAberto] = useState(!colapsado);
  const linhas = manchete ? 2 : 3;

  return (
    <div>
      {manchete && <p className="text-xl font-semibold tracking-tight text-ink">{comNegrito(manchete)}</p>}
      <div className={cn("relative space-y-3 text-[15px] leading-relaxed text-ink-muted", manchete && "mt-2", !aberto && (linhas === 2 ? "line-clamp-2" : "line-clamp-3"))}>
        {paragrafos.map((bloco, i) => {
          const itens = bloco.split("\n");
          const lista = itens.every((l) => /^\s*[-•*]\s+/.test(l));
          if (lista) {
            return (
              <ul key={i} className="space-y-1.5 pl-1">
                {itens.map((l, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-ink-faint" aria-hidden />
                    <span>{comNegrito(l.replace(/^\s*[-•*]\s+/, ""))}</span>
                  </li>
                ))}
              </ul>
            );
          }
          return <p key={i}>{comNegrito(itens.join(" "))}</p>;
        })}
      </div>
      {!aberto && paragrafos.length > 0 && (
        <button type="button" onClick={() => setAberto(true)} className="mt-1 text-xs text-ink-faint transition hover:text-ink">
          ler análise ▾
        </button>
      )}
      {acao && (
        <p className="mt-4 flex gap-2.5 rounded-xl border border-accent/30 bg-accent-soft/60 px-4 py-3 text-sm text-ink">
          <ArrowRight className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <span>
            <span className="hud mr-2 text-accent">próxima</span>
            {comNegrito(acao)}
          </span>
        </p>
      )}
    </div>
  );
}

function comNegrito(texto: string) {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return partes.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink">
        {p.slice(2, -2)}
      </strong>
    ) : (
      p
    ),
  );
}
