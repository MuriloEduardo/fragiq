/**
 * Os textos que o bot manda no chat da Steam — puros, sem banco, para o
 * teste ler. A cadência (quando, quantas vezes, para quem) mora em
 * `pendencias.ts`. Cada texto cabe numa mensagem, leva ao lugar certo e
 * o último de cada série avisa que é o último.
 */

/** A página da Steam que gera o código de autenticação e mostra o último share code (a mesma de `ativar-partidas.tsx`). */
export const CODIGOS_STEAM = "https://help.steampowered.com/pt-br/wizard/HelpWithGameIssue/?appid=730&issueid=128";

export const LEMBRETES_PARTIDAS = (site: string): string[] => [
  [
    "FragIQ · Suas sessões já estão entrando, mas as partidas oficiais (placar, scoreboard dos dez, Premier separado do Competitivo, ADR e KAST da demo) ainda não — falta o código de histórico de partidas da Steam.",
    "É seguro: o código só lê o histórico de partidas, não abre inventário, chat, amigos nem senha, e é revogável a qualquer momento. Leetify, csstats e Scope pedem exatamente o mesmo código.",
    `1) Gere o código e copie o share code da última partida aqui: ${CODIGOS_STEAM}`,
    `2) Cole os dois aqui: ${site}/games/730/partidas · para não receber mais: ${site}/seguranca`,
  ].join("\n"),
  [
    "FragIQ · Lembrete: sem o código de histórico da Steam, cada partida sua entra aqui só como um total entre coletas — sem mapa, sem placar, sem os outros nove.",
    "Leva um minuto, é o mesmo código que Leetify e csstats usam, e a Steam gera outro se você quiser revogar.",
    `Código na Steam: ${CODIGOS_STEAM} · colar em: ${site}/games/730/partidas`,
  ].join("\n"),
  [
    "FragIQ · Último lembrete sobre isto, prometo. Suas partidas oficiais continuam de fora porque o código de histórico não foi ativado.",
    `Se quiser ligar: código em ${CODIGOS_STEAM}, colar em ${site}/games/730/partidas. Se não, tudo bem — o resto continua funcionando, e não volto a falar disso.`,
  ].join("\n"),
];

export const LEMBRETES_PRIVACIDADE = (site: string): string[] => [
  [
    "FragIQ · Vi que você jogou CS2, mas a Steam não deixa o site ler as suas estatísticas: os \"Detalhes do jogo\" do seu perfil estão privados.",
    "É um clique: https://steamcommunity.com/my/edit/settings → Detalhes do jogo → Público. É o que toda plataforma de estatísticas pede, e não expõe nada além do que o próprio jogo já mostra no seu perfil.",
    `Passo a passo: ${site}/cs2 · para não receber mais: ${site}/seguranca`,
  ].join("\n"),
  [
    "FragIQ · Lembrete: enquanto os \"Detalhes do jogo\" estiverem privados na Steam, nenhuma partida sua entra — nem K/D, nem dano, nem headshot.",
    "Privacidade → Detalhes do jogo → Público: https://steamcommunity.com/my/edit/settings. Depois é só clicar em Sincronizar.",
  ].join("\n"),
  [
    "FragIQ · Último lembrete sobre isto. Sem os \"Detalhes do jogo\" públicos o FragIQ não tem o que mostrar para você.",
    `Quando quiser: https://steamcommunity.com/my/edit/settings. Para não receber mais: ${site}/seguranca`,
  ].join("\n"),
];

/**
 * Para quem adicionou o bot e nunca entrou: a página pública já existe
 * com o SteamID da pessoa — é o link que faz sentido mandar, porque
 * mostra o que o CS2 já conta sobre ela antes de pedir qualquer coisa.
 */
export const CONVITES = (site: string, steamId: string): string[] => [
  [
    "FragIQ · Oi! Você me adicionou, então já consigo ver o mapa e o modo de cada partida que você termina. O que falta é a sua conta no site, para isso virar a sua curva: K/D, dano e headshot por sessão, contra o seu normal.",
    `A sua página já existe: ${site}/p/${steamId}`,
    `Entrar é um clique com a Steam (nunca vemos senha): ${site}/api/auth/steam`,
  ].join("\n"),
  [
    "FragIQ · Lembrete: as partidas que você termina estão sendo vistas, mas sem conta nada vira série. Entrar com a Steam leva dez segundos, e o site só lê o que o seu perfil já mostra.",
    `${site}/p/${steamId} · entrar: ${site}/api/auth/steam`,
    `Depois, para ter cada partida com placar, ADR e KAST: gere o código de histórico em ${CODIGOS_STEAM} e cole em ${site}/games/730/partidas.`,
  ].join("\n"),
  [
    "FragIQ · Último convite, prometo. Se quiser a sua curva de CS2 e cada partida oficial com placar, é entrar com a Steam:",
    `${site}/api/auth/steam · a sua página: ${site}/p/${steamId}`,
    "Se não, sem problema — não volto a falar disso. Remover o bot dos amigos também encerra tudo.",
  ].join("\n"),
];
