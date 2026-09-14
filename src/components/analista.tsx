"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AnaliseDTO, SessaoDaAnalise } from "@/lib/analises";
import { lerAnalise } from "@/lib/analise-texto";
import { formatarQuando } from "@/lib/sessoes";
import { cn } from "@/lib/utils";

/**
 * A análise de cada sessão, um cartão por sessão.
 *
 * Toda coleta que fecha uma sessão dispara uma leitura do analista — no
 * sync, no cron, no bot, e quando o scoreboard da partida chega do GC.
 * Não há caixa de pergunta: as análises são disparadas por nós, quando há
 * o que analisar, não por quem digita.
 *
 * O cartão põe a sessão antes do texto: modo, mapa e placar em cima, os
 * três números com a distância do normal logo abaixo — para que quem lê a
 * manchete já saiba de que noite se fala. O texto vem em partes
 * (`lerAnalise`): manchete grande, parágrafos com ar, a ação em destaque
 * no fim. É a diferença entre uma leitura e um paredão.
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
  /** "resumo" mostra só a mais recente, com o atalho para o histórico. */
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

  useEffect(() => {
    if (!sessaoSemAnalise || pediuSessao.current) return;
    pediuSessao.current = true;
    fetch("/api/analises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId }),
    })
      .then(() => recarregar())
      .catch(() => {});
  }, [sessaoSemAnalise, appId, recarregar]);

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
        <Cartao analise={ultima} destaque />
      ) : (
        <div className="rounded-2xl bg-surface p-5 ring-1 ring-line">
          {aguardandoSessao ? (
            <Aguardando texto="Pedindo a análise da sessão…" />
          ) : (
            <p className="text-sm text-ink-faint">
              Ainda não há sessão para analisar: é preciso uma coleta com partidas entre ela e a anterior.
            </p>
          )}
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
                  <Cartao analise={a} />
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

function Cartao({ analise, destaque = false }: { analise: AnaliseDTO; destaque?: boolean }) {
  const data = new Date(analise.sessaoEm ?? analise.createdAt);
  const s = analise.sessao;

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl bg-surface ring-1 ring-line",
        destaque && "glow",
      )}
    >
      {destaque && <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />}
      <div className={cn("relative", destaque ? "p-5 sm:p-7" : "p-5")}>
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {s?.modoRotulo && <Chip forte>{s.modoRotulo}</Chip>}
          {s?.mapa && <Chip>{s.mapa}</Chip>}
          {s?.placar && <Chip>{s.placar}</Chip>}
          {s && (
            <span className="tnum text-xs text-ink-faint">
              {s.rounds} rounds{s.partidas ? ` · ${s.partidas} partida${s.partidas === 1 ? "" : "s"}` : ""} · {s.minutos} min
            </span>
          )}
          <time className="tnum ml-auto text-xs text-ink-faint" dateTime={data.toISOString()} suppressHydrationWarning>
            {formatarQuando(data)}
          </time>
        </header>

        {s && <Numeros sessao={s} grande={destaque} />}

        <div className={cn(s ? "mt-5" : "mt-3")}>
          <Corpo analise={analise} destaque={destaque} />
        </div>
      </div>
    </article>
  );
}

function Chip({ children, forte = false }: { children: React.ReactNode; forte?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs ring-1",
        forte ? "bg-accent-soft text-accent ring-accent/40" : "text-ink-muted ring-line",
      )}
    >
      {children}
    </span>
  );
}

function Numeros({ sessao, grande }: { sessao: SessaoDaAnalise; grande: boolean }) {
  const numeros = [
    { rotulo: "K/D", valor: sessao.kd, ref: sessao.referencia.kd, fmt: (v: number) => v.toFixed(2).replace(".", ",") },
    { rotulo: "Dano / round", valor: sessao.danoPorRound, ref: sessao.referencia.danoPorRound, fmt: (v: number) => v.toFixed(0) },
    { rotulo: "Headshot", valor: sessao.hs, ref: sessao.referencia.hs, fmt: (v: number) => `${v.toFixed(0)}%` },
  ];
  const normal = sessao.modo ? `normal no ${sessao.modoRotulo}` : "vitalício";

  return (
    <div className="mt-4 grid grid-cols-3 gap-3">
      {numeros.map((n) => {
        const delta = n.valor !== null && n.ref ? (n.valor - n.ref) / Math.abs(n.ref) : null;
        const sobe = delta !== null && delta > 0.005;
        const cai = delta !== null && delta < -0.005;
        return (
          <div key={n.rotulo} className="rounded-xl bg-surface-2/60 px-3 py-2.5">
            <p className="hud">{n.rotulo}</p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <p className={cn("num font-semibold", grande ? "text-2xl sm:text-3xl" : "text-xl")}>
                {n.valor === null ? "—" : n.fmt(n.valor)}
              </p>
              {delta !== null && (
                <span
                  className={cn(
                    "num text-xs font-medium",
                    sobe && "text-accent",
                    cai && "text-ink-muted",
                    !sobe && !cai && "text-ink-faint",
                  )}
                >
                  {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {Math.abs(delta * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <p className="num mt-0.5 truncate text-[11px] text-ink-faint" title={n.ref === null ? undefined : `${normal}: ${n.fmt(n.ref)}`}>
              {n.ref === null ? `sem ${normal}` : `${normal} ${n.fmt(n.ref)}`}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Corpo({ analise, destaque }: { analise: AnaliseDTO; destaque: boolean }) {
  switch (analise.status) {
    case "PENDING":
      return <Aguardando texto="Enviando ao analista…" />;
    case "ACKNOWLEDGED":
      return <Aguardando texto="Lendo a sua série…" />;
    case "FAILED":
      return (
        <p className="text-sm text-danger">
          O analista não respondeu desta vez. A próxima sessão gera outra análise.
        </p>
      );
    case "ANSWERED":
      return <Resposta texto={analise.answer ?? ""} destaque={destaque} />;
  }
}

function Aguardando({ texto }: { texto: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-ink-faint">
      <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden />
      {texto}
    </p>
  );
}

/**
 * Manchete grande, parágrafos com ar, ação em destaque. O agente escreve
 * com, no máximo, negrito e listas; um renderizador de markdown inteiro
 * traria tabelas e cabeçalhos que não cabem num cartão.
 */
function Resposta({ texto, destaque }: { texto: string; destaque: boolean }) {
  const { manchete, paragrafos, acao } = lerAnalise(texto);

  return (
    <div>
      {manchete && (
        <p className={cn("font-semibold tracking-tight text-ink", destaque ? "text-xl sm:text-2xl" : "text-lg")}>
          {comNegrito(manchete)}
        </p>
      )}
      <div className={cn("space-y-3 text-sm leading-relaxed text-ink-muted sm:text-[15px]", manchete && "mt-3")}>
        {paragrafos.map((bloco, i) => {
          const linhas = bloco.split("\n");
          const lista = linhas.every((l) => /^\s*[-•*]\s+/.test(l));
          if (lista) {
            return (
              <ul key={i} className="space-y-1.5 pl-1">
                {linhas.map((l, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-ink-faint" aria-hidden />
                    <span>{comNegrito(l.replace(/^\s*[-•*]\s+/, ""))}</span>
                  </li>
                ))}
              </ul>
            );
          }
          return <p key={i}>{comNegrito(linhas.join(" "))}</p>;
        })}
      </div>
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
