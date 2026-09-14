"use client";

import { useMemo, useState } from "react";
import { CS2_PANEL } from "@/lib/cs2-panel";
import { contextOptions, type ContextFilter, type SnapshotRow } from "@/lib/series";
import { StatPanel } from "./stat-panel";
import { ContextFilterBar } from "./context-filter";

/**
 * Os doze tiles, no modo do submenu, com o recorte por mapa por cima.
 *
 * O modo vem de fora e não é escolhido aqui: ele é a navegação, vale para
 * todas as abas e já chega resolvido pelo servidor. O que sobra para a
 * barra é o mapa — um recorte dentro do modo, que faz sentido só nesta
 * tela e não precisa sobreviver a um clique em outra aba.
 */
export function Estatisticas({ appId, rows, modo }: { appId: number; rows: SnapshotRow[]; modo: string | null }) {
  const [mapa, setMapa] = useState<string | null>(null);
  const opcoes = useMemo(() => contextOptions(rows), [rows]);
  const filtro: ContextFilter = { mode: modo, map: mapa };
  const semContexto = rows.filter((s) => !s.matchMode && !s.matchMap).length;

  return (
    <div className="space-y-4">
      <ContextFilterBar
        modes={[]}
        maps={opcoes.maps}
        value={filtro}
        onChange={(f) => setMapa(f.map ?? null)}
        semContexto={semContexto}
      />
      <StatPanel stats={CS2_PANEL} snapshots={rows} filter={filtro} appId={appId} />
    </div>
  );
}
