import { prisma } from "./prisma";

/**
 * O que está gravado, sem nada em cima.
 *
 * O resto do painel responde perguntas ("a coleta está saudável?", "quanto
 * tem modo provado?") e para isso agrega, arredonda e nomeia. Quando o
 * número na tela está errado, agregação é exatamente o que atrapalha: a
 * pergunta passa a ser *o que a Steam, o GC, a demo ou o bot mandaram*, e a
 * resposta só vale se ninguém tocou nela no caminho.
 *
 * Por isso aqui não existe derivação: a lista é `order by` e `limit`, e o
 * payload é a coluna JSONB como o Postgres a devolve. O tamanho vem de
 * `length(col::text)` no banco — trazer 200 KB de demo para contar bytes no
 * Node é o tipo de coisa que faz a página de debug precisar de debug.
 */

export const TIPOS = [
  "coleta",
  "partida",
  "demo",
  "sessao",
  "insight",
  "evento",
  "log",
  "observacao",
  "inventario",
  "analise",
  "jogo",
] as const;

export type TipoBruto = (typeof TIPOS)[number];

export function ehTipo(v: string | undefined): v is TipoBruto {
  return !!v && (TIPOS as readonly string[]).includes(v);
}

export type Entidade = {
  tipo: TipoBruto;
  rotulo: string;
  /** Tabela e coluna onde o payload mora, para quem for conferir no banco. */
  fonte: string;
  /** De onde o dado veio antes de ser nosso. */
  origem: string;
  /** Por que buscar aqui — uma linha. */
  explica: string;
};

export const CATALOGO: Entidade[] = [
  {
    tipo: "coleta",
    rotulo: "Coleta",
    fonte: "stat_snapshots.metrics",
    origem: "Steam Web API (via cogniflow)",
    explica: "Os ~197 contadores vitalícios no instante da coleta, como a Steam devolveu.",
  },
  {
    tipo: "partida",
    rotulo: "Partida (GC)",
    fonte: "matches.gc",
    origem: "Game Coordinator do CS2 (via bot)",
    explica: "A resposta inteira do GC: um roundstatsall por round, pings, rankings da reserva.",
  },
  {
    tipo: "demo",
    rotulo: "Demo",
    fonte: "match_demos.dados",
    origem: "demo da Valve, lida pelo bot",
    explica: "Rounds, mortes com posição, dano, cegueiras, granadas, bomba, zonas, tiros.",
  },
  {
    tipo: "sessao",
    rotulo: "Sessão",
    fonte: "sessions (+ armas)",
    origem: "derivado, materializado",
    explica: "O fato materializado: deltas do intervalo, modo, confiança, provas usadas.",
  },
  {
    tipo: "insight",
    rotulo: "Insight",
    fonte: "insights (base + dados)",
    origem: "derivado, materializado",
    explica: "A linha que a tela mostra, com o que o visual desenha e o hash das entradas.",
  },
  {
    tipo: "evento",
    rotulo: "Evento",
    fonte: "eventos.dados",
    origem: "nosso próprio diário",
    explica: "Erros e transições gravados pelo site e pelo bot, com o payload do momento.",
  },
  {
    tipo: "log",
    rotulo: "Log do bot",
    fonte: "bot_logs.dados",
    origem: "bot",
    explica: "As linhas que o bot mandou em lote, com o objeto que acompanhava cada uma.",
  },
  {
    tipo: "observacao",
    rotulo: "Observação",
    fonte: "bot_observations",
    origem: "rich presence da Steam",
    explica: "O que o bot viu: fim de partida ou saída do jogo, com modo, mapa e placar.",
  },
  {
    tipo: "inventario",
    rotulo: "Inventário",
    fonte: "inventarios_publicos.itens",
    origem: "Steam Community",
    explica: "Os itens lidos do inventário público, do mais raro ao comum.",
  },
  {
    tipo: "analise",
    rotulo: "Análise",
    fonte: "analyses",
    origem: "cogniflow",
    explica: "A pergunta enviada e a resposta que voltou, em texto, sem o renderizador na frente.",
  },
  {
    tipo: "jogo",
    rotulo: "Schema do jogo",
    fonte: "games.statSchema",
    origem: "ISteamUserStats/GetSchemaForGame",
    explica: "O mapa de nome cru para rótulo legível que a Steam publica por appid.",
  },
];

