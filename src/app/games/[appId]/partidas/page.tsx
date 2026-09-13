import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listarPartidas } from "@/lib/partidas";
import { AtivarPartidas, PAGINA_STEAM } from "@/components/ativar-partidas";
import { PartidasTabela } from "@/components/partidas-tabela";

export const dynamic = "force-dynamic";

/**
 * Partidas oficiais, uma a uma — o que a Web API não dá.
 *
 * Sem a corrente ligada a página é o convite: por que vale, o que a Steam
 * pede e a garantia do que NÃO abrimos. Com ela ligada, é a tabela, mais o
 * estado da fila (o bot pergunta ao GC em até um minuto) e o erro, se a
 * Steam parou de aceitar o código.
 */
export default async function PartidasPage({ params }: { params: Promise<{ appId: string }> }) {
  const session = await requireSession();
  const appId = Number((await params).appId);
  if (appId !== 730) notFound();

  const [user, partidas, pendentes] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { partidasAtivadasEm: true, partidasErro: true, shareCodeAtual: true },
    }),
    listarPartidas(session.steamId, 50),
    prisma.match.count({ where: { status: "PENDING", descobertaPorId: session.userId } }),
  ]);
  const ativo = Boolean(user?.partidasAtivadasEm);

  if (!ativo && partidas.length === 0) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-2xl bg-surface p-6 ring-1 ring-line">
          <p className="hud">Partidas oficiais</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">Cada partida, com o placar dos dez.</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            A Steam guarda o scoreboard de cada partida de matchmaking (Premier, Competitivo, Wingman), mas
            só entrega para quem tiver um código gerado por você. Com ele, cada partida nova chega aqui
            sozinha: K/D, HS, MVPs, score, placar — e quem do FragIQ estava do seu lado ou contra.
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-ink-muted">
            <li>· Uma vez só. Depois, nunca mais pede nada.</li>
            <li>· O código só lê o histórico de partidas. Não vê inventário, chat, amigos nem senha.</li>
            <li>· Guardado cifrado. Revogue aqui ou gerando outro na Steam — o antigo morre na hora.</li>
            <li>· Cobre partidas oficiais da Valve. FACEIT e Gamers Club não entram (ainda).</li>
          </ul>
        </section>
        <section className="rounded-2xl bg-surface p-6 ring-1 ring-line">
          <AtivarPartidas />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {user?.partidasErro && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm">
          <p className="font-medium text-danger">A corrente parou.</p>
          <p className="mt-1 text-ink-muted">{user.partidasErro}</p>
          <div className="mt-3">
            <AtivarPartidas compacto />
          </div>
        </div>
      )}
      {!ativo && partidas.length > 0 && (
        <div className="rounded-2xl bg-surface p-4 text-sm ring-1 ring-line">
          <p className="text-ink-muted">
            Estas partidas chegaram pela corrente de outras pessoas do FragIQ que jogaram com você. Para receber
            todas as suas, ligue a sua:
          </p>
          <div className="mt-3">
            <AtivarPartidas compacto />
          </div>
        </div>
      )}
      {pendentes > 0 && (
        <p className="text-sm text-ink-muted">
          <span className="text-accent">{pendentes}</span> {pendentes === 1 ? "partida na fila" : "partidas na fila"} — o bot
          pergunta ao Game Coordinator em até um minuto. Recarregue a página em instantes.
        </p>
      )}
      {partidas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-ink-faint">
          {pendentes > 0 ? "Buscando o scoreboard…" : "Nenhuma partida ainda. A próxima que você jogar aparece aqui depois da coleta."}
        </p>
      ) : (
        <PartidasTabela partidas={partidas} />
      )}
      {ativo && (
        <p className="text-xs text-ink-faint">
          Corrente ligada{user?.shareCodeAtual ? ` · última conhecida ${user.shareCodeAtual}` : ""}. A cada coleta pedimos à Steam a
          próxima. Se a Steam parar de aceitar o código, gere outro na{" "}
          <a href={PAGINA_STEAM} target="_blank" rel="noreferrer" className="underline decoration-line hover:text-ink">
            página da Steam
          </a>{" "}
          e cole de novo. Para revogar: <Link href="/seguranca" className="underline decoration-line hover:text-ink">Segurança e dados</Link>.
        </p>
      )}
    </div>
  );
}
