import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { listarInventario, sincronizarInventario } from "@/lib/inventario";
import { InventarioGrade } from "@/components/inventario-grade";
import { InventarioAtualizar } from "@/components/inventario-atualizar";
import { Estado } from "@/components/estado";
import { formatarQuando } from "@/lib/sessoes";
import { formatarBRL } from "@/lib/precos";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * O inventário de CS2 como o jogador o tem — e como ele muda.
 *
 * Primeira visita lê a Steam (uma vez, com intervalo mínimo depois);
 * daí em diante a página é o banco: itens atuais por raridade, resumo por
 * categoria e quantos saíram nos últimos 30 dias. Sem preço — outra fonte.
 */
export default async function InventarioPage({ params, searchParams }: { params: Promise<{ appId: string }>; searchParams: Promise<{ tipo?: string; raridade?: string }> }) {
  const session = await requireSession();
  const appId = Number((await params).appId);
  if (appId !== 730) notFound();
  const { tipo, raridade } = await searchParams;

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

  const filtrados = dados.itens.filter((i) => (!tipo || i.category === tipo) && (!raridade || i.rarity === raridade));
  const base = `/games/${appId}/inventario`;
  const href = (t?: string, r?: string) => {
    const q = new URLSearchParams();
    if (t) q.set("tipo", t);
    if (r) q.set("raridade", r);
    const qs = q.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const chip = (ativo: boolean) => cn("rounded-full px-2.5 py-1 text-xs ring-1 transition", ativo ? "bg-accent-soft text-accent ring-accent/40" : "text-ink-muted ring-line hover:text-ink");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="num text-xs text-ink-faint" suppressHydrationWarning>
          {dados.itens.length} {dados.itens.length === 1 ? "item" : "itens"}
          {dados.comPreco > 0 ? ` · ${formatarBRL(dados.valorCents)} em ${dados.comPreco} com preço` : " · preços a caminho"}
          {dados.sairam30d ? ` · ${dados.sairam30d} saíram em 30 dias` : ""}
          {dados.lidoEm ? ` · lido ${formatarQuando(dados.lidoEm)}` : ""}
        </p>
        <InventarioAtualizar />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={href(undefined, raridade)} className={chip(!tipo)}>Tudo</Link>
        {dados.porCategoria.map((c) => (
          <Link key={c.categoria} href={href(c.categoria === tipo ? undefined : c.categoria, raridade)} className={chip(tipo === c.categoria)}>
            {c.categoria} <span className="num text-ink-faint">{c.n}</span>
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {dados.porRaridade.map((r) => (
          <Link key={r.raridade} href={href(tipo, r.raridade === raridade ? undefined : r.raridade)} className={chip(raridade === r.raridade)} style={{ color: raridade === r.raridade ? undefined : (r.cor ?? undefined) }}>
            {r.raridade} <span className="num text-ink-faint">{r.n}</span>
          </Link>
        ))}
      </div>

      {filtrados.length ? <InventarioGrade itens={filtrados} /> : <Estado titulo="Nada com esse filtro" texto="Tire um filtro para ver o resto." acao={{ rotulo: "Ver tudo", href: base }} />}

      {dados.mudancas.length > 0 && (
        <section>
          <h2 className="hud mb-2">Últimos 30 dias</h2>
          <ol className="divide-y divide-line-soft rounded-2xl bg-surface ring-1 ring-line">
            {dados.mudancas.slice(0, 20).map((m) => (
              <li key={`${m.tipo}-${m.id}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className={cn("num w-14 shrink-0 text-xs", m.tipo === "entrou" ? "text-good" : "text-bad")}>{m.tipo === "entrou" ? "▲ entrou" : "▼ saiu"}</span>
                <span className="relative h-8 w-11 shrink-0 overflow-hidden rounded bg-surface-2">
                  {m.imageUrl && <Image src={`${m.imageUrl}/88fx64f`} alt="" fill sizes="44px" className="object-contain" unoptimized />}
                </span>
                <span className="min-w-0 flex-1 truncate" style={{ color: m.rarityColor ?? undefined }}>{m.name}</span>
                <span className="num shrink-0 text-xs text-ink-faint" suppressHydrationWarning>{formatarQuando(m.quando)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
