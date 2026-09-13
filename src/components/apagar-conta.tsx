"use client";

import { useState } from "react";

/** Dois cliques e uma palavra: apagar é irreversível e a interface diz isso. */
export function ApagarConta() {
  const [aberto, setAberto] = useState(false);
  const [confirma, setConfirma] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function apagar() {
    setOcupado(true);
    const res = await fetch("/api/conta/apagar", { method: "POST" });
    if (res.ok) window.location.href = "/";
    else setOcupado(false);
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-lg bg-surface px-4 py-2 text-sm text-danger ring-1 ring-danger/40 transition hover:bg-danger/10"
      >
        Apagar minha conta e todos os dados
      </button>
    );
  }

  return (
    <div className="rounded-xl bg-danger/5 p-4 ring-1 ring-danger/40">
      <p className="text-sm text-ink">
        Isso apaga a série inteira, as sessões, as análises e a participação na comunidade. Não tem volta — a
        Steam só sabe o total de hoje, então a curva não se recupera.
      </p>
      <label className="mt-3 block text-xs text-ink-faint">
        Digite <span className="font-mono text-ink">APAGAR</span> para confirmar
        <input
          value={confirma}
          onChange={(e) => setConfirma(e.target.value)}
          className="mt-1 w-full rounded-lg bg-canvas/40 px-3 py-2 text-sm ring-1 ring-line outline-none focus:ring-danger/60"
        />
      </label>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={confirma !== "APAGAR" || ocupado}
          onClick={apagar}
          className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-canvas transition disabled:opacity-40"
        >
          {ocupado ? "Apagando…" : "Apagar agora"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg px-4 py-2 text-sm text-ink-muted hover:text-ink">
          Cancelar
        </button>
      </div>
    </div>
  );
}
