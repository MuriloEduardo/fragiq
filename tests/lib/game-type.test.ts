import { describe, expect, it } from "vitest";
import { decodificarGameType, mapaDoGameType, modoDoGameType } from "@/lib/game-type";

describe("game_type do GC como bitmask", () => {
  it("competitivo de um mapa só: byte baixo 8 + bit do mapa", () => {
    // Os dois valores que produção acumulou com modo nulo: Mirage e Inferno.
    expect(decodificarGameType(32776)).toEqual({ modo: "competitive", mapa: "de_mirage", premier: false });
    expect(decodificarGameType(4104)).toEqual({ modo: "competitive", mapa: "de_inferno", premier: false });
    expect(decodificarGameType(520)).toEqual({ modo: "competitive", mapa: "de_dust2", premier: false });
    expect(decodificarGameType(8388616)).toEqual({ modo: "competitive", mapa: "de_anubis", premier: false });
    expect(decodificarGameType(268435464)).toEqual({ modo: "competitive", mapa: "de_overpass", premier: false });
  });

  it("competitivo sem bit de mapa (o valor clássico do CS:GO) continua competitivo", () => {
    expect(decodificarGameType(8)).toEqual({ modo: "competitive", mapa: null, premier: false });
  });

  it("premier é o competitivo com o bit 25 e sem mapa — o mapa sai do veto", () => {
    expect(decodificarGameType(33554440)).toEqual({ modo: "premier", mapa: null, premier: true });
  });

  it("264 era 'Wingman' na tabela antiga; pelo bitmask é competitivo num mapa sem nome conhecido (bit 8)", () => {
    expect(decodificarGameType(264)).toEqual({ modo: "competitive", mapa: null, premier: false });
  });

  it("wingman, casual e danger zone pelo byte baixo", () => {
    expect(modoDoGameType(814513162)).toBe("scrimcomp2v2");
    expect(modoDoGameType(276870151)).toBe("casual");
    expect(modoDoGameType(519)).toBe("casual");
    expect(modoDoGameType(197389)).toBe("survival");
  });

  it("skirmish diz qual jogo é pelos bits altos", () => {
    expect(modoDoGameType(131084)).toBe("gungameprogressive");
    expect(modoDoGameType(262156)).toBe("gungametrbomb");
    expect(modoDoGameType(524300)).toBe("retakes");
    expect(modoDoGameType(1036)).toBe("flyingscoutsman");
  });

  it("casual não carrega mapa no bitmask: é um grupo, o cabeçalho da demo decide", () => {
    expect(mapaDoGameType(276870151)).toBeNull();
    expect(mapaDoGameType(519)).toBeNull();
  });

  it("desconhecido e ausente viram null em vez de chute", () => {
    expect(decodificarGameType(null)).toEqual({ modo: null, mapa: null, premier: false });
    expect(decodificarGameType(undefined)).toEqual({ modo: null, mapa: null, premier: false });
    expect(decodificarGameType(3)).toEqual({ modo: null, mapa: null, premier: false });
    expect(decodificarGameType(-8)).toEqual({ modo: null, mapa: null, premier: false });
    expect(decodificarGameType(1 << 30)).toEqual({ modo: null, mapa: null, premier: false });
  });
});
