import { describe, expect, it } from "vitest";
import {
  buildSeries,
  classifyMetric,
  normalDe,
  ultimoPar,
  NORMAL_MIN_ROUNDS,
  NORMAL_MIN_SESSOES,
} from "@/lib/series";
import { CS2_PANEL } from "@/lib/cs2-panel";
import { normal, serie } from "./fixtures";

const KD = CS2_PANEL.find((s) => s.key === "kd")!;

describe("classifyMetric", () => {
  it("separa contador, gauge e oculto", () => {
    expect(classifyMetric("total_kills")).toBe("counter");
    expect(classifyMetric("last_match_kills")).toBe("gauge");
    expect(classifyMetric("GI.lesson.csgo_instr_explain_buymenu")).toBe("hidden");
  });
});

describe("ultimoPar", () => {
  it("ignora o ponto de cron sem jogo e volta ao último par com movimento", () => {
    const rows = serie([normal(), normal({ kills: 45, deaths: 30, paradaAntes: true })]);
    // s1 base, s2 sessão 1, s3 parada, s4 sessão 2.
    const par = ultimoPar(rows, "total_rounds_played")!;
    expect(par.curr.id).toBe("s4");
    expect(par.prev.id).toBe("s3");
  });

  it("uma leitura atrasada da Steam não vira partida negativa nem base", () => {
    const rows = serie([normal(), normal()]);
    const atrasada = {
      ...rows[1],
      id: "x",
      capturedAt: new Date(rows[1].capturedAt.getTime() + 1000),
      metrics: { ...rows[1].metrics, total_kills: rows[1].metrics.total_kills - 6 },
    };
    const comAtraso = [rows[0], rows[1], atrasada, rows[2]];
    const pts = buildSeries(comAtraso, { id: "k", metric: "total_kills", mode: "delta" }, "raw");
    expect(pts.map((p) => p.value)).toEqual([30, 30]);
  });
});

describe("buildSeries por dia", () => {
  it("um bucket guarda o último snapshot do dia, sem somar duplicado", () => {
    const rows = serie([normal(), normal()]);
    const mesmoDia = {
      ...rows[1],
      id: "y",
      capturedAt: new Date(rows[1].capturedAt.getTime() + 3600_000),
      metrics: { ...rows[1].metrics, total_kills: rows[1].metrics.total_kills + 10 },
    };
    const pts = buildSeries(
      [rows[0], rows[1], mesmoDia, rows[2]],
      { id: "k", metric: "total_kills", mode: "delta" },
      "day",
    );
    expect(pts.map((p) => p.value)).toEqual([40, 20]);
  });
});

describe("normalDe", () => {
  it("exige sessões e rounds no modo, e exclui a sessão lida", () => {
    const poucas = serie([
      ...Array.from({ length: NORMAL_MIN_SESSOES - 1 }, () => normal({ modo: "premier" })),
      normal({ modo: "premier" }),
    ]);
    expect(normalDe(poucas, KD, { modo: "premier" }, poucas[poucas.length - 1].id!).tipo).toBe("vitalicio-fraco");

    const bastantes = serie([
      ...Array.from({ length: NORMAL_MIN_SESSOES }, () => normal({ modo: "premier" })),
      normal({ kills: 90, deaths: 30, modo: "premier" }),
    ]);
    const n = normalDe(bastantes, KD, { modo: "premier" }, bastantes[bastantes.length - 1].id!);
    expect(n.tipo).toBe("modo");
    expect(n.tipo === "modo" && n.valor).toBe(1);
    expect(NORMAL_MIN_SESSOES * 30).toBeGreaterThanOrEqual(NORMAL_MIN_ROUNDS);
  });

  it("sessões fracas não entram na base", () => {
    const rows = serie([
      ...Array.from({ length: NORMAL_MIN_SESSOES }, () => normal({ modo: "premier", rounds: 5, partidas: 1 })),
      normal({ modo: "premier" }),
    ]);
    expect(normalDe(rows, KD, { modo: "premier" }, rows[rows.length - 1].id!).tipo).toBe("vitalicio-fraco");
  });
});
