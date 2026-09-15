import { describe, expect, it } from "vitest";
import { lerAnalise } from "@/lib/analise-texto";

describe("lerAnalise", () => {
  it("reconhece a forma fixa: manchete em negrito, parágrafos, ação", () => {
    const lida = lerAnalise(
      "**Sua melhor noite de AWP em duas semanas.**\n\nA precisão subiu para **41 %**.\n\nAmostra de 28 rounds: indício.\n\n→ Na próxima, mantenha a AWP no CT.",
    );
    expect(lida.manchete).toBe("Sua melhor noite de AWP em duas semanas.");
    expect(lida.paragrafos).toHaveLength(2);
    expect(lida.acao).toBe("Na próxima, mantenha a AWP no CT.");
  });

  it("um primeiro parágrafo curto sem marcação não vira manchete", () => {
    const lida = lerAnalise("Foi uma noite comum.\n\nNada mudou de verdade.\n\n→ Jogue mais.");
    expect(lida.manchete).toBeNull();
    expect(lida.paragrafos[0]).toBe("Foi uma noite comum.");
  });

  it("manchete terminada em dois-pontos ou longa demais é corpo", () => {
    expect(lerAnalise("**Resumo:**\n\ncorpo").manchete).toBeNull();
    expect(lerAnalise(`**${"x".repeat(91)}**\n\ncorpo`).manchete).toBeNull();
  });

  it("a ação colada no último parágrafo ainda é a ação", () => {
    const lida = lerAnalise("**Manchete curta.**\n\nCorpo.\n→ Faça isto.");
    expect(lida.paragrafos).toEqual(["Corpo."]);
    expect(lida.acao).toBe("Faça isto.");
  });
});
