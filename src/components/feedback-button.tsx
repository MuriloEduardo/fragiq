"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Estado = "parado" | "enviando" | "enviado";

export function FeedbackButton() {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  const [estado, setEstado] = useState<Estado>("parado");
  const [erro, setErro] = useState<string | null>(null);

  // <dialog> nativo já entrega foco preso, fechar no Esc e backdrop — não
  // vale reimplementar isso, e reimplementações costumam errar acessibilidade.
  function abrir() {
    setEstado("parado");
    setErro(null);
    dialog.current?.showModal();
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    setErro(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, path: pathname }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErro(data.error ?? "Não foi possível enviar.");
        setEstado("parado");
        return;
      }

      setMessage("");
      setEstado("enviado");
    } catch {
      setErro("Falha de rede.");
      setEstado("parado");
    }
  }

  return (
    <>
      <button
        onClick={abrir}
        aria-label="Enviar feedback"
        title="Enviar feedback"
        className="rounded-lg p-2 text-ink-faint transition hover:bg-surface-2 hover:text-accent"
      >
        <MessageSquare className="size-4" />
      </button>

      <dialog
        ref={dialog}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-sm font-medium">Feedback do beta</h2>
          <button
            onClick={() => dialog.current?.close()}
            aria-label="Fechar"
            className="rounded p-1 text-ink-faint transition hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {estado === "enviado" ? (
          <Enviado onFechar={() => dialog.current?.close()} />
        ) : (
          <form onSubmit={enviar} className="p-5">
            <label
              htmlFor="feedback-msg"
              className="block text-sm leading-relaxed text-ink-muted"
            >
              O que está confuso, faltando ou errado? Vale relato solto — quanto
              mais concreto, mais útil.
            </label>

            <textarea
              id="feedback-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={4000}
              required
              minLength={4}
              autoFocus
              placeholder="Ex.: cliquei em Sincronizar depois de jogar e não apareceu ponto novo…"
              className="mt-3 w-full resize-y rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none transition focus:border-accent/50"
            />

            {erro && <p className="mt-2 text-sm text-danger">{erro}</p>}

            <div className="mt-4 flex items-center gap-3">
              <button
                type="submit"
                disabled={estado === "enviando" || message.trim().length < 4}
                className={cn(
                  "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-canvas transition",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                  estado !== "enviando" && "hover:brightness-110",
                )}
              >
                {estado === "enviando" ? "Enviando…" : "Enviar"}
              </button>

              <span className="ml-auto tnum text-xs text-ink-faint">
                {message.length}/4000
              </span>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}

function Enviado({ onFechar }: { onFechar: () => void }) {
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => botao.current?.focus(), []);

  return (
    <div className="p-5">
      <p className="text-sm leading-relaxed">
        Recebido. Como você está logado, sei de quem veio e consigo olhar sua
        série junto do relato — isso torna o feedback muito mais útil.
      </p>
      <button
        ref={botao}
        onClick={onFechar}
        className="mt-4 rounded-lg border border-line px-4 py-2 text-sm transition hover:border-ink-faint"
      >
        Fechar
      </button>
    </div>
  );
}
