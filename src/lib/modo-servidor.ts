import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { COOKIE_MODO, abasDeModo, resolverModo, type AbaDeModo, type Modo } from "./modo";

/**
 * O lado servidor do submenu: quais modos a pessoa tem, e qual ela pediu.
 *
 * O layout e cada página precisam da mesma resposta, e o layout não lê
 * `searchParams` — então a contagem sai de uma consulta leve ao banco (não
 * do balde de 500 coletas) e a escolha junta a URL, que a página vê, com o
 * cookie, que os dois veem.
 */
export async function abasDoUsuario(userId: string, appId: number): Promise<AbaDeModo[]> {
  const [porSessao, porPartida] = await Promise.all([
    prisma.statSnapshot.groupBy({
      by: ["matchMode"],
      where: { userGame: { userId, gameAppId: appId }, matchMode: { not: null } },
      _count: { _all: true },
    }),
    appId === 730
      ? prisma.match.groupBy({
          by: ["modo"],
          where: { status: "DONE", modo: { not: null }, jogadores: { some: { userId } } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const rows = porSessao.flatMap((g) =>
    Array.from({ length: g._count._all }, () => ({ capturedAt: new Date(0), playtimeForeverMin: 0, metrics: {}, matchMode: g.matchMode })),
  );
  const partidas = new Map(porPartida.map((g) => [g.modo as string, g._count._all]));
  return abasDeModo(rows, partidas);
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** O modo desta requisição: `?modo=` da URL, senão o cookie, senão tudo. */
export async function modoDaRequisicao(searchParams: SearchParams | undefined, abas: AbaDeModo[]): Promise<Modo> {
  const [params, jar] = await Promise.all([searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>), cookies()]);
  return resolverModo(params.modo, jar.get(COOKIE_MODO)?.value, abas);
}
