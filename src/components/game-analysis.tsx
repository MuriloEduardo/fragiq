"use client";

import { useMemo, useState } from "react";
import { CS2_PANEL } from "@/lib/cs2-panel";
import { StatPanel } from "./stat-panel";
import { lerSerie, todasAsMetricas } from "@/lib/leituras";
import { Leituras } from "./leituras";
import { MetricTable } from "./metric-table";
import { contextOptions, type ContextFilter, type MetricInfo, type SnapshotRow } from "@/lib/series";
import { ContextFilterBar } from "./context-filter";
import { PeriodSummary } from "./period-summary";

/**
 * A análise de um jogo, em três alturas.
 *
 * Leituras dizem o que aconteceu, em português. O painel mostra as doze
 * estatísticas que valem para qualquer jogador. A tabela cobre as outras
 * todas, para quem quer o contador específico.
 *
 * Antes havia um explorador no lugar das duas últimas: você escolhia uma
 * métrica, um modo e uma granularidade, e recebia uma linha sem escala. Era
 * cobertura sem leitura — o trabalho de interpretar ficava todo com quem
 * estava lendo.
 */
export function GameAnalysis({
  appId,
  parsed,
  catalog,
}: {
  appId: number;
  parsed: SnapshotRow[];
  catalog: MetricInfo[];
}) {
  const [filtro, setFiltro] = useState<ContextFilter>({});

  const opcoes = useMemo(() => contextOptions(parsed), [parsed]);
  const semContexto = parsed.filter((s) => !s.matchMode && !s.matchMap).length;

  const leituras = useMemo(() => lerSerie(parsed, filtro), [parsed, filtro]);
  const linhas = useMemo(
    () => todasAsMetricas(parsed, catalog.map((c) => c.key), filtro),
    [parsed, catalog, filtro],
  );

  return (
    <div className="space-y-10">
      {appId === 730 && (
        <ContextFilterBar
          modes={opcoes.modes}
          maps={opcoes.maps}
          value={filtro}
          onChange={setFiltro}
          semContexto={semContexto}
        />
      )}

      {appId === 730 && (
        <section>
          <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">
            Painel
          </h2>
          <PeriodSummary rows={parsed} filter={filtro} />
          <p className="mt-1 text-sm text-ink-faint">
            Cada número é desse período, comparado ao seu vitalício.
          </p>
          <div className="mt-4">
            <StatPanel stats={CS2_PANEL} snapshots={parsed} filter={filtro} />
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">
          Leituras
        </h2>
        <p className="mt-1 text-sm text-ink-faint">
          O que os números dizem, dito por extenso.
        </p>
        <div className="mt-4">
          <Leituras leituras={leituras} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">
          Todas as métricas
        </h2>
        <p className="mt-1 text-sm text-ink-faint">
          As {catalog.length} que o CS2 publica, cada uma comparada com o seu
          vitalício.
        </p>
        <div className="mt-4">
          <MetricTable linhas={linhas} appId={appId} />
        </div>
      </section>

    </div>
  );
}
