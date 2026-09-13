import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { syncUser } from "@/lib/steam/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Coleta reativa: o bot de presença avisa que alguém terminou de jogar e
 * sincronizamos naquele momento, em vez de esperar o cron do dia seguinte.
 *
 * É o que transforma a série de "um ponto por dia" em "um ponto por sessão"
 * sem que o usuário precise clicar em nada.
 */

const schema = z.object({
  steamId: z.string().regex(/^7656119\d{10}$/),
  event: z.enum(["match_ended"]),
  /** Observado pelo bot no rich presence, quando disponível. */
  map: z.string().max(64).optional(),
  mode: z.string().max(64).optional(),
  score: z.string().max(32).optional(),
});

// Um bot com defeito reconectando em loop não pode virar rajada contra a
// Steam. O cooldown é menor que o do botão manual porque aqui o gatilho é
// um evento real de fim de partida.
const COOLDOWN_MS = 60_000;

const CS2_APPID = 730;

export async function POST(request: NextRequest) {
  const secret = process.env.BOT_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[steam-event] BOT_WEBHOOK_SECRET não configurado");
    return NextResponse.json({ error: "Indisponível." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { steamId: parsed.data.steamId },
    select: { id: true, steamId: true, lastSyncedAt: true },
  });

  // O bot é amigo de gente que talvez nunca tenha entrado no site.
  if (!user) {
    return NextResponse.json({ skipped: "usuário desconhecido" });
  }

  const contexto = { map: parsed.data.map, mode: parsed.data.mode, score: parsed.data.score };

  // Cooldown não pode custar o contexto. Se a pessoa clicou em Sincronizar
  // logo depois da partida, o ponto já existe — sem mapa nem modo, porque o
  // botão não sabe deles. Antes o webhook respondia "sincronizado há pouco"
  // e o contexto morria ali; medido em 12/09: competitivo na Mirage,
  // 12:16, perdido. Agora ele é anexado ao ponto recém-gravado, e só se não
  // houver ponto para receber é que o bot é mandado tentar de novo.
  if (user.lastSyncedAt && Date.now() - user.lastSyncedAt.getTime() < COOLDOWN_MS) {
    if (await anexarContexto(user.id, contexto)) {
      return NextResponse.json({ attached: "contexto gravado no ponto recém-coletado" });
    }
    return NextResponse.json({ pending: "sincronizado há pouco" }, { status: 202 });
  }

  try {
    const result = await syncUser(user.id, user.steamId, "EVENT", contexto);

    // A Steam publica as stats minutos depois do fim da partida, e o prazo
    // varia. Se o CS2 veio igual ao último ponto, ou a partida que o bot viu
    // ainda não chegou — e o 202 diz ao bot para tentar de novo — ou ela já
    // foi capturada por outra coleta sem contexto, e o contexto vai para lá.
    if (result.unchanged.includes(CS2_APPID)) {
      if (await anexarContexto(user.id, contexto)) {
        return NextResponse.json({ attached: "contexto gravado no ponto anterior", ...result });
      }
      return NextResponse.json(
        { pending: "stats ainda não publicadas pela Steam", ...result },
        { status: 202 },
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[steam-event] sync falhou", err);
    return NextResponse.json({ error: "Falha ao sincronizar." }, { status: 502 });
  }
}

/** Janela em que um ponto sem contexto ainda é "a partida que o bot viu". */
const JANELA_ANEXO_MS = 20 * 60_000;

/**
 * Dá mapa e modo ao último ponto de CS2 quando ele nasceu sem — e há pouco.
 *
 * Só o último, só se ainda não tiver contexto, e só se for recente: um
 * ponto do cron de ontem não é a partida de agora. Devolve false quando não
 * há a quem entregar, e aí o bot deve insistir.
 */
async function anexarContexto(
  userId: string,
  contexto: { map?: string; mode?: string; score?: string },
): Promise<boolean> {
  if (!contexto.map && !contexto.mode) return false;

  const userGame = await prisma.userGame.findUnique({
    where: { userId_gameAppId: { userId, gameAppId: CS2_APPID } },
    select: {
      snapshots: {
        orderBy: { capturedAt: "desc" },
        take: 1,
        select: { id: true, capturedAt: true, matchMode: true, matchMap: true },
      },
    },
  });
  const ultimo = userGame?.snapshots[0];
  if (!ultimo || ultimo.matchMode || ultimo.matchMap) return false;
  if (Date.now() - ultimo.capturedAt.getTime() > JANELA_ANEXO_MS) return false;

  await prisma.statSnapshot.update({
    where: { id: ultimo.id },
    data: {
      matchMap: contexto.map ?? null,
      matchMode: contexto.mode ?? null,
      matchScore: contexto.score ?? null,
    },
  });
  return true;
}
