import { Info, TriangleAlert } from "lucide-react";

/**
 * A Valve não documenta o escopo dos contadores, e o escopo não é uniforme.
 * Medimos jogando uma partida casual e diffando os 197 contadores.
 *
 * Sem este aviso o produto mente por omissão: alguém olha "K/D por período"
 * achando que é competitivo e está vendo casual misturado.
 */
export function CounterScope({
  appId,
  gaugesStale,
}: {
  appId: number;
  gaugesStale: boolean;
}) {
  if (appId !== 730) return null;

  return (
    <details className="group rounded-2xl bg-surface ring-1 ring-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm text-ink-muted transition hover:text-ink">
        <Info className="size-4 shrink-0 text-ink-faint" />
        O que estes contadores incluem
        <span className="ml-auto text-xs text-ink-faint group-open:hidden">mostrar</span>
        <span className="ml-auto hidden text-xs text-ink-faint group-open:inline">ocultar</span>
      </summary>

      <div className="space-y-3 border-t border-line px-4 py-3 text-sm leading-relaxed text-ink-muted">
        {gaugesStale && (
          <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
            <span>
              Confirmado nos <strong className="font-medium text-ink">seus</strong>{" "}
              dados: você jogou partidas entre coletas e nenhum contador de
              última partida se moveu.
            </span>
          </p>
        )}
        <p className="text-xs text-ink-faint">
          A Valve não documenta isto. Medimos jogando uma partida casual e
          comparando os 197 contadores antes e depois.
        </p>

        <Item titulo="Os contadores não separam modo">
          Competitivo, premier, casual e deathmatch caem todos nos mesmos
          contadores — inclusive os por arma e os por mapa. O schema do jogo
          declara 286 estatísticas e{" "}
          <strong className="font-medium text-ink">nenhuma</strong> distingue
          esses modos; só arms race tem contadores próprios.
        </Item>

        <Item titulo="Mas o bot resolve">
          Adicionando o bot do FragIQ como amigo na Steam, lemos mapa e modo
          direto do jogo enquanto você joga — inclusive nos mapas que os
          contadores não conhecem. Cada coleta feita com o bot ativo fica
          marcada com o mapa e o modo daquela partida.
        </Item>

        <Item titulo="Provavelmente legado">
          Os contadores de <code className="font-mono text-xs">última partida</code>{" "}
          não se moveram — nem com a casual, nem com partidas anteriores. Tudo
          indica que são resquício do CS:GO que a Valve deixou de escrever no
          CS2. Não os use como se fossem a sua partida mais recente.
        </Item>

        <Item titulo="Não são ADR nem rating">
          Estes números não se comparam com os do csstats, do HLTV ou de
          qualquer site que leia demos. O dano por round daqui inclui modos
          onde se causa muito dano por round, então sai inflado — medimos:
          o valor vitalício de uma conta com K/D 0,70 apareceria acima da
          mediana de ADR dos profissionais. Use estes contadores para
          comparar você com você mesmo ao longo do tempo, não com terceiros.
        </Item>

        <Item titulo="Mapas legados apenas">
          A Valve parou de adicionar mapas a estes contadores por volta de 2013.
          Dust2, Inferno, Nuke, Train e Vertigo existem;{" "}
          <strong className="font-medium text-ink">
            Mirage, Ancient, Anubis e Overpass não são rastreados
          </strong>{" "}
          — partidas nesses mapas somam nos totais gerais, mas somem da análise
          por mapa.
        </Item>
      </div>
    </details>
  );
}

function Item({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[11px] tracking-wide text-ink-faint uppercase">
        {titulo}
      </p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}
