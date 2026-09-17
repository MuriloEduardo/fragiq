import Image from "next/image";
import type { ItemDoInventario } from "@/lib/inventario";
import { cn } from "@/lib/utils";

/**
 * A grade do inventário: um card por item, imagem grande, uma linha de
 * nome e uma de detalhe (exterior · arma), a raridade como cor da borda —
 * a mesma cor que a Steam usa. StatTrak e Souvenir são selos, não texto.
 */
export function InventarioGrade({ itens, limite }: { itens: ItemDoInventario[]; limite?: number }) {
  const lista = limite ? itens.slice(0, limite) : itens;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {lista.map((i) => (
        <li
          key={i.id}
          className="group relative overflow-hidden rounded-xl bg-surface ring-1 ring-line"
          style={{ borderBottom: `3px solid ${i.rarityColor ?? "var(--line)"}` }}
          title={`${i.name}${i.exterior ? ` · ${i.exterior}` : ""}${i.rarity ? ` · ${i.rarity}` : ""}`}
        >
          <div className="relative aspect-[4/3] bg-surface-2">
            {i.imageUrl ? (
              <Image src={`${i.imageUrl}/256fx192f`} alt={i.name} fill sizes="(min-width: 1024px) 20vw, 50vw" className="object-contain p-2 transition-transform duration-300 group-hover:scale-105" unoptimized />
            ) : null}
            <div className="absolute left-2 top-2 flex gap-1">
              {i.stattrak && <span className="rounded bg-[#cf6a32] px-1.5 py-0.5 text-[10px] font-semibold text-white">ST</span>}
              {i.souvenir && <span className="rounded bg-[#ffd700] px-1.5 py-0.5 text-[10px] font-semibold text-black">SV</span>}
            </div>
          </div>
          <div className="space-y-0.5 p-2.5">
            <p className="truncate text-sm font-medium">{i.name}</p>
            <p className={cn("truncate text-xs text-ink-muted")} style={{ color: i.rarityColor ?? undefined }}>
              {[i.exterior, i.rarity].filter(Boolean).join(" · ") || i.category || "—"}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