export function entidade(tipo: TipoBruto): Entidade {
  return CATALOGO.find((e) => e.tipo === tipo)!;
}

export type ItemBruto = {
  id: string;
  /** A identidade da linha: quem, ou o quê. */
  quem: string;
  /** O contexto que distingue uma linha da outra. */
  sub: string | null;
  quando: Date | null;
  /** Tamanho do payload em bytes, ou null quando a coluna está vazia. */
  bytes: number | null;
};

const LIMITE = 60;

type LinhaSql = { id: string; quem: string | null; sub: string | null; quando: Date | null; bytes: number | null };

/**
 * A lista de uma entidade, filtrada pela busca.
 *
 * Um campo de busca só, porque em debug não se sabe de antemão o que se tem
 * na mão: cola-se um SteamID, um traceId, um matchid ou um pedaço de nome e
 * a consulta tenta todos. `ilike` nos campos de texto, igualdade nos ids —
 * um id parcial não é um id.
 */
export async function listar(tipo: TipoBruto, q: string): Promise<ItemBruto[]> {
  const termo = q.trim();
  const like = `%${termo}%`;
  const sql = CONSULTAS[tipo];
  const linhas = await prisma.$queryRawUnsafe<LinhaSql[]>(sql, termo, like, LIMITE);
  return linhas.map((l) => ({
    id: String(l.id),
    quem: l.quem ?? "—",
    sub: l.sub || null,
    quando: l.quando,
    bytes: l.bytes === null ? null : Number(l.bytes),
  }));
}

/**
 * $1 é o termo exato (id, steamId, traceId), $2 o termo com `%` para `ilike`
 * e $3 o limite. Toda consulta recebe os três, mesmo quando ignora algum —
 * é o que permite chamá-las por uma porta só.
 */
