# FragIQ

Plataforma de acompanhamento temporal de estatísticas de jogos, com login via
Steam. A ideia central: a Steam só guarda o **total de hoje**; o FragIQ guarda a
**série inteira** e deixa o jogador montar as próprias consultas em cima dela.

## Rodando

```bash
docker compose up -d          # Postgres em localhost:5433
cp .env.example .env          # preencha STEAM_API_KEY e AUTH_SECRET
npm run db:migrate
npm run dev
```

Para avaliar a interface sem chave da Steam:

```bash
npm run seed                  # 90 dias de histórico fictício de CS2
```

e acesse `/api/auth/dev-login` (só existe fora de produção).

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
abriu o site, e uma plataforma de evolução com buracos não serve.

### O gate que torna o polling barato

A chave da Steam Web API permite ~100k chamadas/dia. Uma varredura ingênua
(1 chamada por jogo por usuário) estoura isso com poucas centenas de usuários.

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
ADR, KAST, HLTV rating, clutches, entry duels, dados por round, por arma e por
posição. Nada disso existe na Web API — vem de **parsing de demos**. Veja
`docs/dados-profundos.md`.

## Estrutura

```
prisma/schema.prisma          modelo de dados
scripts/seed.ts               histórico fictício para desenvolvimento
src/lib/
  env.ts                      validação de ambiente
  session.ts                  sessão JWT em cookie
  series.ts                   motor de consulta do explorador
  stats.ts                    formatação e métricas derivadas de CS2
  steam/openid.ts             OpenID 2.0
  steam/api.ts                cliente da Web API
  steam/sync.ts               ingestão com gate de playtime
src/app/
  page.tsx                    landing + login
  dashboard/                  biblioteca
  games/[appId]/              explorador
  api/auth/steam/             login OpenID
  api/sync/                   coleta manual
  api/cron/sync/              coleta agendada
```
