import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

const COOKIE = "fragiq_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

export type SessionPayload = {
  userId: string;
  steamId: string;
};

function secret() {
  return new TextEncoder().encode(env().AUTH_SECRET);
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ steamId: payload.steamId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax", // "lax" e não "strict": o retorno da Steam é cross-site.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.steamId !== "string") return null;
    return { userId: payload.sub, steamId: payload.steamId };
  } catch {
    // Assinatura inválida ou token expirado — trata como deslogado.
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}
