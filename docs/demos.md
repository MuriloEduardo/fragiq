# Demos: o que a partida sabe e como isso vira leitura tática

O caminho 4 de [dados-profundos.md](./dados-profundos.md) posto em pé:
o bot baixa a demo de cada partida oficial, reduz a eventos, o site guarda
os eventos e calcula métricas por jogador. Este documento registra o que
foi **medido** (numa demo real, 18/09/2026), o desenho que essas medidas
justificam, a definição de cada métrica e a linguagem tática que as
métricas ainda não cobrem — para o próximo ciclo saber onde continuar.

## 1. O que o Game Coordinator entrega, além do placar

A resposta a `requestGame(shareCode)` é um `CDataGCCStrike15_v2_MatchInfo`
(protobuf em `bot/node_modules/globaloffensive/protobufs/cstrike15_gcmessages.proto`).
Até 18/09 o bot lia só o último `roundstats` e descartava o resto. O que
existe na mensagem:

| Campo | O que é | Uso |
|---|---|---|
| `roundstatsall[]` | um `roundstats` **por round**, com `kills/assists/deaths/scores/mvps` acumulados dos dez, `team_scores`, `round_result`, `match_duration` | linha do tempo do placar sem demo; a diferença entre dois rounds é o round |
| `pings[]` | ping de cada jogador | única fonte disso — a demo não tem. Virou `MatchPlayer.ping` |
| `enemy_2ks/3ks/4ks/5ks[]` | multi-kills por jogador | a demo dá o mesmo com mais contexto |
| `enemy_headshots[]` | HS em inimigos | já era o `hs` |
| `reservation.rankings[]` | `rank_id`, `wins`, `rank_change`, `rank_type_id` por conta | rank na hora da partida. **Não verificado** se vem preenchido no matchlist por share code |
| `reservation.party_ids[]` | quem entrou junto | pré-made vs solo — não verificado |
| `reservation.game_type` | bitmask modo + mapa | já decodificado (`src/lib/game-type.ts`) |
| `map` (no roundstats) | a **URL da demo** (`replayN.valve.net/730/<matchid>_<reservationid>.dem.bz2`) | é o `demoUrl` |
| `watchablematchinfo.game_map` | nome do mapa | reserva do cabeçalho da demo; não verificado se vem |
| `b_switched_teams`, `max_rounds`, `player_spawned[]`, `team_spawn_count[]` | detalhes de estrutura | sem uso ainda |

Desde 18/09 o bot manda a resposta **inteira** (`gc` no POST, Longs como
string, chaves de criptografia removidas) e o site a guarda em `Match.gc`.
O GC esquece a partida em ~30 dias; o JSON não. O que ainda não virou
coluna (rankings, party, linha do tempo) espera a pergunta certa e um
`SELECT` no `gc`, sem pedir nada de novo ao GC.

## 2. O que a demo entrega — medido

Demo pública de matchmaking (Premier, Ancient, 8 rounds com rendição, um
jogador saiu no 3º; conjunto de testes do awpy), 112 MB descomprimida,
71 MB em `.bz2`, formato `PBDEMS2` — o mesmo que `demo-header.ts` já lia.

Parser: `@laihoe/demoparser2` 0.42.0 (Rust, binding N-API, tem build
`linux-x64-musl` para o Alpine do bot). Medições no WSL:

| Operação | Tempo | RSS máx |
|---|---|---|
| `parseHeader` + `listGameEvents` | 0,2 s | 190 MB |
| 18 tipos de evento com posição e zona | 0,5 s | 215 MB |
| `parseTicks` a cada 64 ticks (1 s), 10 jogadores | 1,0 s | 210 MB |
| `demo-parse.ts` inteiro (o que o bot roda) | 3,3 s | 250 MB |
| `bzip2 -dc` do sistema | 16 s | — |
| `unbzip2-stream` (JS, a reserva) | 54 s | — |

