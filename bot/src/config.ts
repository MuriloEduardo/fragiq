import "dotenv/config";

function obrigatoria(nome: string): string {
  const v = process.env[nome]?.trim();
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
  refreshToken: process.env.STEAM_BOT_REFRESH_TOKEN?.trim() || null,
  password: process.env.STEAM_BOT_PASSWORD?.trim() || null,

  /** Para onde avisamos que alguém terminou de jogar. */
  webhookUrl: obrigatoria("FRAGIQ_WEBHOOK_URL"),
  webhookSecret: obrigatoria("FRAGIQ_WEBHOOK_SECRET"),

  /**
   * A Steam demora a gravar as estatísticas depois que o jogo fecha. Avisar
   * no instante em que a pessoa sai da partida traria os números velhos.
   */
  graceMs: Number(process.env.BOT_GRACE_MS ?? 90_000),

  /** Aceitar pedidos de amizade automaticamente. */
  autoAccept: process.env.BOT_AUTO_ACCEPT !== "false",
} as const;

export const CS2_APPID = 730;
