import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O que a tabela de Sessões lê: o chip de K/D já materializado, casado com a
 * linha pela coleta que fechou a sessão (`Session.ateSnapshotId`).
 *
 * A tabela monta as linhas dos snapshots (`listarSessoes`), então ela tem em
 * mãos o id da coleta, não o da sessão — a junção é o ponto inteiro desta
 * função, e é o que estes testes provam. Prisma é mockado: aqui não há banco.
 */
const prisma = {
  session: { findMany: vi.fn() },
  insight: { findMany: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({ prisma }));

const insight = (escopoId: string, o: Record<string, unknown> = {}) => ({
  id: `i-${escopoId}`,
  escopoId,
  regra: "kd.vs.normal",
  regraVersao: 1,
  tom: "BOM",
  confianca: "EXATA",
  base: { rounds: 24, sessoes: 6 },
  visual: "CHIP",
  dados: { delta: { estado: "ok", valor: 50, unidade: "%", direcao: "sobe", valencia: "good", fraco: false }, rotulo: "K/D", fraco: false },
  linha: "K/D 1,50 · +50% vs normal do Premier (6 sessões)",
  valor: 1.5,
  referencia: 1,
  ...o,
});

beforeEach(() => vi.clearAllMocks());

describe("chips de sessão", () => {
  it("chaveia pela coleta que fechou a sessão, não pelo id da sessão", async () => {
    prisma.session.findMany.mockResolvedValue([{ id: "s1", ateSnapshotId: "snap-1" }]);
    prisma.insight.findMany.mockResolvedValue([insight("s1")]);
    const { chipsDeSessao } = await import("@/lib/insights/ler");

    const chips = await chipsDeSessao("u1", 730);
    expect([...chips.keys()]).toEqual(["snap-1"]);
    expect(chips.get("snap-1")!.linha).toBe("K/D 1,50 · +50% vs normal do Premier (6 sessões)");
    expect(chips.get("snap-1")!.dados.delta).toMatchObject({ estado: "ok", valor: 50, valencia: "good" });
  });

  it("pede só `kd.vs.normal` de escopo SESSAO, e só das sessões daquele jogador e jogo", async () => {
    prisma.session.findMany.mockResolvedValue([
      { id: "s1", ateSnapshotId: "snap-1" },
      { id: "s2", ateSnapshotId: "snap-2" },
    ]);
    prisma.insight.findMany.mockResolvedValue([]);
    const { chipsDeSessao } = await import("@/lib/insights/ler");

    await chipsDeSessao("u1", 730);
    expect(prisma.session.findMany.mock.calls[0][0]).toMatchObject({ where: { userId: "u1", gameAppId: 730 } });
    expect(prisma.insight.findMany.mock.calls[0][0]).toMatchObject({
      where: { escopo: "SESSAO", escopoId: { in: ["s1", "s2"] }, regra: "kd.vs.normal" },
      // A ordem vem do banco: é ela que faz a versão mais nova vencer abaixo.
      orderBy: { regraVersao: "desc" },
    });
  });

  it("sessão sem insight não vira chip — vazio é vazio, não 0%", async () => {
    prisma.session.findMany.mockResolvedValue([
      { id: "s1", ateSnapshotId: "snap-1" },
      { id: "s2", ateSnapshotId: "snap-2" },
    ]);
    prisma.insight.findMany.mockResolvedValue([insight("s2")]);
    const { chipsDeSessao } = await import("@/lib/insights/ler");

    const chips = await chipsDeSessao("u1", 730);
    expect(chips.has("snap-1")).toBe(false);
    expect(chips.has("snap-2")).toBe(true);
  });

  it("com duas versões da regra no banco, a mais nova vence", async () => {
    prisma.session.findMany.mockResolvedValue([{ id: "s1", ateSnapshotId: "snap-1" }]);
    prisma.insight.findMany.mockResolvedValue([
      insight("s1", { regraVersao: 2, linha: "versão nova" }),
      insight("s1", { regraVersao: 1, linha: "versão velha" }),
    ]);
    const { chipsDeSessao } = await import("@/lib/insights/ler");

    expect((await chipsDeSessao("u1", 730)).get("snap-1")!.linha).toBe("versão nova");
  });

  it("jogo sem sessão nenhuma não vai ao banco atrás de insights", async () => {
    prisma.session.findMany.mockResolvedValue([]);
    const { chipsDeSessao } = await import("@/lib/insights/ler");

    expect((await chipsDeSessao("u1", 440)).size).toBe(0);
    expect(prisma.insight.findMany).not.toHaveBeenCalled();
  });
});
