"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const TEXTO: Record<string, string> = {
  lido: "Inventário atualizado",
  recente: "Lido há pouco — a Steam pede intervalo",
  privado: "Inventário privado na Steam",
  indisponivel: "A Steam não respondeu agora",
};

export function InventarioAtualizar({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function atualizar() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/inventario", { method: "POST" });
      const data = (await res.json()) as { estado?: string; error?: string };
      setMsg(data.error ?? TEXTO[data.estado ?? ""] ?? "Feito");
      router.refresh();
    } catch {
      setMsg("Não foi possível atualizar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={cn("inline-flex items-center gap-2 text-xs text-ink-muted", className)}>
      <button type="button" onClick={atualizar} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 ring-1 ring-line hover:text-ink disabled:opacity-60">
        <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} aria-hidden />
        Atualizar
      </button>
      {msg && <span className="truncate">{msg}</span>}
    </span>
  );
}
