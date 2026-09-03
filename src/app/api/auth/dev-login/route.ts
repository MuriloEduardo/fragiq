import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Atalho para avaliar a interface sem uma chave da Steam Web API.
// Some completamente fora de desenvolvimento.
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Indisponível." }, { status: 404 });
  }

  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    return NextResponse.json(
      { error: "Nenhum usuário no banco. Rode `npm run seed` primeiro." },
      { status: 404 },
    );
  }

  await createSession({ userId: user.id, steamId: user.steamId });
  return NextResponse.redirect(new URL("/dashboard", env().NEXT_PUBLIC_APP_URL));
}
