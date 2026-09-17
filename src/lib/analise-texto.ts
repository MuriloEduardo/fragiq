/**
 * A resposta do analista, lida em partes.
 *
 * O prompt pede uma forma fixa: a manchete **em negrito** na primeira
 * linha, dois ou três parágrafos curtos, e uma última linha começando com
 * "→" com a ação para a próxima sessão. Isto reconhece essa forma — e só
 * ela. Uma manchete é manchete quando vem marcada (`**…**` inteira ou
 * `# `), com até 90 caracteres e sem dois-pontos no fim; um primeiro
 * parágrafo curto não vira título por ser curto. Foi assim que uma
 * introdução de 24 px apareceu em produção: heurística promovendo prosa.
 * Análises antigas e respostas desobedientes começam pelo corpo.
 */
import { z } from "zod";

export type AnaliseLida = {
  manchete: string | null;
  paragrafos: string[];
  acao: string | null;
};

/**
 * A forma estruturada (prompt v4, 17/09/2026): o agente responde JSON, e
 * o cartão desenha — não há parágrafo. Cada achado é um número contra a
 * sua referência, com o rótulo e no máximo uma nota curta; a causa e a
 * ação são uma linha cada. Uma resposta que não é JSON válido cai na
 * leitura antiga (`lerAnalise`), que o cartão mostra colapsada numa linha.
 */
export type Achado = {
  rotulo: string;
  valor: number;
  referencia: number | null;
  /** "" razão pura (K/D), "%" percentual, "n" contagem. */
  unidade: "" | "%" | "n";
  /** O que é bom para esta métrica; "nenhuma" para as neutras. */
  melhorQuando: "sobe" | "desce" | "nenhuma";
  nota: string | null;
};

export type AnaliseEstruturada = {
  manchete: string;
  achados: Achado[];
  causa: string | null;
  acao: string | null;
};

const MAX_LINHA = 90;

const linha = (max = MAX_LINHA) => z.string().trim().min(1).max(max);

const achadoSchema = z.object({
  rotulo: linha(32),
  valor: z.number().finite(),
  referencia: z.number().finite().nullable().optional().default(null),
  unidade: z.enum(["", "%", "n"]).optional().default(""),
  melhorQuando: z.enum(["sobe", "desce", "nenhuma"]).optional().default("sobe"),
  nota: linha(48).nullable().optional().default(null),
});

const estruturadaSchema = z.object({
  manchete: linha(),
  achados: z.array(achadoSchema).max(4).optional().default([]),
  causa: linha().nullable().optional().default(null),
  acao: linha().nullable().optional().default(null),
});

/** JSON puro ou dentro de um bloco ```json```; qualquer outra coisa é null. */
export function lerAnaliseEstruturada(texto: string): AnaliseEstruturada | null {
  const bruto = texto.trim();
  const cercado = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(bruto)?.[1] ?? bruto;
  if (!cercado.startsWith("{")) return null;
  try {
    const parsed = estruturadaSchema.safeParse(JSON.parse(cercado));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const MAX_MANCHETE = 90;

export function lerAnalise(texto: string): AnaliseLida {
  const blocos = texto
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .flatMap(separarAcaoColada);

  let manchete: string | null = null;
  let acao: string | null = null;

  const primeiro = blocos[0];
  if (primeiro && blocos.length > 1) {
    const marcada = /^\*\*([^*\n]+)\*\*$/.exec(primeiro)?.[1] ?? /^#\s+([^\n]+)$/.exec(primeiro)?.[1] ?? null;
    if (marcada && marcada.trim().length <= MAX_MANCHETE && !marcada.trim().endsWith(":")) {
      manchete = marcada.trim();
      blocos.shift();
    }
  }
  const ultimo = blocos[blocos.length - 1];
  if (ultimo && /^(→|->|➜)\s*/.test(ultimo)) {
    acao = blocos.pop()!.replace(/^(→|->|➜)\s*/, "");
  }
  return { manchete, paragrafos: blocos, acao };
}

/** "→" no fim de um parágrafo, sem linha em branco antes, ainda é a ação. */
function separarAcaoColada(bloco: string): string[] {
  const linhas = bloco.split("\n");
  const i = linhas.findIndex((l, idx) => idx > 0 && /^(→|->|➜)\s*/.test(l.trim()));
  if (i === -1) return [bloco];
  return [linhas.slice(0, i).join("\n").trim(), linhas.slice(i).join(" ").trim()];
}
