import Link from "next/link";
import Image from "next/image";
import { LogOut } from "lucide-react";
import { SyncButton } from "./sync-button";
import { FeedbackButton } from "./feedback-button";

type Props = {
  personaName: string;
  avatarUrl: string | null;
  lastSyncedAt: Date | null;
};

export function SiteHeader({ personaName, avatarUrl, lastSyncedAt }: Props) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
        <Link href="/cs2" className="font-mono text-sm font-bold tracking-tight">
          Frag<span className="text-accent">IQ</span>
        </Link>

        <div className="ml-auto flex items-center gap-4">
          <SyncButton />

          <div className="flex items-center gap-2 border-l border-line pl-4">
            {avatarUrl && (
              <Image
                src={avatarUrl}
                alt=""
                width={28}
                height={28}
                className="rounded-full ring-1 ring-line"
                unoptimized
              />
            )}
            <div className="hidden sm:block">
              <p className="text-sm leading-tight">{personaName}</p>
              <p className="text-[11px] leading-tight text-ink-faint">
                {lastSyncedAt
                  ? `sync ${lastSyncedAt.toLocaleDateString("pt-BR")}`
                  : "nunca sincronizado"}
              </p>
            </div>
          </div>

          <FeedbackButton />

          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              aria-label="Sair"
              className="rounded-lg p-2 text-ink-faint transition hover:bg-surface-2 hover:text-danger"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
