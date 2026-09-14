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
export type AnaliseLida = {
  manchete: string | null;
  paragrafos: string[];
  acao: string | null;
};

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
