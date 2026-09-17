"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AnaliseDTO } from "@/lib/analises";
import { lerAnalise, lerAnaliseEstruturada, type Achado } from "@/lib/analise-texto";
import { formatarNumero, formatarQuando } from "@/lib/formato";
import { calcularDelta } from "@/lib/delta";
import { DeltaChip } from "@/components/delta-chip";
import { cn } from "@/lib/utils";

/**
 * A análise de cada sessão, um cartão por sessão.
 *
 * Toda coleta que fecha uma sessão dispara uma leitura do analista — no
 * sync, no cron, no bot, e quando o scoreboard da partida chega do GC.
 * Não há caixa de pergunta: as análises são disparadas por nós.
 *
 * O cartão é desenhado, não lido (docs/dados-confiaveis.md §4): contexto
 * numa linha, a manchete numa linha, os três números da sessão contra a
 * referência como tiles com chip, os achados do agente como barras valor ×
 * referência, e causa e ação numa linha cada. Análises antigas em prosa
 * ficam colapsadas numa linha, com "ler" para quem quiser o texto.
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
        {s && analise.status === "ANSWERED" && <Tiles sessao={s} />}
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

/** Os três números da sessão, cada um contra a sua referência: o "quanto" em tiles. */
function Tiles({ sessao: s }: { sessao: NonNullable<AnaliseDTO["sessao"]> }) {
  const tiles = [
    { rotulo: "K/D", valor: s.kd, ref: s.referencia.kd, casas: 2, unit: undefined },
    { rotulo: "Dano/round", valor: s.danoPorRound, ref: s.referencia.danoPorRound, casas: 0, unit: undefined },
    { rotulo: "HS", valor: s.hs, ref: s.referencia.hs, casas: 0, unit: "%" },
  ];
  return (
    <div className="mb-3 grid grid-cols-3 gap-2">
      {tiles.map((t) => {
        const normal = t.ref === null ? ({ tipo: "nenhum", motivo: "sem-sessoes" } as const) : ({ tipo: "vitalicio", valor: t.ref, rotulo: "vitalício" } as const);
        const delta = calcularDelta({ unit: t.unit, melhorQuando: "sobe" }, t.valor, normal, s.rounds < 10);
        return (
          <div key={t.rotulo} className="rounded-xl bg-surface-2/60 px-3 py-2">
            <p className="hud text-[10px]">{t.rotulo}</p>
            <p className="num flex items-baseline gap-2 text-lg font-semibold">
              {t.valor === null ? "—" : `${formatarNumero(t.valor, t.casas)}${t.unit ?? ""}`}
              <DeltaChip delta={delta} />
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** Um achado do agente: rótulo, valor contra referência em duas barras, chip. */
function AchadoLinha({ achado: a }: { achado: Achado }) {
  const normal = a.referencia === null ? ({ tipo: "nenhum", motivo: "sem-sessoes" } as const) : ({ tipo: "vitalicio", valor: a.referencia, rotulo: "vitalício" } as const);
  const delta = calcularDelta({ unit: a.unidade === "%" ? "%" : undefined, melhorQuando: a.melhorQuando }, a.valor, normal);
  const max = Math.max(Math.abs(a.valor), Math.abs(a.referencia ?? 0)) || 1;
  const casas = a.unidade === "n" ? 0 : Math.abs(a.valor) >= 10 ? 0 : 2;
  const fmt = (v: number) => `${formatarNumero(v, casas)}${a.unidade === "%" ? "%" : ""}`;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-sm" title={a.nota ?? a.rotulo}>
          <span className="font-medium text-ink">{a.rotulo}</span>
          {a.nota && <span className="text-ink-faint"> · {a.nota}</span>}
        </p>
        <div className="mt-1 flex flex-col gap-0.5" aria-hidden>
          <span className="h-1.5 rounded bg-accent" style={{ width: `${Math.max(4, (Math.abs(a.valor) / max) * 100)}%` }} />
          {a.referencia !== null && <span className="h-1.5 rounded bg-ink-faint/50" style={{ width: `${Math.max(4, (Math.abs(a.referencia) / max) * 100)}%` }} />}
        </div>
      </div>
      <p className="num flex items-center gap-2 text-sm whitespace-nowrap">
        <span className="font-semibold">{fmt(a.valor)}</span>
        {a.referencia !== null && <span className="text-ink-faint">vs {fmt(a.referencia)}</span>}
        <DeltaChip delta={delta} />
      </p>
    </li>
  );
}

function Resposta({ texto, colapsado }: { texto: string; colapsado: boolean }) {
  const estruturada = lerAnaliseEstruturada(texto);
  if (estruturada) {
    return (
      <div>
        <p className="truncate text-xl font-semibold tracking-tight text-ink" title={estruturada.manchete}>{estruturada.manchete}</p>
        {estruturada.achados.length > 0 && (
          <ul className="mt-2 divide-y divide-line-soft">
            {estruturada.achados.map((a, i) => <AchadoLinha key={i} achado={a} />)}
          </ul>
        )}
        {estruturada.causa && (
          <p className="mt-2 truncate text-sm text-ink-muted" title={estruturada.causa}>
            <span className="hud mr-2">porque</span>{estruturada.causa}
          </p>
        )}
        {estruturada.acao && <Acao texto={estruturada.acao} />}
      </div>
    );
  }
  return <RespostaLegada texto={texto} colapsado={colapsado} />;
}

function Acao({ texto }: { texto: string }) {
  return (
    <p className="mt-3 flex items-center gap-2.5 rounded-xl border border-accent/30 bg-accent-soft/60 px-4 py-2.5 text-sm text-ink">
      <ArrowRight className="size-4 shrink-0 text-accent" aria-hidden />
      <span className="hud text-accent">próxima</span>
      <span className="truncate" title={texto}>{comNegrito(texto)}</span>
    </p>
  );
}

/**
 * Análises anteriores a 17/09/2026 vieram em prosa. Ficam numa linha —
 * manchete ou primeira frase — com "ler" para abrir o texto; a ação, que
 * sempre foi uma linha, continua em destaque.
 */
function RespostaLegada({ texto, colapsado }: { texto: string; colapsado: boolean }) {
  const { manchete, paragrafos, acao } = lerAnalise(texto);
  const [aberto, setAberto] = useState(false);
  const primeira = manchete ?? paragrafos[0]?.split(/(?<=[.!?])\s/)[0] ?? "";
  void colapsado;
  return (
    <div>
      <p className="flex items-baseline gap-2">
        <span className="min-w-0 truncate text-base font-medium text-ink" title={primeira}>{comNegrito(primeira)}</span>
        {paragrafos.length > 0 && (
          <button type="button" onClick={() => setAberto((v) => !v)} className="shrink-0 text-xs text-ink-faint transition hover:text-ink">
            {aberto ? "fechar ▴" : "ler ▾"}
          </button>
        )}
      </p>
      {aberto && (
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-muted">
          {paragrafos.map((bloco, i) => <p key={i}>{comNegrito(bloco.replace(/^\s*[-•*]\s+/gm, "").split("\n").join(" "))}</p>)}
        </div>
      )}
      {acao && <Acao texto={acao} />}
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
