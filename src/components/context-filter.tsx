"use client";

import { Filter, X } from "lucide-react";
import type { ContextFilter } from "@/lib/series";
import { rotularModo } from "@/lib/cs2-labels";
import { cn } from "@/lib/utils";

/**
 * Recorte por mapa (e por modo, onde o modo não é navegação).
 *
 * Só existe porque o bot de presença lê o rich presence do CS2 — os
 * contadores da Steam não distinguem modo nem conhecem os mapas modernos.
 * Sem coletas marcadas, o controle não aparece: um filtro que não filtra
 * nada só confunde. Nas abas do jogo o modo vem do submenu e a barra
 * recebe `modes=[]`; o "limpar" então só solta o mapa.
 */


type Props = {
  modes: [string, number][];
  maps: [string, number][];
  value: ContextFilter;
  onChange: (filter: ContextFilter) => void;
  /** Quantas coletas ainda não têm contexto registrado. */
  semContexto: number;
};

export function ContextFilterBar({ modes, maps, value, onChange, semContexto }: Props) {
  if (modes.length === 0 && maps.length === 0) return null;

  const ativo = Boolean((modes.length > 0 && value.mode) || value.map);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface px-4 py-3 ring-1 ring-line">
      <Filter className="size-4 shrink-0 text-ink-faint" />

      {modes.length > 0 && (
        <Grupo
          rotulo="Modo"
          opcoes={modes.map(([v, n]) => ({ value: v, label: `${rotularModo(v)} (${n})` }))}
          value={value.mode ?? ""}
          onChange={(v) => onChange({ ...value, mode: v || null })}
        />
      )}

      {maps.length > 0 && (
        <Grupo
          rotulo="Mapa"
          opcoes={maps.map(([v, n]) => ({ value: v, label: `${v} (${n})` }))}
          value={value.map ?? ""}
          onChange={(v) => onChange({ ...value, map: v || null })}
        />
      )}

      {ativo && (
        <button
          onClick={() => onChange(modes.length > 0 ? {} : { ...value, map: null })}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-faint transition hover:text-ink"
        >
          <X className="size-3" />
          limpar
        </button>
      )}

      {semContexto > 0 && (
        <span className="ml-auto text-xs text-ink-faint">
          {semContexto} coleta{semContexto === 1 ? "" : "s"} sem contexto
          {ativo && " — fora do recorte"}
        </span>
      )}
    </div>
  );
}

function Grupo({
  rotulo,
  opcoes,
  value,
  onChange,
}: {
  rotulo: string;
  opcoes: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-ink-muted">
      {rotulo}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "rounded-md border bg-surface-2 px-2 py-1 text-sm text-ink outline-none transition focus:border-accent/50",
          value ? "border-accent/50" : "border-line",
        )}
      >
        <option value="">todos</option>
        {opcoes.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
