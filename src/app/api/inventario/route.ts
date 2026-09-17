import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sincronizarInventario } from "@/lib/inventario";

export const dynamic = "force-dynamic";

/** Atualizar o inventário à mão: respeita o intervalo mínimo, como o sync. */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const r = await sincronizarInventario(session.userId, session.steamId);
  return NextResponse.json(r);
}
