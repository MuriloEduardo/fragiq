"use client";

import { useMemo, useState } from "react";
import { CS2_PANEL } from "@/lib/cs2-panel";
import { contextOptions, type ContextFilter, type SnapshotRow } from "@/lib/series";
import { StatPanel } from "./stat-panel";
import { ContextFilterBar } from "./context-filter";

/** Os doze tiles, com o recorte por mapa e modo quando o bot registrou. */
export function Estatisticas({ appId, rows }: { appId: number; rows: SnapshotRow[] }) {
  const [filtro, setFiltro] = useState<ContextFilter>({});
  const opcoes = useMemo(() => contextOptions(rows), [rows]);
  const semContexto = rows.filter((s) => !s.matchMode && !s.matchMap).length;

  return (
    <div className="space-y-4">
      <ContextFilterBar
        modes={opcoes.modes}
        maps={opcoes.maps}
        value={filtro}
        onChange={setFiltro}
        semContexto={semContexto}
      />
      <StatPanel stats={CS2_PANEL} snapshots={rows} filter={filtro} appId={appId} />
    </div>
  );
}
