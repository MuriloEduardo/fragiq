"use client";

import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { PAGINA_STEAM } from "./ativar-partidas";

type Codigos = {
  ativo: boolean;
  authCode?: string | null;
  authLegivel?: boolean;
  shareCodeAtual?: string | null;
  ultimaPartida?: { shareCode: string; jogadaEm: string; mapa: string | null } | null;
  erro?: string | null;
};

/**
 * Os três códigos da corrente, à vista do dono: autenticação (escondido
 * até pedir), share code atual e o da última partida. Uma linha cada, com
 * copiar. Nada é buscado até clicar em "mostrar" — o código de
 * autenticação só sai do banco quando alguém quer vê-lo.
 */
export function PartidasCodigos() {
  const [c, setC] = useState<Codigos | null>(null);
  const [verAuth, setVerAuth] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function carregar() {
    setOcupado(true);
    try {
      const res = await fetch("/api/partidas/codigos", { cache: "no-store" });
      setC((await res.json()) as Codigos);
    } finally {
      setOcupado(false);
    }
  }

  if (!c) {
    return (
      <button type="button" onClick={carregar} disabled={ocupado} className="text-xs text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent disabled:opacity-50">
        ver os códigos
      </button>
    );
  }
  if (!c.ativo) return <p className="text-xs text-ink-faint">Corrente desligada: não há códigos guardados.</p>;

  return (
    <ul className="mt-2 space-y-1.5 text-xs">
      <Linha rotulo="Autenticação" valor={c.authLegivel ? (verAuth ? (c.authCode ?? "—") : "••••-•••••-••••") : "ilegível — cole de novo na aba Partidas"} copiar={c.authLegivel && verAuth ? (c.authCode ?? undefined) : undefined}>
        {c.authLegivel && (
          <button type="button" onClick={() => setVerAuth((v) => !v)} className="text-ink-faint hover:text-ink" title={verAuth ? "esconder" : "mostrar"}>
            {verAuth ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        )}
      </Linha>
      <Linha rotulo="Share code atual" valor={c.shareCodeAtual ?? "—"} copiar={c.shareCodeAtual ?? undefined} nota="de onde a próxima busca continua" />
      <Linha rotulo="Última partida" valor={c.ultimaPartida?.shareCode ?? "—"} copiar={c.ultimaPartida?.shareCode} nota={c.ultimaPartida ? `${c.ultimaPartida.mapa ?? "?"} · ${new Date(c.ultimaPartida.jogadaEm).toLocaleDateString("pt-BR")}` : undefined} />
      <li className="pt-1 text-ink-faint">
        <a href={PAGINA_STEAM} target="_blank" rel="noreferrer" className="underline decoration-line hover:text-ink">gerar outro código de autenticação na Steam</a>
        {c.erro && <span className="ml-2 text-danger">· {c.erro}</span>}
      </li>
    </ul>
  );
}

function Linha({ rotulo, valor, copiar, nota, children }: { rotulo: string; valor: string; copiar?: string; nota?: string; children?: React.ReactNode }) {
  const [ok, setOk] = useState(false);
  return (
    <li className="flex items-center gap-2">
      <span className="hud w-28 shrink-0 text-[10px]">{rotulo}</span>
      <code className="num min-w-0 truncate rounded bg-surface-2 px-2 py-0.5" title={valor}>{valor}</code>
      {children}
      {copiar && (
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(copiar).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); })}
          className="text-ink-faint hover:text-ink"
          title="copiar"
        >
          {ok ? <span className="text-good">✓</span> : <Copy className="size-3.5" />}
        </button>
      )}
      {nota && <span className="hidden truncate text-ink-faint sm:inline">· {nota}</span>}
    </li>
  );
}
