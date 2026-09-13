"use client";

import { useState } from "react";

/** O interruptor da análise no chat da Steam. */
export function AvisoSteamToggle({ ligado, amigo }: { ligado: boolean; amigo: boolean | null }) {
  const [on, setOn] = useState(ligado);
  const [salvando, setSalvando] = useState(false);

  async function alternar() {
    const proximo = !on;
    setOn(proximo);
    setSalvando(true);
    try {
      await fetch("/api/conta/aviso-steam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ligado: proximo }),
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Análise no chat da Steam</p>
        <p className="mt-0.5 text-xs text-ink-faint">
          {on
            ? amigo === false
              ? "Ligada — mas só chega depois que você adicionar o bot como amigo."
              : "Ligada. Minutos depois de fechar o jogo, o bot manda a leitura da sessão no chat."
            : "Desligada. O bot não manda nada."}
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
