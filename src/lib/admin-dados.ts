import { prisma } from "./prisma";

/**
 * O que o painel administrativo lê.
 *
 * Tudo em consultas de agregação, nada de carregar séries inteiras: o
 * painel responde "quem entrou, o que fizeram, a coleta está saudável?" e
 * essas perguntas são contagens. Os dias são contados no fuso do Brasil,
 * porque é assim que quem opera lê "hoje".
 */

export const FUSO = "America/Sao_Paulo";
const DIAS = 30;

export type Usuario = {
  id: string;
  personaName: string;
  avatarUrl: string | null;
  steamId: string;
  countryCode: string | null;
  createdAt: Date;
  lastSyncedAt: Date | null;
  logins: number;
  syncs: number;
  feedbacks: number;
  analises: number;
  cs2: { horas: number; coletas: number; ultimaColeta: Date | null } | null;
};

export type PontoDia = { dia: string; valor: number };

export type EtapaFunil = {
  id: string;
  rotulo: string;
  /** Quantos chegaram até aqui. */
  chegaram: number;
  /** Quem passou pela anterior e parou aqui (nomes, até 6). */
  presos: string[];
};

export type Saude = {
  bot: { ultimoTickEm: Date; amigos: number; gcConectado: boolean; iniciadoEm: Date | null } | null;
  capturasPendentes: { total: number; maisAntigaEm: Date | null; maxTentativa: number };
  partidasNaFila: number;
  partidasExpiradas: number;
  chat24h: { enviadas: number; falhas: number; pendentes: number };
  erros24h: number;
};

export type EventoLinha = { id: string; nome: string; persona: string | null; dados: unknown; createdAt: Date };

export type Painel = {
  funil: EtapaFunil[];
  saude: Saude;
  eventos: EventoLinha[];
  totais: {
    usuarios: number;
    novos7d: number;
    ativos7d: number;
    coletas: number;
    coletasComContexto: number;
    analises: number;
    analisesRespondidas: number;
    feedbacks: number;
  };
  usuarios: Usuario[];
  porDia: {
    cadastros: PontoDia[];
    coletas: PontoDia[];
    syncs: PontoDia[];
    analises: PontoDia[];
  };
  syncsRecentes: {
    id: string;
    persona: string;
    trigger: string;
    status: string;
    gamesStored: number;
    startedAt: Date;
    duracaoMs: number | null;
    error: string | null;
  }[];
  cronRecentes: {
    id: string;
    status: string;
    candidates: number;
    synced: number;
    failed: number;
    skipped: number;
    snapshots: number;
    startedAt: Date;
    duracaoMs: number | null;
    error: string | null;
  }[];
  analisesRecentes: {
    id: string;
    persona: string;
    kind: string;
    status: string;
    question: string;
    createdAt: Date;
    latenciaMs: number | null;
    error: string | null;
  }[];
  feedbacks: { id: string; persona: string; path: string | null; message: string; createdAt: Date }[];
};

