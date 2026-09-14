# FragIQ

Plataforma de acompanhamento temporal de estatísticas de jogos, com login via
Steam. A ideia central: a Steam só guarda o **total de hoje**; o FragIQ guarda a
**série inteira** e deixa o jogador montar as próprias consultas em cima dela.

## Rodando

```bash
docker compose up -d          # Postgres em localhost:5433
cp .env.example .env          # preencha AUTH_SECRET e as variáveis COGNIFLOW_*
npm run db:migrate
npm run dev
```

Para avaliar a interface sem o cogniflow (e portanto sem Steam):

```bash
npm run seed                  # 90 dias de histórico fictício de CS2
```

e acesse `/api/auth/dev-login` (só existe fora de produção; aceita
`?steamId=` para escolher a conta).

Para diagnosticar uma conta real sem gravar nada:

```bash
npm run probe -- 76561198000000000
```

No VS Code, `.vscode/launch.json` traz o compound **FragIQ: full stack**, que
sobe o servidor e o Chrome juntos — no App Router os dois lados são o mesmo
processo Next, então breakpoints em Server Components e no explorador
funcionam na mesma sessão.

## Como os dados entram

**A Steam não tem webhooks para dados de jogador.** Os únicos webhooks do
Steamworks são de comércio, para publishers. A Web API é 100% *pull*, então a
única questão é *quando* puxar. Existem três gatilhos:

| Gatilho | Onde | Quando |
|---|---|---|
| `LOGIN` | `api/auth/steam/callback` | no login, se os dados estiverem > 6 h velhos |
| `MANUAL` | `POST /api/sync` | botão "Sincronizar", com cooldown de 2 min |
| `CRON` | `GET /api/cron/sync` | diário às 05:00 UTC (`vercel.json`) |

O cron é o que importa: sem ele a série só tem pontos nos dias em que a pessoa
abriu o site, e uma plataforma de evolução com buracos não serve. Em produção
a coleta é automática — o botão é conveniência, não requisito.

O cron para por **orçamento de tempo**, não por contagem de usuários: um sync
varia de 1s a 40s conforme a biblioteca, então 50 usuários podem estourar o
limite da função e perder o lote inteiro. Quem não coube volta primeiro na
execução seguinte (a ordenação é por `lastSyncedAt` ascendente), então a fila
gira sem estado extra. O campo `skipped` na resposta é o sinal de que a fila
não está sendo vazada no ritmo do agendamento.

Limites da Vercel a considerar: no **Hobby** o cron roda no máximo 1×/dia e a
função morre em 60s (daí o `CRON_TIME_BUDGET_MS` padrão de 45s, que dá ~25
usuários por dia — suficiente para validar, não para escalar). No **Pro** a
cadência é por minuto e a função vai a 300s.

### Quem fala com a Steam é o cogniflow

O FragIQ não tem chave da Steam. `src/lib/steam/api.ts` mantém as funções
de sempre (`getOwnedGames`, `getUserStatsForGame`…), mas cada uma é uma
chamada `POST /capabilities/steam.*` na API de capabilities do cogniflow,
assinada com o mesmo segredo da conexão webhook (`src/lib/cogniflow-api.ts`).
A chave, a cota e as semânticas da Web API (400 em stats é "não há stats",
401 em amigos é "lista privada") moram lá; a regra de *quando* e *o que*
pedir mora aqui. As mesmas capabilities são as tools que o analista tem no
turno — o cron e o agente leem a Steam pelo mesmo caminho.

### O gate que torna o polling barato

A chave da Steam Web API permite ~100k chamadas/dia — e é uma só, da
plataforma, dividida entre todos os tenants do cogniflow. Uma varredura
ingênua (1 chamada por jogo por usuário) estoura isso com poucas centenas de
usuários.

`GetOwnedGames` devolve o `playtime_forever` de **toda** a biblioteca em uma
única chamada. Se o playtime de um jogo não mudou desde a última coleta, o
jogador não jogou, e buscar as stats dele produziria um ponto idêntico ao
anterior. `src/lib/steam/sync.ts` compara antes de gastar chamadas:

- usuário que não jogou nada: **2 chamadas** (perfil + biblioteca)
- usuário que jogou: 2 + 1 por jogo tocado, com teto de 40

