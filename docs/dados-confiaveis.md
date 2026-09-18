# Dados confiáveis — modelo, regras e apresentação

Decisão de 2026-09-16. Substitui a leitura "por tela" do `design.md` no que
diz respeito a **onde os números nascem, como são guardados e como são
mostrados**. O `design.md` continua valendo para tokens, chips e cartões;
este documento diz o que entra neles.

## 1. O que está errado hoje (com os números de produção)

| Sintoma | Causa no código | Evidência (16/09) |
|---|---|---|
| "Mistura casual, competitivo e Premier" | Uma **sessão** é o intervalo entre duas coletas (`paresDeMovimento`), e o modo é o da coleta que **fechou** o intervalo. Se a coleta anterior foi o cron de ontem, o "Premier de hoje" carrega todas as partidas jogadas desde ontem — inclusive casual que o bot não viu. | 28 snapshots, **3 com modo**; 135 coletas (84 por evento do bot) para 28 pontos: a maioria não trouxe nada novo |
| Números mudam ao recarregar / entre telas | Nada é materializado: sessão, delta, normal, leitura e "impacto" são recalculados a cada request sobre o conjunto de snapshots que existir naquele instante. Um snapshot novo muda o normal de sessões antigas. | `metricas/[key]` já divergia da lista (backlog) |
| Partidas oficiais sem modo | `game_type` do GC lido como enum de dois valores | 6 partidas DONE, todas com `modo` nulo até o backfill de hoje |
| Análise é um bloco de texto | `Analysis.answer` é prosa do LLM, ~1.100 caracteres por sessão, não determinística, não comparável entre sessões | 13 análises SESSION, média 1.088 chars |
| Não dá para responder "de onde veio este número" | `StatSnapshot` não aponta para o `SyncRun` que o criou; a captura pendente é apagada ao virar snapshot; o bot só loga no `docker logs` | `eventos`: 9 linhas em 12 dias; `bot_status`: uma linha |

O que está **certo** e fica: a Steam só sabe o total de hoje, então o
snapshot bruto é o fato primário e nunca se apaga; `Match`/`MatchPlayer`
(GC) são fatos exatos por partida; a regra de sinal vs ruído (`delta.ts`,
`referencia.ts`) é boa — só precisa rodar uma vez e ficar guardada.

## 2. Princípios

1. **Fato é imutável e tem proveniência.** Todo snapshot sabe qual coleta o
   criou (`syncRunId`), qual gatilho, e qual `traceId` amarra bot → captura
   → coleta → snapshot. Nada de fato é recalculado; só derivações.
2. **Derivação é determinística e versionada.** Sessão, insight e referência
   são funções puras de fatos + `regraVersao`. Guardam-se com as entradas
   (hash) para serem reproduzíveis e auditáveis. Mudou a regra, sobe a
   versão e recomputa-se tudo — nunca "um pouco de cada".
3. **Modo é atributo de partida, não de intervalo.** Um intervalo entre
   coletas só recebe um modo se **provadamente** contém uma partida só; do
   contrário é `MISTO` e não entra em nenhuma aba de modo. Preferir
   "sem modo" a modo errado.
4. **Todo número carrega confiança e base.** `EXATA` (GC ou uma partida só
   observada), `INFERIDA` (presença do bot, várias partidas), `MISTA`
   (cron, desconhecido). A UI mostra a marca; o BI filtra por ela.
5. **Apresentação: uma linha.** Nenhum texto de mais de uma linha na área
   logada. Insight = número + direção + referência + base, sempre com
   representação visual (chip, barra, sparkline, mapa de calor). Prosa do
   LLM sai da tela.
6. **Auditoria completa.** Toda operação (cron, sync, captura, bot, GC,
   callback) deixa linha estruturada no banco, com `traceId`, lida no
   `/admin`. Sem abrir log de container.

## 3. Modelo de dados em camadas

