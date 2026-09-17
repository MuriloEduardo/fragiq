import "dotenv/config";
import { lerSegredos } from "./segredos.js";

// Segredo tem precedência sobre ambiente: em produção o .env nem existe, e
// em dev quem define FRAGIQ_SECRET_ID quer testar o caminho real.
const segredos = await lerSegredos();

function ler(nome: string): string | null {
  return segredos[nome]?.trim() || process.env[nome]?.trim() || null;
}

function obrigatoria(nome: string): string {
  const v = ler(nome);
  if (!v) {
    console.error(`Variável de ambiente ausente: ${nome}`);
    process.exit(1);
  }
  return v;
}

export const config = {
  /** Conta dedicada do bot. Nunca use uma conta pessoal com inventário. */
  accountName: obrigatoria("STEAM_BOT_ACCOUNT"),

  /**
   * Depois do primeiro login o steam-user emite um refresh token. Guardá-lo
   * evita manter a senha em variável de ambiente e dispensa o Steam Guard
   * nas reconexões.
   */
  refreshToken: ler("STEAM_BOT_REFRESH_TOKEN"),
  password: ler("STEAM_BOT_PASSWORD"),

  /** Para onde avisamos que alguém terminou de jogar. */
  webhookUrl: obrigatoria("FRAGIQ_WEBHOOK_URL"),
  webhookSecret: obrigatoria("FRAGIQ_WEBHOOK_SECRET"),
  /**
   * De onde buscamos as mensagens a entregar no chat. Deriva do webhook por
   * padrão: é o mesmo site e o mesmo segredo.
   */
  outboxUrl:
    ler("FRAGIQ_OUTBOX_URL") ??
    obrigatoria("FRAGIQ_WEBHOOK_URL").replace(/\/api\/sync\/steam-event$/, "/api/bot/outbox"),
  /** A fila de share codes para perguntar ao Game Coordinator. */
  partidasUrl:
    ler("FRAGIQ_PARTIDAS_URL") ??
    obrigatoria("FRAGIQ_WEBHOOK_URL").replace(/\/api\/sync\/steam-event$/, "/api/bot/partidas"),
  /** O relógio das capturas pendentes: o site processa, nós só chamamos. */
  tickUrl:
    ler("FRAGIQ_TICK_URL") ??
    obrigatoria("FRAGIQ_WEBHOOK_URL").replace(/\/api\/sync\/steam-event$/, "/api/bot/tick"),
  tickMs: Number(process.env.BOT_TICK_MS ?? 30_000),
  /** Para onde vai o log do bot, em lotes (docs/dados-confiaveis.md §3.4). */
  logsUrl:
    ler("FRAGIQ_LOGS_URL") ??
    obrigatoria("FRAGIQ_WEBHOOK_URL").replace(/\/api\/sync\/steam-event$/, "/api/bot/logs"),
  /** Para onde vai a lista de amigos do bot. */
  amigosUrl:
    ler("FRAGIQ_AMIGOS_URL") ??
    obrigatoria("FRAGIQ_WEBHOOK_URL").replace(/\/api\/sync\/steam-event$/, "/api/bot/amigos"),
  /** Intervalo entre buscas na fila de mensagens. */
  outboxPollMs: Number(process.env.BOT_OUTBOX_POLL_MS ?? 20_000),

  /** Aceitar pedidos de amizade automaticamente. */
  autoAccept: process.env.BOT_AUTO_ACCEPT !== "false",
} as const;

export const CS2_APPID = 730;
