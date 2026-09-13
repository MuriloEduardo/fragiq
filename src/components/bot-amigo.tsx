import Image from "next/image";
import { Check, ExternalLink } from "lucide-react";
import { BOT_STEAM_ID, perfilDoBot } from "@/lib/bot";

/**
 * "Adicione o bot" — com a cara dele.
 *
 * A foto e o nome são os da conta na Steam, agora, e o link vai para o
 * perfil dela: a pessoa confere que está adicionando exatamente o que o
 * site diz, e lê o que ele vê e o que não vê antes de aceitar.
 */
export async function BotAmigo({ amigo, compacto }: { amigo: boolean | null; compacto?: boolean }) {
  const bot = await perfilDoBot();
  const nome = bot?.personaname ?? "FragIQ bot";
  const perfil = bot?.profileurl ?? `https://steamcommunity.com/profiles/${BOT_STEAM_ID}`;

  return (
    <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-4">
        {bot?.avatarfull ? (
          <Image src={bot.avatarfull} alt="" width={56} height={56} className="size-14 rounded-xl ring-1 ring-line" unoptimized />
        ) : (
          <span className="size-14 rounded-xl bg-surface-2" />
        )}
        <div className="min-w-0 flex-1">
          <p className="hud">Bot de presença</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
            {nome}
            {amigo && (
              <span className="hud inline-flex items-center gap-1 rounded-full border border-accent/50 px-2 py-0.5 text-[10px] text-accent">
                <Check className="size-3" /> amigo
              </span>
            )}
          </p>
          <p className="num text-xs text-ink-faint">{BOT_STEAM_ID}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!amigo && (
            <a
              href={`steam://friends/add/${BOT_STEAM_ID}`}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-canvas transition hover:brightness-110"
            >
              Adicionar como amigo
            </a>
          )}
          <a
            href={perfil}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-sm text-ink-muted ring-1 ring-line transition hover:text-ink hover:ring-accent/60"
          >
            Perfil na Steam <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      {!compacto && (
        <div className="mt-5 grid gap-4 text-sm leading-relaxed text-ink-muted sm:grid-cols-2">
          <div>
            <p className="hud mb-1">O que ele vê</p>
            O que qualquer amigo seu vê: que você está no CS2, e o rich presence que o jogo
            publica — mapa, modo e placar. É só isso que ele lê, e é o que dá mapa e modo a
            cada sessão sua no FragIQ, minutos depois de a partida acabar.
          </div>
          <div>
            <p className="hud mb-1">O que ele faz, e o que não</p>
            Manda uma mensagem por partida — três linhas, minutos depois de ela terminar —
            e nada mais: não convida, não entra em partida, não acessa inventário, trocas nem
            qualquer coisa da sua conta. A mensagem se desliga em Segurança e dados; o bot se
            remove da lista de amigos quando quiser, e o site segue com a coleta diária.
          </div>
        </div>
      )}
      {amigo === null && (
        <p className="mt-4 text-xs text-ink-faint">
          Sua lista de amigos está privada na Steam, então não dá para conferir daqui se ele já está nela.
        </p>
      )}
    </section>
  );
}
