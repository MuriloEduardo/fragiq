import { describe, expect, it } from "vitest";
import { consultar, ViewInvalida, type Fonte } from "@/lib/analista";
import { metricCatalog } from "@/lib/series";
import { normal, serie } from "./fixtures";

function fonte(rows: ReturnType<typeof serie>): Fonte {
  return {
    appId: 730,
    gameName: "Counter-Strike 2",
    playtimeForeverMin: 60000,
    rows,
    catalog: metricCatalog(rows, null),
    partidasOficiais: [],
  };
}

type Painel = {
  estatistica: string;
  periodo: number | null;
  vitalicio: number | null;
  referencia: { tipo: string; sessoes: number | null };
};

describe("view resumo", () => {
  it("o painel devolve a referência da tela, com o tipo", () => {
    const rows = serie([
      ...Array.from({ length: 6 }, () => normal({ modo: "premier" })),
      normal({ kills: 60, deaths: 30, modo: "premier" }),
    ]);
    const r = consultar(fonte(rows), "resumo", { modo: "premier" }) as {
      painel: Painel[];
      periodo: { modo: string | null };
    };
    const kd = r.painel.find((p) => p.estatistica === "K/D")!;
    expect(kd.periodo).toBe(2);
    expect(kd.vitalicio).toBe(1);
    expect(kd.referencia.tipo).toBe("modo");
    expect(kd.referencia.sessoes).toBe(6);
    expect(r.periodo.modo).toBe("Premier");
  });

  it("na primeira sessão do modo, o painel diz que o normal é o vitalício por falta de base", () => {
    const rows = serie([
      ...Array.from({ length: 10 }, () => normal()),
      normal({ kills: 60, deaths: 30, modo: "premier" }),
    ]);
    const r = consultar(fonte(rows), "resumo", { modo: "premier" }) as { painel: Painel[] };
    const kd = r.painel.find((p) => p.estatistica === "K/D")!;
    expect(kd.referencia.tipo).toBe("vitalicio-fraco");
    expect(kd.vitalicio).not.toBe(kd.periodo);
  });

  it("recusa view desconhecida com a lista das que existem", () => {
    expect(() => consultar(fonte(serie([normal()])), "resumão", {})).toThrow(ViewInvalida);
    expect(() => consultar(fonte(serie([normal()])), "resumão", {})).toThrow(/resumo, metricas, serie/);
  });

  it("serie em razão devolve o mesmo vitalício do painel", () => {
    const rows = serie([
      ...Array.from({ length: 6 }, () => normal({ modo: "premier" })),
      normal({ kills: 60, deaths: 30, modo: "premier" }),
    ]);
    const s = consultar(fonte(rows), "serie", {
      metrica: "total_kills",
      denominador: "total_deaths",
      modo: "premier",
      bucket: "raw",
    }) as { vitalicio: number; pontos: { valor: number }[] };
    expect(s.vitalicio).toBe(1);
    expect(s.pontos[s.pontos.length - 1].valor).toBe(2);
  });

  it("armas traz a precisão do período e a referência", () => {
    const rows = serie([...Array.from({ length: 6 }, () => normal()), normal({ ak: { tiros: 100, acertos: 40 } })]);
    const a = consultar(fonte(rows), "armas", {}) as {
      armas: {
        arma: string;
        periodo: { precisao: number };
        vitalicio: { precisao: number };
        referencia: { tipo: string };
      }[];
    };
    const ak = a.armas.find((x) => x.arma === "ak47")!;
    expect(ak.periodo.precisao).toBe(40);
    expect(ak.referencia.tipo).toBe("vitalicio");
    expect(ak.vitalicio.precisao).toBeCloseTo((6 * 30 + 40) / 7, 0);
  });
});
