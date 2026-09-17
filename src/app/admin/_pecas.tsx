import { FUSO } from "@/lib/admin-dados";
import { cn } from "@/lib/utils";

/** Peças do painel compartilhadas entre /admin, /admin/dados e /admin/trace. */
export function dataHora(d: Date) {
  return d
    .toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: FUSO })
    .replace(",", "");
}

export function Secao({ titulo, sub, children }: { titulo: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">{titulo}</h2>
      <p className="mt-1 text-xs text-ink-faint">{sub}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Vazio({ texto }: { texto: string }) {
  return <p className="rounded-xl border border-dashed border-line px-6 py-8 text-center text-sm text-ink-faint">{texto}</p>;
}

export function Tabela({ cabecalho, linhas, vazio }: { cabecalho: string[]; linhas: React.ReactNode[][]; vazio: string }) {
  if (linhas.length === 0) return <Vazio texto={vazio} />;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-faint">
            {cabecalho.map((c) => (
              <th key={c} className="px-3 py-2 font-normal whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-line-soft last:border-0">
              {l.map((c, j) => (
                <td key={j} className="px-3 py-2 align-top">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Tile({ rotulo, valor, nota, alerta = false }: { rotulo: string; valor: number | string; nota: string; alerta?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-surface p-4", alerta ? "border-danger/50" : "border-line")}>
      <p className="text-xs text-ink-muted">{rotulo}</p>
      <p className="num mt-1 text-2xl font-semibold">{valor}</p>
      <p className="mt-1 truncate text-xs text-ink-faint" title={nota}>{nota}</p>
    </div>
  );
}
