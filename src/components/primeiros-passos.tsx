import Link from "next/link";
import { ArrowRight, Check, Circle, ExternalLink, HelpCircle } from "lucide-react";
import { BOT_STEAM_ID, perfilDoBot } from "@/lib/bot";
import { SyncButton } from "./sync-button";
import { cn } from "@/lib/utils";

/**
 * Os passos entre entrar e ter uma curva — com o estado de cada um.
 *
 * Quem acabou de logar vê uma tela quase vazia e não sabe se o site quebrou
 * ou se falta algo dele. Falta algo dele, quase sempre: "Detalhes do jogo"
 * privado na Steam (a API não lê nada), o bot ainda não é amigo (mapa e
 * modo não chegam) e só existe uma coleta (não há curva). Cada passo diz o
 * que fazer e conferimos sozinhos quando foi feito — a lista some quando
 * todos estão verdes. O último (partidas oficiais) é o que transforma
 * "totais entre coletas" em "cada partida, com placar".
 *
 * Entrar com a Steam conta como o passo zero, já feito: uma lista que
 * começa em "1 de 5" é uma lista que a pessoa já começou, e isso puxa mais
 * do que "0 de 4". O próximo passo pendente fica em destaque — quem chega
 * não precisa decidir por onde ir — e a barra mostra quanto falta.
 */
