import SteamUser, { type LogOnDetails } from "steam-user";

/**
 * Supervisor da conexão com a Steam.
 *
 * O `autoRelogin` do steam-user só religa em quatro resultados (Fail,
 * NoConnection, ServiceUnavailable, TryAnotherCM), e religa por conta
 * própria, num backoff que não dá para observar. Todo o resto —
 * LoggedInElsewhere, LogonSessionReplaced, RateLimitExceeded, um token que
 * a Steam parou de aceitar — vira `error`, e um bot que sai no primeiro
 * `error` passa a depender do Docker para voltar, sem saber por quê. Foi
 * assim que ele ficou deslogado de 15/09 a 16/09: vivo, sem ticks e sem
 * ninguém para contar.
 *
 * Aqui a política é uma só: ficar logado — e é só esta, por isso o cliente
 * é criado com `autoRelogin: false`. Cada queda agenda uma nova
 * tentativa com espera crescente (30 s → 10 min; 30 min quando a Steam
 * pediu calma), um vigia confere a cada minuto que a sessão existe, e só
 * dois casos encerram o processo — credencial morta (ninguém além do humano
 * resolve) e uma hora sem conseguir voltar (o estado interno da biblioteca
 * pode estar preso; um processo novo é mais barato que adivinhar). Nos
 * dois o Docker recria o container, e o motivo fica no heartbeat do site.
 */

const E = {
  InvalidPassword: 5,
  LoggedInElsewhere: 6,
  AccessDenied: 15,
  Expired: 27,
  LogonSessionReplaced: 34,
  AccountLogonDenied: 63,
  RateLimitExceeded: 84,
  AccountLogonDeniedNeedTwoFactorCode: 85,
  CachedCredentialInvalid: 126,
} as const;

/** Resultados em que insistir é inútil: o token ou a conta precisam de gente. */
const CREDENCIAL_MORTA = new Set<number>([
  E.InvalidPassword,
  E.AccessDenied,
  E.Expired,
  E.AccountLogonDenied,
  E.AccountLogonDeniedNeedTwoFactorCode,
  E.CachedCredentialInvalid,
]);

const ESPERA_MIN_MS = 30_000;
const ESPERA_MAX_MS = 10 * 60_000;
const ESPERA_RATE_LIMIT_MS = 30 * 60_000;
const VIGIA_MS = 60_000;
/** Depois disso desconectado, desistimos do processo e deixamos o Docker recriar. */
const LIMITE_FORA_MS = 60 * 60_000;

export type EstadoConexao = {
  logado: boolean;
  desconectadoDesde: string | null;
  motivo: string | null;
  tentativas: number;
};

type Opcoes = {
  /** Como logar de novo — relido a cada tentativa, porque o refresh token pode ter sido renovado. */
  credenciais: () => Promise<LogOnDetails>;
  /** Um nome legível para o eresult, quando existir. */
  nomeDoResultado?: (eresult: number) => string;
};

export function supervisionarConexao(client: SteamUser, opcoes: Opcoes) {
  let tentativas = 0;
  let timer: NodeJS.Timeout | null = null;
  let desconectadoDesde: Date | null = null;
  let motivo: string | null = null;
  let encerrando = false;

  const nome = (eresult: number) => opcoes.nomeDoResultado?.(eresult) ?? String(eresult);

  function marcarQueda(razao: string) {
    desconectadoDesde ??= new Date();
    motivo = razao;
  }

  function agendar(esperaMinima = 0) {
    if (encerrando || timer) return;
    const espera = Math.max(esperaMinima, Math.min(ESPERA_MIN_MS * 2 ** tentativas, ESPERA_MAX_MS));
    tentativas += 1;
    console.log(`Religando em ${Math.round(espera / 1000)} s (tentativa ${tentativas}).`);
    timer = setTimeout(() => void religar(), espera);
  }

  async function religar() {
    timer = null;
    if (encerrando || client.steamID) return;
    if (desconectadoDesde && Date.now() - desconectadoDesde.getTime() > LIMITE_FORA_MS) {
      console.error(`Fora da Steam há mais de ${LIMITE_FORA_MS / 60_000} min (${motivo}); encerrando para o Docker recriar o processo.`);
      process.exit(1);
    }
    // `logOn` durante uma conexão em curso lança dentro de um nextTick
    // assíncrono — não é um erro que se pega com try/catch, é o processo
    // caindo. A biblioteca guarda o estado em `_connecting`; olhar é o único
    // jeito de não atropelar uma tentativa em andamento.
    if ((client as unknown as { _connecting?: boolean })._connecting) {
      console.log("A biblioteca ainda está tentando conectar; o vigia confere em 1 min.");
      agendar();
      return;
    }
    const credenciais = await opcoes.credenciais();
    console.log(`Logando de novo (${credenciais.refreshToken ? "refresh token" : "senha"}).`);
    client.logOn(credenciais);
  }

  client.on("loggedOn", () => {
    if (desconectadoDesde) console.log(`De volta à Steam depois de ${Math.round((Date.now() - desconectadoDesde.getTime()) / 1000)} s (${motivo}).`);
    tentativas = 0;
    desconectadoDesde = null;
    motivo = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  });

  // Com `autoRelogin: false` toda queda chega como `error`; `disconnected`
  // só aparece num logOff pedido por nós. Fica registrado por completude.
  client.on("disconnected", (eresult, msg) => {
    marcarQueda(`desconectado: ${nome(eresult)}${msg ? ` (${msg})` : ""}`);
    console.warn(motivo);
    agendar();
  });

  client.on("error", (err) => {
    const eresult = (err as Error & { eresult?: number }).eresult ?? 0;
    marcarQueda(`erro: ${nome(eresult)} (${err.message})`);
    console.error(motivo);
    if (CREDENCIAL_MORTA.has(eresult)) {
      console.error(
        "A Steam não aceita mais esta credencial. Rode o bot uma vez localmente com STEAM_BOT_PASSWORD para " +
          "gerar um refresh token novo e grave-o no segredo. Encerrando em 5 min para não martelar a Steam.",
      );
      encerrando = true;
      setTimeout(() => process.exit(1), 5 * 60_000).unref();
      return;
    }
    agendar(eresult === E.RateLimitExceeded ? ESPERA_RATE_LIMIT_MS : 0);
  });

  // O vigia: a única garantia de que ninguém fica deslogado em silêncio.
  const vigia = setInterval(() => {
    if (encerrando || client.steamID || timer) return;
    marcarQueda(motivo ?? "sem sessão e sem queda registrada");
    agendar();
  }, VIGIA_MS);

  return {
    estado(): EstadoConexao {
      return {
        logado: Boolean(client.steamID),
        desconectadoDesde: desconectadoDesde?.toISOString() ?? null,
        motivo,
        tentativas,
      };
    },
    encerrar() {
      encerrando = true;
      clearInterval(vigia);
      if (timer) clearTimeout(timer);
    },
  };
}
