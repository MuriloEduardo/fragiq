import type { Delta } from "@/lib/delta";
import { formatarNumero, formatarPp } from "@/lib/formato";
import { cn } from "@/lib/utils";

/**
 * O chip de "contra o seu normal", um só para o site inteiro.
 *
 * `▲ 19%` / `▼ 17 pp` / `≈`. O ícone é o sinal; a cor é a valência (verde
 * quando o movimento é bom para a estatística, vermelho quando é ruim,
 * cinza quando tanto faz ou quando a diferença é ruído). Amostra pequena
 * tira o fundo e pontilha a borda — o número fica, a confiança não. Sem
 * base, o chip não existe: quem explica é a linha de referência do cartão.
 */
export function DeltaChip({ delta, className, tamanho = "sm" }: { delta: Delta; className?: string; tamanho?: "sm" | "md" }) {
  if (delta.estado !== "ok") return null;
  const icone = delta.direcao === "sobe" ? "▲" : delta.direcao === "desce" ? "▼" : "≈";
  const texto =
    delta.direcao === "igual"
      ? ""
      : delta.unidade === "pp"
        ? formatarPp(delta.valor)
        : `${formatarNumero(Math.abs(delta.valor), 0)}%`;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium whitespace-nowrap",
        tamanho === "sm" ? "text-xs" : "text-sm",
        delta.valencia === "good" && "text-good",
        delta.valencia === "bad" && "text-bad",
        delta.valencia === "neutral" && "text-neutral",
        !delta.fraco && delta.valencia === "good" && "bg-good-soft",
        !delta.fraco && delta.valencia === "bad" && "bg-bad-soft",
        delta.fraco && "border border-dotted border-current/60",
        className,
      )}
      title={delta.fraco ? "amostra pequena" : undefined}
    >
      <span aria-hidden>{icone}</span>
      {texto}
    </span>
  );
}
