import { Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Comparação honesta. Onde os concorrentes ganham, a tabela diz que ganham —
 * uma tabela em que a coluna própria só tem check não convence ninguém que
 * já usou as outras ferramentas, e o público-alvo já usou.
 */

type Cell = "yes" | "no" | "partial" | "roadmap";

const COLUMNS = ["FragIQ", "csstats.gg", "csrep.gg", "Leetify"] as const;

const ROWS: { label: string; note?: string; cells: [Cell, Cell, Cell, Cell] }[] = [
  {
    label: "Série temporal de qualquer métrica",
    note: "178 contadores do CS2, não uma lista fixa",
    cells: ["yes", "no", "partial", "partial"],
  },
  {
    label: "Você monta a própria consulta",
    note: "métrica, modo, granularidade e razões — como um BI",
    cells: ["yes", "no", "no", "no"],
  },
  {
    label: "Precisão por arma ao longo do tempo",
    note: "as outras mostram só o número vitalício; soma todos os modos",
    cells: ["yes", "no", "no", "no"],
  },
  {
    label: "Taxa de vitória por mapa ao longo do tempo",
    note: "só nos mapas que a Valve ainda rastreia — Mirage e Ancient ficam de fora",
    cells: ["partial", "no", "no", "no"],
  },
  {
    label: "Painel com todas as estatísticas de uma vez",
    note: "sem escolher uma métrica por vez",
    cells: ["yes", "partial", "partial", "partial"],
  },
  {
    label: "Começa só com o login",
    note: "sem colar código de autenticação",
    cells: ["yes", "no", "no", "no"],
  },
  {
    label: "ADR, KAST, rating, clutches",
    note: "exige parsing de demo",
    cells: ["roadmap", "yes", "yes", "yes"],
  },
  {
    label: "Dados por partida e por round",
    cells: ["roadmap", "yes", "yes", "yes"],
  },
  {
    label: "Histórico retroativo",
    note: "eles leem demos antigas; nós contamos do seu primeiro login",
    cells: ["no", "yes", "yes", "yes"],
  },
];

export function Comparison() {
  return (
    <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="bg-canvas pb-3 text-left font-normal">
              <span className="font-mono text-[11px] tracking-widest text-ink-faint uppercase">
                Recurso
              </span>
            </th>
            {COLUMNS.map((col, i) => (
              <th
                key={col}
                className={cn(
                  "px-3 pb-3 text-center font-medium",
                  i === 0 ? "text-accent" : "text-ink-muted",
                )}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label}>
              <td className="border-t border-line py-3 pr-6 align-top">
                <span className="block text-ink">{row.label}</span>
                {row.note && (
                  <span className="mt-0.5 block text-xs text-ink-faint">{row.note}</span>
                )}
              </td>

              {row.cells.map((cell, i) => (
                <td
                  key={i}
                  className={cn(
                    "border-t border-line px-3 py-3 text-center align-top",
                    i === 0 && "bg-accent-soft/50",
                  )}
                >
                  <Mark cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Mark({ cell }: { cell: Cell }) {
  if (cell === "yes") {
    return (
      <>
        <Check className="mx-auto size-4 text-accent" aria-hidden />
        <span className="sr-only">sim</span>
      </>
    );
  }

  if (cell === "no") {
    return (
      <>
        <X className="mx-auto size-4 text-ink-faint/50" aria-hidden />
        <span className="sr-only">não</span>
      </>
    );
  }

  if (cell === "partial") {
    return (
      <>
        <Minus className="mx-auto size-4 text-ink-faint" aria-hidden />
        <span className="sr-only">parcial</span>
      </>
    );
  }

  return (
    <span className="rounded-full border border-warn/40 px-2 py-0.5 font-mono text-[10px] tracking-wide text-warn uppercase">
      roadmap
    </span>
  );
}
