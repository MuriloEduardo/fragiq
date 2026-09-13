import { NextResponse, type NextRequest } from "next/server";
import { resolverEntrada } from "@/lib/perfil-publico";

export const dynamic = "force-dynamic";

/** O campo da landing: aceita ID, link ou apelido e leva à página pública. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  let steamId: string | null = null;
  try {
    steamId = await resolverEntrada(q);
  } catch {
    steamId = null;
  }
  const destino = steamId
    ? `/p/${steamId}`
    : `/?erro=${encodeURIComponent("Não achei esse perfil. Cole o link do perfil da Steam ou o SteamID64.")}`;
  return NextResponse.redirect(new URL(destino, request.url));
}
