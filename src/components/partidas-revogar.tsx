"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** Desliga a corrente e apaga o código de autenticação. As partidas já gravadas ficam. */
export function PartidasRevogar({ ativo, desde }: { ativo: boolean; desde: Date | null }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);

  async function revogar() {
    setEnviando(true);
    try {
      await fetch("/api/partidas", { method: "DELETE" });
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Histórico de partidas oficiais</p>
        <p className="mt-0.5 text-xs text-ink-faint">
          {ativo
            ? `Ligado${desde ? ` desde ${desde.toLocaleDateString("pt-BR")}` : ""}. O código de autenticação fica cifrado e só serve para pedir o próximo share code à Steam. Revogar apaga o código aqui; as partidas já gravadas continuam.`
            : "Desligado. Ligue na aba Partidas do CS2: dois códigos de uma página da Steam, uma vez."}
        </p>
      </div>
      {ativo ? (
        <button
          type="button"
          onClick={revogar}
          disabled={enviando}
          className="rounded-lg bg-surface px-3 py-2 text-sm text-ink-muted ring-1 ring-line transition hover:text-danger hover:ring-danger/60 disabled:opacity-60"
        >
          Revogar
        </button>
      ) : (
        <Link href="/games/730/partidas" className="rounded-lg bg-surface px-3 py-2 text-sm text-ink-muted ring-1 ring-line transition hover:text-ink hover:ring-accent/60">
          Ligar
        </Link>
      )}
    </div>
  );
}
