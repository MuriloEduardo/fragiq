"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatarBytes } from "@/lib/formato";

/**
 * O visualizador de JSON do painel.
 *
 * Um `<pre>` com `JSON.stringify(x, null, 2)` resolve um payload de dez
 * chaves e falha exatamente onde a dúvida aparece: 197 contadores de uma
 * coleta ou 24 rounds de uma demo viram um paredão onde ninguém acha nada.
 * Daí as três coisas que este componente faz e um `<pre>` não faz: dobra os
 * nós, filtra por caminho ou valor (achatando o resultado, porque procurar
 * "flash" não deve exigir abrir seis níveis) e diz o tamanho de cada ramo.
 *
 * O que ele deliberadamente não faz é interpretar: nenhum valor é
 * formatado, arredondado ou traduzido. Um timestamp aparece como o número
 * que está gravado — se ele estiver em segundos onde devia estar em
 * milissegundos, é isso que se quer ver.
 */
export function JsonBruto({ valor, bytes }: { valor: unknown; bytes: number }) {
  const [filtro, setFiltro] = useState("");
  const [cru, setCru] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const texto = useMemo(() => JSON.stringify(valor, null, 2) ?? "null", [valor]);
  const achatado = useMemo(() => (filtro.trim() ? achatar(valor, filtro.trim().toLowerCase()) : null), [valor, filtro]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="filtrar por caminho ou valor"
          className="min-h-8 min-w-0 flex-1 rounded-lg bg-surface-2 px-3 font-mono text-xs outline-none ring-1 ring-line placeholder:text-ink-faint focus:ring-accent/50"
        />
        <span className="tnum text-[11px] text-ink-faint">{formatarBytes(bytes)}</span>
        <Botao ativo={!cru} onClick={() => setCru(false)}>árvore</Botao>
        <Botao ativo={cru} onClick={() => setCru(true)}>texto</Botao>
        <Botao onClick={copiar}>{copiado ? "copiado" : "copiar"}</Botao>
      </div>

      {cru ? (
        <pre className="max-h-[70vh] overflow-auto px-3 py-3 font-mono text-xs leading-relaxed whitespace-pre text-ink-muted">{texto}</pre>
      ) : achatado ? (
        <div className="max-h-[70vh] overflow-auto px-3 py-2">
          {achatado.length === 0 ? (
            <p className="px-1 py-4 text-xs text-ink-faint">Nada com “{filtro}”.</p>
          ) : (
            <>
              <p className="px-1 pb-2 text-[11px] text-ink-faint">
                {achatado.length} {achatado.length === 1 ? "folha" : "folhas"} · caminho completo
              </p>
              <ul className="font-mono text-xs">
                {achatado.map((f) => (
                  <li key={f.caminho} className="flex gap-2 py-0.5">
                    <span className="shrink-0 text-ink-faint">{f.caminho}</span>
                    <Folha valor={f.valor} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-auto px-3 py-2 font-mono text-xs">
          <No chave={null} valor={valor} nivel={0} />
        </div>
      )}
    </div>
  );
}

function Botao({ children, ativo, onClick }: { children: React.ReactNode; ativo?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-8 rounded-lg px-2.5 text-[11px] ring-1 transition",
        ativo ? "bg-accent-soft text-accent ring-accent/40" : "text-ink-muted ring-line hover:text-ink hover:ring-accent/40",
      )}
    >
      {children}
    </button>
  );
}

/** Nós abertos até aqui por padrão: o bastante para ver a forma, não o conteúdo. */
const ABERTO_ATE = 1;
/** Itens de array mostrados antes do "mais N": 24 rounds cabem, 40 mil tiros não. */
const PAGINA = 30;

function No({ chave, valor, nivel }: { chave: string | null; valor: unknown; nivel: number }) {
  const composto = valor !== null && typeof valor === "object";
  const [aberto, setAberto] = useState(nivel < ABERTO_ATE);
  const [mostrar, setMostrar] = useState(PAGINA);

  if (!composto) {
    return (
      <div className="flex gap-2 py-0.5">
        {chave !== null && <span className="shrink-0 text-ink-muted">{chave}:</span>}
        <Folha valor={valor} />
      </div>
    );
  }

  const arr = Array.isArray(valor);
  const entradas: [string, unknown][] = arr
    ? (valor as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(valor as Record<string, unknown>);
  const resumo = arr ? `[ ${entradas.length} ]` : `{ ${entradas.length} }`;

  return (
    <div className="py-0.5">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-2 text-left hover:text-ink"
      >
        <span className="w-3 shrink-0 text-ink-faint">{aberto ? "▾" : "▸"}</span>
        {chave !== null && <span className="text-ink-muted">{chave}:</span>}
        <span className="text-ink-faint">{resumo}</span>
        {!aberto && !arr && entradas.length > 0 && (
          <span className="truncate text-ink-faint/70">{entradas.slice(0, 6).map(([k]) => k).join(", ")}</span>
        )}
      </button>
      {aberto && (
        <div className="ml-3 border-l border-line-soft pl-3">
          {entradas.slice(0, mostrar).map(([k, v]) => (
            <No key={k} chave={k} valor={v} nivel={nivel + 1} />
          ))}
          {entradas.length > mostrar && (
            <button
              type="button"
              onClick={() => setMostrar((m) => m + PAGINA * 10)}
              className="py-1 text-[11px] text-accent hover:underline"
            >
              mais {entradas.length - mostrar}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Folha({ valor }: { valor: unknown }) {
  if (valor === null) return <span className="text-ink-faint">null</span>;
  switch (typeof valor) {
    case "number":
      return <span className="tnum text-accent">{String(valor)}</span>;
    case "boolean":
      return <span className="text-warn">{String(valor)}</span>;
    case "string":
      return <span className="break-all text-good">&quot;{valor}&quot;</span>;
    default:
      return <span className="text-ink-muted">{String(valor)}</span>;
  }
}

/**
 * Todas as folhas cujo caminho ou valor contém o termo.
 *
 * Achatar em vez de podar a árvore: quem procura `flash` quer ver
 * `rounds.3.cegueiras.0.duracao` numa linha, não descer cinco níveis para
 * confirmar que o número está lá.
 */
function achatar(raiz: unknown, termo: string): { caminho: string; valor: unknown }[] {
  const saida: { caminho: string; valor: unknown }[] = [];
  const limite = 500;

  function andar(v: unknown, caminho: string) {
    if (saida.length >= limite) return;
    if (v !== null && typeof v === "object") {
      const entradas: [string, unknown][] = Array.isArray(v)
        ? v.map((x, i) => [String(i), x])
        : Object.entries(v as Record<string, unknown>);
      for (const [k, filho] of entradas) andar(filho, caminho ? `${caminho}.${k}` : k);
      return;
    }
    if (caminho.toLowerCase().includes(termo) || String(v).toLowerCase().includes(termo)) {
      saida.push({ caminho, valor: v });
    }
  }

  andar(raiz, "");
  return saida;
}

