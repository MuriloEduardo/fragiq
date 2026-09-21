import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Download } from "lucide-react";
import { getSession } from "@/lib/session";
import { carregarScoreboard, type Scoreboard } from "@/lib/partidas";
import { metricasDaPartida, type ConversaoGravada, type MetricasDaPartida } from "@/lib/demos";
import { conversaoDosTimes, vantagens } from "@/lib/demo/conversao";
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
  const [partida, session, demo] = await Promise.all([carregarScoreboard(id), getSession(), metricasDaPartida(id)]);
  if (!partida) notFound();

  const meuSteamId = session?.steamId ?? null;
  const meuTime = partida.times.find((t) => t.jogadores.some((j) => j.steamId === meuSteamId));
  const estouNela = Boolean(meuTime);
  const resultado = meuTime ? (meuTime.venceu === null ? "empate" : meuTime.venceu ? "vitória" : "derrota") : null;
  const regiao = partida.servidor?.match(/Counter-Strike 2 (\S+) Server/)?.[1]?.replace("_", " ");
  const minhas = meuSteamId ? demo.porJogador.get(meuSteamId) : undefined;
  const conversao = conversaoDosTimes(
    demo.times,
    partida.times.map((t) => t.jogadores.map((j) => j.steamId)),
  );

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
            <Time
              key={t.time}
              time={t}
              rotulo={i === 0 ? "Time A" : "Time B"}
              meuSteamId={meuSteamId}
              metricas={demo.porJogador}
              conversao={conversao[i]}
            />
          ))}
        </div>

        {minhas && (
          <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
            <span className="hud">da demo</span>
            <span><b className="num text-ink">{minhas.aberturas}–{minhas.aberturasPerdidas}</b> aberturas</span>
            <span><b className="num text-ink">{minhas.trocas}</b> trocas · <b className="num text-ink">{minhas.mortesTrocadas}/{minhas.deaths}</b> mortes trocadas</span>
            {minhas.clutches > 0 && <span><b className="num text-ink">{minhas.clutchesGanhos}/{minhas.clutches}</b> clutches</span>}
            <span><b className="num text-ink">{minhas.inimigosCegados}</b> cegados por <b className="num text-ink">{minhas.segundosCegando.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s</b></span>
            <span><b className="num text-ink">{minhas.danoUtil}</b> de dano com granada</span>
            {minhas.ratingTipo === 11 && minhas.ratingDepois ? (
              <span>
                rating <b className="num text-ink">{minhas.ratingAntes?.toLocaleString("pt-BR")}</b> → <b className="num text-ink">{minhas.ratingDepois.toLocaleString("pt-BR")}</b>
              </span>
            ) : null}
          </p>
        )}

        <p className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-faint">
          <span>Share code {partida.shareCode}</span>
          {partida.demoUrl && (
            <a href={partida.demoUrl} className="inline-flex items-center gap-1 underline decoration-line hover:text-ink">
              <Download className="size-3" /> demo (.dem.bz2, fica ~30 dias na Valve)
            </a>
          )}
          <span>Placar como a Steam mostra em &ldquo;Suas partidas&rdquo; a qualquer um dos dez.</span>
          {demo.status === "DONE" && <span>ADR e KAST lidos da demo.</span>}
          {demo.status === "PENDING" && <span>Demo na fila do bot.</span>}
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

function Time({
  time,
  rotulo,
  meuSteamId,
  metricas,
  conversao,
}: {
  time: Scoreboard["times"][number];
  rotulo: string;
  meuSteamId: string | null;
  metricas: MetricasDaPartida;
  conversao: ConversaoGravada | null;
}) {
  const n = (v: number) => v.toLocaleString("pt-BR");
  // As duas colunas da demo só existem quando a demo foi lida; sem ela a tabela é a do GC.
  const comDemo = time.jogadores.some((j) => metricas.has(j.steamId));
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
            {["K", "A", "D", "HS", ...(comDemo ? ["ADR", "KAST"] : []), "MVP", "Score"].map((c) => (
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
              {comDemo && (
                <>
                  <td className="px-3 py-2 text-right">{metricas.has(j.steamId) ? Math.round(metricas.get(j.steamId)!.adr) : "–"}</td>
                  <td className="px-3 py-2 text-right text-ink-muted">{metricas.has(j.steamId) ? `${Math.round(metricas.get(j.steamId)!.kast * 100)}%` : "–"}</td>
                </>
              )}
              <td className="px-3 py-2 text-right">{n(j.mvps)}</td>
              <td className="px-3 py-2 text-right font-medium">{n(j.score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Conversao c={conversao} />
      <Ritmo c={conversao} />
    </section>
  );
}

/**
 * O que o time fez com o que teve: a vantagem numérica e a bomba plantada
 * que viraram round (src/lib/demo/conversao.ts). Uma linha, e só quando há
 * o que dizer — partida sem nenhuma vantagem nem plant não ganha rodapé
 * com zeros. O critério inteiro fica no `title`.
 */
function Conversao({ c }: { c: ConversaoGravada | null }) {
  if (!c) return null;
  const { situacoes, convertidas } = vantagens(c);
  if (situacoes === 0 && c.plants === 0) return null;
  // O lado que não teve nenhuma vantagem fica fora da frase: "de CT 0 de 0" não diz nada.
  const porLado = [
    c.vantagensCT > 0 && `de CT ${c.vantagensCTGanhas} de ${c.vantagensCT}`,
    c.vantagensT > 0 && `de T ${c.vantagensTGanhas} de ${c.vantagensT}`,
  ].filter(Boolean);
  const criterio = [
    situacoes > 0 &&
      `Vantagem: round que começou igual em que o time ficou com mais gente viva, com inimigo vivo (a última morte não conta) — ${porLado.join(", ")}.`,
    c.plants > 0 && `Plantada: round em que o time, de T, plantou a bomba.`,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <p className="border-t border-line-soft px-4 py-2.5 text-sm text-ink-muted" title={criterio}>
      {situacoes > 0 && (
        <span>
          converteu <b className="num text-ink">{convertidas} de {situacoes}</b> vantagens
        </span>
      )}
      {situacoes > 0 && c.plants > 0 && <span className="text-ink-faint"> · </span>}
      {c.plants > 0 && (
        <span>
          plantou <b className="num text-ink">{c.plants}</b> e venceu <b className="num text-ink">{c.plantsGanhos}</b>
        </span>
      )}
    </p>
  );
}

/**
 * A que segundo do round este time joga (src/lib/demo/ritmo.ts). De T o
 * número é o ritmo que ele impôs — ele escolhe quando executar; de CT é o
 * ritmo que sofreu, e por isso o de CT de um time é o de T do outro. Só
 * aparece o que tem número: demo antiga, gravada antes da regra, tem as
 * colunas vazias até o recompute.
 */
function Ritmo({ c }: { c: ConversaoGravada | null }) {
  if (!c) return null;
  const s = (v: number) => `${Math.round(v).toLocaleString("pt-BR")} s`;
  const partes = [
    c.segundoContatoT != null && ["de T contato aos", s(c.segundoContatoT)],
    c.segundoPlant != null && ["planta aos", s(c.segundoPlant)],
    c.segundoContatoCT != null && ["de CT contato aos", s(c.segundoContatoCT)],
  ].filter((p): p is string[] => Array.isArray(p));
  if (partes.length === 0) return null;
  const base = [
    c.contatosT > 0 && `${c.contatosT} round(s) de T com contato`,
    c.plants > 0 && `${c.plants} com plantada`,
    c.contatosCT > 0 && `${c.contatosCT} de CT com contato`,
  ].filter(Boolean);
  return (
    <p
      className="border-t border-line-soft px-4 py-2.5 text-sm text-ink-muted"
      title={`Mediana do segundo, contado do fim do freeze, nos rounds jogados: ${base.join(", ")}. O contato é o primeiro dano entre lados opostos — de T o time escolhe a hora, de CT ele a sofre.`}
    >
      <span className="hud mr-2">ritmo</span>
      {partes.map(([rotulo, valor], i) => (
        <span key={rotulo}>
          {i > 0 && <span className="text-ink-faint"> · </span>}
          {rotulo} <b className="num text-ink">{valor}</b>
        </span>
      ))}
    </p>
  );
}