Uma partida de 24 rounds é ~3× isso: **~350 MB de demo, ~400 MB de RSS,
~1 min de descompressão** — o que faz o parser rodar num processo filho
(`bot/src/demos.ts`): se a t2.micro (1 GB) não aguentar, morre o filho e a
partida fica `FAILED` com o motivo; a conexão com a Steam não cai. Ainda
não medido em produção; se falhar por memória em partidas longas, o
caminho é `parseTicks` por blocos ou uma instância maior.

### Os 43 eventos que uma demo de matchmaking carrega

`begin_new_match bomb_beginplant bomb_dropped bomb_pickup bomb_planted
bullet_damage buytime_ended chat_message cs_pre_restart cs_round_final_beep
cs_round_start_beep cs_win_panel_match decoy_detonate decoy_started
fire_bullets flashbang_detonate hegrenade_detonate hltv_versioninfo
inferno_expire inferno_startburn item_equip item_pickup other_death
player_blind player_death player_disconnect player_footstep player_hurt
player_jump player_spawn rank_update round_announce_match_start
round_freeze_end round_officially_ended round_poststart round_prestart
round_time_warning server_cvar smokegrenade_detonate smokegrenade_expired
weapon_fire weapon_reload weapon_zoom`

Mais `round_start`/`round_end` (com `winner` e `reason`), que o parser
reconstrói do estado do jogo. E, em qualquer evento, o parser anexa
propriedades do jogador no tick: `X/Y/Z`, `last_place_name` (a **zona
nomeada do mapa** — `BombsiteA`, `Ramp`, `Middle`… sem precisar de nav
mesh), `team_name`, `health`, `armor_value`, `balance`,
`current_equip_value`, `is_alive`, `flash_duration`, `active_weapon_name`.

Três achados que mudam o que o produto pode fazer:

1. **`rank_update` traz o CS Rating do Premier de cada um dos dez**, com
   `rank_old`, `rank_new`, `rank_change`, `num_wins`, `rank_type_id` (11 =
   Premier). Na demo medida: 17 628 → 17 990 (+362) para quem venceu,
   −1 000 para quem abandonou. É a série de rating que o
   [roadmap](./roadmap-dados.md) achava que só o caminho 3 daria — e vem
   de graça com a demo, para os dez, não só para quem tem conta.
2. **`last_place_name` é a zona do mapa**, amostrada por segundo em
   `parseTicks`. "Controle de mapa" deixa de precisar de geometria: é
   contar segundos por zona, por lado, por round.
3. **`player_death` diz o contexto do duelo**: `attackerblind`,
   `thrusmoke`, `noscope`, `penetrated`, `distance`, `assistedflash`,
   `hitgroup`, posição dos dois. Dá para separar "morreu num duelo" de
   "morreu cego atravessando uma smoke".

## 3. O desenho

```
GET /api/bot/demos ──► bot: baixa .dem.bz2 (fetch → disco)
                            │  bzip2 -dc (JS como reserva)
                            │  tsx src/demo-parse.ts <arquivo>   ← processo filho
                            ▼
POST /api/bot/demos ◄── JSON gzip (~11 KB por 8 rounds; ~300 KB estimado por partida inteira)
        │
        ├─ MatchDemo.dados      ← o payload inteiro (fato)
        ├─ MatchPlayerDemo      ← metricasDaDemo() (regra, REGRAS_VERSAO)
        ├─ MatchTeamDemo        ← conversaoDaDemo() (regra, a mesma versão)
        └─ Match.mapa/servidor  ← do cabeçalho, se ainda não tinha
```

- **Fila** (`src/lib/demos.ts#filaDeDemos`): partidas `DONE` com `demoUrl`,
  jogadas há menos de 30 dias, sem `MatchDemo` ou com ele `PENDING` e
  menos de 3 tentativas. Uma por vez, a mais recente primeiro. O bot passa
  a cada 5 min.
