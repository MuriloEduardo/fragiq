import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import type { DemoPayload } from "@/lib/demo/payload";
import { ladosPorRound, REGRAS_VERSAO } from "@/lib/demo/metricas";

/**
 * O que `gravarDemo` escreve nas linhas de time e de jogador. A regra de
 * cada número tem os próprios testes; aqui o ponto é a fronteira com o
 * banco — em especial que demo sem amostra de economia grava **nulo**, e
 * não zero, porque "0 rounds de eco" diria que o time comprou em todos.
 * Prisma é mockado: aqui não há banco.
 */
const prisma = {
  $transaction: vi.fn(async (ops: unknown[]) => ops),
  matchDemo: { upsert: vi.fn() },
  matchPlayerDemo: { deleteMany: vi.fn(), createMany: vi.fn() },
  matchTeamDemo: { deleteMany: vi.fn(), createMany: vi.fn() },
  match: { updateMany: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/eventos", () => ({ registrar: vi.fn() }));

/** A partida real de Premier em Ancient dos outros testes de demo — payload v1, sem economia. */
const ancient: DemoPayload = JSON.parse(readFileSync(new URL("../fixtures/demo-ancient.json", import.meta.url), "utf8"));

/** A mesma partida em v2: pistol no primeiro round, compra cheia nos outros. */
function comEconomia(p: DemoPayload): DemoPayload {
  const lados = ladosPorRound(p);
  return {
    ...p,
    versao: 2,
    rounds: p.rounds.map((r) => ({
      ...r,
      economia: [...(lados.get(r.n) ?? [])].map(([steamId, lado]) => ({ steamId, lado, saldo: 0, equipamento: r.n === 1 ? 800 : 4200 })),
    })),
  };
}

type Linha = Record<string, unknown>;
const times = () => prisma.matchTeamDemo.createMany.mock.calls[0][0].data as Linha[];
const jogadores = () => prisma.matchPlayerDemo.createMany.mock.calls[0][0].data as Linha[];

beforeEach(() => vi.clearAllMocks());

describe("gravarDemo — economia", () => {
  it("demo v1 grava as contagens do time e o recorte por compra como nulos", async () => {
    const { gravarDemo } = await import("@/lib/demos");
    await gravarDemo("m1", ancient);
    expect(times()).toHaveLength(2);
    for (const t of times()) {
      expect(t.versaoRegras).toBe(REGRAS_VERSAO);
      for (const c of ["pistol", "pistolGanhos", "eco", "ecoGanhos", "meia", "meiaGanhas", "cheia", "cheiaGanhas"]) expect(t[c]).toBeNull();
    }
    expect(jogadores().every((j) => j.porCompra === Prisma.JsonNull)).toBe(true);
  });

  it("demo v2 grava as contagens do time, com zero onde o time não jogou a classe, e o recorte por compra de cada um", async () => {
    const { gravarDemo } = await import("@/lib/demos");
    await gravarDemo("m1", comEconomia(ancient));
    for (const t of times()) {
      expect(t).toMatchObject({ pistol: 1, eco: 0, ecoGanhos: 0, meia: 0, meiaGanhas: 0, cheia: (t.rounds as number) - 1 });
      expect((t.pistolGanhos as number) + (t.cheiaGanhas as number)).toBe(t.roundsGanhos);
    }
    for (const j of jogadores()) {
      const e = j.porCompra as Record<string, { rounds: number; dano: number }>;
      // A soma das classes é o dano e os rounds da partida: todo round desta tem amostra.
      expect(Object.values(e).reduce((s, c) => s + c.dano, 0)).toBe(j.dano);
      expect(Object.values(e).reduce((s, c) => s + c.rounds, 0)).toBe(j.rounds);
    }
  });
});
