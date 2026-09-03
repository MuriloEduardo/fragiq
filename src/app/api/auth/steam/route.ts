import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { STATE_COOKIE, buildAuthorizeUrl, createState } from "@/lib/steam/openid";

export const dynamic = "force-dynamic";

// Passo 1: manda o usuário para a Steam. Nenhuma credencial passa por aqui —
// a senha é digitada no domínio da Valve e nunca chega até nós.
export async function GET() {
  const state = createState();

  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return NextResponse.redirect(buildAuthorizeUrl(state));
}
