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
  /** Intervalo entre buscas na fila de mensagens. */
  outboxPollMs: Number(process.env.BOT_OUTBOX_POLL_MS ?? 20_000),

  /**
   * A Steam demora a gravar as estatísticas depois que o jogo fecha. Avisar
   * no instante em que a pessoa sai da partida traria os números velhos.
   */
  graceMs: Number(process.env.BOT_GRACE_MS ?? 90_000),

  /** Aceitar pedidos de amizade automaticamente. */
  autoAccept: process.env.BOT_AUTO_ACCEPT !== "false",
} as const;

export const CS2_APPID = 730;
