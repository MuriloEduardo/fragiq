/**
 * Aparece ao entrar na tela.
 *
 * Animação dirigida pelo scroll, em CSS puro (`animation-timeline: view()`):
 * onde o navegador não suporta, o conteúdo simplesmente está lá. Nada fica
 * escondido atrás de JavaScript — uma landing que some quando o observer
 * não dispara é pior do que uma que não anima.
 */
export function Revelar({
  children,
  className,
  atraso = 0,
}: {
  children: React.ReactNode;
  className?: string;
  atraso?: number;
}) {
  return (
    <div className={`revelar ${className ?? ""}`} style={{ animationDelay: `${atraso}ms` }}>
      {children}
    </div>
  );
}