```text
camada 0 · fatos brutos      camada 1 · fatos derivados     camada 2 · derivações     camada 3 · operação
─────────────────────────    ──────────────────────────     ─────────────────────     ───────────────────
StatSnapshot (+syncRunId,    Session (fechada na ingestão,  Insight (regraVersao,     SyncRun, CronRun,
 traceId, trigger)            modo + confianca, matchIds)    entradasHash, valor,      PendingCapture,
Match / MatchPlayer (GC)     Reference (normal por modo,     referencia, tom, base,    BotLog (novo),
BotObservation (novo:         versão, janela)                escopo: sessão/período)   Evento, traceId
 presença, fim de partida)                                   ↑ UI só lê daqui          em tudo
```

### 3.1 Camada 0 — o que muda

- `StatSnapshot` ganha `syncRunId` (FK), `trigger` (copiado do run, para
  consulta sem join) e `traceId`. Backfill: nulo para o histórico.
- `BotObservation` (nova): o que o bot **viu**, antes de qualquer coleta —
  `steamId`, `kind` (`match_started` | `match_ended` | `left_game` |
  `presence`), `map`, `mode`, `score`, `observedAt`, `traceId`. Hoje isso
  vira `PendingCapture` e some quando a captura acontece; a observação é
  o único registro de "houve uma partida de Premier às 22:02" e precisa
  sobreviver. É ela que permite atribuir modo com prova.
- `Match` já é fato; com `game-type.ts` o modo é exato. Ganha `traceId`.

### 3.2 Camada 1 — `Session`, materializada

Uma linha por par de snapshots com rounds > 0, criada **no momento em que
o segundo snapshot é gravado** (não na leitura). Campos: `userId`,
`appId`, `deSnapshotId`, `ateSnapshotId`, `de`, `ate`, os deltas dos
contadores que o painel usa (rounds, kills, deaths, hs, dano, mvps,
partidas, vitórias, tempo em partida), `armas`, `modo`, `modoConfianca`,
`mapa`, `placar`, `matchIds[]`, `regraVersao`.

`armas` (Json, desde 17/09) é o delta por arma do intervalo —
`{ "ak47": { "kills": 14, "tiros": 180, "acertos": 40 } }`, só as que se
moveram. É o que torna um número por arma atribuível a um modo: o
contador por arma da Steam soma todos os modos para sempre, mas o que se
moveu entre duas coletas pertence ao que foi jogado nesse intervalo — e a
sessão já diz, com prova, qual foi o modo. Arma é o que tem
`total_shots_<arma>` (`armasNasMetricas` em `cs2-labels.ts`): faca e
granada matam sem disparar e ficam de fora, porque sem par tiros/acertos
não há precisão para comparar.

**Regra de atribuição de modo** (a peça central; testada em
`tests/lib/sessao.test.ts`):

| Situação | modo | confiança |
|---|---|---|
| `Δ total_matches_played = 1` e há `BotObservation(match_ended)` dentro do intervalo | o da observação | `EXATA` |
| Há `Match` (GC) cujo `jogadaEm+duração` cai no intervalo e `Δ partidas = 1` | o do `Match` (bitmask) | `EXATA` |
| `Δ partidas > 1` e **todas** as observações/partidas do intervalo têm o mesmo modo, cobrindo Δ partidas | esse modo | `INFERIDA` |
| `Δ partidas > 1` com modos diferentes, ou observações < Δ partidas | `null` | `MISTA` |
| Sem observação nem partida (cron puro) | `null` | `MISTA` |

Abas de modo mostram só `EXATA` + `INFERIDA` (com a marca); "Tudo"
mostra tudo. `MISTA` nunca entra num normal de modo.

Recomputação: `npm run recompute:sessions` apaga e recria as sessões de um
usuário (ou todos) a partir dos fatos — é o que roda quando `regraVersao`
sobe. Idempotente por `(ateSnapshotId)`.

### 3.3 Camada 2 — `Insight`, materializado (com a referência embutida)

