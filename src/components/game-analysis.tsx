"use client";

import { useState } from "react";
import { CS2_PANEL } from "@/lib/cs2-panel";
import { StatPanel, type PanelStat } from "./stat-panel";
import { Explorer, type Preset } from "./explorer";
import type { MetricInfo, SeriesSpec, SnapshotRow } from "@/lib/series";

type RawSnapshot = {
  capturedAt: string;
  playtimeForeverMin: number;
  metrics: Record<string, number>;
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

  function selecionar(stat: PanelStat) {
    setSpecs([{ ...stat.spec, id: `tile-${stat.key}` }]);
    setAtivo(stat.key);
    document.getElementById("explorador")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-10">
      {appId === 730 && (
        <section>
          <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">
            Painel
          </h2>
          <p className="mt-1 text-sm text-ink-faint">
            Cada número é do período mais recente, comparado ao seu vitalício.
            Clique para abrir no explorador.
          </p>
          <div className="mt-4">
            <StatPanel
              stats={CS2_PANEL}
              snapshots={parsed}
              activeKey={ativo}
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
          />
        </div>
      </section>
    </div>
  );
}
