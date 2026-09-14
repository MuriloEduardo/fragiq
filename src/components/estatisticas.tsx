import { CS2_PANEL } from "@/lib/cs2-panel";
import type { SnapshotRow } from "@/lib/series";
import { StatPanel } from "./stat-panel";

/**
 * Os doze cartões, na lente do submenu. Não há mais filtro por mapa aqui:
 * recortar por mapa tinha o mesmo defeito que recortar por modo — esvaziava
 * os gráficos — e ainda menos dados. Mapa é coluna em Sessões e dimensão em
 * Partidas.
 */
export function Estatisticas({ appId, rows, lente }: { appId: number; rows: SnapshotRow[]; lente: string | null }) {
  return <StatPanel stats={CS2_PANEL} snapshots={rows} lente={lente} appId={appId} />;
}
