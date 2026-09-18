import type { PartidaLinha } from "@/lib/partidas";
import { formatarNumero } from "@/lib/formato";
import { rotularMapa } from "@/lib/cs2-labels";

/**
 * O que o Game Coordinator entrega sobre um jogador, agregado: o único
 * dado que existe para quem está privado na Steam. Cada partida que
 * alguém do FragIQ jogou com a pessoa deixa o scoreboard dos dez; somando
 * dá K/D, HS, MVP e vitórias reais — por partida oficial, não vitalício.
 */
export function PartidasAgregado({ partidas }: { partidas: PartidaLinha[] }) {
  if (partidas.length === 0) return null;
  const n = partidas.length;
  const soma = partidas.reduce(
    (a, p) => ({ kills: a.kills + p.eu.kills, deaths: a.deaths + p.eu.deaths, assists: a.assists + p.eu.assists, hs: a.hs + p.eu.hs, mvps: a.mvps + p.eu.mvps, vitorias: a.vitorias + (p.eu.venceu ? 1 : 0), rounds: a.rounds + p.rounds }),
    { kills: 0, deaths: 0, assists: 0, hs: 0, mvps: 0, vitorias: 0, rounds: 0 },
  );
  const tiles = [
    { r: "K/D", v: soma.deaths ? formatarNumero(soma.kills / soma.deaths, 2) : "—" },
    { r: "HS", v: soma.kills ? `${formatarNumero((soma.hs / soma.kills) * 100, 0)}%` : "—" },
    { r: "Kills/round", v: soma.rounds ? formatarNumero(soma.kills / soma.rounds, 2) : "—" },
    { r: "MVP/partida", v: formatarNumero(soma.mvps / n, 1) },
    { r: "Vitórias", v: `${formatarNumero((soma.vitorias / n) * 100, 0)}%` },
  ];
  const porMapa = new Map<string, { n: number; v: number }>();
  for (const p of partidas) {
    const k = p.mapa ?? "?";
    const m = porMapa.get(k) ?? { n: 0, v: 0 };
    porMapa.set(k, { n: m.n + 1, v: m.v + (p.eu.venceu ? 1 : 0) });
  }
  const mapas = [...porMapa.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6);
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="hud">Nas partidas oficiais</h2>
        <p className="num text-xs text-ink-faint">{n} {n === 1 ? "partida" : "partidas"} · {soma.rounds} rounds · placar dos dez, direto do Game Coordinator</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.r} className="rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
            <p className="hud text-[10px]">{t.r}</p>
            <p className="num text-xl font-semibold">{t.v}</p>
          </div>
        ))}
      </div>
      {mapas.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {mapas.map(([mapa, m]) => (
            <li key={mapa} className="num rounded-full px-3 py-1 text-xs text-ink-muted ring-1 ring-line">
              {mapa === "?" ? "mapa ?" : rotularMapa(mapa)} · {m.v}V {m.n - m.v}D
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