- **Decisão de 17/09 (implementação):** não há tabela `Reference`. A
  referência de um insight de sessão é o **normal na hora** — o acumulado
  das sessões provadas do mesmo modo *anteriores* à sessão lida (≥ 5
  sessões, ≥ 150 rounds), senão o vitalício da coleta que a fechou — e fica
  embutida no próprio insight (`referencia`, `referenciaTipo`). É mais
  estável e mais honesta que o leave-one-out sobre o futuro: a leitura de
  uma sessão antiga **não muda** quando entram sessões novas.
- `Insight`: `escopo` (`sessao` | `periodo` | `modo`), `escopoId`, `regra`
  (id estável, ex. `kd.vs.normal`, `hs.tendencia.5`, `mapa.melhor`),
  `regraVersao`, `entradasHash`, `valor`, `referencia`, `delta`, `tom`,
  `base` (rounds, sessões), `confianca`, `visual` (`chip` | `barra` |
  `sparkline` | `heatmap` | `rank`), `dados` (Json para o visual: pontos,
  ranking), `createdAt`. Uma linha por (escopo, escopoId, regra, versão).
  A UI **nunca** calcula; só lê e desenha.

Catálogo inicial de regras (todas determinísticas, todas de uma linha):

| regra | escopo | visual | linha que aparece |
|---|---|---|---|
| `kd.vs.normal` | sessão | chip | `K/D 1,32 · +9 % vs normal do Premier (8 sessões)` |
| `dano.vs.normal` | sessão | chip | `ADR 84 · −6 % vs normal` |
| `hs.vs.normal` | sessão | chip | `HS 41 % · +3 pp` |
| `sessao.classificacao` | sessão | selo | `Acima do normal` / `Dentro do ruído` / `Abaixo` |
| `tendencia.kd.5` | período | sparkline | `K/D nas últimas 5: subindo` |
| `forma.vs.vitalicio` | modo | barra dupla | `Forma atual 1,21 · vitalício 1,08` |
| `mapa.melhor` / `mapa.pior` | modo | rank | `Mirage +14 % · Inferno −9 %` (só EXATA/INFERIDA, mín. rounds) |
| `arma.destaque` | modo | barra | `AK-47 38% dos abates · normal 31% (+7 pp)` |
| `arma.precisao` | modo | rank | `AK-47 15% de acerto (+1 pp) · M4A1 11% (−7 pp)` |
| `consistencia` | modo | faixa | `Variação de K/D entre sessões: baixa` |
| `cobertura.modo` | período | anel | `72 % dos rounds com modo conhecido` |

As regras vivem em `src/lib/insights/regras.ts` (puras, versionadas, com
teste em `tests/lib/insights.test.ts`); `materializar.ts` grava ao fechar a
sessão e no `recompute:insights`; `ler.ts` é o que a tela consulta;
`components/insight.tsx` desenha pelo `visual`. `entradasHash` = sha256
das entradas serializadas. Implementadas em 17/09: os 4 de sessão
(`kd|adr|hs.vs.normal`, `sessao.classificacao`) e 7 de modo
(`tendencia.kd.5`, `forma.vs.vitalicio`, `mapa.ranking`, `arma.destaque`,
`arma.precisao`, `consistencia`, `cobertura.modo`).

`arma.destaque` compara a **fatia dos abates** de cada arma nas últimas 5
sessões da lente com a fatia nas sessões anteriores a essa janela (mín. 15
abates com a arma na janela, 60 abates de base), e mostra a que mais se
afastou. A fatia é a única leitura por arma que não depende do vitalício
misturado: ela sai só dos deltas de `Session.armas`. A pergunta é "o que
mudou no seu arsenal", não "o que você mais usa" — que a pessoa já sabe.
Sem direção boa ou ruim (§4.5): usar mais AWP não é melhor nem pior, o tom
é NEUTRO. Sessão sem `armas` registrada fica de fora inteira — entrar só
no denominador encolheria a fatia de todas as armas por um dado que não
existe.

