import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { carregar, ehTipo } from "@/lib/admin-bruto";

export const dynamic = "force-dynamic";

/**
 * O mesmo payload da tela, sozinho, como `application/json`.
 *
 * A árvore serve para procurar; isto serve para levar embora — `curl |
 * jq`, o visualizador do navegador, um diff contra o que o bot mandou. Sem
 * um envelope nosso em volta: o corpo é a coluna, e nada mais, senão
 * qualquer comparação com a fonte começa tendo que descascar dois níveis.
 *
 * Mesma porta do painel: sem sessão, ou sem estar em ADMIN_STEAM_IDS, é
 * 404 — a URL não precisa anunciar que existe.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !isAdmin(session.steamId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(req.url);
  const tipo = url.searchParams.get("tipo") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!ehTipo(tipo) || !id) return new NextResponse("Not found", { status: 404 });

  const registro = await carregar(tipo, id);
  if (!registro) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(JSON.stringify(registro.payload ?? null, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
