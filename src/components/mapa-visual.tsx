"use client";

import { useState } from "react";
import { identidadeDoMapa, imagemDoMapa } from "@/lib/mapas";
import { rotularMapa } from "@/lib/cs2-labels";
import { cn } from "@/lib/utils";

/**
 * O mapa, visível.
 *
 * Tenta `public/mapas/<mapa>.jpg` e, se o arquivo não existir, fica na
 * cor do mapa — o `onError` derruba a imagem uma vez e o componente não
 * tenta de novo. É por isso que não usa `next/image`: com o otimizador no
 * meio, um 404 vira erro de servidor em vez de um evento que o componente
 * resolve sozinho, e não haveria como ter a lista funcionando com alguns
 * mapas ilustrados e outros não.
 *
 * `tamanho` é o papel, não o pixel: `linha` é a miniatura de tabela,
 * `cartao` a faixa de um bloco, `hero` a do topo de uma página.
 */
const TAMANHOS = {
  linha: "h-8 w-12 rounded-md text-[10px]",
  cartao: "h-16 w-24 rounded-lg text-sm",
  hero: "h-20 w-32 rounded-xl text-base",
} as const;

export function MapaVisual({
  mapa,
  tamanho = "linha",
  className,
}: {
  mapa: string | null | undefined;
  tamanho?: keyof typeof TAMANHOS;
  className?: string;
}) {
  const [semImagem, setSemImagem] = useState(false);
  const id = identidadeDoMapa(mapa);
  const nome = mapa ? rotularMapa(mapa) : "sem mapa";

  return (
    <span
      title={nome}
      aria-label={nome}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden font-mono font-semibold ring-1 ring-line",
        TAMANHOS[tamanho],
        className,
      )}
      style={{ background: `linear-gradient(135deg, ${id.de}, ${id.para})`, color: id.tinta }}
    >
      {mapa && !semImagem && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagemDoMapa(mapa)}
          alt=""
          onError={() => setSemImagem(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {(!mapa || semImagem) && <span className="relative">{id.sigla}</span>}
    </span>
  );
}
