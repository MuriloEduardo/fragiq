import { redirect } from "next/navigation";
import {
  ArrowRight,
  Database,
  GitCompareArrows,
  Layers,
  Lock,
  MessageSquare,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { getSession } from "@/lib/session";
import { SteamMark } from "@/components/steam-mark";
import { ThesisChart } from "@/components/thesis-chart";
import { Comparison } from "@/components/landing/comparison";

export const dynamic = "force-dynamic";

// TODO: trocar pelo canal real de feedback do beta (Discord, e-mail, form).
const FEEDBACK_URL = "https://steamcommunity.com/id/merudox";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  if (await getSession()) redirect("/dashboard");

  const { erro } = await searchParams;

  return (
    <div className="min-h-dvh">
      <TopBar />

      <main>
        <Hero erro={erro} />
        <MetricBuckets />
        <HowItWorks />
        <Differentiators />
        <Beta />
        <Privacy />
      </main>

      <Footer />
    </div>
  );
}

/* ---------------------------------- topo ---------------------------------- */

function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3.5">
        <span className="font-mono text-sm font-bold tracking-tight">
          Frag<span className="text-accent">IQ</span>
        </span>
        <BetaTag />

        <a
          href="#beta"
          className="ml-auto hidden text-sm text-ink-muted transition hover:text-ink sm:block"
        >
          Beta
        </a>
        <a
          href="#diferenciais"
          className="hidden text-sm text-ink-muted transition hover:text-ink sm:block"
        >
          Comparação
        </a>

        <a
          href="/api/auth/steam"
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium transition hover:border-steam/50 hover:text-steam sm:ml-4"
        >
          <SteamMark className="size-4" />
          Entrar
        </a>
      </div>
    </header>
  );
}

function BetaTag() {
  return (
    <span className="rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 font-mono text-[10px] font-medium tracking-widest text-accent uppercase">
      beta
    </span>
  );
}

/* ---------------------------------- hero ---------------------------------- */

