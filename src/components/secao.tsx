import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Título de seção no padrão de HUD: rótulo pequeno em mono, sem legenda.
 * A legenda que explicava cada bloco foi removida; se um bloco precisa de
 * uma frase para ser entendido, o problema é o bloco.
 */
export function Secao({
  titulo,
  href,
  acao,
  children,
}: {
  titulo: string;
  href?: string;
  acao?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-0">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="hud">{titulo}</h2>
        {href && (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs text-ink-faint transition hover:text-accent"
          >
            {acao ?? "ver tudo"}
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
