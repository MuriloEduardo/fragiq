import { NextResponse, type NextRequest } from "next/server";
import { pareceSteamId, resolverEntrada } from "@/lib/perfil-publico";

export const dynamic = "force-dynamic";

/** O campo "comparar com…" da página pública. */
export async function GET(request: NextRequest) {
  const a = request.nextUrl.searchParams.get("a") ?? "";
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const b = pareceSteamId(a) ? await resolverEntrada(q).catch(() => null) : null;
  const destino = b && b !== a ? `/p/${a}/vs/${b}` : `/p/${a}?erro=${encodeURIComponent("Não achei esse perfil para comparar.")}`;
  return NextResponse.redirect(new URL(destino, request.url));
}