- **Payload** (`bot/src/demo-parse.ts`, validado por
  `src/lib/demo/payload.ts`): `jogadores`, `rounds` (início, fim do
  freeze, fim, vencedor, motivo) e `eventos` ordenados por tick — `morte`,
  `dano`, `cego`, `granada`, `bomba`, `zona`, `saiu`, `rank` — mais
  `tiros` por jogador e arma (o `weapon_fire` cru é o maior evento da demo
  e não vale o peso). A zona só entra quando muda, mas todo jogador ganha
  um registro na primeira amostra de cada round: é assim que o site sabe
  quem estava no round e de que lado.
- **Aquecimento fora**: eventos com `is_warmup_period` não entram.
- **Recompute**: `npm run recompute:demos` refaz `MatchPlayerDemo` e
  `MatchTeamDemo` de todos os `MatchDemo.dados` com a regra vigente.
- **Tela**: `/partida/[id]` ganha ADR e KAST na tabela quando a demo foi
  lida, uma linha "da demo" para quem está logado e jogou, e o rodapé de
  conversão em cada time (§4.1).

## 4. As métricas, definidas

`src/lib/demo/metricas.ts`, versão 1. Por jogador, por partida. Round
rendido não é jogado; jogador que saiu conta só os rounds em que apareceu.

| Métrica | Definição |
|---|---|
| `rounds` | rounds em que o jogador esteve (teve lado) |
| `kills`, `hs` | mortes de inimigo causadas por ele; kill de aliado não conta |
| `deaths` | todas as mortes dele |
| `assists`, `flashAssists` | `assister` da morte, sem e com `assistedflash` |
| `dano`, `danoSofrido` | `player_hurt` entre lados opostos, **limitado à vida que a vítima tinha** (o evento diz 108 num jogador com 30) |
| `adr` | `dano / rounds` |
| `kast` | fração dos rounds com kill, assist, sobrevivência ou morte trocada |
| `aberturas`, `aberturasPerdidas` | a primeira morte por inimigo do round: quem matou abriu, quem morreu perdeu |
| `trocas` | kill sobre quem matou um aliado há ≤ 5 s (320 ticks, o prazo do HLTV) |
| `mortesTrocadas` | mortes dele vingadas nesse prazo |
| `multi2..5` | rounds com exatamente 2, 3, 4 ou 5+ kills |
| `clutches`, `clutchesGanhos` | vezes em que ficou como último vivo do lado com ≥ 1 inimigo vivo (uma por round); ganhou se o round foi do lado dele |
| `inimigosCegados`, `segundosCegando`, `aliadosCegados` | `player_blind` por flash dele, separados por lado; segundos só dos inimigos |
| `danoUtil` | dano de `hegrenade`, `inferno`, `molotov`, `incgrenade` |
| `granadas` | detonações dele (smoke, flash, HE, molotov, decoy) |
| `sobreviveu` | rounds sem morrer |
| `vidaMediaS` | segundos do fim do freeze até a morte, média dos rounds em que morreu |
| `zonas` | segundos por zona, por lado, enquanto vivo |
| `rating` | o `rank_update` dele: tipo, antes, depois, mudança, vitórias |

Sem "rating" composto de propósito: um número que mistura tudo esconde o
que a série temporal existe para mostrar. Testes: `tests/lib/demo-metricas.test.ts`
(a partida real como fixture + um round sintético por regra).

### 4.1 Conversão do time — `MatchTeamDemo`

`src/lib/demo/conversao.ts`, mesma `REGRAS_VERSAO`, mesmo recompute. Uma
linha por time (duas por partida), e a primeira métrica que não é de
jogador: o que o time fez com o que teve.

