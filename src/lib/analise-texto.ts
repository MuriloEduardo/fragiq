/**
 * A resposta do analista, lida em partes.
 *
 * O prompt pede uma forma fixa: manchete numa linha, dois ou três
 * parágrafos curtos, e uma última linha começando com "→" com a ação para
 * a próxima sessão. Isto reconhece essa forma quando ela veio — e quando
 * não veio (análises antigas, um modelo que desobedeceu), devolve o texto
 * como parágrafos, sem inventar manchete. O cartão decide o que mostrar
 * grande; aqui só se separa.
 */
export type AnaliseLida = {
  manchete: string | null;
  paragrafos: string[];
  acao: string | null;
};

const MAX_MANCHETE = 140;

export function lerAnalise(texto: string): AnaliseLida {
  const blocos = texto
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .flatMap(separarAcaoColada);

  let manchete: string | null = null;
  let acao: string | null = null;

  if (blocos.length > 1 && !blocos[0].includes("\n") && blocos[0].length <= MAX_MANCHETE && !/^\s*[-•*]\s/.test(blocos[0])) {
    manchete = blocos.shift()!.replace(/^\*\*(.+)\*\*$/, "$1");
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