const CONSULTAS: Record<TipoBruto, string> = {
  coleta: `
    select s.id,
           u."personaName" as quem,
           concat_ws(' · ', s.trigger::text, s."matchMode", s."matchMap", s."matchScore") as sub,
           s."capturedAt" as quando,
           length(s.metrics::text) as bytes
      from stat_snapshots s
      join user_games ug on ug.id = s."userGameId"
      join users u on u.id = ug."userId"
     where $1 = ''
        or s.id = $1 or s."traceId" = $1 or u."steamId" = $1
        or u."personaName" ilike $2 or s."matchMap" ilike $2 or s."matchMode" ilike $2
     order by s."capturedAt" desc
     limit $3`,

  partida: `
    select m.id,
           coalesce(m.mapa, 'sem mapa') as quem,
           concat_ws(' · ', m.status::text, m.modo,
                     case when m."placarA" is null then null else m."placarA" || ':' || m."placarB" end,
                     m.servidor, m.error) as sub,
           coalesce(m."jogadaEm", m."createdAt") as quando,
           length(m.gc::text) as bytes
      from matches m
     where $1 = ''
        or m.id = $1 or m."shareCode" = $1
        or m.mapa ilike $2 or m.modo ilike $2 or m.servidor ilike $2
     order by coalesce(m."jogadaEm", m."createdAt") desc
     limit $3`,

  demo: `
    select d."matchId" as id,
           coalesce(m.mapa, d."matchId") as quem,
           concat_ws(' · ', d.status::text, d.parser,
                     case when d.versao is null then null else 'formato v' || d.versao end,
                     case when d.ticks is null then null else d.ticks || ' ticks' end,
                     d.error) as sub,
           d."updatedAt" as quando,
           length(d.dados::text) as bytes
      from match_demos d
      left join matches m on m.id = d."matchId"
     where $1 = ''
        or d."matchId" = $1
        or d.status::text ilike $2 or d.parser ilike $2 or m.mapa ilike $2
     order by d."updatedAt" desc
     limit $3`,

  sessao: `
    select s.id,
           u."personaName" as quem,
           concat_ws(' · ', coalesce(s.modo, 'sem modo'), s."modoConfianca"::text, s.mapa,
                     s.rounds || ' rounds', 'regra v' || s."regraVersao") as sub,
           s.ate as quando,
           length(s.armas::text) as bytes
      from sessions s
      join users u on u.id = s."userId"
     where $1 = ''
        or s.id = $1 or s."ateSnapshotId" = $1 or u."steamId" = $1
        or u."personaName" ilike $2 or s.modo ilike $2 or s.mapa ilike $2
     order by s.ate desc
     limit $3`,

  insight: `
    select i.id,
           i.regra as quem,
           concat_ws(' · ', i.escopo::text, i.tom::text, 'v' || i."regraVersao", i.linha) as sub,
           i."createdAt" as quando,
           length(i.dados::text) as bytes
      from insights i
      join users u on u.id = i."userId"
     where $1 = ''
        or i.id = $1 or i."escopoId" = $1 or u."steamId" = $1
        or i.regra ilike $2 or i.linha ilike $2 or u."personaName" ilike $2
     order by i."createdAt" desc
     limit $3`,

  evento: `
    select e.id,
           e.nome as quem,
           concat_ws(' · ', u."personaName", left(e.dados::text, 120)) as sub,
           e."createdAt" as quando,
           length(e.dados::text) as bytes
      from eventos e
      left join users u on u.id = e."userId"
     where $1 = ''
        or e.id = $1 or e."traceId" = $1 or u."steamId" = $1
        or e.nome ilike $2 or e.dados::text ilike $2 or u."personaName" ilike $2
     order by e."createdAt" desc
     limit $3`,

  log: `
    select l.id,
           l.nivel::text as quem,
           l.mensagem as sub,
           l.em as quando,
           length(l.dados::text) as bytes
      from bot_logs l
     where $1 = ''
        or l.id = $1 or l."traceId" = $1 or l."steamId" = $1
        or l.nivel::text ilike $2 or l.mensagem ilike $2 or l.dados::text ilike $2
     order by l.em desc
     limit $3`,

  observacao: `
    select o.id,
           coalesce(u."personaName", o."steamId") as quem,
           concat_ws(' · ', o.kind::text, o.mode, o.map, o.score) as sub,
           o."observedAt" as quando,
           null::int as bytes
      from bot_observations o
      left join users u on u.id = o."userId"
     where $1 = ''
        or o.id = $1 or o."traceId" = $1 or o."steamId" = $1
        or o.map ilike $2 or o.mode ilike $2 or u."personaName" ilike $2
     order by o."observedAt" desc
     limit $3`,

  inventario: `
    select i."steamId" as id,
           coalesce(u."personaName", i."steamId") as quem,
           concat_ws(' · ', case when i.publico then 'público' else 'privado' end, i.total || ' itens') as sub,
           i."lidoEm" as quando,
           length(i.itens::text) as bytes
      from inventarios_publicos i
      left join users u on u."steamId" = i."steamId"
     where $1 = ''
        or i."steamId" = $1
        or u."personaName" ilike $2
     order by i."lidoEm" desc
     limit $3`,

  analise: `
    select a.id,
           u."personaName" as quem,
           concat_ws(' · ', a.kind::text, a.status::text, coalesce(a.error, left(a.question, 90))) as sub,
           a."createdAt" as quando,
           coalesce(length(a.answer), 0) as bytes
      from analyses a
      join users u on u.id = a."userId"
     where $1 = ''
        or a.id = $1 or a."snapshotId" = $1 or a."replyId" = $1 or u."steamId" = $1
        or u."personaName" ilike $2 or a.question ilike $2 or a.answer ilike $2
     order by a."createdAt" desc
     limit $3`,

  jogo: `
    select g."appId"::text as id,
           g.name as quem,
           concat_ws(' · ', 'appid ' || g."appId",
                     case when g."supportsStats" then 'expõe stats' else 'sem stats' end) as sub,
           g."schemaFetchedAt" as quando,
           length(g."statSchema"::text) as bytes
      from games g
     where $1 = ''
        or g."appId"::text = $1
        or g.name ilike $2
     order by g."appId" asc
     limit $3`,
};

export type Registro = {
  id: string;
  titulo: string;
  /** O payload cru: a coluna JSONB, o texto, ou a linha inteira. */
  payload: unknown;
  /** Como o payload é nomeado no banco. */
  payloadNome: string;
  /** As colunas escalares da mesma linha — o contexto que não é payload. */
  linha: Record<string, unknown>;
  /** Trace para pular direto para a cadeia, quando a linha carrega um. */
  traceId: string | null;
};

/**
 * Uma linha inteira, separada em payload e contexto.
 *
 * A separação existe porque as duas perguntas são diferentes: "o que
 * mandaram" é o JSONB; "em que circunstância" são as colunas que já
 * viraram schema. Juntar tudo num objeto só faria o `metrics` de 197
 * chaves engolir o `capturedAt` que explica por que ele é daquele tamanho.
 */