| Métrica | Definição |
|---|---|
| `rounds`, `roundsGanhos` | rounds jogados (sem os rendidos) e os vencidos — fecham o placar |
| `vantagensCT`, `vantagensCTGanhas` | rounds **que começaram iguais** em que o time, de CT, ficou com mais gente viva que o adversário, **com inimigo vivo** — e quantos virou round |
| `vantagensT`, `vantagensTGanhas` | o mesmo, jogando de T |
| `plants`, `plantsGanhos` | rounds em que o time, de T, plantou a bomba — e quantos venceu |

As duas restrições da vantagem são o que separa a métrica de uma taxa de
vitória disfarçada:

- **round que começa desigual fica fora.** Quando alguém sai da partida, o
  round inteiro é 5v4 — isso não é uma vantagem criada no jogo, é a
  condição dele. Na demo medida, quatro dos sete rounds jogados começam
  assim (o jogador saiu no 3º) e não entram no denominador.
- **a última morte não é vantagem.** Ficar 1v0 é o round ganho; a situação
  a converter precisa de inimigo vivo. Sem essa regra todo round vencido
  por eliminação contaria como uma vantagem convertida.

A vantagem que troca de mão conta para os dois times — cada um teve a sua,
e no máximo um converteu. O time é identificado pelo **lado em que começou
a partida**, que é o que sobrevive à troca do intervalo; a página casa
essa linha com o time do placar pela escalação (`conversaoDosTimes`),
porque o placar do GC numera os times pela reserva e a demo não os conhece.
Testes: `tests/lib/demo-conversao.test.ts`.

Na partida real medida: quem começou de CT converteu 2 de 2 vantagens e
venceu 5 rounds; quem começou de T converteu 1 de 2 e plantou 2 bombas,
ganhando os dois rounds.

## 5. A linguagem tática — o que falta e de onde sai

A tese (registrada em 18/09): CS2 é um jogo de **informação e controle de
espaço sob restrição de tempo e recursos, em que cada equipe tenta
manipular as decisões da outra**. Estratégia não é "qual call", é uma
árvore de decisões; uma ação gera valor sem kill quando muda a estrutura
adversária. As dimensões: espaço, tempo, informação, recursos, ameaça,
risco. A métrica de jogador que interessa não é K/D — é comportamento
tático: controle de mapa, disciplina de troca, timing de rotação, valor do
utilitário, jogo de informação, gestão de risco.

O que a versão 1 já cobre é a camada de **conversão** (o que aconteceu e a
quem se atribui) e contagens de **recurso** (granadas, cegueira, dano de
utilitário). A tabela abaixo mapeia cada princípio ao que a demo tem, com
o que já existe no payload marcado — é o backlog desta frente.

| Princípio | Pergunta | Fatos na demo | No payload v1? |
|---|---|---|---|
| **Espaço** — controle de mapa | que zonas o time ocupa, quando, e por quanto tempo antes do contato? | `zona` por segundo, por lado; `morte.zonaVitima/zonaAutor` | sim (`zonas` soma por jogador; falta por round e por **time**) |
| **Espaço** — profundidade | quão longe do spawn o time chega antes da primeira morte? | zona + posição da primeira morte do round | sim, não calculado |
| **Tempo** — ritmo | a que segundo do round vem o primeiro contato, a plant, a execução? | `round.jogo`, tick da primeira `morte`/`dano`, `bomba.plantando` | sim, não calculado |
| **Tempo** — timing de rotação | quanto o CT demora a mudar de site depois do primeiro sinal? | `zona` (mudança de site) contra tick do primeiro `dano`/`granada` no outro site | sim, não calculado |
| **Informação** — o que se revelou | o time viu antes de comprometer? | `dano` sem morte, `cego`, `granada` de reconhecimento, `zona` de quem entrou e saiu | parcial: falta `weapon_fire` por round (um tiro de "info") e `player_footstep` |
| **Recursos** — utilitário que compra algo | a smoke/flash antecedeu uma entrada com kill ou uma plant? | `granada.pos`+tick vs `morte`/`bomba` logo depois, `flashAssist` | sim, não calculado |
| **Recursos** — economia | com quanto cada um entrou no round; força ou eco? | `balance`, `current_equip_value` (propriedade de jogador, **não** incluída) | não — próximo campo do payload |
| **Ameaça** — fake | o time mostrou presença num site e plantou no outro? | `granada`/`zona`/`dano` num site seguido de `bomba.plantada` no outro | sim, não calculado |
| **Risco** — disciplina de troca | morreu sozinho ou com aliado a ≤ 5 s de distância? | `morte` + `zona` dos aliados no mesmo tick | `mortesTrocadas` já; falta "morte sem aliado perto" |
| **Risco** — duelo tomado | morreu cego, atravessando smoke, sem colete, num 1v3? | `morte.cego/atravesSmoke`, `vivos` no tick | sim, não calculado |
| **Conversão** — vantagem mantida | 5v4 virou round? plant virou round? | `morte` (vivos), `bomba`, `round.vencedor` | **feito** (§4.1, `MatchTeamDemo`) |

