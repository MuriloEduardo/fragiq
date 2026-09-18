import { describe, expect, it } from "vitest";
import { CODIGOS_STEAM, CONVITES, LEMBRETES_PRIVACIDADE } from "@/lib/lembretes-texto";

/**
 * As mensagens que o bot manda: cada uma cabe no chat da Steam, leva a
 * pessoa ao lugar certo (a página dela, o login, a página da Steam que
 * gera o código) e a última avisa que é a última.
 */
describe("convites e lembretes no chat da Steam", () => {
  const site = "https://fragiq.example";
  const steamId = "76561198757419550";

  it("o convite leva à página pública da própria pessoa e ao login com a Steam", () => {
    const textos = CONVITES(site, steamId);
    expect(textos).toHaveLength(3);
    for (const t of textos) {
      expect(t).toContain(`${site}/p/${steamId}`);
      expect(t).toContain(`${site}/api/auth/steam`);
      expect(t.length).toBeLessThan(700);
    }
    expect(textos[1]).toContain(CODIGOS_STEAM);
    expect(textos[2].toLowerCase()).toContain("último");
  });

  it("a página da Steam dos códigos é a do CS2", () => {
    expect(CODIGOS_STEAM).toMatch(/help\.steampowered\.com.*appid=730/);
    expect(LEMBRETES_PRIVACIDADE(site)[0]).toContain("steamcommunity.com/my/edit/settings");
  });
});
