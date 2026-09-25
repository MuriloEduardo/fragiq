import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Toda recusa que passa pelo cogniflow deixa `steam.recusa` no diário com
 * o status do cogniflow e o da Steam — inclusive as que quem chama engole.
 */
const invocar = vi.fn();
const registrar = vi.fn();

vi.mock("@/lib/cogniflow-api", async (original) => ({
  ...(await original<typeof import("@/lib/cogniflow-api")>()),
  invocar,
}));
vi.mock("@/lib/eventos", () => ({ registrar }));

beforeEach(() => vi.clearAllMocks());

describe("steam.recusa", () => {
  it("um 429 da Steam vira SteamApiError e fica registrado", async () => {
    const { CogniflowApiError } = await import("@/lib/cogniflow-api");
    const { getOwnedGames, SteamApiError } = await import("@/lib/steam/api");
    invocar.mockRejectedValue(new CogniflowApiError("steam.library.read", 502, 429, "Too Many Requests"));

    const err = await getOwnedGames("76561198000000001").catch((e) => e);
    expect(err).toBeInstanceOf(SteamApiError);
    expect(err.status).toBe(429);
    expect(registrar).toHaveBeenCalledWith("steam.recusa", {
      dados: { capability: "steam.library.read", status: 502, providerStatus: 429 },
    });
  });

  it("falha do próprio cogniflow também fica registrada, sem virar erro da Steam", async () => {
    const { CogniflowApiError } = await import("@/lib/cogniflow-api");
    const { getGameStatSchema } = await import("@/lib/steam/api");
    invocar.mockRejectedValue(new CogniflowApiError("steam.stats.schema.read", 503, null, "indisponível"));

    // O schema engole o erro; o diário não.
    expect(await getGameStatSchema(730)).toBeNull();
    expect(registrar).toHaveBeenCalledWith("steam.recusa", {
      dados: { capability: "steam.stats.schema.read", status: 503, providerStatus: null },
    });
  });

  it("resposta boa não registra nada", async () => {
    const { getFriendIds } = await import("@/lib/steam/api");
    invocar.mockResolvedValue({ steam_ids: ["1"] });
    expect(await getFriendIds("x")).toEqual(["1"]);
    expect(registrar).not.toHaveBeenCalled();
  });
});
