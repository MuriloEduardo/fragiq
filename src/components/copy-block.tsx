"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bloco de texto para copiar. O conteúdo fica visível: cegar o usuário para
 *  o que ele vai colar na própria máquina seria pior que o risco do token. */
export function CopyBlock({ texto, className }: { texto: string; className?: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de clipboard o texto continua ali para seleção manual.
    }
  }

  return (
    <div className={cn("relative rounded-xl border border-line bg-surface-2", className)}>
      <button
        onClick={copiar}
        className="absolute top-2 right-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs text-ink-muted transition hover:border-accent/50 hover:text-accent"
      >
        {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copiado ? "copiado" : "copiar"}
      </button>
      <pre className="overflow-x-auto px-4 py-3 pr-24 font-mono text-[11px] leading-relaxed text-ink">
        {texto}
      </pre>
    </div>
  );
}