export async function carregarPainel(): Promise<Painel> {
  const semanaAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [funil, saude, eventos] = await Promise.all([carregarFunil(), carregarSaude(), carregarEventos()]);

  const [
    usuarios,
    novos7d,
    ativos7d,
    coletas,
    coletasComContexto,
    analises,
    analisesRespondidas,
    feedbacks,
    linhas,
    porDia,
    syncs,
    crons,
    analisesRecentes,
    feedbackRecentes,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gt: semanaAtras } } }),
    prisma.user.count({ where: { lastSyncedAt: { gt: semanaAtras } } }),
    prisma.statSnapshot.count(),
    prisma.statSnapshot.count({ where: { matchMode: { not: null } } }),
    prisma.analysis.count(),
    prisma.analysis.count({ where: { status: "ANSWERED" } }),
    prisma.feedback.count(),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        personaName: true,
        avatarUrl: true,
        steamId: true,
        countryCode: true,
        createdAt: true,
        lastSyncedAt: true,
        _count: { select: { syncRuns: true, feedback: true, analyses: true } },
        syncRuns: { where: { trigger: "LOGIN" }, select: { id: true } },
        games: {
          where: { gameAppId: 730 },
          select: {
            playtimeForeverMin: true,
            _count: { select: { snapshots: true } },
            snapshots: { orderBy: { capturedAt: "desc" }, take: 1, select: { capturedAt: true } },
          },
        },
      },
    }),
    contagensPorDia(),
    prisma.syncRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
      select: {
        id: true,
        trigger: true,
        status: true,
        gamesStored: true,
        startedAt: true,
        finishedAt: true,
        error: true,
        user: { select: { personaName: true } },
      },
    }),
    prisma.cronRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    prisma.analysis.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        kind: true,
        status: true,
        question: true,
        createdAt: true,
        answeredAt: true,
        error: true,
        user: { select: { personaName: true } },
      },
    }),
    prisma.feedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, path: true, message: true, createdAt: true, user: { select: { personaName: true } } },
    }),
  ]);

  return {
    funil,
    saude,
    eventos,
    totais: {
      usuarios,
      novos7d,
      ativos7d,
      coletas,
      coletasComContexto,
      analises,
      analisesRespondidas,
      feedbacks,
    },
    usuarios: linhas.map((u) => {
      const cs2 = u.games[0];
      return {
        id: u.id,
        personaName: u.personaName,
        avatarUrl: u.avatarUrl,
        steamId: u.steamId,
        countryCode: u.countryCode,
        createdAt: u.createdAt,
        lastSyncedAt: u.lastSyncedAt,
        logins: u.syncRuns.length,
        syncs: u._count.syncRuns,
        feedbacks: u._count.feedback,
        analises: u._count.analyses,
        cs2: cs2
          ? {
              horas: Math.round(cs2.playtimeForeverMin / 60),
              coletas: cs2._count.snapshots,
              ultimaColeta: cs2.snapshots[0]?.capturedAt ?? null,
            }
          : null,
      };
    }),
    porDia,
    syncsRecentes: syncs.map((s) => ({
      id: s.id,
      persona: s.user.personaName,
      trigger: s.trigger,
      status: s.status,
      gamesStored: s.gamesStored,
      startedAt: s.startedAt,
      duracaoMs: s.finishedAt ? s.finishedAt.getTime() - s.startedAt.getTime() : null,
      error: s.error,
    })),
    cronRecentes: crons.map((c) => ({
      id: c.id,
      status: c.status,
      candidates: c.candidates,
      synced: c.synced,
      failed: c.failed,
      skipped: c.skipped,
      snapshots: c.snapshots,
      startedAt: c.startedAt,
      duracaoMs: c.finishedAt ? c.finishedAt.getTime() - c.startedAt.getTime() : null,
      error: c.error,
    })),
    analisesRecentes: analisesRecentes.map((a) => ({
      id: a.id,
      persona: a.user.personaName,
      kind: a.kind,
      status: a.status,
      question: a.question,
      createdAt: a.createdAt,
      latenciaMs: a.answeredAt ? a.answeredAt.getTime() - a.createdAt.getTime() : null,
      error: a.error,
    })),
    feedbacks: feedbackRecentes.map((f) => ({
      id: f.id,
      persona: f.user.personaName,
      path: f.path,
      message: f.message,
      createdAt: f.createdAt,
    })),
  };
}

/**
 * Contagens por dia dos últimos 30 dias, com os dias vazios preenchidos:
 * um gráfico de barras que pula os zeros mente sobre o ritmo.
 */
async function contagensPorDia() {
  const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000);
  desde.setHours(0, 0, 0, 0);

  type Linha = { dia: string; n: bigint | number };
  const conta = (tabela: string, coluna: string) =>
    prisma.$queryRawUnsafe<Linha[]>(
      `select to_char(("${coluna}" at time zone 'UTC') at time zone '${FUSO}', 'YYYY-MM-DD') as dia, count(*) as n
       from "${tabela}" where "${coluna}" >= $1 group by 1 order by 1`,
      desde,
    );

  const [cadastros, coletas, syncs, analises] = await Promise.all([
    conta("users", "createdAt"),
    conta("stat_snapshots", "capturedAt"),
    conta("sync_runs", "startedAt"),
    conta("analyses", "createdAt"),
  ]);

  const dias: string[] = [];
  for (let i = DIAS - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dias.push(d.toLocaleDateString("sv-SE", { timeZone: FUSO }));
  }
  const preencher = (linhas: Linha[]): PontoDia[] => {
    const mapa = new Map(linhas.map((l) => [l.dia, Number(l.n)]));
    return dias.map((dia) => ({ dia, valor: mapa.get(dia) ?? 0 }));
  };

  return {
    cadastros: preencher(cadastros),
    coletas: preencher(coletas),
    syncs: preencher(syncs),
    analises: preencher(analises),
  };
}

