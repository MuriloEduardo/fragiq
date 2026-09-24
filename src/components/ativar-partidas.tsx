"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Loader2 } from "lucide-react";
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
 *
 * Quando já temos um share code dela — da própria corrente ou de uma
 * partida que a corrente de outra pessoa trouxe —, o campo some atrás de
 * um link e só volta se a pessoa quiser ou se a Steam recusar o que temos.
 */
const FORMATO_AUTH = /^[A-Z0-9]{4}-[A-Z0-9]{5}-[A-Z0-9]{4}$/;
const FORMATO_SHARE = /CSGO(-[A-Za-z0-9]{5}){5}/;

/**
 * A página da Steam mostra os dois códigos um embaixo do outro, e é comum
 * colar o share code no primeiro campo. Em vez de devolver "formato
 * errado", o código vai para o campo dele — e o ✓ ao lado do rótulo diz,
 * antes de enviar, que a cola saiu inteira.
 */
function separar(colado: string): { auth?: string; share?: string } {
  const share = colado.match(FORMATO_SHARE)?.[0];
  if (share) return { share };
  const auth = colado.trim().toUpperCase();
  return FORMATO_AUTH.test(auth) ? { auth } : {};
}

export function AtivarPartidas({ compacto = false, religar = false }: { compacto?: boolean; religar?: boolean }) {
  const router = useRouter();
  const [authCode, setAuthCode] = useState("");
  const [shareCode, setShareCode] = useState("");
  const [erro, setErro] = useState<{ campo?: string; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [trocarShare, setTrocarShare] = useState(false);
  const pedeShare = !religar || trocarShare;
  const authOk = FORMATO_AUTH.test(authCode.trim());
  const shareOk = FORMATO_SHARE.test(shareCode);

  function colar(valor: string, campo: "auth" | "share") {
    const { auth, share } = separar(valor);
    if (campo === "auth" && share) {
      setShareCode(share);
      setTrocarShare(true);
      return;
    }
    if (campo === "share" && auth) {
      setAuthCode(auth);
      return;
    }
    if (campo === "auth") setAuthCode(valor.toUpperCase());
    else setShareCode(valor);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/partidas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authCode, shareCode: pedeShare ? shareCode : "" }),
      });
      const corpo = (await res.json().catch(() => ({}))) as { error?: string; campo?: string };
      if (!res.ok) {
        setErro({ campo: corpo.campo, texto: corpo.error ?? "Não deu certo. Tente de novo." });
        if (corpo.campo === "share") setTrocarShare(true);
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
            {pedeShare ? (
              <>
                Copie o código de autenticação e o <strong className="text-ink">share code da última partida</strong>, que aparece logo abaixo dele; cole aqui.
              </>
            ) : (
              <>Copie o código de autenticação e cole aqui. Já temos uma partida sua para começar.</>
            )}
          </div>
        </li>
      </ol>

      <div className={cn("grid gap-3", pedeShare && "sm:grid-cols-2")}>
        <label className="block">
          <span className="hud inline-flex items-center gap-1.5">
            Código de autenticação {authOk && <Check className="size-3.5 text-accent" aria-label="formato certo" />}
          </span>
          <input
            value={authCode}
            onChange={(e) => colar(e.target.value, "auth")}
            placeholder="XXXX-XXXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            required
            className={cn(campo, "mt-1.5", erro?.campo === "auth" ? "ring-danger" : "ring-line")}
          />
        </label>
        {pedeShare && (
          <label className="block">
            <span className="hud inline-flex items-center gap-1.5">
              {religar ? "Share code (opcional: em branco, começa da última que temos)" : "Share code da última partida"}
              {shareOk && <Check className="size-3.5 text-accent" aria-label="formato certo" />}
            </span>
            <input
              value={shareCode}
              onChange={(e) => colar(e.target.value, "share")}
              placeholder="CSGO-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx"
              autoComplete="off"
              spellCheck={false}
              required={!religar}
              className={cn(campo, "mt-1.5", erro?.campo === "share" ? "ring-danger" : "ring-line")}
            />
          </label>
        )}
      </div>

      {!pedeShare && (
        <button type="button" onClick={() => setTrocarShare(true)} className="text-xs text-ink-faint underline decoration-line hover:text-ink">
          Recomeçar de outra partida (colar um share code)
        </button>
      )}

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
