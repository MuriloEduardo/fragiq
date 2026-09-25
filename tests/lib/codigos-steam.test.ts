import { describe, expect, it } from "vitest";
import { authCodeValido, separarCodigos, shareCodeValido } from "@/lib/sharecode";

/**
 * A cola dos dois códigos da Steam: cada um tem que ir para o seu campo,
 * venha de onde vier — o código puro, o link do share code, ou com espaço
 * sobrando do copiar.
 */
const SHARE = "CSGO-GADqf-jjyJ8-cSP2r-smZRo-TO2xK";

describe("separarCodigos", () => {
  it("reconhece o share code puro", () => {
    expect(separarCodigos(SHARE)).toEqual({ share: SHARE });
  });

  it("tira o share code de dentro do link da Steam", () => {
    expect(separarCodigos(`steam://rungame/730/76561202255233023/+csgo_download_match%20${SHARE}`)).toEqual({ share: SHARE });
  });

  it("reconhece o código de autenticação, em minúsculas e com espaço", () => {
    expect(separarCodigos("  7k8s-ynxhw-bfqn ")).toEqual({ auth: "7K8S-YNXHW-BFQN" });
  });

  it("separa os dois códigos colados juntos, com ou sem espaço entre eles", () => {
    expect(separarCodigos(`7k8s-ynxhw-bfqn${SHARE}`)).toEqual({ auth: "7K8S-YNXHW-BFQN", share: SHARE });
    expect(separarCodigos(`${SHARE} 7K8S-YNXHW-BFQN`)).toEqual({ auth: "7K8S-YNXHW-BFQN", share: SHARE });
    expect(separarCodigos(`${SHARE}7k8s-ynxhw-bfqn`)).toEqual({ auth: "7K8S-YNXHW-BFQN", share: SHARE });
  });

  it("não corta um share code com caractere sobrando no fim", () => {
    expect(separarCodigos(`${SHARE}x`)).toEqual({});
    expect(separarCodigos(`${SHARE}-`)).toEqual({});
  });

  it("não quebra com um link copiado pela metade", () => {
    expect(separarCodigos("steam://rungame/730/76561202255233023/+csgo_download_match%2")).toEqual({});
    expect(separarCodigos("100%")).toEqual({});
  });

  it("não adivinha quando não é nenhum dos dois", () => {
    expect(separarCodigos("7K8S-YNXH")).toEqual({});
    expect(separarCodigos("")).toEqual({});
  });
});

describe("validação de formato", () => {
  it("aceita os dois formatos certos", () => {
    expect(authCodeValido("7K8S-YNXHW-BFQN")).toBe(true);
    expect(shareCodeValido(SHARE)).toBe(true);
  });

  it("recusa, sem jogar erro, o que não é URI válida", () => {
    expect(shareCodeValido("%")).toBe(false);
    expect(shareCodeValido(`${SHARE}%`)).toBe(true);
  });

  it("recusa share code com letra fora do alfabeto da Steam", () => {
    // "I", "l", "0" e "1" não existem no alfabeto base 57 do share code.
    expect(shareCodeValido("CSGO-IIIII-jjyJ8-cSP2r-smZRo-TO2xK")).toBe(false);
  });
});
