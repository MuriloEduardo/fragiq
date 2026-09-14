import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Um estado vazio, um formato: título em HUD (≤ 5 palavras), uma linha de
 * texto opcional e, quando há o que fazer, uma ação. Substitui as sete
 * caixas tracejadas que cada página escrevia à sua maneira. Título e texto
 * são rótulos, não frases — é o que vai ser traduzido.
 */
export function Estado({
  titulo,
  texto,
  acao,
  className,
  compacto = false,
}: {
  titulo: string;
  texto?: string;
  acao?: { rotulo: string; href: string; externa?: boolean };
  className?: string;
  compacto?: boolean;
}) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-line text-center", compacto ? "px-4 py-5" : "px-6 py-10", className)}>
      <p className="hud">{titulo}</p>
      {texto && <p className="mt-1.5 text-sm text-ink-muted">{texto}</p>}
      {acao &&
        (acao.externa ? (
          <a href={acao.href} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent">
            {acao.rotulo}
          </a>
        ) : (
          <Link href={acao.href} className="mt-3 inline-block text-sm text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent">
            {acao.rotulo}
          </Link>
        ))}
    </div>
  );
}
