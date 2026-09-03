import { Clock, LineChart } from "lucide-react";

/**
 * A série temporal precisa de duas coletas para existir, e a primeira sessão
 * de um usuário novo sempre tem uma. Sem esta faixa, ele vê um gráfico vazio
 * e conclui que o produto não funciona — em vez de entender que ainda não
 * há o que desenhar e o que fazer a respeito.
 */
export function CollectionStatus({ snapshotCount }: { snapshotCount: number }) {
  if (snapshotCount >= 2) return null;

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border border-accent/25 bg-accent-soft/50 px-4 py-3.5">
      <LineChart className="mt-0.5 size-4 shrink-0 text-accent" />

      <div className="min-w-56 flex-1">
        <p className="text-sm font-medium">
          Primeira coleta feita. Falta uma para o gráfico de evolução.
        </p>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          Os números da Steam são totais acumulados — a evolução é a diferença
          entre duas coletas. Jogue uma partida e clique em{" "}
          <strong className="font-medium text-ink">Sincronizar</strong> para o
          segundo ponto. Enquanto isso, as métricas de{" "}
          <strong className="font-medium text-ink">última partida</strong> já
          funcionam com uma coleta só.
        </p>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Clock className="size-3" />
        Coletamos sozinhos uma vez por dia
      </p>
    </div>
  );
}

/** Versão compacta para o dashboard, onde o contexto é a biblioteca inteira. */
export function LibraryStatus({ gamesWithSeries }: { gamesWithSeries: number }) {
  if (gamesWithSeries > 0) return null;

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-accent/25 bg-accent-soft/50 px-4 py-3">
      <LineChart className="size-4 shrink-0 text-accent" />
      <p className="flex-1 text-sm leading-relaxed">
        Sua primeira coleta está gravada. Jogue uma partida e clique em{" "}
        <strong className="font-medium">Sincronizar</strong> para o segundo
        ponto — ou volte amanhã, que a coleta automática roda todo dia.
      </p>
    </div>
  );
}
