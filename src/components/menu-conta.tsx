"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Gauge, LogOut, Settings, ShieldCheck, User } from "lucide-react";
import { Selo } from "./selo";
import { cn } from "@/lib/utils";

type Props = {
  personaName: string;
  avatarUrl: string | null;
  steamId: string;
  lastSyncedAt: Date | null;
  selo?: "fundador" | "beta" | null;
  admin?: boolean;
};

/**
 * O menu da conta.
 *
 * O cabeçalho tinha seis ícones sem rótulo em fila — escudo, megafone,
 * pessoas, medidor, balão, porta — e nenhum jeito de saber qual era qual
 * sem passar o mouse, o que no celular não existe. Eram todos do mesmo
 * peso visual e nenhum era o "onde eu mexo nas minhas coisas".
 *
 * Aqui há um alvo só, com a cara da pessoa nele, e o que estava escondido
 * em ícone vira uma linha com nome. É a convenção que todo produto usa
 * porque funciona: quem procura "minhas configurações" procura no avatar.
 */
export function MenuConta({ personaName, avatarUrl, steamId, lastSyncedAt, selo, admin }: Props) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    // Fechar no clique fora e no Esc: sem isso o menu fica pendurado
    // quando a navegação acontece por teclado.
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  return (
    <div className="relative" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        className={cn(
          "flex min-h-9 items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-surface-2",
          aberto && "bg-surface-2",
        )}
      >
        {avatarUrl ? (
          <Image src={avatarUrl} alt="" width={28} height={28} className="size-7 rounded-full ring-1 ring-line" unoptimized />
        ) : (
          <span className="flex size-7 items-center justify-center rounded-full bg-surface-2 ring-1 ring-line">
            <User className="size-4 text-ink-faint" />
          </span>
        )}
        <span className="hidden max-w-32 truncate text-sm sm:block">{personaName}</span>
        <ChevronDown className={cn("size-3.5 text-ink-faint transition", aberto && "rotate-180")} />
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1.5 w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-xl shadow-black/20"
        >
          <div className="border-b border-line-soft px-3 py-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className="min-w-0 truncate">{personaName}</span>
              {selo && <Selo tipo={selo} />}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-faint" suppressHydrationWarning>
              {lastSyncedAt ? `última coleta em ${lastSyncedAt.toLocaleDateString("pt-BR")}` : "nunca sincronizado"}
            </p>
          </div>

          <nav className="py-1">
            <Item href={`/p/${steamId}`} icone={<User className="size-4" />}>Meu perfil público</Item>
            <Item href="/configuracoes" icone={<Settings className="size-4" />}>Configurações</Item>
            <Item href="/seguranca" icone={<ShieldCheck className="size-4" />}>Segurança e dados</Item>
            {admin && <Item href="/admin" icone={<Gauge className="size-4" />}>Painel</Item>}
          </nav>

          <form action="/api/auth/logout" method="post" className="border-t border-line-soft">
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-ink-muted transition hover:bg-surface-2 hover:text-danger"
            >
              <LogOut className="size-4" />
              Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Item({ href, icone, children }: { href: string; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink-muted transition hover:bg-surface-2 hover:text-ink"
    >
      <span className="text-ink-faint">{icone}</span>
      {children}
    </Link>
  );
}
