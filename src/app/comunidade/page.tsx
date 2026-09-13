import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

/** Reservada: a área de quem participa entra na próxima rodada. */
export default function ComunidadePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition hover:text-accent">
        <ArrowLeft className="size-4" /> FragIQ
      </Link>
      <p className="hud mt-10">Comunidade</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Em construção.</h1>
      <p className="mt-3 max-w-lg text-sm text-ink-muted">
        Beta testers, feedback público e quem está desenvolvendo — chega em breve.
      </p>
    </main>
  );
}
