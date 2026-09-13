import Link from "next/link";
import Image from "next/image";
import { Gauge, LogOut, Megaphone, Users } from "lucide-react";
import { Selo } from "./selo";
import { SyncButton } from "./sync-button";
import { FeedbackButton } from "./feedback-button";

type Props = {
  personaName: string;
  avatarUrl: string | null;
  lastSyncedAt: Date | null;
  /** Mostra o atalho para /admin. Só quem está em ADMIN_STEAM_IDS. */
  admin?: boolean;
  /** Selo da comunidade, quando a pessoa entrou. */
  selo?: "fundador" | "beta" | null;
};

/**
 * Cabeçalho.
 *
 * Mobile primeiro, e por um defeito medido: numa viewport de 390px o layout
 * anterior produzia 471px de conteúdo — o botão de feedback e o de sair
 * ficavam inteiramente fora da tela, e a página inteira deslizava para o
 * lado. Agora o grupo de sincronização quebra para uma linha própria abaixo
 * de `sm` (`order-last w-full`) e volta para a mesma linha a partir dali, sem
 * duplicar o componente — duas instâncias de SyncButton seriam dois estados
 * de seleção de modo divergindo em silêncio.
 */
export function SiteHeader({ personaName, avatarUrl, lastSyncedAt, admin, selo }: Props) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 sm:flex-nowrap sm:gap-x-4 sm:px-6 sm:py-3">
        <Link
          href="/cs2"
          className="font-mono text-sm font-bold tracking-tight"
        >
          Frag<span className="text-accent">IQ</span>
        </Link>

        {admin && (
          <Link
            href="/admin"
            className="inline-flex size-11 items-center justify-center rounded-lg text-ink-faint transition hover:bg-surface-2 hover:text-accent sm:size-9"
            aria-label="Painel"
            title="Painel"
          >
            <Gauge className="size-4" />
          </Link>
        )}

        {/* Identidade e ações ficam sempre na primeira linha: são o que
            precisa estar alcançável mesmo com o teclado aberto. */}
        <div className="ml-auto flex items-center gap-1 sm:order-last sm:gap-2">
          <div className="flex items-center gap-2 sm:border-l sm:border-line sm:pl-4">
            {avatarUrl && (
              <Image
                src={avatarUrl}
                alt=""
                width={28}
                height={28}
                className="size-7 rounded-full ring-1 ring-line"
                unoptimized
              />
            )}
            <div className="hidden sm:block">
              <p className="flex items-center gap-2 text-sm leading-tight">
                {personaName}
                {selo && <Selo tipo={selo} />}
              </p>
              <p className="text-[11px] leading-tight text-ink-faint">
                {lastSyncedAt
                  ? `sync ${lastSyncedAt.toLocaleDateString("pt-BR")}`
                  : "nunca sincronizado"}
              </p>
            </div>
          </div>

          <Link
            href="/amigos"
            aria-label="Amigos"
            title="Amigos"
            className="inline-flex size-11 items-center justify-center rounded-lg text-ink-faint transition hover:bg-surface-2 hover:text-accent sm:size-9"
          >
            <Users className="size-4" />
          </Link>

          <Link
            href="/comunidade"
            aria-label="Comunidade"
            title="Comunidade"
            className="inline-flex size-11 items-center justify-center rounded-lg text-ink-faint transition hover:bg-surface-2 hover:text-accent sm:size-9"
          >
            <Megaphone className="size-4" />
          </Link>

          <FeedbackButton />

          <form action="/api/auth/logout" method="post" className="flex">
            <button
              type="submit"
              aria-label="Sair"
              className="inline-flex size-11 items-center justify-center rounded-lg text-ink-faint transition hover:bg-surface-2 hover:text-danger sm:size-9"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>

        {/* No celular vira a segunda linha, ocupando a largura toda. */}
        <div className="order-last w-full sm:order-none sm:ml-auto sm:w-auto">
          <SyncButton className="w-full sm:w-auto" />
        </div>
      </div>
    </header>
  );
}
