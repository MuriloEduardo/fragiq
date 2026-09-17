/**
 * De que modo foi uma sessão — e com que certeza.
 *
 * Uma sessão é o intervalo entre duas coletas. A Steam só entrega totais,
 * então o intervalo carrega tudo o que foi jogado nele, e um modo só pode
 * ser afirmado quando há **prova** de que o intervalo contém uma partida só
 * (ou várias, todas do mesmo modo). A prova vem de duas fontes: as
 * partidas oficiais do Game Coordinator (modo exato pelo bitmask) e as
 * observações do bot de presença (o rich presence no fim da partida).
 *
 * A tabela é a da §3.2 de docs/dados-confiaveis.md:
 *
 * | Δ partidas | prova no intervalo                          | modo   | confiança |
 * |------------|---------------------------------------------|--------|-----------|
 * | 1 (ou ?)   | 1+ evidências, um modo só                   | esse   | EXATA     |
 * | n > 1      | ≥ n evidências, um modo só                  | esse   | INFERIDA  |
 * | n > 1      | menos evidências que partidas, ou 2+ modos  | null   | MISTA     |
 * | qualquer   | nenhuma evidência; snapshot marcado (legado) | esse   | INFERIDA (Δ ≤ 1) / MISTA |
 * | qualquer   | nada                                        | null   | MISTA     |
 *
 * Preferir "sem modo" a modo errado: `MISTA` nunca entra numa aba nem num
 * normal de modo. A função é pura e versionada (`REGRA_VERSAO`): mudou a
 * regra, sobe a versão e `recompute:sessions` refaz tudo.
 */

export const REGRA_VERSAO = 1;

export type ModoConfianca = "EXATA" | "INFERIDA" | "MISTA";

export type Evidencia = {
  /** `match` = partida oficial do GC; `observacao` = fim de partida visto pelo bot. */
  fonte: "match" | "observacao";
  id: string;
  modo: string | null;
  mapa: string | null;
  placar: string | null;
};

export type EntradaAtribuicao = {
  /** Δ `total_matches_played` no intervalo; null quando a Steam não deu o contador. */
  deltaPartidas: number | null;
  evidencias: Evidencia[];
  /** O que a coleta que fechou o intervalo já trazia (bot antigo ou marcação manual). */
  snapshot: { matchMode: string | null; matchMap: string | null; matchScore: string | null };
};

export type Atribuicao = {
  modo: string | null;
  confianca: ModoConfianca;
  mapa: string | null;
  placar: string | null;
  matchIds: string[];
  observacaoIds: string[];
};

function unico<T>(valores: (T | null)[]): T | null {
  const set = new Set(valores.filter((v): v is T => v !== null && v !== undefined));
  return set.size === 1 ? [...set][0] : null;
}

export function atribuirModo(entrada: EntradaAtribuicao): Atribuicao {
  const { deltaPartidas, evidencias, snapshot } = entrada;
  const matchIds = evidencias.filter((e) => e.fonte === "match").map((e) => e.id);
  const observacaoIds = evidencias.filter((e) => e.fonte === "observacao").map((e) => e.id);
  const comModo = evidencias.filter((e) => e.modo);
  const modos = new Set(comModo.map((e) => e.modo as string));

  // As duas fontes descrevem as mesmas partidas (o GC e o bot viram o
  // mesmo jogo), então a cobertura é a maior das duas, não a soma.
  const cobertura = Math.max(
    comModo.filter((e) => e.fonte === "match").length,
    comModo.filter((e) => e.fonte === "observacao").length,
  );
  const esperadas = deltaPartidas === null || deltaPartidas < 1 ? null : deltaPartidas;

  const misto = (): Atribuicao => ({ modo: null, confianca: "MISTA", mapa: null, placar: null, matchIds, observacaoIds });

  if (modos.size > 1) return misto();

  if (modos.size === 1) {
    const modo = [...modos][0];
    // Mapa e placar só quando todas as evidências concordam; senão null.
    const mapa = unico(evidencias.map((e) => e.mapa)) ?? snapshot.matchMap ?? null;
    const placar = unico(evidencias.map((e) => e.placar)) ?? snapshot.matchScore ?? null;
    if (esperadas === null || esperadas === 1) {
      return { modo, confianca: "EXATA", mapa, placar, matchIds, observacaoIds };
    }
    if (cobertura >= esperadas) {
      return { modo, confianca: "INFERIDA", mapa, placar, matchIds, observacaoIds };
    }
    return misto();
  }

  // Sem evidência registrada: só o que a coleta trazia. É o caso do
  // histórico anterior a 17/09/2026 e da marcação manual — o bot disse,
  // mas não deixou observação. Vale para uma partida; para várias, não.
  if (snapshot.matchMode && (esperadas === null || esperadas <= 1)) {
    return {
      modo: snapshot.matchMode,
      confianca: "INFERIDA",
      mapa: snapshot.matchMap ?? null,
      placar: snapshot.matchScore ?? null,
      matchIds,
      observacaoIds,
    };
  }
  return misto();
}
