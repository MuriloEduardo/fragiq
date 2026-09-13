"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * O formulário de entrada na comunidade. Reeditável: quem já entrou vê o
 * que disse e pode mudar. O GitHub é opcional — testar não exige código.
 */
const PAPEIS = [
  { id: "testar", rotulo: "Testar", desc: "jogar, voltar e dizer o que está errado" },
  { id: "desenvolver", rotulo: "Desenvolver", desc: "Next.js, Python, dados — no GitHub" },
  { id: "dados", rotulo: "Dados", desc: "demos, GSI, o que a Steam não conta" },
  { id: "design", rotulo: "Design", desc: "telas, HUD, o que está feio" },
] as const;

type Inicial = {
  githubLogin: string | null;
  papeis: string[];
  mensagem: string | null;
  visivel: boolean;
} | null;

export function Participar({ inicial }: { inicial: Inicial }) {
  const [github, setGithub] = useState(inicial?.githubLogin ?? "");
  const [papeis, setPapeis] = useState<string[]>(inicial?.papeis ?? ["testar"]);
  const [mensagem, setMensagem] = useState(inicial?.mensagem ?? "");
  const [visivel, setVisivel] = useState(inicial?.visivel ?? true);
  const [estado, setEstado] = useState<"parado" | "enviando" | "salvo">("parado");
  const [erro, setErro] = useState<string | null>(null);

  function alternar(id: string) {
    setPapeis((atual) => (atual.includes(id) ? atual.filter((p) => p !== id) : [...atual, id]));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    setErro(null);
    try {
      const res = await fetch("/api/comunidade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubLogin: github, papeis, mensagem, visivel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error ?? "Não deu para salvar.");
        setEstado("parado");
        return;
      }
      setEstado("salvo");
      window.location.reload();
    } catch {
      setErro("Falha de rede.");
      setEstado("parado");
    }
  }

  return (
    <form onSubmit={enviar} className="rounded-2xl bg-surface p-5 ring-1 ring-line sm:p-6">
      <p className="hud">Como quer ajudar</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {PAPEIS.map((p) => {
          const on = papeis.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => alternar(p.id)}
              aria-pressed={on}
              className={cn(
                "flex items-start gap-3 rounded-xl p-3 text-left ring-1 transition",
                on ? "bg-accent-soft ring-accent/60" : "bg-canvas/40 ring-line hover:ring-ink-faint",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                  on ? "border-accent bg-accent text-canvas" : "border-line",
                )}
              >
                {on && <Check className="size-3" />}
              </span>
              <span>
                <span className="block text-sm font-medium">{p.rotulo}</span>
                <span className="block text-xs text-ink-faint">{p.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      <label className="mt-5 block">
        <span className="hud">GitHub</span>
        <input
          value={github}
          onChange={(e) => setGithub(e.target.value)}
          placeholder="seu-usuario"
          className="mt-2 w-full rounded-lg bg-canvas/40 px-3 py-2 text-sm ring-1 ring-line outline-none transition focus:ring-accent/50"
        />
        <span className="mt-1 block text-xs text-ink-faint">Opcional. É por onde vem o convite ao repositório.</span>
      </label>

      <label className="mt-4 block">
        <span className="hud">Uma frase</span>
        <textarea
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          rows={2}
          maxLength={600}
          placeholder="O que você quer ver no FragIQ, ou o que sabe fazer."
          className="mt-2 w-full resize-y rounded-lg bg-canvas/40 px-3 py-2 text-sm ring-1 ring-line outline-none transition focus:ring-accent/50"
        />
      </label>

      <label className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
        <input type="checkbox" checked={visivel} onChange={(e) => setVisivel(e.target.checked)} className="accent-accent" />
        Aparecer na lista de quem participa
      </label>

      {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={estado !== "parado" || papeis.length === 0}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-canvas transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {estado === "enviando" ? "Salvando…" : inicial ? "Atualizar" : "Completar meu perfil"}
        </button>
        {inicial && <span className="text-xs text-ink-faint">Você já está dentro.</span>}
      </div>
    </form>
  );
}
