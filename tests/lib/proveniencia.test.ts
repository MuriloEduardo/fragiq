import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O fio do traceId: nasce no aviso do bot, vira observação e captura, e a
 * coleta que a captura dispara recebe o mesmo id — é assim que um ponto
 * responde "quem me criou" (docs/dados-confiaveis.md §3.1).
 */
const prisma = {
  user: { findUnique: vi.fn() },
  botObservation: { create: vi.fn() },
  pendingCapture: { upsert: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
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

beforeEach(() => {
  vi.clearAllMocks();
  prisma.pendingCapture.upsert.mockImplementation(async ({ create }) => ({ ...create, id: "cap-1" }));
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

    const cap = prisma.pendingCapture.upsert.mock.calls[0][0].create;
    expect(cap).toMatchObject({ userId: "u1", matchMode: "premier", traceId: TRACE });
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
});