Na prática isso sustenta dezenas de milhares de usuários numa chave só.

## O balde de estatísticas

`StatSnapshot.metrics` é um JSONB com os contadores crus no instante da coleta:

```json
{ "total_kills": 41234, "total_deaths": 39001, "total_shots_fired": 802431 }
```

Nada é pré-agregado. Métricas novas não exigem migração nem recoleta — o jogo
passa a expor um contador e ele aparece sozinho no explorador. É também o que
torna o sistema agnóstico de jogo: qualquer appid da Steam que exponha stats
funciona sem uma linha de código nova.

### O que o CS2 realmente expõe

Medido com `npm run probe`: **197 contadores**, dos quais 178 vão para o
explorador.

| Grupo | Qtd | Exemplos |
|---|---|---|
| Geral | 36 | `total_kills`, `total_damage_done`, `total_mvps` |
| Por arma | 94 | `total_kills_ak47`, `total_hits_awp`, `total_shots_deagle` |
| Por mapa | 30 | `total_wins_map_de_mirage`, `total_rounds_map_de_nuke` |
| Última partida | 18 | `last_match_kills`, `last_match_damage` |
| Ocultos | 19 | `GI.lesson.*` — flags de tutorial, ruído |

Isso é bem mais do que "K/D ao longo do tempo": dá precisão **por arma** e
taxa de vitória **por mapa** em série temporal, que nem csstats nem csrep
grafica hoje.

Duas ressalvas medidas experimentalmente, não documentadas pela Valve: os
contadores globais e por arma **somam todos os modos** (casual entra junto com
competitivo), e os contadores por mapa estão **congelados em mapas legados** —
Mirage, Ancient, Anubis e Overpass não são rastreados. Detalhes em
[docs/dados-profundos.md](docs/dados-profundos.md).

### Nem todo contador é cumulativo

Tratar todos como cumulativos gera gráficos silenciosamente errados, então
`classifyMetric()` separa três naturezas:

- **`counter`** — só sobe (`total_kills`). O delta entre coletas é o período.
- **`gauge`** — reseta a cada partida (`last_match_*`). O valor **já é** do
  período; tirar delta dele compararia duas partidas diferentes. Estes só
  aceitam os modos "valor da coleta" e "razão", e a UI reconcilia o modo
  sozinha quando você troca a métrica.
- **`hidden`** — `GI.lesson.*`, fora do catálogo.

Os `last_match_*` são valiosos: dão a granularidade mais próxima de "por
partida" sem precisar parsear demo.

### Uma armadilha da Valve

`total_shots_hit` está quebrado há anos — no perfil de teste devolve 8.635
contra 940.530 de `total_shots_fired`, uma precisão impossível de 0,9%. Os
pares por arma (`total_hits_ak47` / `total_shots_ak47`) são confiáveis, e é
por isso que o preset "Precisão por arma" existe.

## Modos: Premier, Competitivo, Casual

A Steam soma todos os modos num contador só, e um K/D de Premier misturado
com casual não diz nada. Por isso o modo é **navegação**, não filtro: sob
as abas do jogo há um submenu (Tudo · Premier · Competitivo · Casual ·
Wingman) que vale para todas elas — Resumo, Estatísticas, Sessões,
Partidas, Métricas e Análises mostram só aquele modo até a pessoa trocar.
A escolha vai na URL (`?modo=premier`, compartilhável) e num cookie de 90
dias (`src/lib/modo.ts`, `src/lib/modo-servidor.ts`, `components/modo-nav.tsx`).

De onde vem o modo de cada coisa:

- **sessão**: o rich presence que o bot observou no fim da partida
  (`StatSnapshot.matchMode`), ou o que a pessoa marcou à mão no hero;
- **partida oficial**: `Match.modo`, resolvido na gravação — pelo
  `gameType` do GC quando o valor é conhecido (8 = competitivo, 264 =
  Wingman; o Premier ainda depende da presença), senão pelo snapshot de
  presença de algum dos dez jogadores na janela da partida;
- **análise**: o modo da sessão analisada; o analista recebe o modo na
  mensagem e passa `modo=` em toda consulta.

