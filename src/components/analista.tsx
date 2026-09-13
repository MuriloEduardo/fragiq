"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquarePlus, Send, Sparkles } from "lucide-react";
import type { AnaliseDTO } from "@/lib/analises";
import { cn } from "@/lib/utils";

/**
 * A análise da sessão, sem ninguém pedir.
 *
 * Toda coleta que fecha uma sessão dispara uma leitura do analista — no
 * sync, no cron, no bot. Esta tela mostra a da sessão mais recente em
 * primeiro plano e, se ela ainda não existe (sessão anterior à feature, ou
 * sync que não conseguiu), pede ao abrir. Ninguém digita "como fui?".
 *
 * Perguntar continua possível, como acompanhamento: "e no Mirage?", "e a
 * AWP?". Fica dobrado atrás de um link porque é a exceção, não o caminho.
 *
 * A conversa é assíncrona (a resposta vem por callback), então a lista é
 * consultada enquanto há algo em aberto e para quando não há. Uma por vez.
 */

const INTERVALO_MS = 2500;

type Estado = "parado" | "enviando";

export function Analista({
  appId,
  iniciais,
  sessaoSemAnalise,
}: {
  appId: number;
  iniciais: AnaliseDTO[];
  /** A sessão mais recente ainda não tem análise: pedir ao montar. */
  sessaoSemAnalise: boolean;
}) {
  const [analises, setAnalises] = useState<AnaliseDTO[]>(iniciais);
  const [pergunta, setPergunta] = useState("");
  const [perguntando, setPerguntando] = useState(false);
  const [estado, setEstado] = useState<Estado>("parado");
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
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
      body: JSON.stringify({ kind: "SESSION", appId }),
    })
      .then(() => recarregar())
      .catch(() => {});
  }, [sessaoSemAnalise, appId, recarregar]);

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
          kind: "QUESTION",
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

  const sessao = analises.find((a) => a.kind === "SESSION");
  const perguntas = analises.filter((a) => a.kind === "QUESTION");
  const aguardandoSessao = !sessao && sessaoSemAnalise;

  return (
    <section>
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-ink-muted uppercase">
        <Sparkles className="size-4 text-accent" aria-hidden />
        Análise da última sessão
      </h2>
      <p className="mt-1 text-sm text-ink-faint">
        Chega sozinha a cada sessão nova, lendo a mesma série desta página.
      </p>

      <div className="mt-4 rounded-xl border border-line bg-surface p-4">
        {sessao ? (
          <Corpo analise={sessao} />
        ) : aguardandoSessao ? (
          <Aguardando texto="Pedindo a análise da sessão…" />
        ) : (
          <p className="text-sm text-ink-faint">
            Ainda não há sessão para analisar: é preciso uma coleta com partidas
            entre ela e a anterior.
          </p>
        )}
      </div>

      {perguntas.length > 0 && (
        <ol className="mt-3 space-y-3">
          {perguntas.map((a) => (
            <li key={a.id} className="rounded-xl border border-line bg-surface p-4">
              <p className="text-sm font-medium">{a.question}</p>
              <div className="mt-3 border-t border-line-soft pt-3">
                <Corpo analise={a} />
              </div>
            </li>
          ))}
        </ol>
      )}

      {perguntando ? (
        <form onSubmit={enviar} className="mt-3 rounded-xl border border-line bg-surface p-3">
          <textarea
            ref={campo}
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) enviar();
            }}
            rows={2}
            maxLength={1000}
            autoFocus
            placeholder="Ex.: e se eu olhar só o competitivo? A AWP está melhorando?"
            className="w-full resize-y rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none transition focus:border-accent/50"
          />
          <div className="mt-2 flex items-center gap-3">
            {erro && <p className="text-sm text-danger">{erro}</p>}
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
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setPerguntando(true)}
          className="mt-3 inline-flex items-center gap-2 text-sm text-ink-faint transition hover:text-ink"
        >
          <MessageSquarePlus className="size-4" aria-hidden />
          Perguntar algo sobre esta sessão
        </button>
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
          O analista não respondeu. Recarregue a página para pedir de novo.
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
