import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O cron lê os perfis do lote numa chamada só e entrega cada um à coleta;
 * se a leitura em lote falha, cada coleta volta a ler o próprio perfil.
 */
const prisma = {
  user: { findMany: vi.fn() },
  cronRun: { create: vi.fn(async () => ({ id: "run-1" })), update: vi.fn() },
};
const syncUser = vi.fn<(...args: unknown[]) => Promise<{ snapshotsCreated: number }>>(async () => ({ snapshotsCreated: 0 }));
const getPlayerSummaries = vi.fn();
const reportarErro = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/steam/sync", () => ({ syncUser }));
vi.mock("@/lib/steam/api", () => ({ getPlayerSummaries }));
vi.mock("@/lib/capturas", () => ({ processarCapturasDevidas: vi.fn(async () => undefined) }));
vi.mock("@/lib/pendencias", () => ({ lembrarPendenciasNoSteam: vi.fn(async () => null) }));
vi.mock("@/lib/eventos", () => ({ registrar: vi.fn(), reportarErro }));

const USERS = [
  { id: "u1", steamId: "76561198000000001" },
  { id: "u2", steamId: "76561198000000002" },
];

function chamar() {
  return import("@/app/api/cron/sync/route").then(({ GET }) =>
    GET(new Request("http://x/api/cron/sync", { headers: { authorization: "Bearer segredo" } }) as never),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "segredo";
  prisma.user.findMany.mockResolvedValue(USERS);
});

describe("cron: perfis do lote numa chamada", () => {
  it("pede todos os perfis de uma vez e passa cada um à coleta", async () => {
    const perfil = { steamid: USERS[0].steamId, personaname: "a", communityvisibilitystate: 3 };
    getPlayerSummaries.mockResolvedValue(new Map([[USERS[0].steamId, perfil]]));

    const res = await chamar();
    expect(res.status).toBe(200);
    expect(getPlayerSummaries).toHaveBeenCalledTimes(1);
    expect(getPlayerSummaries).toHaveBeenCalledWith(USERS.map((u) => u.steamId));
    expect(syncUser.mock.calls[0][5]).toEqual({ perfil });
    // A Steam não devolveu o segundo: a coleta sabe disso e não pergunta de novo.
    expect(syncUser.mock.calls[1][5]).toEqual({ perfil: null });
  });

  it("se a leitura em lote falha, cada coleta lê o próprio perfil", async () => {
    getPlayerSummaries.mockRejectedValue(new Error("cogniflow fora"));

    const res = await chamar();
    expect(res.status).toBe(200);
    expect(reportarErro).toHaveBeenCalledWith("cron.perfis", expect.any(Error));
    expect(syncUser).toHaveBeenCalledTimes(2);
    for (const call of syncUser.mock.calls) expect(call[5]).toEqual({ perfil: undefined });
  });

  it("sem candidatos, não gasta chamada", async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await chamar();
    expect(getPlayerSummaries).not.toHaveBeenCalled();
  });
});
