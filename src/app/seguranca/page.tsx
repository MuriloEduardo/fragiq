import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isAdmin, seloDe } from "@/lib/admin";
import { botEhAmigo } from "@/lib/bot";
import { SiteHeader } from "@/components/site-header";
import { BotAmigo } from "@/components/bot-amigo";
import { ApagarConta } from "@/components/apagar-conta";
import { PerfilPublicoToggle } from "@/components/perfil-publico-toggle";
import { AvisoSteamToggle } from "@/components/aviso-steam-toggle";
import { PartidasRevogar } from "@/components/partidas-revogar";

export const dynamic = "force-dynamic";

/**
 * Segurança, transparência e os dados de cada pessoa — a página inteira.
 *
 * Quem joga CS2 já foi enganado por site de skin e sabe o que é uma conta
 * roubada. A resposta não é um selo de "seguro": é dizer exatamente o que
 * lemos, o que guardamos, o que nunca tocamos, e dar os dois botões que
 * provam isso — baixar tudo e apagar tudo.
 */
export default async function SegurancaPage() {
  const session = await getSession();
  const [user, selo, amigo] = await Promise.all([
    session
      ? prisma.user.findUnique({
          where: { id: session.userId },
          select: { personaName: true, avatarUrl: true, lastSyncedAt: true, perfilPublico: true, avisoSteam: true, steamId: true, partidasAtivadasEm: true },
        })
      : null,
    session ? seloDe(session.userId) : null,
    session ? botEhAmigo(session.steamId) : null,
  ]);

  return (
    <div className="min-h-dvh">
      {session && user ? (
        <SiteHeader {...user} admin={isAdmin(session.steamId)} selo={selo} />
      ) : (
        <header className="border-b border-line/60 bg-canvas/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3.5">
            <Link href="/" className="inline-flex items-center gap-2 font-mono text-sm font-bold tracking-tight">
              <ArrowLeft className="size-4 text-ink-faint" />
              Frag<span className="text-accent">IQ</span>
            </Link>
          </div>
        </header>
      )}

      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="hud">Segurança e dados</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
          O que lemos, o que guardamos, o que nunca tocamos.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">
          Tudo abaixo vale para qualquer conta, sempre. Se algo aqui parecer diferente do que o site
          faz, isso é um bug — nos diga.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Bloco titulo="Login">
            Você entra no site da Valve, não no nosso. O mecanismo é o OpenID oficial da Steam: a
            Steam nos devolve uma afirmação assinada com o seu SteamID e nada mais. Nunca vemos
            senha, e-mail, Steam Guard ou código de troca.
          </Bloco>
          <Bloco titulo="O que lemos">
            Perfil público, biblioteca (tempo de jogo) e as estatísticas de CS2 — o mesmo que
            qualquer pessoa vê no seu perfil público. Só leitura, e só do público: se você fecha os
            &ldquo;Detalhes do jogo&rdquo; na Steam, paramos de conseguir ler.
          </Bloco>
          <Bloco titulo="O que guardamos">
            Os contadores de CS2 a cada coleta, com data — é a série que a Steam não guarda. As
            sessões derivadas dela, os textos das análises, o que você escreveu na comunidade e no
            feedback, e quem você segue. Nada além disso.
          </Bloco>
          <Bloco titulo="O que nunca tocamos">
            Inventário, skins, trocas, mercado, mensagens, lista de amigos de terceiros. Não
            temos permissão para agir na sua conta — a Steam não a concede a sites — e não pedimos.
          </Bloco>
          <Bloco titulo="Quem vê o quê">
            A página pública mostra só o que a Steam já mostra, e você desliga. A curva, as sessões
            e as leituras são suas: outra pessoa só vê se você aceitar o pedido dela, e você revoga
            quando quiser.
          </Bloco>
          <Bloco titulo="Partidas oficiais">
            Opcional. Para ver cada partida com placar, a Steam exige um código de autenticação de
            histórico que só você gera, mais um share code. Esse código lê exclusivamente a lista de
            partidas — não abre inventário, chat, amigos nem senha — e fica cifrado aqui. Você revoga
            abaixo, ou gerando outro na Steam.
          </Bloco>
          <Bloco titulo="O analista">
            As análises são geradas por um modelo de linguagem (OpenAI) através do nosso serviço.
            Enviamos os números agregados da sua série e o seu nome de jogador — nunca o SteamID,
            e nada é usado para treinar modelos.
          </Bloco>
        </div>

        <section className="mt-10">
          <h2 className="hud mb-3">O bot de presença</h2>
          <BotAmigo amigo={amigo} />
        </section>

        {session && user && (
          <section className="mt-10 space-y-4">
            <h2 className="hud">Os seus dados</h2>
            <PerfilPublicoToggle publico={user.perfilPublico} steamId={user.steamId} />
            <AvisoSteamToggle ligado={user.avisoSteam} amigo={amigo} />
            <PartidasRevogar ativo={Boolean(user.partidasAtivadasEm)} desde={user.partidasAtivadasEm} />
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Baixar tudo</p>
                <p className="mt-0.5 text-xs text-ink-faint">Um JSON com cada coleta, sessão, análise e o resto. Sem filtro: é seu.</p>
              </div>
              <a
                href="/api/conta/exportar"
                className="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-ink-muted ring-1 ring-line transition hover:text-ink hover:ring-accent/60"
              >
                <Download className="size-4" /> Exportar
              </a>
            </div>
            <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
              <p className="text-sm font-medium">Apagar tudo</p>
              <p className="mt-0.5 mb-3 text-xs text-ink-faint">Conta, série, sessões, análises, comunidade. Na hora, sem fila e sem e-mail.</p>
              <ApagarConta />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface p-5 ring-1 ring-line">
      <p className="hud">{titulo}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{children}</p>
    </div>
  );
}
