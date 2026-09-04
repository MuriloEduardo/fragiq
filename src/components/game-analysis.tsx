"use client";

import { useMemo, useState } from "react";
import { CS2_PANEL } from "@/lib/cs2-panel";
import { StatPanel, type PanelStat } from "./stat-panel";
import { Explorer, type Preset } from "./explorer";
import { contextOptions, type ContextFilter, type MetricInfo, type SeriesSpec, type SnapshotRow } from "@/lib/series";
import { ContextFilterBar } from "./context-filter";
import { PeriodSummary } from "./period-summary";

type RawSnapshot = {
  capturedAt: string;
  playtimeForeverMin: number;
  metrics: Record<string, number>;
  matchMap?: string | null;
  matchMode?: string | null;
};

/**
 * Junta o painel fixo e o explorador para que um alimente o outro: o painel
 * é para varrer todas as estatísticas de uma vez, o explorador é para
 * aprofundar em uma. Clicar num tile carrega aquela métrica embaixo.
 */
export function GameAnalysis({
  appId,
  snapshots,
  parsed,
  catalog,
  presets,
}: {
  appId: number;
  snapshots: RawSnapshot[];
  parsed: SnapshotRow[];
  catalog: MetricInfo[];
  presets: Preset[];
}) {
  const [specs, setSpecs] = useState<SeriesSpec[]>(() =>
    presets[0]
      ? presets[0].specs.map((s, i) => ({ ...s, id: `p${i}` }))
      : catalog[0]
        ? [{ id: "p0", metric: catalog[0].key, mode: parsed.length < 2 ? "cumulative" : "delta" }]
        : [],
  );
  const [ativo, setAtivo] = useState<string | undefined>();
  const [filtro, setFiltro] = useState<ContextFilter>({});

  const opcoes = useMemo(() => contextOptions(parsed), [parsed]);
  const semContexto = parsed.filter((s) => !s.matchMode && !s.matchMap).length;

  function selecionar(stat: PanelStat) {
    setSpecs([{ ...stat.spec, id: `tile-${stat.key}` }]);
    setAtivo(stat.key);
    document.getElementById("explorador")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
            Cada número é desse período, comparado ao seu vitalício. Clique
            para abrir no explorador.
          </p>
          <div className="mt-4">
            <StatPanel
              stats={CS2_PANEL}
              snapshots={parsed}
              activeKey={ativo}
              filter={filtro}
              onSelect={selecionar}
            />
          </div>
        </section>
      )}

      <section id="explorador" className="scroll-mt-16">
        <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">
          Explorador
        </h2>
        <p className="mt-1 text-sm text-ink-faint">
          Qualquer um dos {catalog.length} contadores, no modo e na
          granularidade que você escolher.
        </p>
        <div className="mt-4">
          <Explorer
            snapshots={snapshots}
            catalog={catalog}
            presets={presets}
            specs={specs}
            onSpecsChange={setSpecs}
            onPresetApplied={() => setAtivo(undefined)}
            filter={filtro}
          />
        </div>
      </section>
    </div>
  );
}