Com modo, o "normal" contra o qual um período é lido deixa de ser o
vitalício da Steam e vira o acumulado das sessões daquele modo
(`lifetimeValue` em `series.ts`, `vitaliciosDoHero`, as leituras). Só o
submenu aparece para quem tem ao menos uma sessão marcada — e quem não tem
recebe o aviso abaixo.

### Avisos do que falta compartilhar

Três portas e um dado atrás de cada: "Detalhes do jogo" privado (nenhuma
estatística), bot não é amigo (sessões sem modo nem mapa) e corrente de
share codes desligada (nenhuma partida oficial). `src/lib/pendencias.ts`
calcula; `components/pendencias-banner.tsx` mostra em toda aba do jogo
(no Resumo o onboarding já conta a história), dispensável por uma semana.
No chat da Steam, para quem o bot alcança, uma mensagem por porta, uma vez
só: a de privacidade quando uma captura desiste, a das partidas depois da
terceira sessão sem corrente (`User.avisoPrivacidadeEm`, `avisoPartidasEm`).

## O explorador

`src/lib/series.ts` deriva tudo em tempo de consulta. Como os contadores são
cumulativos e vitalícios, a média de sempre não mostra evolução — depois de
mil horas, um mês excelente não move o número. Os modos derivados resolvem:

| Modo | O que responde |
|---|---|
| `cumulative` | valor cru do contador |
| `delta` | "quantas kills naquele dia" |
| `perHour` | delta ÷ horas jogadas, para comparar dias desiguais |
| `ratio` | A ÷ B no período: K/D, HS%, precisão |

Buckets: dia, semana, mês ou cada coleta. Um bucket guarda o **último**
snapshot do período — como os contadores são cumulativos, somar os snapshots
do dia contaria duplicado.

O cálculo roda no cliente: o page envia o balde uma vez e cada ajuste de query
re-renderiza sem round-trip.

## Autenticação

Steam fala **OpenID 2.0**, não OAuth2/OIDC — por isso o Auth.js não encaixa bem
aqui (ele é construído para OAuth). São dois passos, implementados direto em
`src/lib/steam/openid.ts`:

1. redirect para `steamcommunity.com/openid/login` com um nonce anti-CSRF
2. na volta, reenvio dos parâmetros com `mode=check_authentication`; só depois
   de `is_valid:true` o `claimed_id` (o SteamID64) é confiável

A sessão é um JWT HS256 em cookie `httpOnly` (`src/lib/session.ts`). Não há
token de acesso da Steam para renovar, então não há o que um framework de auth
administraria. Trocar por Auth.js depois significa reimplementar `getSession()`
— o resto do código não toca em sessão diretamente.

O SteamID64 é a chave; `personaName` e avatar são só cache de exibição.

## Limites desta camada de dados

O que a Steam Web API entrega são **contadores vitalícios agregados**. Isso dá
kills, mortes, headshots, precisão, dano, rounds, vitórias — tudo ao longo do
tempo, com granularidade diária.

O que ela **não** entrega, e que csstats.gg / csrep.gg / Leetify mostram:
ADR, KAST, HLTV rating, clutches, entry duels e dados por round. Nada disso
existe na Web API.

O primeiro passo já está dado: **partidas oficiais, uma a uma**. Com o código
de autenticação de histórico (que só a pessoa gera, numa página da Steam) e
um share code, a Web API entrega a corrente de share codes; o bot pergunta ao
Game Coordinator por cada um e recebe o scoreboard dos dez jogadores sem
baixar demo (`src/lib/partidas.ts`, `bot/src/partidas.ts`). É o que a aba
Partidas mostra. ADR, KAST e rating continuam pedindo a demo.

Existem cinco caminhos para chegar lá, com credenciais e custos diferentes:

- [docs/dados-profundos.md](docs/dados-profundos.md) — o que cada caminho
  entrega, como funciona e quais limites ele impõe
- [docs/roadmap-dados.md](docs/roadmap-dados.md) — qual atacar primeiro, e
  qual medição decide isso

## O analista

