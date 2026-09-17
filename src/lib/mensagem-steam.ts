import { prisma } from "./prisma";
import { appUrl } from "./env";
import { carregarFonte } from "./fonte";
import { listarSessoes, valoresDoNormal, type Sessao } from "./sessoes";
import { listarPartidas, type PartidaLinha } from "./partidas";
import { rotularMapa } from "./cs2-labels";
import { LEMBRETES_PRIVACIDADE } from "./pendencias";

/**
 * A sessão no chat da Steam, em três linhas.
 *
 * Quem adicionou o bot recebe, minutos depois de fechar o jogo, o que o
 * csstats manda: a manchete da partida, um número ou dois, e o link. A
 * leitura inteira do analista fica no site — no chat ela vira um paredão
 * de texto que ninguém lê no celular. Por isso a mensagem é montada
 * daqui, dos mesmos números da tela, e não do texto do modelo: fica curta
 * porque é curta por construção.
 *
 * Linha 1: placar e mapa (da partida oficial, quando a corrente está
 * ligada; senão rounds e contexto da sessão). Linha 2: os dois números
 * que mais fugiram do normal. Linha 3: o link. Quem não quiser desliga em
 * /seguranca — e isso vai dito na primeira mensagem, só nela.
 */
export async function enfileirarAnaliseNoSteam(analysisId: string): Promise<boolean> {
  const analise = await prisma.analysis.findUnique({
    where: { id: analysisId },
    select: {
      answer: true,
      kind: true,
      gameAppId: true,
      user: { select: { id: true, steamId: true, avisoSteam: true } },
      snapshot: { select: { id: true, capturedAt: true } },
    },
  });
  if (!analise?.answer || analise.kind !== "SESSION" || !analise.user.avisoSteam || !analise.snapshot) return false;

  const texto = await montarTextoDaSessao(analise.user.id, analise.user.steamId, analise.gameAppId, analise.snapshot.id);
  if (!texto) return false;

  await prisma.steamMessage.create({
    data: { userId: analise.user.id, steamId: analise.user.steamId, texto },
  });
  return true;
}

/** As três linhas, ou null se a sessão não existe mais na série. */
/**
 * A mensagem da sessão: a manchete (placar, quando o GC deu a partida), a
 * classificação e os dois insights de maior desvio — as mesmas linhas da
 * tela, lidas de `insights`, nunca prosa do modelo (docs/dados-confiaveis.md
 * §3.5). Sem insight materializado ainda, cai nos desvios calculados.
 */
export async function montarTextoDaSessao(userId: string, steamId: string, appId: number, snapshotId: string): Promise<string | null> {
  const fonte = await carregarFonte(userId, appId);
  if (!fonte) return null;
  const sessao = listarSessoes(fonte.rows).find((s) => s.snapshotId === snapshotId);
  if (!sessao) return null;

  const partidas = (await listarPartidas(steamId, 10)).filter(
    (p) => p.jogadaEm >= new Date(sessao.de.getTime() - 5 * 60_000) && p.jogadaEm <= sessao.ate,
  );
  const primeira = (await prisma.steamMessage.count({ where: { userId } })) === 0;

  const materializada = await prisma.session.findUnique({ where: { ateSnapshotId: snapshotId }, select: { id: true } });
  const insights = materializada
    ? await prisma.insight.findMany({ where: { escopo: "SESSAO", escopoId: materializada.id }, select: { regra: true, linha: true, delta: true } })
    : [];
  const selo = insights.find((i) => i.regra === "sessao.classificacao")?.linha;
  const chips = insights
    .filter((i) => i.regra !== "sessao.classificacao" && i.delta !== null)
    .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))
    .slice(0, 2)
    .map((i) => i.linha);
  const leitura = chips.length ? chips.join(" · ") : desvios(sessao, valoresDoNormal(fonte.rows, { modo: sessao.modoId }, sessao.snapshotId));

  return [
    `FragIQ · ${manchete(sessao, partidas)}${selo ? ` · ${selo}` : ""}`,
    leitura,
    `Leitura completa: ${appUrl()}/cs2${primeira ? ` · para não receber mais: ${appUrl()}/seguranca` : ""}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function manchete(s: Sessao, partidas: PartidaLinha[]): string {
  if (partidas.length === 1) {
    const [p] = partidas;
    const resultado = p.eu.venceu === null ? "empate" : p.eu.venceu ? "vitória" : "derrota";
    const mapa = p.mapa ? rotularMapa(p.mapa) : "partida";
    return `${mapa} ${p.placar[0]}–${p.placar[1]}, ${resultado} · ${p.eu.kills}/${p.eu.assists}/${p.eu.deaths}, ${p.eu.hs} HS`;
  }
  if (partidas.length > 1) {
    const v = partidas.filter((p) => p.eu.venceu === true).length;
    const lista = partidas
      .slice()
      .reverse()
      .map((p) => `${p.mapa ? rotularMapa(p.mapa) : "?"} ${p.placar[0]}–${p.placar[1]}`)
      .join(", ");
    return `${partidas.length} partidas, ${v}V ${partidas.length - v}D · ${lista}`;
  }
  const contexto = [s.modo, s.mapa ? rotularMapa(s.mapa) : null, s.placar].filter(Boolean).join(" ");
  const partes = s.partidas ? ` em ${s.partidas} partida${s.partidas === 1 ? "" : "s"}` : "";
  return `${s.rounds} rounds${partes}${contexto ? ` · ${contexto}` : ""}`;
}

/** Os dois números que mais se afastaram do vitalício, em termos relativos. */
function desvios(s: Sessao, normal: { kd: number | null; danoPorRound: number | null; hs: number | null }): string {
  const n = (v: number, casas: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const candidatos = [
    { rotulo: "K/D", atual: s.kd, base: normal.kd, fmt: (v: number) => n(v, 2) },
    { rotulo: "Dano/round", atual: s.danoPorRound, base: normal.danoPorRound, fmt: (v: number) => n(v, 0) },
    { rotulo: "HS", atual: s.hs, base: normal.hs, fmt: (v: number) => `${n(v, 0)}%` },
  ]
    .filter((c): c is typeof c & { atual: number; base: number } => c.atual !== null && c.base !== null && c.base > 0)
    .map((c) => ({ ...c, desvio: Math.abs(c.atual / c.base - 1) }))
    .sort((a, b) => b.desvio - a.desvio)
    .slice(0, 2);
  return candidatos.map((c) => `${c.rotulo} ${c.fmt(c.atual)} (seu normal ${c.fmt(c.base)})`).join(" · ");
}

/**
 * "Vi que você jogou, mas a Steam não me deixa ler." Só para quem nunca
 * teve um ponto de CS2 — quem já teve e parou de ter recebe o aviso no
 * site — e só uma vez por conta.
 */
export async function avisarPrivacidadeSePreciso(userId: string, steamId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      avisoSteam: true,
      avisosPrivacidade: true,
      games: { where: { gameAppId: 730 }, select: { _count: { select: { snapshots: true } } } },
    },
  });
  if (!user || !user.avisoSteam || user.avisosPrivacidade > 0) return false;
  if ((user.games[0]?._count.snapshots ?? 0) > 0) return false;

  const texto = LEMBRETES_PRIVACIDADE(appUrl())[0];
  await prisma.$transaction([
    prisma.steamMessage.create({ data: { userId, steamId, texto } }),
    prisma.user.update({ where: { id: userId }, data: { avisoPrivacidadeEm: new Date(), avisosPrivacidade: 1 } }),
  ]);
  return true;
}
