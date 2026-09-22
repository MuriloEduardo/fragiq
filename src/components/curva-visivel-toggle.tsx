"use client";

import { useState } from "react";

/**
 * Quem te segue vê a sua curva, ou não.
 *
 * É o que sobrou da aprovação pedido a pedido, e de propósito só tem duas
 * posições: a versão anterior obrigava a julgar cada pessoa para sempre, e
 * na prática ninguém mantém uma fila dessas em dia. Uma decisão, revogável
 * a qualquer hora, alcança o mesmo — desligar aqui tira a curva da vista
 * de todos os seguidores na hora, sem desfazer seguida nenhuma.
 */
export function CurvaVisivelToggle({ visivel, seguidores }: { visivel: boolean; seguidores: number }) {
  const [on, setOn] = useState(visivel);
  const [salvando, setSalvando] = useState(false);

  async function alternar() {
    const proximo = !on;
    setOn(proximo);
    setSalvando(true);
    try {
      await fetch("/api/perfil/visibilidade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curvaVisivel: proximo }),
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Curva para quem me segue</p>
        <p className="mt-0.5 text-xs text-ink-faint">
          {on
            ? `A série, as sessões e os cartões aparecem para ${seguidores === 0 ? "quem te seguir" : seguidores === 1 ? "o seu seguidor" : `os seus ${seguidores} seguidores`}. As leituras do analista nunca saem daqui.`
            : "Fechada. Quem te segue vê o mesmo que qualquer um: o que a Steam já mostra."}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Curva para quem me segue"
        disabled={salvando}
        onClick={alternar}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-surface-2 ring-1 ring-line"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-canvas transition ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
