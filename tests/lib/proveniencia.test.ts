import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O fio do traceId: nasce no aviso do bot, vira observação e captura, e a
 * coleta que a captura dispara recebe o mesmo id — é assim que um ponto
 * responde "quem me criou" (docs/dados-confiaveis.md §3.1).
 */
const prisma = {
  user: { findUnique: vi.fn() },
  botObservation: { create: vi.fn() },
  pendingCapture: { upsert: vi.fn(), create: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
  userGame: { findUnique: vi.fn() },
  statSnapshot: { update: vi.fn() },
};
const syncUser = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/steam/sync", () => ({ syncUser }));
vi.mock("@/lib/mensagem-steam", () => ({ avisarPrivacidadeSePreciso: vi.fn(async () => false) }));
vi.mock("@/lib/eventos", () => ({ registrar: vi.fn(), reportarErro: vi.fn() }));
vi.mock("@/lib/segredos", () => ({ segredoOpcional: vi.fn(async () => "segredo") }));

const TRACE = "11111111-2222-4333-8444-555555555555";
const STEAM = "76561198000000001";

let obsSeq = 0;

beforeEach(() => {
  vi.clearAllMocks();
  obsSeq = 0;
  prisma.botObservation.create.mockImplementation(async ({ data }) => ({ ...data, id: `obs-${++obsSeq}` }));
  prisma.pendingCapture.upsert.mockImplementation(async ({ create }) => ({ ...create, id: `cap-${create.observacaoId}` }));
  prisma.pendingCapture.findMany.mockResolvedValue([]);
});

describe("steam-event: observação antes da captura, com o trace do bot", () => {
  it("grava a observação e agenda a captura com o mesmo traceId", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "u1", steamId: STEAM });
    const { POST } = await import("@/app/api/sync/steam-event/route");
    const req = new Request("http://x/api/sync/steam-event", {
      method: "POST",
      headers: { authorization: "Bearer segredo", "content-type": "application/json" },
      body: JSON.stringify({ steamId: STEAM, event: "match_ended", map: "de_mirage", mode: "premier", score: "13:9", traceId: TRACE }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ traceId: TRACE });

    const obs = prisma.botObservation.create.mock.calls[0][0].data;
    expect(obs).toMatchObject({ steamId: STEAM, userId: "u1", kind: "MATCH_ENDED", map: "de_mirage", mode: "premier", traceId: TRACE });

    const chamada = prisma.pendingCapture.upsert.mock.calls[0][0];
    expect(chamada.create).toMatchObject({ userId: "u1", matchMode: "premier", traceId: TRACE, observacaoId: "obs-1" });
    // A chave de idempotência é a observação, não o jogador: é o que
    // impede o aviso seguinte de apagar esta captura.
    expect(chamada.where).toEqual({ observacaoId: "obs-1" });
  });

  it("duas partidas seguidas viram duas capturas, não uma", async () => {
    // A regressão que aglomerava partidas: `pending_captures.userId` era
    // único e o upsert por jogador fazia o fim da segunda partida
    // sobrescrever a captura da primeira. A primeira nunca era coletada e
    // o ponto seguinte cobria as duas — uma sessão com duas partidas
    // dentro, que nenhum gráfico consegue ler como desempenho.
    prisma.user.findUnique.mockResolvedValue({ id: "u1", steamId: STEAM });
    const { POST } = await import("@/app/api/sync/steam-event/route");
    const avisar = (mapa: string) =>
      POST(
        new Request("http://x/api/sync/steam-event", {
          method: "POST",
          headers: { authorization: "Bearer segredo", "content-type": "application/json" },
          body: JSON.stringify({ steamId: STEAM, event: "match_ended", map: mapa, mode: "premier" }),
        }) as never,
      );

    await avisar("de_mirage");
    await avisar("de_nuke");

    expect(prisma.pendingCapture.upsert).toHaveBeenCalledTimes(2);
    const chaves = prisma.pendingCapture.upsert.mock.calls.map((c) => c[0].where.observacaoId);
    expect(chaves).toEqual(["obs-1", "obs-2"]);
    const mapas = prisma.pendingCapture.upsert.mock.calls.map((c) => c[0].create.matchMap);
    expect(mapas).toEqual(["de_mirage", "de_nuke"]);
  });

  it("quem não tem conta ainda deixa observação mesmo assim", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const { POST } = await import("@/app/api/sync/steam-event/route");
    const req = new Request("http://x/api/sync/steam-event", {
      method: "POST",
      headers: { authorization: "Bearer segredo", "content-type": "application/json" },
      body: JSON.stringify({ steamId: STEAM, event: "left_game" }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(prisma.botObservation.create.mock.calls[0][0].data).toMatchObject({ userId: null, kind: "LEFT_GAME" });
    expect(prisma.pendingCapture.upsert).not.toHaveBeenCalled();
    // Sem trace do bot, a rota inventa um: o fio nunca fica vazio.
    expect((await res.json()).traceId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("tick: a coleta reativa herda o trace da captura", () => {
  it("passa o traceId da captura vencida para syncUser", async () => {
    prisma.pendingCapture.findMany.mockResolvedValue([
      { id: "cap-1", userId: "u1", steamId: STEAM, matchMap: "de_mirage", matchMode: "premier", matchScore: null, traceId: TRACE, tentativa: 0 },
    ]);
    syncUser.mockResolvedValue({ snapshotsCreated: 1 });
    const { processarCapturasDevidas } = await import("@/lib/capturas");
    const r = await processarCapturasDevidas();
    expect(r).toMatchObject({ processadas: 1, gravadas: 1 });
    expect(syncUser).toHaveBeenCalledWith("u1", STEAM, "EVENT", { map: "de_mirage", mode: "premier", score: undefined }, TRACE);
  });

  it("processa uma captura por pessoa por rodada", async () => {
    // Duas capturas da mesma pessoa vencidas juntas leriam o mesmo estado
    // da Steam; a segunda não viraria ponto e gastaria chamada. Fica para
    // o tick seguinte, quando a Steam já publicou a partida seguinte.
    prisma.pendingCapture.findMany.mockResolvedValue([
      { id: "cap-1", userId: "u1", steamId: STEAM, matchMap: "de_mirage", matchMode: "premier", matchScore: null, traceId: TRACE, tentativa: 0 },
      { id: "cap-2", userId: "u1", steamId: STEAM, matchMap: "de_nuke", matchMode: "premier", matchScore: null, traceId: TRACE, tentativa: 0 },
      { id: "cap-3", userId: "u2", steamId: STEAM, matchMap: "de_inferno", matchMode: "premier", matchScore: null, traceId: TRACE, tentativa: 0 },
    ]);
    syncUser.mockResolvedValue({ snapshotsCreated: 1 });
    const { processarCapturasDevidas } = await import("@/lib/capturas");
    const r = await processarCapturasDevidas();
    expect(r).toMatchObject({ processadas: 2, gravadas: 2 });
    expect(syncUser.mock.calls.map((c) => c[3].map)).toEqual(["de_mirage", "de_inferno"]);
  });
});
