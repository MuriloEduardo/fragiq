import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { carregarPainel, FUSO } from "@/lib/admin-dados";
import { SiteHeader } from "@/components/site-header";
import { BarrasPorDia } from "@/components/barras-por-dia";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Painel de operação: quem entrou, o que fizeram, a coleta está saudável.
 *
 * Restrito por SteamID (ADMIN_STEAM_IDS). Quem não é admin recebe 404, não
 * 403 — a URL não precisa anunciar que existe.
 */
export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/");
  if (!isAdmin(session.steamId)) notFound();

  const [user, painel] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { personaName: true, avatarUrl: true, lastSyncedAt: true },
    }),
    carregarPainel(),
  ]);
  if (!user) redirect("/");

  const { totais, usuarios, porDia } = painel;

  return (
    <>
      <SiteHeader {...user} admin />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Painel</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Quem entrou, o que aconteceu e se a coleta está saudável. Horários em Brasília.
        </p>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile rotulo="Jogadores" valor={totais.usuarios} nota={`${totais.novos7d} novos em 7 dias`} />
          <Tile rotulo="Ativos em 7 dias" valor={totais.ativos7d} nota="sincronizaram na semana" />
          <Tile
            rotulo="Coletas"
            valor={totais.coletas}
            nota={`${totais.coletasComContexto} com mapa e modo`}
          />
          <Tile
            rotulo="Análises"
            valor={totais.analises}
            nota={`${totais.analisesRespondidas} respondidas · ${totais.feedbacks} feedback${totais.feedbacks === 1 ? "" : "s"}`}
          />
        </section>

        <section className="mt-8 grid gap-3 lg:grid-cols-2">
          <BarrasPorDia titulo="Cadastros por dia" pontos={porDia.cadastros} />
          <BarrasPorDia titulo="Sincronizações por dia" pontos={porDia.syncs} />
          <BarrasPorDia titulo="Coletas por dia" pontos={porDia.coletas} />
          <BarrasPorDia titulo="Análises por dia" pontos={porDia.analises} />
        </section>

        <Secao titulo="Jogadores" sub="Todo mundo que entrou com a Steam, do mais recente ao mais antigo.">
          <Tabela
            cabecalho={["Jogador", "País", "Cadastro", "Último sync", "Logins", "Syncs", "CS2", "Coletas", "Última coleta", "Análises", "Feedback"]}
            linhas={usuarios.map((u) => [
              <span key="p" className="flex items-center gap-2">
                {u.avatarUrl && (
                  <Image src={u.avatarUrl} alt="" width={24} height={24} className="size-6 rounded-full ring-1 ring-line" unoptimized />
                )}
                <a
                  href={`https://steamcommunity.com/profiles/${u.steamId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-accent"
                >
                  {u.personaName}
                </a>
              </span>,
              u.countryCode ?? "—",
              dataHora(u.createdAt),
              u.lastSyncedAt ? dataHora(u.lastSyncedAt) : "nunca",
              u.logins,
              u.syncs,
              u.cs2 ? `${u.cs2.horas} h` : "—",
              u.cs2?.coletas ?? "—",
              u.cs2?.ultimaColeta ? dataHora(u.cs2.ultimaColeta) : "—",
              u.analises,
              u.feedbacks,
            ])}
            vazio="Ninguém entrou ainda."
          />
        </Secao>

        <Secao titulo="Coleta agendada" sub="Uma linha por execução do cron. `skipped` > 0 significa que a fila não está sendo vazada no ritmo.">
          <Tabela
            cabecalho={["Início", "Status", "Candidatos", "Sincronizados", "Falhas", "Pulados", "Pontos", "Duração", "Erro"]}
            linhas={painel.cronRecentes.map((c) => [
              dataHora(c.startedAt),
              <Status key="s" valor={c.status} />,
              c.candidates,
              c.synced,
              c.failed,
              c.skipped,
              c.snapshots,
              duracao(c.duracaoMs),
              c.error ? <span className="text-danger">{c.error}</span> : "",
            ])}
            vazio="O cron ainda não rodou."
          />
        </Secao>

        <Secao titulo="Sincronizações recentes" sub="Manual, login, cron ou evento do bot.">
          <Tabela
            cabecalho={["Início", "Jogador", "Gatilho", "Status", "Jogos", "Duração", "Erro"]}
            linhas={painel.syncsRecentes.map((s) => [
              dataHora(s.startedAt),
              s.persona,
              s.trigger,
              <Status key="s" valor={s.status} />,
              s.gamesStored,
              duracao(s.duracaoMs),
              s.error ? <span className="text-danger">{s.error}</span> : "",
            ])}
            vazio="Nenhuma sincronização ainda."
          />
        </Secao>

        <Secao titulo="Analista" sub="Pedidos ao cogniflow e quanto demoraram para voltar.">
          <Tabela
            cabecalho={["Quando", "Jogador", "Tipo", "Status", "Latência", "Pergunta / erro"]}
            linhas={painel.analisesRecentes.map((a) => [
              dataHora(a.createdAt),
              a.persona,
              a.kind === "SESSION" ? "sessão" : "pergunta",
              <Status key="s" valor={a.status} />,
              duracao(a.latenciaMs),
              <span key="q" className="block max-w-md truncate" title={a.error ?? a.question}>
                {a.error ? <span className="text-danger">{a.error}</span> : a.question}
              </span>,
            ])}
            vazio="Nenhuma análise pedida ainda."
          />
        </Secao>

        <Secao titulo="Feedback" sub="O que as pessoas escreveram, e de onde.">
          {painel.feedbacks.length === 0 ? (
            <Vazio texto="Nenhum feedback ainda." />
          ) : (
            <ol className="space-y-3">
              {painel.feedbacks.map((f) => (
                <li key={f.id} className="rounded-xl border border-line bg-surface p-4">
                  <p className="flex flex-wrap gap-x-3 text-xs text-ink-faint">
                    <span>{dataHora(f.createdAt)}</span>
                    <span>{f.persona}</span>
                    {f.path && <span className="font-mono">{f.path}</span>}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{f.message}</p>
                </li>
              ))}
            </ol>
          )}
        </Secao>
      </main>
    </>
  );
}

/* ------------------------------ peças ----------------------------------- */

function Tile({ rotulo, valor, nota }: { rotulo: string; valor: number; nota: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs text-ink-muted">{rotulo}</p>
      <p className="tnum mt-1.5 text-2xl font-semibold">{valor.toLocaleString("pt-BR")}</p>
      <p className="mt-1 text-[11px] text-ink-faint">{nota}</p>
    </div>
  );
}

function Secao({ titulo, sub, children }: { titulo: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">{titulo}</h2>
      <p className="mt-1 text-sm text-ink-faint">{sub}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Tabela({
  cabecalho,
  linhas,
  vazio,
}: {
  cabecalho: string[];
  linhas: React.ReactNode[][];
  vazio: string;
}) {
  if (linhas.length === 0) return <Vazio texto={vazio} />;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] tracking-wide text-ink-faint uppercase">
            {cabecalho.map((c) => (
              <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={i} className="border-t border-line-soft">
              {linha.map((celula, j) => (
                <td key={j} className="tnum px-3 py-2 whitespace-nowrap align-top">
                  {celula}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <p className="rounded-xl border border-dashed border-line px-6 py-8 text-center text-sm text-ink-faint">
      {texto}
    </p>
  );
}

function Status({ valor }: { valor: string }) {
  const ruim = valor === "FAILED";
  const andando = valor === "RUNNING" || valor === "PENDING" || valor === "ACKNOWLEDGED";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        ruim ? "text-danger" : andando ? "text-warn" : "text-ink-muted",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          ruim ? "bg-danger" : andando ? "bg-warn" : "bg-accent",
        )}
      />
      {valor.toLowerCase()}
    </span>
  );
}

function dataHora(d: Date) {
  return d
    .toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: FUSO })
    .replace(",", "");
}

function duracao(ms: number | null) {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}