export async function PrimeirosPassos({
  statsVisiveis,
  botAmigo,
  coletas,
  partidasAtivas,
  partidasParadas = false,
}: {
  /** A Steam devolveu estatísticas de CS2 (perfil e detalhes do jogo públicos). */
  statsVisiveis: boolean;
  /** null quando a lista de amigos é privada e não dá para conferir. */
  botAmigo: boolean | null;
  coletas: number;
  /** A corrente de share codes está ligada (partidas oficiais, uma a uma). */
  partidasAtivas: boolean;
  /** Foi ligada, mas a Steam parou de aceitar o código. */
  partidasParadas?: boolean;
}) {
  const bot = await perfilDoBot();
  const passos: { feito: boolean; incerto?: boolean; ancora?: string; titulo: string; texto: string; acao: React.ReactNode }[] = [
    {
      feito: true,
      titulo: "Entre com a Steam",
      texto: "Feito. Sua conta está ligada ao seu perfil da Steam.",
      acao: null,
    },
    {
      feito: statsVisiveis,
      titulo: "Deixe os detalhes do jogo públicos na Steam",
      texto: statsVisiveis
        ? "A Steam mostra suas estatísticas de CS2 para nós."
        : "Na Steam: Perfil → Editar perfil → Privacidade → \"Detalhes do jogo\": Público. Volte aqui e clique em Sincronizar.",
      acao: statsVisiveis ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="https://steamcommunity.com/my/edit/settings"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-canvas transition hover:brightness-110"
          >
            Abrir privacidade da Steam <ExternalLink className="size-3.5" />
          </a>
          <SyncButton />
        </div>
      ),
    },
    {
      feito: botAmigo === true,
      incerto: botAmigo === null,
      ancora: "bot",
      titulo: `Adicione ${bot?.personaname ?? "o bot do FragIQ"} como amigo`,
      texto:
        botAmigo === true
          ? "Ele avisa o site quando você termina uma partida, com mapa, modo e placar."
          : botAmigo === null
            ? "Lista de amigos privada: não dá para conferir daqui. Ele só vê o que qualquer amigo vê."
            : "Ele avisa o site no fim de cada partida — com mapa, modo e placar — e manda a análise no chat. Só lê o que qualquer amigo vê.",
      acao:
        botAmigo === true ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`steam://friends/add/${BOT_STEAM_ID}`}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-canvas transition hover:brightness-110"
            >
              Adicionar como amigo
            </a>
            <a
              href={bot?.profileurl ?? `https://steamcommunity.com/profiles/${BOT_STEAM_ID}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-sm text-ink-muted ring-1 ring-line transition hover:text-ink hover:ring-accent/60"
            >
              Ver o perfil dele <ExternalLink className="size-3.5" />
            </a>
          </div>
        ),
    },
    {
      feito: coletas >= 2,
      titulo: "Jogue uma partida",
      texto:
        coletas >= 2
          ? "Sua evolução já está sendo desenhada: cada partida nova vira um ponto."
          : coletas === 1
            ? "Já temos seu ponto de partida. Jogue uma partida de CS2: com o bot como amigo, a comparação aparece aqui sozinha quando ela termina; sem ele, clique em Sincronizar."
            : "Assim que a Steam liberar suas estatísticas, guardamos o ponto de partida. A partida seguinte já mostra o que mudou.",
      acao: null,
    },
    {
      feito: partidasAtivas,
      titulo: partidasParadas ? "Religue as partidas oficiais" : "Ligue as partidas oficiais",
      texto: partidasAtivas
        ? "Cada partida de matchmaking chega com o placar dos dez jogadores."
        : partidasParadas
          ? "As partidas pararam de chegar: cole o código de autenticação de novo. As que ficaram no intervalo voltam junto."
          : "O código de histórico da Steam, colado uma vez: cada partida chega com K/D, HS, MVPs e placar.",
      acao: partidasAtivas ? null : (
        <Link
          href={partidasParadas ? "/configuracoes" : "/games/730/partidas"}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-canvas transition hover:brightness-110"
        >
          {partidasParadas ? "Colar o código novo" : "Ativar partidas"} <ArrowRight className="size-3.5" />
        </Link>
      ),
    },
  ];

  const pendentes = passos.filter((p) => !p.feito).length;
  const feitos = passos.length - pendentes;
  const proximo = passos.findIndex((p) => !p.feito);

  const progresso = (
    <div
      className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={passos.length}
      aria-valuenow={feitos}
      aria-label="Progresso dos primeiros passos"
    >
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(feitos / passos.length) * 100}%` }} />
    </div>
  );

  // Com as estatísticas entrando, o cartão inteiro vira uma linha: o que
  // falta (bot, partidas) é conveniência, não bloqueio, e a tela é da
  // sessão. O primeiro passo pendente mantém o cartão aberto — sem ele
  // nada funciona.
  const lista = (
    <ol className="mt-4 space-y-4">
        {passos.map((p, i) => (
          <li
            key={p.titulo}
            id={p.ancora}
            className={cn("flex gap-3 scroll-mt-24", i === proximo && "-mx-3 rounded-xl bg-accent/5 p-3 ring-1 ring-accent/30")}
          >
            <span
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ring-1",
                p.feito ? "bg-accent text-canvas ring-accent" : "text-ink-faint ring-line",
              )}
              aria-label={p.feito ? "feito" : "pendente"}
            >
              {p.feito ? <Check className="size-3.5" /> : p.incerto ? <HelpCircle className="size-3.5" /> : <Circle className="size-2 fill-current" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", p.feito && "text-ink-muted line-through decoration-line")}>
                {p.titulo}
                {i === proximo && <span className="hud ml-2 text-accent">próximo</span>}
              </p>
              <p className="mt-0.5 text-sm text-ink-muted">{p.texto}</p>
              {p.acao && <div className="mt-3">{p.acao}</div>}
            </div>
          </li>
        ))}
      </ol>
  );

  if (statsVisiveis && pendentes > 0) {
    return (
      <details className="group rounded-2xl bg-surface px-5 ring-1 ring-line" id="bot">
        <summary className="flex cursor-pointer list-none items-center gap-3 py-3">
          <h2 className="hud">Primeiros passos</h2>
          <span className="num text-xs text-ink-faint">
            {feitos} de {passos.length}
          </span>
          {progresso}
          <span className="ml-2 text-xs text-ink-faint transition group-open:rotate-180">▾</span>
        </summary>
        <div className="pb-5">{lista}</div>
      </details>
    );
  }

  return (
    <section className="rounded-2xl bg-surface p-5 ring-1 ring-line sm:p-6">
      <div className="flex items-center gap-3">
        <h2 className="hud">Primeiros passos</h2>
        <span className="num text-xs text-ink-faint">
          {feitos} de {passos.length}
        </span>
        {progresso}
      </div>
      {lista}
    </section>
  );
}

/**
 * O "5 de 5" que a lista nunca mostra: ela some quando fica toda verde.
 * Diz o que mudou agora que tudo está ligado, para o último passo não
 * terminar em silêncio.
 */
export function TudoPronto() {
  return (
    <section className="rounded-2xl bg-accent/5 p-5 ring-1 ring-accent/30 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-canvas">
          <Check className="size-3.5" />
        </span>
        <h2 className="hud text-accent">Primeiros passos concluídos</h2>
        <span className="num text-xs text-ink-faint">5 de 5</span>
      </div>
      <p className="mt-3 text-sm text-ink-muted">
        Agora tudo chega sozinho: cada sessão com modo e mapa, cada partida oficial com o placar dos dez. Não há mais nada para colar.
      </p>
      <Link href="/games/730/partidas" className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
        Ver as partidas <ArrowRight className="size-3.5" />
      </Link>
    </section>
  );
}
