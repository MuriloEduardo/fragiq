import { randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../env";

// Steam não fala OAuth2/OIDC para login de terceiros: fala OpenID 2.0.
// São só dois passos — um redirect e uma verificação server-to-server —
// então implementamos direto, sem dependência externa.

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";

const CLAIMED_ID_PATTERN =
  /^https:\/\/steamcommunity\.com\/openid\/id\/(7656119[0-9]{10})$/;

export const STATE_COOKIE = "fragiq_openid_state";

function callbackUrl() {
  return new URL("/api/auth/steam/callback", env().NEXT_PUBLIC_APP_URL).toString();
}

/** Nonce anti-CSRF: viaja no return_to e é comparado com o cookie na volta. */
export function createState() {
  return randomBytes(16).toString("hex");
}

/** URL para onde mandamos o usuário logar na Steam. */
export function buildAuthorizeUrl(state: string) {
  const returnTo = new URL(callbackUrl());
  returnTo.searchParams.set("state", state);

  const params = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo.toString(),
    "openid.realm": env().NEXT_PUBLIC_APP_URL,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.claimed_id": IDENTIFIER_SELECT,
  });

  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

export function statesMatch(a: string | undefined, b: string | undefined) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export type VerifyResult =
  | { ok: true; steamId: string }
  | { ok: false; reason: string };

/**
 * Valida a asserção que a Steam devolveu.
 *
 * A regra de ouro do OpenID 2.0: nada nos parâmetros de query é confiável até
 * que o provedor confirme a assinatura. Reenviamos tudo com
 * mode=check_authentication e só aceitamos se a Steam responder is_valid:true.
 */
export async function verifyAssertion(query: URLSearchParams): Promise<VerifyResult> {
  if (query.get("openid.mode") !== "id_res") {
    return { ok: false, reason: "Login cancelado ou resposta inesperada da Steam." };
  }

  // O return_to assinado tem que ser o nosso, senão a asserção foi emitida
  // para outro site e está sendo replayed aqui.
  const returnTo = query.get("openid.return_to");
  if (!returnTo || new URL(returnTo).origin !== new URL(callbackUrl()).origin) {
    return { ok: false, reason: "return_to não corresponde a esta aplicação." };
  }

  const body = new URLSearchParams(query);
  body.set("openid.mode", "check_authentication");

  let text: string;
  try {
    const res = await fetch(STEAM_OPENID_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, reason: `Steam respondeu ${res.status}.` };
    text = await res.text();
  } catch {
    return { ok: false, reason: "Não foi possível contatar a Steam." };
  }

  if (!/^is_valid:true$/m.test(text)) {
    return { ok: false, reason: "A Steam não validou a asserção." };
  }

  // Só agora o claimed_id é confiável.
  const match = CLAIMED_ID_PATTERN.exec(query.get("openid.claimed_id") ?? "");
  if (!match) return { ok: false, reason: "claimed_id em formato inesperado." };

  return { ok: true, steamId: match[1] };
}
