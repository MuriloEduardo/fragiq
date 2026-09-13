"use client";

import { useState } from "react";
import Link from "next/link";

/** O interruptor da página pública. Os números já são públicos na Steam; o
 * que se esconde aqui é a página, o selo e o nome na lista de perfis. */
export function PerfilPublicoToggle({ publico, steamId }: { publico: boolean; steamId: string }) {
  const [on, setOn] = useState(publico);
  const [salvando, setSalvando] = useState(false);

  async function alternar() {
    const proximo = !on;
    setOn(proximo);
    setSalvando(true);
    try {
      await fetch("/api/perfil/visibilidade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publico: proximo }),
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Página pública</p>
        <p className="mt-0.5 text-xs text-ink-faint">
          {on ? (
            <>
              Ligada em{" "}
              <Link href={`/p/${steamId}`} className="text-ink-muted underline-offset-2 hover:text-accent hover:underline">
                /p/{steamId}
              </Link>
              . Só o que a Steam já mostra; a curva fica com você.
            </>
          ) : (
            "Desligada. Ninguém vê seu perfil no FragIQ."
          )}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={salvando}
        onClick={alternar}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-surface-2 ring-1 ring-line"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-canvas transition ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
