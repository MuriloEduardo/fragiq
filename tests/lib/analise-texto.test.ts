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

import { lerAnaliseEstruturada } from "@/lib/analise-texto";

describe("lerAnaliseEstruturada (prompt v4)", () => {
  it("lê o JSON do agente, com defaults para o que faltar", () => {
    const r = lerAnaliseEstruturada(
      '```json\n{"manchete":"Noite de AK, não de AWP.","achados":[{"rotulo":"Precisão AK-47","valor":20.1,"referencia":7.8,"unidade":"%"},{"rotulo":"K/D","valor":0.59,"referencia":0.7}],"causa":"Kills de AK subiram e os de AWP caíram","acao":"Segure a AK nos rounds de eco"}\n```',
    );
    expect(r?.manchete).toBe("Noite de AK, não de AWP.");
    expect(r?.achados).toHaveLength(2);
    expect(r?.achados[0]).toMatchObject({ rotulo: "Precisão AK-47", valor: 20.1, referencia: 7.8, unidade: "%", melhorQuando: "sobe", nota: null });
    expect(r?.acao).toBe("Segure a AK nos rounds de eco");
  });

  it("prosa não é estruturada; JSON com linha longa demais também não", () => {
    expect(lerAnaliseEstruturada("**Manchete.**\n\nCorpo.")).toBeNull();
    expect(lerAnaliseEstruturada(JSON.stringify({ manchete: "x".repeat(91) }))).toBeNull();
    expect(lerAnaliseEstruturada("{oops")).toBeNull();
  });
});
