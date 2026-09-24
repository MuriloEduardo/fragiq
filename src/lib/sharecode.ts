/**
 * Share code de partida do CS2 (`CSGO-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx`).
 *
 * É um número de 18 bytes em base 57, escrito de trás para frente: os oito
 * primeiros bytes são o matchid do Game Coordinator, os oito seguintes o
 * id da reserva (o "outcome") e os dois últimos a porta do GOTV, que
 * funciona como token. Mesmo algoritmo do csgo-sharecode, do akiver.
 */
const ALFABETO = "ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789";
const FORMATO = /^CSGO(?:-[ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789]{5}){5}$/;

export type ShareCode = { matchId: bigint; outcomeId: bigint; token: number };

export function shareCodeValido(codigo: string): boolean {
  return FORMATO.test(normalizarShareCode(codigo));
}

/** Aceita o link inteiro (`steam://rungame/730/.../+csgo_download_match%20CSGO-...`) ou só o código. */
export function normalizarShareCode(entrada: string): string {
  const achado = decodeURIComponent(entrada.trim()).match(/CSGO(?:-[A-Za-z0-9]{5}){5}/);
  return achado ? achado[0] : entrada.trim();
}

export function decodificarShareCode(codigo: string): ShareCode {
  const limpo = normalizarShareCode(codigo);
  if (!FORMATO.test(limpo)) throw new Error(`share code inválido: ${codigo}`);

  const letras = limpo.replace(/^CSGO-/, "").replaceAll("-", "");
  let numero = 0n;
  for (const letra of [...letras].reverse()) numero = numero * 57n + BigInt(ALFABETO.indexOf(letra));

  const bytes = Buffer.from(numero.toString(16).padStart(36, "0"), "hex");
  return {
    matchId: bytes.readBigUInt64LE(0),
    outcomeId: bytes.readBigUInt64LE(8),
    token: bytes.readUInt16LE(16),
  };
}

/** Código de autenticação do histórico de partidas: `XXXX-XXXXX-XXXX`. */
const FORMATO_AUTH = /^[A-Z0-9]{4}-[A-Z0-9]{5}-[A-Z0-9]{4}$/i;

export function authCodeValido(codigo: string): boolean {
  return FORMATO_AUTH.test(codigo.trim());
}

/**
 * O que foi colado, e em que campo deveria estar. A página da Steam mostra
 * os dois códigos um embaixo do outro, e é comum colar o share code no
 * campo do código de autenticação (ou o contrário); o formulário usa isto
 * para mover a cola em vez de devolver "formato errado".
 */
export function separarCodigos(colado: string): { auth?: string; share?: string } {
  const share = normalizarShareCode(colado);
  if (FORMATO.test(share)) return { share };
  const auth = colado.trim().toUpperCase();
  return FORMATO_AUTH.test(auth) ? { auth } : {};
}
