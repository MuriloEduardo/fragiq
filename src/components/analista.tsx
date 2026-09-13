"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AnaliseDTO } from "@/lib/analises";
import { formatarQuando } from "@/lib/sessoes";

/**
 * A análise da sessão, sem ninguém pedir.
 *
 * Toda coleta que fecha uma sessão dispara uma leitura do analista — no
 * sync, no cron, no bot, e quando o scoreboard da partida chega do GC.
 * Esta tela mostra a da sessão mais recente em primeiro plano e, se ela
 * ainda não existe (sessão anterior à feature, ou sync que não conseguiu),
 * pede ao abrir. Não há caixa de pergunta: as análises são disparadas por
 * nós, quando há o que analisar, não por quem digita.
 *
 * A resposta vem por callback, então a lista é consultada enquanto há algo
 * em aberto e para quando não há.
 */

const INTERVALO_MS = 2500;

export function Analista({
  appId,
  iniciais,
  sessaoSemAnalise,
  modo = "completo",
}: {
  appId: number;
  iniciais: AnaliseDTO[];
  /** A sessão mais recente ainda não tem análise: pedir ao montar. */
  sessaoSemAnalise: boolean;
  /** "resumo" mostra só a mais recente, com o atalho para o histórico. */
  modo?: "resumo" | "completo";
}) {
  const [analises, setAnalises] = useState<AnaliseDTO[]>(iniciais);
  const pediuSessao = useRef(false);

  const emAberto = analises.some((a) => a.status === "PENDING" || a.status === "ACKNOWLEDGED");

  const recarregar = useCallback(async () => {
    const res = await fetch(`/api/analises?appId=${appId}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { analyses: AnaliseDTO[] };
    setAnalises(data.analyses);
  }, [appId]);

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
      <div className="rounded-2xl bg-surface p-5 ring-1 ring-line">
        {ultima ? (
          <>
            <Quando analise={ultima} />
            <Corpo analise={ultima} />
          </>
        ) : aguardandoSessao ? (
          <Aguardando texto="Pedindo a análise da sessão…" />
        ) : (
          <p className="text-sm text-ink-faint">
            Ainda não há sessão para analisar: é preciso uma coleta com partidas
            entre ela e a anterior.
          </p>
        )}
      </div>

      {modo === "resumo" ? (
        anteriores.length > 0 && (
          <Link
            href={`/games/${appId}/analista`}
            className="mt-3 inline-flex items-center gap-2 text-sm text-ink-faint transition hover:text-ink"
          >
            Análises anteriores ({anteriores.length}) <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )
      ) : (
        anteriores.length > 0 && (
          <ol className="mt-4 space-y-3">
            {anteriores.map((a) => (
              <li key={a.id} className="rounded-2xl bg-surface p-5 ring-1 ring-line">
                <Quando analise={a} />
                <Corpo analise={a} />
              </li>
            ))}
          </ol>
        )
      )}
    </div>
  );
}

function Quando({ analise }: { analise: AnaliseDTO }) {
  const data = analise.sessaoEm ?? analise.createdAt;
  return (
    <p className="hud mb-3" suppressHydrationWarning>
      sessão de {formatarQuando(new Date(data))}
    </p>
  );
}

function Corpo({ analise }: { analise: AnaliseDTO }) {
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
      return <Resposta texto={analise.answer ?? ""} />;
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
 * O agente escreve em texto corrido com, no máximo, negrito e listas. Um
 * renderizador de markdown inteiro traria tabelas e cabeçalhos que não
 * cabem num cartão; o suficiente é parágrafo, `- item` e `**negrito**`.
 */
function Resposta({ texto }: { texto: string }) {
  const blocos = texto.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  return (
    <div className="space-y-2 text-sm leading-relaxed text-ink-muted">
      {blocos.map((bloco, i) => {
        const linhas = bloco.split("\n");
        const lista = linhas.every((l) => /^\s*[-•*]\s+/.test(l));
        if (lista) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {linhas.map((l, j) => (
                <li key={j}>{comNegrito(l.replace(/^\s*[-•*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{comNegrito(linhas.join(" "))}</p>;
      })}
    </div>
  );
}

function comNegrito(texto: string) {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return partes.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-medium text-ink">
        {p.slice(2, -2)}
      </strong>
    ) : (
      p
    ),
  );
}