A análise de cada sessão, na página do jogo, vem de um agente que lê a mesma
série e responde em texto — disparado por nós a cada sessão fechada (sync,
cron, bot, scoreboard do GC), nunca por uma pergunta digitada. A resposta
tem forma fixa (manchete, dois ou três parágrafos, uma linha "→" com a
ação), que `src/lib/analise-texto.ts` separa e o cartão de
`components/analista.tsx` mostra com a sessão em cima: modo, mapa, placar
e os três números contra o normal do modo. Ele não roda aqui: o FragIQ é um tenant do **cogniflow**,
conectado pelo canal webhook — a pergunta sai assinada, a resposta volta por
callback, e durante o turno o agente consulta `/api/cogniflow/data`, que
expõe as mesmas derivações de `series.ts` como views. Provisionamento,
contrato das views e prompt do agente em
[docs/cogniflow-tenant.md](docs/cogniflow-tenant.md).

## Segredos

Em produção `AUTH_SECRET`, `COGNIFLOW_SIGNING_SECRET` e
`BOT_WEBHOOK_SECRET` não são variáveis da Vercel: vêm do segredo
`cogniflow/tenants/fragiq` no Secrets Manager, lido por OIDC no boot
(`src/instrumentation.ts` → `src/lib/segredos.ts`). O que precisa ficar na
Vercel, e o passo a passo da AWS, estão em [docs/segredos.md](docs/segredos.md).

## Limpeza pendente (depois da fase 2 do cogniflow)

Quando o canal `steam:chat` e o `steam-worker` existirem no cogniflow
(`cogniflow/orchestration-service/docs/STEAM.md`), isto deixa de ter razão
de existir aqui e pode ser apagado:

- `bot/` inteiro (presença, chat, GC) e o EC2 `fragiq-bot`;
- `src/app/api/bot/*` (amigos, outbox, partidas, tick) e `src/lib/bot.ts`;
- `SteamMessage` e a outbox em `src/lib/mensagem-steam.ts` — as mensagens
  proativas viram `messaging.send` pela API de capabilities;
- `src/app/api/sync/steam-event` — vira um handler do evento
  `steam.match.ended` no callback já assinado do cogniflow;
- `BOT_WEBHOOK_SECRET`, `BOT_STEAM_ID`, `BotStatus`;
- `bot/src/partidas.ts` — o scoreboard passa a chegar por
  `steam.match.read`.

Fica: `PendingCapture` e as retentativas (é conhecimento sobre quando a
Steam publica, não sobre como falar com ela), o gate de playtime, o
snapshot, as sessões, a corrente de share codes (a chamada já passa pelo
cogniflow).

## Estrutura

```
prisma/schema.prisma          modelo de dados
scripts/seed.ts               histórico fictício para desenvolvimento
src/lib/
  env.ts                      validação de ambiente
  session.ts                  sessão JWT em cookie
  series.ts                   motor de consulta do explorador
  stats.ts                    formatação e métricas derivadas de CS2
  analista.ts                 views que o analista consulta (data.read)
  cogniflow.ts                assinatura e envio de pedidos de análise ao cogniflow
  cogniflow-api.ts            chamada assinada de uma capability (fora do turno)
  modo.ts / modo-servidor.ts  o modo como navegação: abas, URL, cookie
  pendencias.ts               o que falta compartilhar, e o aviso no chat
  analise-texto.ts            manchete / parágrafos / ação da resposta do analista
  segredos.ts                 segredos do Secrets Manager via OIDC (instrumentation.ts)
  steam/openid.ts             OpenID 2.0
  steam/api.ts                a Steam como capabilities steam.* do cogniflow
  steam/sync.ts               ingestão com gate de playtime
src/app/
  page.tsx                    landing + login
  dashboard/                  biblioteca
  games/[appId]/              explorador
  api/auth/steam/             login OpenID
  api/sync/                   coleta manual
  api/cron/sync/              coleta agendada
  admin/                      painel de operação (ADMIN_STEAM_IDS)
  comunidade/                 quem participa, selo, feedback público
  p/[steamId]/                perfil público (só o que a Steam já mostra)
  p/[steamId]/vs/[outro]/     dois perfis lado a lado
  amigos/                     amigos da Steam no FragIQ, pedidos, quem segue quem
  seguranca/                  o que lemos, guardamos e nunca tocamos; exportar e apagar
  api/analises/               análises de sessão (listar; pedir a que falta)
  api/cogniflow/              callback e dados, assinados pelo cogniflow
```