/* ---------------------------------- funil --------------------------------- */

/**
 * O funil de ativação, derivado do estado — não de eventos de clique.
 *
 * Cada etapa é um fato do banco: tem ponto de CS2, o bot é amigo, a
 * corrente está ligada, tem partida oficial, recebeu mensagem. Quem parou
 * numa etapa aparece pelo nome: com três testadores, o painel precisa
 * dizer "o AVELLARTS está preso na privacidade", não "33%".
 */
async function carregarFunil(): Promise<EtapaFunil[]> {
  const users = await prisma.user.findMany({
    select: {
      personaName: true,
      botAmigoDesde: true,
      partidasAtivadasEm: true,
      games: { where: { gameAppId: 730 }, select: { _count: { select: { snapshots: true } } } },
      _count: { select: { partidas: true, mensagens: { where: { status: "SENT" } } } },
    },
  });
  const etapas: { id: string; rotulo: string; passa: (u: (typeof users)[number]) => boolean }[] = [
    { id: "entrou", rotulo: "Entrou com a Steam", passa: () => true },
    { id: "stats", rotulo: "Steam deixa ler (1ª coleta de CS2)", passa: (u) => (u.games[0]?._count.snapshots ?? 0) > 0 },
    { id: "bot", rotulo: "Adicionou o bot", passa: (u) => u.botAmigoDesde !== null },
    { id: "corrente", rotulo: "Ligou as partidas oficiais", passa: (u) => u.partidasAtivadasEm !== null },
    { id: "partida", rotulo: "Tem partida com placar", passa: (u) => u._count.partidas > 0 },
    { id: "chat", rotulo: "Recebeu mensagem no chat", passa: (u) => u._count.mensagens > 0 },
  ];
  // Funil de verdade: só conta na etapa N quem passou por todas até N.
  let restantes = users;
  return etapas.map((e, i) => {
    const passaram = restantes.filter(e.passa);
    const presos = i === 0 ? [] : restantes.filter((u) => !e.passa(u)).map((u) => u.personaName).slice(0, 6);
    restantes = passaram;
    return { id: e.id, rotulo: e.rotulo, chegaram: passaram.length, presos };
  });
}

/* ---------------------------------- saúde --------------------------------- */

async function carregarSaude(): Promise<Saude> {
  const diaAtras = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [bot, capturas, maisAntiga, partidasNaFila, partidasExpiradas, enviadas, falhas, pendentes, erros24h] = await Promise.all([
    prisma.botStatus.findUnique({ where: { id: "bot" } }),
    prisma.pendingCapture.aggregate({ _count: true, _max: { tentativa: true } }),
    prisma.pendingCapture.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.match.count({ where: { status: "PENDING" } }),
    prisma.match.count({ where: { status: { in: ["EXPIRED", "FAILED"] } } }),
    prisma.steamMessage.count({ where: { status: "SENT", sentAt: { gt: diaAtras } } }),
    prisma.steamMessage.count({ where: { status: "FAILED", createdAt: { gt: diaAtras } } }),
    prisma.steamMessage.count({ where: { status: "PENDING" } }),
    prisma.evento.count({ where: { nome: "erro", createdAt: { gt: diaAtras } } }),
  ]);
  return {
    bot,
    capturasPendentes: { total: capturas._count, maisAntigaEm: maisAntiga?.createdAt ?? null, maxTentativa: capturas._max.tentativa ?? 0 },
    partidasNaFila,
    partidasExpiradas,
    chat24h: { enviadas, falhas, pendentes },
    erros24h,
  };
}

async function carregarEventos(): Promise<EventoLinha[]> {
  const linhas = await prisma.evento.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  const ids = [...new Set(linhas.map((l) => l.userId).filter((v): v is string => Boolean(v)))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, personaName: true } }) : [];
  const nome = new Map(users.map((u) => [u.id, u.personaName]));
  return linhas.map((l) => ({ id: l.id, nome: l.nome, persona: l.userId ? (nome.get(l.userId) ?? null) : null, dados: l.dados, createdAt: l.createdAt }));
}
