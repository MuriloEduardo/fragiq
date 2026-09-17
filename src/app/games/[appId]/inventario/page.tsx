import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { listarInventario, sincronizarInventario } from "@/lib/inventario";
import { InventarioGrade } from "@/components/inventario-grade";
import { InventarioAtualizar } from "@/components/inventario-atualizar";
import { Estado } from "@/components/estado";
import { formatarQuando } from "@/lib/sessoes";

export const dynamic = "force-dynamic";

/**
 * O inventário de CS2 como o jogador o tem — e como ele muda.
 *
 * Primeira visita lê a Steam (uma vez, com intervalo mínimo depois);
 * daí em diante a página é o banco: itens atuais por raridade, resumo por
 * categoria e quantos saíram nos últimos 30 dias. Sem preço — outra fonte.
 */
export default async function InventarioPage({ params }: { params: Promise<{ appId: string }> }) {
  const session = await requireSession();
  const appId = Number((await params).appId);
  if (appId !== 730) notFound();

  let dados = await listarInventario(session.userId);
  if (dados.lidoEm === null) {
    await sincronizarInventario(session.userId, session.steamId).catch(() => null);
    dados = await listarInventario(session.userId);
  }

  if (dados.publico === false && dados.itens.length === 0) {
    return (
      <Estado
        titulo="Inventário privado na Steam"
        texto="Perfil → Privacidade → Inventário: público. Depois, atualize aqui."
        acao={{ rotulo: "Abrir a privacidade da Steam", href: "https://steamcommunity.com/my/edit/settings" }}
      />
    );
  }
  if (dados.itens.length === 0) {
    return <Estado titulo="Nenhum item lido" texto={dados.lidoEm ? "O inventário está vazio na Steam." : "A Steam não respondeu ainda — tente atualizar."} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="num text-xs text-ink-faint" suppressHydrationWarning>
          {dados.itens.length} {dados.itens.length === 1 ? "item" : "itens"}
          {dados.porCategoria.slice(0, 4).map((c) => ` · ${c.n} ${c.categoria}`).join("")}
          {dados.sairam30d ? ` · ${dados.sairam30d} saíram em 30 dias` : ""}
          {dados.lidoEm ? ` · lido ${formatarQuando(dados.lidoEm)}` : ""}
        </p>
        <InventarioAtualizar />
      </div>
      <InventarioGrade itens={dados.itens} />
    </div>
  );
}
