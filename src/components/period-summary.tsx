"use client";

import { deltaEntre, ultimoPar, type ContextFilter, type SnapshotRow } from "@/lib/series";

/**
 * Descreve o período que o painel está mostrando.
 *
 * Sem isto o painel exibe "K/D 6,30, vitalício 0,70, +798%" e a pessoa não
 * tem como saber se aquilo saiu de uma noite ou de um ano — o número parece
 * inventado mesmo estando certo. Um K/D de 6,30 em 5 partidas de 6 rounds é
 * deathmatch; em 20 partidas de 13 rounds seria outra história, e a diferença
 * não está em lugar nenhum da tela.
 *
 * Os pares vêm de `ultimoPar`, a mesma caminhada que alimenta os gráficos:
 * duas contagens diferentes para o mesmo período seriam pior que nenhuma.
 */

const DATA_HORA: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

export function PeriodSummary({
  rows,
  filter,
}: {
  rows: SnapshotRow[];
  filter?: ContextFilter;
}) {
  // Rounds é a métrica de referência porque é a que existe em todo modo do
  // CS2 — partidas não sobem em deathmatch de treino, por exemplo.
  const par = ultimoPar(rows, "total_rounds_played", filter);
  if (!par) return null;

  const rounds = deltaEntre(par, "total_rounds_played");
  const partidas = deltaEntre(par, "total_matches_played");
  const porPartida = rounds !== null && partidas ? rounds / partidas : null;

  const fmt = (d: Date) => d.toLocaleString("pt-BR", DATA_HORA).replace(".", "");

  return (
    // suppressHydrationWarning: o servidor formata em UTC e o browser no fuso
    // de quem lê. O texto certo é o do leitor; divergir na primeira pintura é
    // esperado e não é defeito.
    <p
      className="tnum mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted"
      suppressHydrationWarning
    >
      <span className="text-ink">
        {fmt(par.prev.capturedAt)} → {fmt(par.curr.capturedAt)}
      </span>
      {partidas !== null && (
        <>
          <Ponto />
          <span>
            {partidas} partida{partidas === 1 ? "" : "s"}
          </span>
        </>
      )}
      {rounds !== null && (
        <>
          <Ponto />
          <span>
            {rounds} round{rounds === 1 ? "" : "s"}
          </span>
        </>
      )}
      {porPartida !== null && (
        <>
          <Ponto />
          {/* O divisor que denuncia o modo: competitivo é MR12, então algo
              perto de 6 rounds por partida é casual, deathmatch ou desistência
              — e explica um K/D fora de escala sem precisar acusar ninguém. */}
          <span className="text-ink-faint">
            {porPartida.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} rounds/partida
          </span>
        </>
      )}
    </p>
  );
}

function Ponto() {
  return <span aria-hidden className="text-ink-faint">·</span>;
}
