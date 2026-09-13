import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";
import { getSession } from "@/lib/session";
import { carregarPerfilPublico, pareceSteamId, resolverEntrada } from "@/lib/perfil-publico";
import { SteamMark } from "@/components/steam-mark";
import { Selo } from "@/components/selo";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * A página pública de um jogador.
 *
 * Só o que a Steam já mostra a quem tem o SteamID — números vitalícios, por
 * arma, por mapa. Nada de curva nem leitura: isso é do dono. Quem tem conta
 * no FragIQ ganha o selo e um aviso de que a curva existe; quem não tem, um
 * convite para começar a gravar a dele.
 */
export default async function PerfilPublicoPage({ params }: { params: Promise<{ steamId: string }> }) {
  const { steamId: bruto } = await params;
  const entrada = decodeURIComponent(bruto);

  if (!pareceSteamId(entrada)) {
    const resolvido = await resolverEntrada(entrada).catch(() => null);
    if (!resolvido) notFound();
    redirect(`/p/${resolvido}`);
  }

  const [perfil, session] = await Promise.all([carregarPerfilPublico(entrada), getSession()]);
  const souEu = session?.steamId === entrada;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line/60 bg-canvas/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3.5">
          <Link href={session ? "/cs2" : "/"} className="font-mono text-sm font-bold tracking-tight">
            Frag<span className="text-accent">IQ</span>
          </Link>
          <span className="hud">perfil público</span>
          {!session && (
            <a
              href="/api/auth/steam"
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-sm font-medium ring-1 ring-line transition hover:ring-accent/60"
            >
              <SteamMark className="size-4" />
              Entrar
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {perfil.estado === "oculto" && <Estado titulo="Perfil oculto" texto="Esta pessoa escolheu não ter página pública no FragIQ." />}
        {perfil.estado === "inexistente" && <Estado titulo="Perfil não encontrado" texto="A Steam não conhece esse SteamID." />}
        {perfil.estado === "privado" && (
          <Estado
            titulo={perfil.jogador.personaname}
            texto="Perfil privado na Steam. Só o dono pode mudar isso, em Editar perfil → Privacidade."
          />
        )}
        {perfil.estado === "sem-cs2" && (
          <Estado
            titulo={perfil.jogador.personaname}
            texto='Sem estatísticas de CS2 visíveis — ou não jogou, ou "Detalhes do jogo" está privado.'
          />
        )}

        {perfil.estado === "ok" && (
          <>
            <section className="flex flex-wrap items-center gap-5">
              {perfil.jogador.avatarfull && (
                <Image src={perfil.jogador.avatarfull} alt="" width={72} height={72} className="size-18 rounded-2xl ring-1 ring-line" unoptimized />
              )}
              <div className="min-w-0 flex-1">
                <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
                  {perfil.jogador.personaname}
                  {perfil.usuarioDoFragiq && <Selo tipo="beta" />}
                </h1>
                <p className="tnum mt-1 text-sm text-ink-muted">
                  {perfil.horas.toLocaleString("pt-BR")} h em partida
                  {perfil.jogador.loccountrycode ? ` · ${perfil.jogador.loccountrycode}` : ""}
                  {perfil.usuarioDoFragiq
                    ? ` · no FragIQ desde ${perfil.usuarioDoFragiq.desde.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "")}`
                    : ""}
                </p>
              </div>
              {souEu ? (
                <Link href="/cs2" className="inline-flex items-center gap-2 text-sm text-ink-muted transition hover:text-accent">
                  Ver a minha curva <ArrowRight className="size-4" />
                </Link>
              ) : perfil.usuarioDoFragiq ? (
                <p className="flex items-center gap-1.5 text-xs text-ink-faint">
                  <Lock className="size-3" /> a curva e as leituras são só do dono
                </p>
              ) : null}
            </section>

            <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {perfil.resumo.map((r) => (
                <div key={r.rotulo} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
                  <p className="hud">{r.rotulo}</p>
                  <p className="num mt-2 text-2xl font-semibold">{r.valor}</p>
                </div>
              ))}
            </section>

            <div className="mt-10 grid gap-8 lg:grid-cols-2">
              <section>
                <h2 className="hud">Por arma</h2>
                <Tabela
                  cabecalho={["Arma", "Kills", "Tiros", "Precisão"]}
                  linhas={perfil.armas.slice(0, 12).map((a) => [
                    a.arma,
                    a.kills.toLocaleString("pt-BR"),
                    a.tiros.toLocaleString("pt-BR"),
                    a.precisao === null ? "—" : `${a.precisao.toFixed(1).replace(".", ",")}%`,
                  ])}
                />
              </section>
              <section>
                <h2 className="hud">Por mapa</h2>
                <Tabela
                  cabecalho={["Mapa", "Rounds", "Ganhos", "Taxa"]}
                  linhas={perfil.mapas.slice(0, 12).map((m) => [
                    m.mapa,
                    m.rounds.toLocaleString("pt-BR"),
                    m.vitorias.toLocaleString("pt-BR"),
                    m.taxa === null ? "—" : `${m.taxa.toFixed(1).replace(".", ",")}%`,
                  ])}
                />
                <p className="mt-2 text-[11px] text-ink-faint">
                  A Steam só conta os mapas do pool antigo; Mirage, Ancient, Anubis e Overpass não aparecem.
                </p>
              </section>
            </div>

            {!perfil.usuarioDoFragiq && !session && (
              <section className="mt-12 rounded-2xl bg-surface p-6 ring-1 ring-line">
                <p className="text-lg font-semibold tracking-tight">É você?</p>
                <p className="mt-1 max-w-lg text-sm text-ink-muted">
                  Estes números são o total desde sempre. O FragIQ grava a curva a partir de hoje e analisa
                  cada sessão contra o seu normal.
                </p>
                <a
                  href="/api/auth/steam"
                  className="borda-viva mt-4 inline-flex items-center gap-3 rounded-xl px-5 py-3 font-medium text-ink transition hover:text-accent"
                >
                  <SteamMark />
                  Entrar com Steam
                </a>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Estado({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      <p className="mt-3 text-sm text-ink-muted">{texto}</p>
      <Link href="/" className="mt-6 inline-block text-sm text-ink-faint transition hover:text-accent">
        ← FragIQ
      </Link>
    </div>
  );
}

function Tabela({ cabecalho, linhas }: { cabecalho: string[]; linhas: string[][] }) {
  if (linhas.length === 0) {
    return <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-faint">Sem dados.</p>;
  }
  return (
    <div className="mt-3 overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {cabecalho.map((c, i) => (
              <th key={c} className={cn("hud px-4 py-2.5 font-normal", i === 0 ? "text-left" : "text-right")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="num">
          {linhas.map((l, i) => (
            <tr key={i} className="border-t border-line-soft">
              {l.map((c, j) => (
                <td key={j} className={cn("px-4 py-2", j === 0 ? "font-sans text-left" : "text-right")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
