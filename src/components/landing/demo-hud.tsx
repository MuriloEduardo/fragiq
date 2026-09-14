import { Sparkline } from "@/components/sparkline";
import { pontosSimples } from "@/lib/series";

/**
 * O produto, em miniatura, com os componentes reais.
 *
 * Não é screenshot: são os mesmos tiles do dashboard com números de
 * demonstração, então renderiza nítido em qualquer tela e com a fonte certa.
 * Os valores são inventados de propósito e ficam marcados como demo.
 */
const TILES = [
  { rotulo: "K/D", valor: "1,21", vit: "0,94", var: "+29%", serie: [0.8, 1.1, 0.9, 1.3, 1.0, 1.21] },
  { rotulo: "Headshot", valor: "48,2%", vit: "41,0%", var: "+18%", serie: [38, 44, 40, 46, 43, 48.2] },
  { rotulo: "Precisão AK-47", valor: "23,4%", vit: "19,7%", var: "+19%", serie: [18, 21, 19, 24, 22, 23.4] },
];

export function DemoHud() {
  return (
    <div className="glow relative overflow-hidden rounded-2xl bg-surface">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="hud">Última sessão</span>
          <span className="tnum text-sm text-ink-muted">hoje 21:40 → 23:05 · 31 rounds · 2 partidas · Competitivo · Mirage</span>
          <span className="ml-auto hud text-accent">demo</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {TILES.map((t) => (
            <div key={t.rotulo} className="rounded-xl bg-canvas/60 p-4 ring-1 ring-line">
              <p className="hud">{t.rotulo}</p>
              <p className="num mt-2 text-3xl font-semibold">{t.valor}</p>
              <p className="num mt-1 text-xs text-ink-faint">
                {t.vit} <span className="ml-1 font-medium text-accent">{t.var}</span>
              </p>
              <div className="mt-3 h-8">
                <Sparkline pontos={pontosSimples(t.serie)} normal={Number(t.vit.replace(",", "."))} className="h-8 w-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-canvas/60 p-4 ring-1 ring-line">
          <p className="hud">Análise da sessão</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Seu <strong className="font-medium text-ink">K/D foi 1,21</strong>, 29% acima do seu
            normal, e a precisão com AK acompanhou. O headshot subiu nas duas partidas — foi mira,
            não sorte. Mantenha o ritmo de troca à distância; foi onde os rounds se decidiram.
          </p>
        </div>
      </div>
    </div>
  );
}
