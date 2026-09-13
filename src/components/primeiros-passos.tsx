import { Check, Circle, ExternalLink, HelpCircle } from "lucide-react";
import { BOT_STEAM_ID, perfilDoBot } from "@/lib/bot";
import { SyncButton } from "./sync-button";
import { cn } from "@/lib/utils";

/**
 * Os três passos entre entrar e ter uma curva — com o estado de cada um.
 *
 * Quem acabou de logar vê uma tela quase vazia e não sabe se o site quebrou
 * ou se falta algo dele. Falta algo dele, quase sempre: "Detalhes do jogo"
 * privado na Steam (a API não lê nada), o bot ainda não é amigo (mapa e
 * modo não chegam) e só existe uma coleta (não há curva). Cada passo diz o
 * que fazer e conferimos sozinhos quando foi feito — a lista some quando
 * os três estão verdes.
 */
export async function PrimeirosPassos({
  statsVisiveis,
  botAmigo,
  coletas,
}: {
  /** A Steam devolveu estatísticas de CS2 (perfil e detalhes do jogo públicos). */
  statsVisiveis: boolean;
  /** null quando a lista de amigos é privada e não dá para conferir. */
  botAmigo: boolean | null;
  coletas: number;
}) {
  const bot = await perfilDoBot();
  const passos = [
    {
      feito: statsVisiveis,
      titulo: "Deixe os detalhes do jogo públicos na Steam",
      texto: statsVisiveis
        ? "A Steam mostra suas estatísticas de CS2 para nós."
        : "É o que permite ler suas estatísticas. Na Steam: Perfil → Editar perfil → Privacidade → \"Detalhes do jogo\" como Público. Depois clique em Sincronizar.",
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
      titulo: `Adicione ${bot?.personaname ?? "o bot do FragIQ"} como amigo`,
      texto:
        botAmigo === true
          ? "Ele avisa o site quando você termina uma partida, com mapa, modo e placar."
          : botAmigo === null
            ? "Sua lista de amigos é privada, então não dá para conferir daqui. Ele só lê o que qualquer amigo vê: que você está no CS2 e em que mapa."
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
          ? "A curva existe: cada nova partida vira um ponto."
          : coletas === 1
            ? "A primeira coleta já está gravada. A curva nasce na segunda — o bot registra sozinho quando você fecha o jogo, ou clique em Sincronizar depois de jogar. Todo dia às 02:00 coletamos de qualquer jeito."
            : "Depois do passo 1, a primeira coleta entra na hora e a curva começa na partida seguinte.",
      acao: null,
    },
  ];

  const pendentes = passos.filter((p) => !p.feito).length;

  return (
    <section className="rounded-2xl bg-surface p-5 ring-1 ring-line sm:p-6">
      <div className="flex items-baseline gap-3">
        <h2 className="hud">Primeiros passos</h2>
        <span className="num text-xs text-ink-faint">{3 - pendentes} de 3</span>
      </div>
      <ol className="mt-4 space-y-4">
        {passos.map((p, i) => (
          <li key={p.titulo} className="flex gap-3">
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
                {i + 1}. {p.titulo}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{p.texto}</p>
              {p.acao && <div className="mt-3">{p.acao}</div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
