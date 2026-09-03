import { redirect } from "next/navigation";
import { LineChart, Lock, TrendingUp } from "lucide-react";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  if (await getSession()) redirect("/dashboard");

  const { erro } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-16">
      <p className="font-mono text-sm font-bold tracking-tight text-ink-muted">
        Frag<span className="text-accent">IQ</span>
      </p>

      <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        Sua evolução, <span className="text-accent">jogo a jogo</span>.
      </h1>

      <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-muted">
        A Steam guarda seus números desde sempre — e é justamente por isso que eles não
        mostram nada. Depois de mil horas, um mês excelente não move a média. O FragIQ
        registra suas estatísticas periodicamente e mostra a diferença entre as coletas:
        como você está jogando <em className="text-ink not-italic">agora</em>.
      </p>

      {erro && (
        <p className="mt-6 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {erro}
        </p>
      )}

      <div className="mt-9">
        <a
          href="/api/auth/steam"
          className="inline-flex items-center gap-3 rounded-xl border border-steam/30 bg-steam/10 px-5 py-3 font-medium text-steam transition hover:border-steam/60 hover:bg-steam/15"
        >
          <SteamMark />
          Entrar com Steam
        </a>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-faint">
          <Lock className="size-3" />
          Você digita sua senha no site da Valve. Nós recebemos apenas seu SteamID.
        </p>
      </div>

      <ul className="mt-14 grid gap-6 border-t border-line pt-8 sm:grid-cols-3">
        <Feature
          icon={<TrendingUp className="size-4" />}
          title="Forma atual"
          body="K/D, precisão e headshot calculados sobre o período, não sobre a vida inteira."
        />
        <Feature
          icon={<LineChart className="size-4" />}
          title="Toda a biblioteca"
          body="Não é só CS2. Qualquer jogo Steam que exponha estatísticas entra no acompanhamento."
        />
        <Feature
          icon={<Lock className="size-4" />}
          title="Histórico que a Steam não guarda"
          body="A Valve só mostra o total de hoje. Guardamos a série inteira, coleta a coleta."
        />
      </ul>
    </main>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li>
      <span className="flex size-8 items-center justify-center rounded-lg bg-surface-2 text-accent">
        {icon}
      </span>
      <h2 className="mt-3 text-sm font-medium">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{body}</p>
    </li>
  );
}

function SteamMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M11.98 2C6.5 2 2.01 6.2 1.53 11.55l5.36 2.21a3.03 3.03 0 0 1 1.72-.53h.15l2.39-3.45v-.05a4.03 4.03 0 1 1 4.03 4.03h-.09l-3.4 2.42v.12a3.03 3.03 0 1 1-6.05-.1L1.8 14.6A10.01 10.01 0 0 0 21.98 12 10 10 0 0 0 11.98 2ZM7.8 17.17l-1.22-.5a2.28 2.28 0 1 0 1.18-2.84 2.3 2.3 0 0 0-.24.1l1.27.53a1.68 1.68 0 1 1-1 3.09l.01-.38Zm10.02-7.44a2.69 2.69 0 1 0-5.37 0 2.69 2.69 0 0 0 5.37 0Zm-4.7 0a2.02 2.02 0 1 1 4.03 0 2.02 2.02 0 0 1-4.03 0Z" />
    </svg>
  );
}