export async function carregar(tipo: TipoBruto, id: string): Promise<Registro | null> {
  switch (tipo) {
    case "coleta": {
      const r = await prisma.statSnapshot.findUnique({
        where: { id },
        include: { userGame: { select: { gameAppId: true, user: { select: { personaName: true, steamId: true } } } } },
      });
      if (!r) return null;
      const { metrics, userGame, ...resto } = r;
      return {
        id: r.id,
        titulo: `${userGame.user.personaName} · app ${userGame.gameAppId}`,
        payload: metrics,
        payloadNome: "metrics",
        linha: { ...resto, steamId: userGame.user.steamId },
        traceId: r.traceId,
      };
    }
    case "partida": {
      const r = await prisma.match.findUnique({
        where: { id },
        include: { jogadores: true, demo: { select: { status: true, versao: true, parser: true, ticks: true } } },
      });
      if (!r) return null;
      const { gc, ...resto } = r;
      return {
        id: r.id,
        titulo: `${r.mapa ?? "sem mapa"} · ${r.modo ?? "sem modo"}`,
        payload: gc,
        payloadNome: "gc",
        linha: resto,
        traceId: null,
      };
    }
    case "demo": {
      const r = await prisma.matchDemo.findUnique({ where: { matchId: id } });
      if (!r) return null;
      const { dados, ...resto } = r;
      return { id: r.matchId, titulo: `demo da partida ${r.matchId}`, payload: dados, payloadNome: "dados", linha: resto, traceId: null };
    }
    case "sessao": {
      const r = await prisma.session.findUnique({ where: { id }, include: { user: { select: { personaName: true, steamId: true } } } });
      if (!r) return null;
      const { armas, user, ...resto } = r;
      return {
        id: r.id,
        titulo: `${user.personaName} · ${r.rounds} rounds`,
        payload: armas,
        payloadNome: "armas",
        linha: { ...resto, steamId: user.steamId },
        traceId: null,
      };
    }
    case "insight": {
      const r = await prisma.insight.findUnique({ where: { id } });
      if (!r) return null;
      const { dados, base, ...resto } = r;
      return { id: r.id, titulo: `${r.regra} v${r.regraVersao}`, payload: { base, dados }, payloadNome: "base + dados", linha: resto, traceId: null };
    }
    case "evento": {
      const r = await prisma.evento.findUnique({ where: { id } });
      if (!r) return null;
      const { dados, ...resto } = r;
      return { id: r.id, titulo: r.nome, payload: dados, payloadNome: "dados", linha: resto, traceId: r.traceId };
    }
    case "log": {
      const r = await prisma.botLog.findUnique({ where: { id } });
      if (!r) return null;
      const { dados, ...resto } = r;
      return { id: r.id, titulo: `${r.nivel} · ${r.mensagem}`, payload: dados, payloadNome: "dados", linha: resto, traceId: r.traceId };
    }
    case "observacao": {
      const r = await prisma.botObservation.findUnique({ where: { id } });
      if (!r) return null;
      // Não há coluna JSONB: a observação inteira é o que o bot mandou.
      return { id: r.id, titulo: `${r.kind} · ${r.steamId}`, payload: r, payloadNome: "a linha inteira", linha: {}, traceId: r.traceId };
    }
    case "inventario": {
      const r = await prisma.inventarioPublico.findUnique({ where: { steamId: id } });
      if (!r) return null;
      const { itens, ...resto } = r;
      return { id: r.steamId, titulo: `inventário de ${r.steamId}`, payload: itens, payloadNome: "itens", linha: resto, traceId: null };
    }
    case "analise": {
      const r = await prisma.analysis.findUnique({ where: { id }, include: { user: { select: { personaName: true } } } });
      if (!r) return null;
      const { question, answer, user, ...resto } = r;
      return {
        id: r.id,
        titulo: `${user.personaName} · ${r.kind.toLowerCase()}`,
        payload: { question, answer },
        payloadNome: "question + answer",
        linha: resto,
        traceId: null,
      };
    }
    case "jogo": {
      const r = await prisma.game.findUnique({ where: { appId: Number(id) } });
      if (!r || !Number.isInteger(Number(id))) return null;
      const { statSchema, ...resto } = r;
      return { id: String(r.appId), titulo: r.name, payload: statSchema, payloadNome: "statSchema", linha: resto, traceId: null };
    }
  }
}