Ordem sugerida para o próximo ciclo, do mais barato ao mais caro:

1. ~~**Conversão por round**~~ — feito em 19/09 (§4.1). O que ficou de
   fora e continua valendo: a retomada do CT (round em que a bomba foi
   plantada contra ele e ele venceu assim mesmo) é o complemento do
   `plants` do outro time e hoje só se lê cruzando as duas linhas.
2. **Ritmo**: segundo do primeiro contato e da plant, por round e por
   lado. Duas linhas no payload.
3. **Economia**: `balance` e `current_equip_value` na amostra do início do
   round (dois campos em `parseTicks`, versão 2 do payload). Sem isso,
   "força vs eco" não existe e ADR num eco é lido como ADR.
4. **Utilitário que compra algo**: flash seguida de kill/entrada, smoke
   seguida de plant. Cruza dois eventos por tick e zona.
5. **Controle de mapa por time e por round**: `zonas` já existe por
   jogador; agregar por time no round e comparar com o vencedor.

## 6. Custos e limites

- **Onde roda**: no bot, na EC2 — é o único processo persistente e o
  único que já tem o `demoUrl`. Um demo por vez; nada em paralelo.
- **Memória**: ver §2. A `PARSE_TIMEOUT_MS` (5 min) e o processo filho
  são o freio.
- **Disco**: ~450 MB por partida em `/tmp/fragiq-demos`, apagados no fim,
  deu certo ou não.
- **Rede**: ~100 MB de download por partida na EC2 (saída da Valve para a
  AWS, sem custo de egress para nós).
- **Banco**: `MatchDemo.dados` estimado em ~1 MB por partida inteira
  (jsonb comprime). 100 partidas = 100 MB no Neon; acompanhar.
- **Vercel**: `POST /api/bot/demos` recebe gzip e descomprime; o corpo
  descomprimido fica bem abaixo dos 4,5 MB do limite. `maxDuration = 60`.
- **Expiração**: a Valve apaga a demo em ~30 dias; 404 vira `EXPIRED` e
  não volta à fila. Partidas de antes de 18/09 já gravadas com `demoUrl`
  entram na fila sozinhas enquanto estiverem no prazo.

## 7. O que precisa do humano para ir ao ar

1. `git push` (migrations `20260918200000_demos`,
   `20260918210000_gc_bruto` e `20260919030000_conversao_do_time` entram
   pelo `vercel-build`). Demo já gravada antes da última só ganha a linha
   de time no `npm run recompute:demos`.
2. `bot/deploy.sh` — a imagem nova instala `bzip2` e o
   `@laihoe/demoparser2`; o `.dockerignore`/`npm ci` já cobrem.
3. Conferir no `/admin` (log do bot) a primeira linha `Demo CSGO-…: N MB,
   S s` e, se vier `parser saiu com null` (SIGKILL), é memória: a
   instância não aguentou uma partida longa.
