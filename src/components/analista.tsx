"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import type { AnaliseDTO } from "@/lib/analises";
import { cn } from "@/lib/utils";

/**
 * Pergunte ao analista.
 *
 * As leituras dizem o que os números dizem; aqui a pessoa pergunta o que
 * quiser, e o agente do cogniflow responde consultando a mesma série. A
 * conversa é assíncrona — a resposta vem por callback — então a tela
 * consulta a lista enquanto há pergunta em aberto e para quando não há.
 *
 * Uma pergunta por vez: é o contrato do callback (a resposta chega sem
 * dizer a qual pergunta pertence) e também o ritmo certo para uma conversa.
 */

const INTERVALO_MS = 2500;

const SUGESTOES = [
  "Como fui esta semana comparado ao meu normal?",
  "Em que mapa eu mais caio, e por quê?",
  "Minha precisão com AK-47 está melhorando?",
];

type Estado = "parado" | "enviando";

export function Analista({ appId, iniciais }: { appId: number; iniciais: AnaliseDTO[] }) {
  const [analises, setAnalises] = useState<AnaliseDTO[]>(iniciais);
  const [pergunta, setPergunta] = useState("");
  const [estado, setEstado] = useState<Estado>("parado");
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  const emAberto = analises.some((a) => a.status === "PENDING" || a.status === "ACKNOWLEDGED");

  const recarregar = useCallback(async () => {
    const res = await fetch(`/api/analises?appId=${appId}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { analyses: AnaliseDTO[] };
    setAnalises(data.analyses);
  }, [appId]);

  useEffect(() => {
    if (!emAberto) return;
    const id = setInterval(recarregar, INTERVALO_MS);
    return () => clearInterval(id);
  }, [emAberto, recarregar]);

  async function enviar(e?: React.FormEvent) {
    e?.preventDefault();
    const texto = pergunta.trim();
    if (texto.length < 4 || estado === "enviando" || emAberto) return;

    setEstado("enviando");
    setErro(null);
    try {
      const res = await fetch("/api/analises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, question: texto }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error ?? "Não foi possível perguntar.");
        return;
      }
      setPergunta("");
      setAnalises((atual) => [
        {
          id: data.id,
          question: texto,
          answer: null,
          status: "PENDING",
          createdAt: new Date().toISOString(),
          answeredAt: null,
        },
        ...atual,
      ]);
    } catch {
      setErro("Falha de rede.");
    } finally {
      setEstado("parado");
    }
  }

  function sugerir(texto: string) {
    setPergunta(texto);
    campo.current?.focus();
  }

  return (
    <section>
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-ink-muted uppercase">
        <Sparkles className="size-4 text-accent" aria-hidden />
        Pergunte ao analista
      </h2>
      <p className="mt-1 text-sm text-ink-faint">
        Ele lê a mesma série que está nesta página e responde em segundos.
      </p>

      <form onSubmit={enviar} className="mt-4 rounded-xl border border-line bg-surface p-3">
        <textarea
          ref={campo}
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) enviar();
          }}
          rows={2}
          maxLength={1000}
          placeholder="Ex.: por que meu K/D caiu nas últimas partidas?"
          className="w-full resize-y rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none transition focus:border-accent/50"
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {SUGESTOES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => sugerir(s)}
              className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted transition hover:border-ink-faint hover:text-ink"
            >
              {s}
            </button>
          ))}

          <button
            type="submit"
            disabled={estado === "enviando" || emAberto || pergunta.trim().length < 4}
            className={cn(
              "ml-auto inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-canvas transition",
              "disabled:cursor-not-allowed disabled:opacity-40",
              estado !== "enviando" && "hover:brightness-110",
            )}
          >
            <Send className="size-3.5" aria-hidden />
            {estado === "enviando" ? "Enviando…" : emAberto ? "Aguardando…" : "Perguntar"}
          </button>
        </div>

        {erro && <p className="mt-2 text-sm text-danger">{erro}</p>}
      </form>

      {analises.length > 0 && (
        <ol className="mt-4 space-y-3">
          {analises.map((a) => (
            <li key={a.id} className="rounded-xl border border-line bg-surface p-4">
              <p className="text-sm font-medium">{a.question}</p>
              <div className="mt-3 border-t border-line-soft pt-3">
                <Corpo analise={a} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
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
          O analista não respondeu. Tente perguntar de novo.
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
