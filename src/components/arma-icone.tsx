import { iconeDaArma } from "@/lib/cs2-assets";
import { rotularArma } from "@/lib/cs2-labels";
import { cn } from "@/lib/utils";

/**
 * A silhueta da arma, a mesma do killfeed.
 *
 * O SVG do jogo é branco chapado; como máscara, ele pega a cor do texto
 * em volta (`bg-current`) e fica certo nos dois temas sem uma segunda
 * versão do arquivo. Arma sem ícone não desenha nada — o nome ao lado
 * continua dizendo qual é.
 */
export function ArmaIcone({ arma, className }: { arma: string; className?: string }) {
  const url = iconeDaArma(arma);
  if (!url) return null;
  return (
    <span
      role="img"
      aria-label={rotularArma(arma.replace(/^weapon_/, ""))}
      className={cn("inline-block h-4 w-12 shrink-0 bg-current", className)}
      style={{
        maskImage: `url(${url})`,
        WebkitMaskImage: `url(${url})`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "left center",
        WebkitMaskPosition: "left center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
      }}
    />
  );
}
