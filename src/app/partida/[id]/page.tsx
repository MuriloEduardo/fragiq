import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Download } from "lucide-react";
import { getSession } from "@/lib/session";
import { carregarScoreboard, type Scoreboard } from "@/lib/partidas";
import { formatarQuando } from "@/lib/sessoes";
import { rotularMapa } from "@/lib/cs2-labels";
import { SteamMark } from "@/components/steam-mark";
import { Selo } from "@/components/selo";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Uma partida oficial, os dois times.
 *
 * Pública de propósito: é o mesmo placar que o "Suas partidas" do CS2
 * mostra a qualquer um dos dez, e nove deles não têm conta aqui. Cada nome
 * leva à página pública da pessoa; quem chega sem conta e se reconhece na
 * lista vê o convite no fim.
 */
export default async function PartidaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,20}$/.test(id)) notFound();
  const [partida, session] = await Promise.all([carregarScoreboard(id), getSession()]);
  if (!partida) notFound();

  const meuSteamId = session?.steamId ?? null;
  const meuTime = partida.times.find((t) => t.jogadores.some((j) => j.steamId === meuSteamId));
  const estouNela = Boolean(meuTime);
  const resultado = meuTime ? (meuTime.venceu === null ? "empate" : meuTime.venceu ? "vitória" : "derrota") : null;
  const regiao = partida.servidor?.match(/Counter-Strike 2 (\S+) Server/)?.[1]?.replace("_", " ");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line/60 bg-canvas/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3.5">
          <Link href={session ? "/games/730/partidas" : "/"} className="font-mono text-sm font-bold tracking-tight">
            Frag<span className="text-accent">IQ</span>
          </Link>
          <span className="hud">partida oficial</span>
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

      <main className="mx-auto max-w-5xl px-6 py-10">
        <section className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="hud" suppressHydrationWarning>
              {formatarQuando(partida.jogadaEm)} · {Math.round(partida.duracaoS / 60)} min{regiao ? ` · ${regiao}` : ""}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {partida.mapa ? rotularMapa(partida.mapa) : "Partida"}
              {resultado && (
                <span
                  className={cn(
                    "ml-3 align-middle rounded-md px-2 py-0.5 text-sm font-medium",
                    resultado === "vitória" && "bg-accent/15 text-accent",
                    resultado === "derrota" && "bg-danger/15 text-danger",
                    resultado === "empate" && "bg-surface-2 text-ink-muted",
                  )}
                >
                  {resultado}
                </span>
              )}
            </h1>
          </div>
          <p className="num text-5xl font-semibold tracking-tight">
            <span className={cn(partida.times[0].venceu && "text-accent")}>{partida.placar[0]}</span>
            <span className="mx-3 text-ink-faint">–</span>
            <span className={cn(partida.times[1].venceu && "text-accent")}>{partida.placar[1]}</span>
          </p>
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {partida.times.map((t, i) => (
            <Time key={t.time} time={t} rotulo={i === 0 ? "Time A" : "Time B"} meuSteamId={meuSteamId} />
          ))}
        </div>

        <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-faint">
          <span>Share code {partida.shareCode}</span>
          {partida.demoUrl && (
            <a href={partida.demoUrl} className="inline-flex items-center gap-1 underline decoration-line hover:text-ink">
              <Download className="size-3" /> demo (.dem.bz2, fica ~30 dias na Valve)
            </a>
          )}
          <span>Placar como a Steam mostra em &ldquo;Suas partidas&rdquo; a qualquer um dos dez.</span>
        </p>

        {!session && (
          <section className="mt-12 rounded-2xl bg-surface p-6 ring-1 ring-line">
            <p className="text-lg font-semibold tracking-tight">Você está nesta lista?</p>
            <p className="mt-1 max-w-lg text-sm text-ink-muted">
              O FragIQ grava cada partida sua com este placar e a sua evolução por sessão — de graça, com
              login pela Steam e só leitura do que já é público.
            </p>
            <a
              href="/api/auth/steam"
              className="borda-viva mt-4 inline-flex items-center gap-3 rounded-xl px-5 py-3 font-medium text-ink transition hover:text-accent"
            >
              <SteamMark />
              Entrar com Steam
              <ArrowRight className="size-4" />
            </a>
          </section>
        )}
        {session && !estouNela && (
          <p className="mt-8 text-sm text-ink-faint">
            Você não está nesta partida. <Link href="/games/730/partidas" className="underline decoration-line hover:text-ink">As suas →</Link>
          </p>
        )}
      </main>
    </div>
  );
}

function Time({ time, rotulo, meuSteamId }: { time: Scoreboard["times"][number]; rotulo: string; meuSteamId: string | null }) {
  const n = (v: number) => v.toLocaleString("pt-BR");
  return (
    <section className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="hud">
          {rotulo}
          {time.venceu === true && <span className="ml-2 text-accent">venceu</span>}
        </p>
        <p className="num text-lg font-semibold">{time.placar}</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-t border-line-soft text-left">
            <th className="hud px-4 py-2 font-normal">Jogador</th>
            {["K", "A", "D", "HS", "MVP", "Score"].map((c) => (
              <th key={c} className="hud px-3 py-2 text-right font-normal">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="num">
          {time.jogadores.map((j) => (
            <tr key={j.steamId} className={cn("border-t border-line-soft", j.steamId === meuSteamId && "bg-accent/5")}>
              <td className="px-4 py-2 font-sans">
                <Link href={`/p/${j.steamId}`} className="flex items-center gap-2.5 hover:text-accent">
                  {j.avatar ? (
                    <Image src={j.avatar} alt="" width={28} height={28} className="size-7 rounded-md ring-1 ring-line" unoptimized />
                  ) : (
                    <span className="size-7 rounded-md bg-surface-2 ring-1 ring-line" />
                  )}
                  <span className="truncate">{j.nome ?? j.steamId}</span>
                  {j.userId && <Selo tipo="beta" />}
                </Link>
              </td>
              <td className="px-3 py-2 text-right">{n(j.kills)}</td>
              <td className="px-3 py-2 text-right text-ink-muted">{n(j.assists)}</td>
              <td className="px-3 py-2 text-right">{n(j.deaths)}</td>
              <td className="px-3 py-2 text-right">{j.kills ? Math.round((j.hs / j.kills) * 100) : 0}%</td>
              <td className="px-3 py-2 text-right">{n(j.mvps)}</td>
              <td className="px-3 py-2 text-right font-medium">{n(j.score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