`arma.precisao` (17/09) usa a outra metade de `Session.armas`, o par
tiros/acertos, e responde "com qual arma eu estou acertando mais do que
costumava": a precisão da mesma janela de 5 sessões contra a das sessões
anteriores a ela, arma por arma. Os mínimos são de **tiros** — 200 na
janela, 400 na base — porque é o tiro que é o denominador; a 200 tiros uma
precisão perto de 25 % ainda carrega ~3 pp de ruído amostral, então a
janela abaixo de 400 tiros fica marcada como fraca (`dados.fraco`).
Diferente do destaque, esta regra tem direção (acertar mais é melhor) e o
tom vem da valência do `delta.ts` — exceto quando a melhor e a pior arma
andaram para lados opostos, caso em que a linha tem dois sujeitos e
nenhuma direção única, e o tom é NEUTRO. É a regra que substituiu as duas
leituras de arma que a aba Estatísticas montava por request contra o
vitalício misturado da Steam.

### 3.4 Camada 3 — operação, auditoria, tracing

- `traceId` (uuid) nasce no bot a cada observação e viaja: `BotObservation`
  → `PendingCapture` → `SyncRun` → `StatSnapshot` → `Session` → `Insight`.
  Cron e manual geram o próprio. `/admin/trace/[id]` mostra a cadeia.
- `BotLog` (nova): o bot envia lotes (`POST /api/bot/logs`, a cada 10 s
  ou 50 linhas) com `nivel`, `mensagem`, `dados`, `traceId`, `em`. Retenção
  30 dias. O `/admin` ganha a aba **Bot** com os últimos logs, filtro por
  nível e por `steamId`, e o estado do supervisor (`logado`, `motivo`).
- `Evento` continua para transições de produto; ganha `traceId`.
- `/admin` ganha **Cobertura**: rounds por confiança de modo, sessões
  `MISTA` por jogador, buracos entre coletas, e **Regras**: versão em vigor
  de cada regra e quantos insights estão em versão antiga.

### 3.5 O analista (LLM)

Sai da tela principal. A conversa fica em `/analista` como
acompanhamento opcional; a mensagem automática por sessão no chat da Steam
vira **uma linha** montada a partir dos insights (`sessao.classificacao` +
o maior delta), não prosa do modelo. O modelo continua disponível para
perguntas, lendo as views — que passam a ler `Session`/`Insight`, não
recalcular.

## 4. Regras de apresentação (área logada)

1. Texto de no máximo **uma linha** por elemento; excedeu, corta com
   reticências e mostra inteiro no `title`.
2. Todo número tem base e confiança visíveis: `· 8 sessões · 214 rounds`
   e a marca (`●` exata, `◐` inferida, `○` mista) ao lado do modo.
3. Todo insight tem um visual; o número é o rótulo do visual, não o
   contrário.
4. Vazio é vazio: sem base suficiente, o cartão mostra o anel de cobertura
   e o que falta (`faltam 3 sessões de Premier`), nunca um número fraco.
5. Nada de cor semântica sem direção explícita: `melhorQuando` decide.

## 5. Infra: o que **não** muda agora

Postgres/Neon com Prisma, Vercel, bot na EC2. As tabelas novas são
relacionais e apendáveis; quando o volume pedir, `Session`/`Insight`
viram fonte de um warehouse sem mudar o produto — é por isso que elas
existem materializadas desde já.

## 6. Fases (cada uma cabe em ciclos da rotina; critério de pronto no backlog)

1. **Fatos e proveniência** — `syncRunId`/`trigger`/`traceId` no snapshot,
   `BotObservation`, `traceId` no bot e nas rotas; `BotLog` + aba Bot no
   admin. Sem mudar a tela.
2. **`Session` materializada** — tabela, regra de atribuição de modo com
   testes, `recompute:sessions`, telas de sessões/modo passam a ler dela;
   `listarSessoes` some.
3. **`Reference` + `Insight`** — as 10 regras, materialização ao fechar
   sessão, recompute por versão; telas Resumo/Estatísticas/Sessões passam
   a ler insights e desenhar.
4. **UI de uma linha** — auditoria de todas as telas contra a seção 4;
   analista sai da tela principal; mensagem de Steam vira uma linha.
5. **Admin de dados** — Cobertura, Regras, trace por id.