function Hero({ erro }: { erro?: string }) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      {/* Malha sutil atrás do hero: dá profundidade sem competir com o gráfico. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(var(--line-soft)_1px,transparent_1px),linear-gradient(90deg,var(--line-soft)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_20%,transparent_75%)]"
      />

      <div className="relative mx-auto max-w-5xl px-6 pt-16 pb-14 sm:pt-24">
        <p className="font-mono text-[11px] tracking-[0.2em] text-ink-faint uppercase">
          Análise temporal de desempenho · Steam
        </p>

        <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Todo número do seu jogo,{" "}
          <span className="text-accent">ao longo do tempo</span>.
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted">
          A Steam guarda só o total de hoje, acumulado desde sempre. Depois de mil
          horas, esse número não se move mais — um mês excelente e um mês péssimo
          produzem a mesma média. O FragIQ coleta periodicamente e mostra a{" "}
          <strong className="font-medium text-ink">diferença entre as coletas</strong>:
          como você está jogando agora, não como jogou na vida inteira.
        </p>

        {erro && (
          <p className="mt-6 flex max-w-xl items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {erro}
          </p>
        )}

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <a
            href="/api/auth/steam"
            className="group inline-flex items-center gap-3 rounded-xl bg-steam px-5 py-3 font-medium text-white shadow-sm transition hover:brightness-110"
          >
            <SteamMark />
            Entrar com Steam
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </a>

          <a
            href="#diferenciais"
            className="rounded-xl border border-line px-5 py-3 text-sm font-medium text-ink-muted transition hover:border-ink-faint hover:text-ink"
          >
            Como se compara ao csstats
          </a>
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-faint">
          <Lock className="size-3" />
          Você digita a senha no site da Valve. Recebemos apenas o seu SteamID.
        </p>

        <div className="mt-14">
          <ThesisChart />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ o que dá pra ver --------------------------- */

const BUCKETS = [
  { count: 36, label: "Gerais", example: "kills, mortes, dano, MVPs, rounds" },
  { count: 94, label: "Por arma", example: "kills, tiros e acertos de cada arma" },
  { count: 30, label: "Por mapa", example: "rounds e vitórias em cada mapa" },
  { count: 18, label: "Última partida", example: "o resultado da partida mais recente" },
];

function MetricBuckets() {
  return (
    <Section
      eyebrow="O balde"
      title="178 métricas do CS2, não seis"
      lead="O CS2 expõe muito mais do que os painéis mostram. Medimos: são 197 contadores, dos quais 178 viram série temporal. Qualquer um deles pode virar gráfico."
    >
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {BUCKETS.map((b) => (
          <div
            key={b.label}
            className="rounded-xl border border-line bg-surface p-4 transition hover:border-accent/40"
          >
            <dt className="tnum font-mono text-3xl font-semibold text-accent">
              {b.count}
            </dt>
            <dd className="mt-1">
              <span className="block text-sm font-medium">{b.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-faint">
                {b.example}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 text-sm leading-relaxed text-ink-muted">
        E como o catálogo é montado a partir dos próprios dados, não de uma lista
        escrita no código, qualquer jogo da Steam que exponha estatísticas entra no
        acompanhamento sem alteração nenhuma.
      </p>
    </Section>
  );
}

/* ------------------------------- como funciona ----------------------------- */

const STEPS = [
  {
    icon: <SteamMark className="size-4" />,
    title: "Entre com a Steam",
    body: "Sem senha, sem código de autenticação, sem instalar nada. O login por OpenID devolve só o seu SteamID.",
  },
  {
    icon: <Database className="size-4" />,
    title: "Coletamos todo dia",
    body: "Um job diário registra o estado das suas estatísticas. Se você não jogou, não gravamos ponto — a série não ganha ruído.",
  },
  {
    icon: <SlidersHorizontal className="size-4" />,
    title: "Você monta o gráfico",
    body: "Escolha a métrica, o modo (total, por período, por hora jogada, razão entre duas) e a granularidade. Sobreponha quantas séries quiser.",
  },
];

function HowItWorks() {
  return (
    <Section
      eyebrow="Como funciona"
      title="Três passos, e o primeiro é o único que exige você"
      muted
    >
      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
                {s.icon}
              </span>
              <span className="tnum font-mono text-xs text-ink-faint">
                0{i + 1}
              </span>
            </div>
            <h3 className="mt-3 font-medium">{s.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* ------------------------------- diferenciais ------------------------------ */

function Differentiators() {
  return (
    <Section
      id="diferenciais"
      eyebrow="Comparação"
      title="Onde ganhamos, e onde ainda não"
      lead="csstats.gg, csrep.gg e Leetify parseiam demos: por isso têm ADR, KAST e rating, e nós ainda não. Em compensação, eles graficam pouca coisa ao longo do tempo — o csstats só o CS Rating do Premier. É essa lacuna que o FragIQ ocupa."
    >
      <Comparison />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Callout
          icon={<GitCompareArrows className="size-4" />}
          title="A conta que ninguém faz"
          body="Todas mostram a sua precisão vitalícia com a AK. Nenhuma mostra se ela subiu ou caiu no último mês — que é a única versão da informação sobre a qual dá pra agir."
        />
        <Callout
          icon={<Layers className="size-4" />}
          title="Não é só CS2"
          body="O motor não sabe o que é Counter-Strike. Ele lê contadores e deriva séries, então qualquer jogo da sua biblioteca que exponha estatísticas aparece junto."
        />
      </div>
    </Section>
  );
}

/* ----------------------------------- beta ---------------------------------- */

function Beta() {
  return (
    <section id="beta" className="border-t border-line bg-surface">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex items-center gap-3">
          <BetaTag />
          <span className="font-mono text-[11px] tracking-widest text-ink-faint uppercase">
            aberto · gratuito
          </span>
        </div>

        <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-balance">
          Procuramos beta testers que joguem de verdade
        </h2>

        <p className="mt-4 max-w-2xl leading-relaxed text-ink-muted">
          A plataforma está no ar e funcionando, mas é honesto dizer o que isso
          significa: só conseguimos validar o produto com gente jogando ao longo de
          semanas, porque a série temporal precisa de tempo para existir.
        </p>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="font-mono text-[11px] tracking-widest text-ink-faint uppercase">
              O que você ganha
            </h3>
            <ul className="mt-3 space-y-2.5 text-sm text-ink-muted">
              <Item>Acesso completo, sem cobrança, durante todo o beta</Item>
              <Item>
                Seu histórico começa a ser gravado hoje — e ele não é recuperável
                depois
              </Item>
              <Item>Peso real nas próximas métricas e telas</Item>
            </ul>
          </div>

          <div>
            <h3 className="font-mono text-[11px] tracking-widest text-ink-faint uppercase">
              O que pedimos
            </h3>
            <ul className="mt-3 space-y-2.5 text-sm text-ink-muted">
              <Item>Perfil da Steam com &ldquo;Detalhes do jogo&rdquo; público</Item>
              <Item>Voltar depois de algumas semanas de jogo</Item>
              <Item>Dizer o que está confuso, faltando ou errado</Item>
            </ul>
          </div>
        </div>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <a
            href="/api/auth/steam"
            className="group inline-flex items-center gap-3 rounded-xl bg-steam px-5 py-3 font-medium text-white transition hover:brightness-110"
          >
            <SteamMark />
            Entrar e começar a gravar
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
          </a>

          <a
            href={FEEDBACK_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-xl border border-line px-5 py-3 text-sm font-medium text-ink-muted transition hover:border-ink-faint hover:text-ink"
          >
            <MessageSquare className="size-4" />
            Enviar feedback
          </a>
        </div>

        <p className="mt-6 flex max-w-2xl items-start gap-2 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-ink-muted">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            Software em beta: pode haver bug, indisponibilidade e mudança de
            estrutura de dados. Nada aqui altera nada na sua conta Steam — só
            lemos.
          </span>
        </p>
      </div>
    </section>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden
        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
      />
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

/* --------------------------------- privacidade ----------------------------- */

function Privacy() {
  return (
    <Section eyebrow="Privacidade" title="O que lemos, e o que não tocamos" muted>
      <div className="grid gap-4 sm:grid-cols-2">
        <Callout
          icon={<ShieldCheck className="size-4" />}
          title="Nunca vemos sua senha"
          body="O login usa OpenID 2.0, o mecanismo oficial da Valve para sites de terceiros. Você autentica no domínio da Steam e nós recebemos uma afirmação assinada com o seu SteamID — nada além disso."
        />
        <Callout
          icon={<Lock className="size-4" />}
          title="Somente leitura, e só do público"
          body="Lemos perfil, biblioteca e estatísticas — os mesmos dados que qualquer pessoa vê no seu perfil público. Não temos permissão para inventário, trades ou qualquer ação na sua conta."
        />
      </div>
    </Section>
  );
}

/* --------------------------------- estrutura ------------------------------- */

function Section({
  id,
  eyebrow,
  title,
  lead,
  muted,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  lead?: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={`border-t border-line ${muted ? "bg-surface/40" : ""} scroll-mt-14`}
    >
      <div className="mx-auto max-w-5xl px-6 py-16">
        <p className="font-mono text-[11px] tracking-[0.2em] text-ink-faint uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-balance">
          {title}
        </h2>
        {lead && (
          <p className="mt-4 max-w-2xl leading-relaxed text-ink-muted">{lead}</p>
        )}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function Callout({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
        {icon}
      </span>
      <h3 className="mt-3 font-medium">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-xs text-ink-faint">
        <span className="font-mono">
          Frag<span className="text-accent">IQ</span>
        </span>
        <span>Beta aberto</span>
        <span className="ml-auto">
          Powered by Steam. Não afiliado à Valve Corporation.
        </span>
      </div>
    </footer>
  );
}
