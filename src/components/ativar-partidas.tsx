"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** A página da Steam que gera o código de autenticação e mostra o share code da última partida. */
export const PAGINA_STEAM = "https://help.steampowered.com/pt-br/wizard/HelpWithGameIssue/?appid=730&issueid=128";

/**
 * Duas colas, uma vez.
 *
 * A Steam só entrega o histórico de partidas para quem tem um código de
 * autenticação gerado pela própria pessoa e um share code de partida —
 * e uma única página da Steam dá os dois. O formulário valida contra a
 * Steam antes de guardar e aponta o campo errado quando erra.
 */
export function AtivarPartidas({ compacto = false, religar = false }: { compacto?: boolean; religar?: boolean }) {
  const router = useRouter();
  const [authCode, setAuthCode] = useState("");
  const [shareCode, setShareCode] = useState("");
  const [erro, setErro] = useState<{ campo?: string; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/partidas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authCode, shareCode }),
      });
      const corpo = (await res.json().catch(() => ({}))) as { error?: string; campo?: string };
      if (!res.ok) {
        setErro({ campo: corpo.campo, texto: corpo.error ?? "Não deu certo. Tente de novo." });
        return;
      }
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  const campo = "min-h-11 w-full rounded-xl bg-canvas px-4 font-mono text-sm ring-1 outline-none transition placeholder:font-sans placeholder:text-ink-faint focus:ring-accent/50";

  return (
    <form onSubmit={enviar} className="space-y-4">
      <ol className={cn("space-y-3 text-sm text-ink-muted", compacto && "space-y-2")}>
        <li className="flex gap-3">
          <span className="num shrink-0 text-accent">1</span>
          <div>
            Abra a página da Steam e clique em <strong className="text-ink">Criar código de autenticação</strong>.
            <div className="mt-2">
              <a
                href={PAGINA_STEAM}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-canvas transition hover:brightness-110"
              >
                Abrir a página da Steam <ExternalLink className="size-3.5" />
              </a>
            </div>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="num shrink-0 text-accent">2</span>
          <div>
            Copie o código de autenticação e o <strong className="text-ink">share code da última partida</strong>; cole aqui.
          </div>
        </li>
      </ol>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="hud">Código de autenticação</span>
          <input
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            required
            className={cn(campo, "mt-1.5", erro?.campo === "auth" ? "ring-danger" : "ring-line")}
          />
        </label>
        <label className="block">
          <span className="hud">{religar ? "Share code (opcional: em branco, continua de onde parou)" : "Share code da última partida"}</span>
          <input
            value={shareCode}
            onChange={(e) => setShareCode(e.target.value)}
            placeholder="CSGO-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx"
            autoComplete="off"
            spellCheck={false}
            required={!religar}
            className={cn(campo, "mt-1.5", erro?.campo === "share" ? "ring-danger" : "ring-line")}
          />
        </label>
      </div>

      {erro && <p className="text-sm text-danger">{erro.texto}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={enviando}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-canvas transition hover:brightness-110 disabled:opacity-60"
        >
          {enviando && <Loader2 className="size-4 animate-spin" />}
          {enviando ? "Conferindo com a Steam…" : "Ativar partidas"}
        </button>
        <span className="text-xs text-ink-faint">
          Só o histórico de partidas · revogável aqui
        </span>
      </div>
    </form>
  );
}
