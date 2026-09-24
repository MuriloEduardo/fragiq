import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { agenteDoLado, iconeDaArma, iconeDaPatente, noRadar, pontosDoRadar, radarDoMapa } from "@/lib/cs2-assets";
import { armasNasMetricas } from "@/lib/cs2-labels";

const noPublico = (url: string) => existsSync(path.join(__dirname, "../../public", url));

describe("noRadar", () => {
  it("põe o bomb A da Dust2 onde o próprio jogo marca", () => {
    // Centro do A em coordenadas do jogo; o overview da Valve diz (0,80; 0,16).
    const p = noRadar("de_dust2", 1150, 2500)!;
    const [ax, ay] = pontosDoRadar("de_dust2").a!;
    expect(p.x).toBeCloseTo(ax, 1);
    expect(p.y).toBeCloseTo(ay, 1);
    expect(p.inferior).toBe(false);
  });

  it("manda o que está abaixo do corte para o radar de baixo da Nuke", () => {
    expect(noRadar("de_nuke", 0, 0, -700)!.inferior).toBe(true);
    expect(noRadar("de_nuke", 0, 0, 0)!.inferior).toBe(false);
    expect(noRadar("de_mirage", 0, 0, -700)!.inferior).toBe(false);
  });

  it("não inventa posição em mapa sem radar", () => {
    expect(noRadar("workshop_qualquer", 0, 0)).toBeNull();
  });
});

describe("arquivos", () => {
  it("toda arma que a Steam conta tem ícone no disco", () => {
    const metricas = Object.fromEntries(
      ["ak47", "m4a1", "awp", "deagle", "glock", "hkp2000", "p250", "fiveseven", "tec9", "elite", "galilar",
        "famas", "aug", "sg556", "ssg08", "scar20", "g3sg1", "mac10", "mp7", "mp9", "ump45", "p90", "bizon",
        "nova", "xm1014", "mag7", "sawedoff", "m249", "negev", "taser"].map((a) => [`total_shots_${a}`, 1]),
    );
    for (const arma of armasNasMetricas(metricas)) {
      const url = iconeDaArma(arma);
      expect(url, arma).not.toBeNull();
      expect(noPublico(url!), url!).toBe(true);
    }
  });

  it("aceita o nome do evento da demo e recusa o que o jogo não tem", () => {
    expect(iconeDaArma("weapon_ak47")).toBe("/cs2/armas/ak47.svg");
    expect(iconeDaArma("arma_do_futuro")).toBeNull();
  });

  it("radar, patente e agente apontam para arquivos que existem", () => {
    for (const mapa of ["de_dust2", "de_mirage", "de_inferno", "de_nuke", "de_ancient", "de_anubis", "de_overpass", "de_vertigo", "de_train"]) {
      expect(noPublico(radarDoMapa(mapa)!), mapa).toBe(true);
    }
    expect(noPublico(radarDoMapa("de_nuke", true)!)).toBe(true);
    expect(radarDoMapa("de_mirage", true)).toBeNull();
    for (let n = 1; n <= 18; n++) expect(noPublico(iconeDaPatente(n)!)).toBe(true);
    expect(iconeDaPatente(0)).toBeNull();
    expect(noPublico(agenteDoLado("CT", "76561198000000000"))).toBe(true);
    expect(agenteDoLado("T", "abc")).toBe(agenteDoLado("T", "abc"));
  });
});
