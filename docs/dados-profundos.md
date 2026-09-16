# Fontes de dados de CS2

Referência do que é possível obter, por qual mecanismo, e a que custo.
Para a decisão de sequência, veja [roadmap-dados.md](./roadmap-dados.md).

## O mapa

A Valve não expõe uma API de estatísticas de partida. O que existe são cinco
caminhos distintos, com credenciais e limites diferentes.

| # | Caminho | Credencial | Dá acesso a |
|---|---|---|---|
| 1 | **Web API pública** | chave da API | contadores vitalícios, biblioteca, perfil |
| 2 | **Web API + bot amigo** | chave + amizade | o mesmo, em perfis "somente amigos" |
| 3 | **Game Coordinator** | bot com CS2 + amizade | rank, medalhas, comendações |
| 4 | **Share codes + demos** | auth code do usuário | tudo que existe numa partida |
| 5 | **GCPD** | sessão do browser do usuário | 20 abas de dados pessoais |

O FragIQ hoje usa só o caminho 1.

---

## 1. Web API pública — o que já usamos

`api.steampowered.com`, autenticado pela chave da plataforma (no cogniflow; o FragIQ chama as capabilities `steam.*`). Entrega contadores
**vitalícios e cumulativos**: no CS2 são 197, dos quais 178 viram série
temporal (ver [README](../README.md)).

### Escopo dos contadores — medido, não documentado

A Valve não documenta o que cada contador conta, e o escopo **não é uniforme**.
Medimos jogando uma partida casual e comparando os 197 contadores antes e
depois.

| Comportamento | Contadores |
|---|---|
| **Somam todos os modos** | `total_kills`, `total_deaths`, `total_damage_done`, `total_rounds_played`, `total_matches_played`, `total_time_played`, `total_contribution_score`, e todos os por arma (`total_shots_*`, `total_hits_*`, `total_kills_*`) |
| **Aparentemente mortos** | os 18 `last_match_*` — ver abaixo |
| **Somam todos os modos** | também os 30 por mapa — confirmado: uma casual em Inferno moveu `total_rounds_map_de_inferno` |

Consequência para o produto: um K/D por período que inclua dias de casual vem
inflado, porque casual é mais solto.

### Separar competitivo de casual é impossível por aqui

Testado por dois caminhos independentes.

**Pelo schema.** `GetSchemaForGame` declara 286 estatísticas. Procurando
marcadores de modo no nome:

| Modo | Contadores próprios |
|---|---|
| Arms race / gun game | **9** |
| Tutorial (`GI.lesson.*`) | 34 (flags, não desempenho) |
| Wingman | 0 |
| Competitivo | 0 |
| Casual | 0 |
| Deathmatch | 0 |
| Premier | 0 |
| Sem marcador (globais) | 243 |

**Pela observação.** Comparando quais contadores se moveram em dois
intervalos — um com uma partida, outro com duas casuais — a diferença entre
os conjuntos é só *qual arma e qual mapa foram usados*
(`total_kills_tec9` num, `total_kills_ssg08` no outro; `de_dust2` num,
`de_inferno` no outro). Nenhum contador é exclusivo de um modo.

Conclusão para a API de estatísticas: **arms race é o único modo separável**.

**Mas o rich presence resolve isso** — ver abaixo.

### O rich presence entrega mapa e modo

Achado que muda o teto do projeto. Consultando o estado de persona de um
amigo com `node-steam-user`, o CS2 publica:

```
game:map    = de_anubis
game:mode   = retakes
game:score  = [ 7 : 3 ]
game:state  = game
game:server = offline
status      = Offline Retakes Anubis [ 7 : 3 ]
```

Duas coisas que a API de estatísticas não dá, de graça:

1. **O mapa** — inclusive `de_anubis`, que não existe no schema de stats.
   Mirage, Ancient e Overpass caem no mesmo caso.
2. **O modo** — o que torna possível separar competitivo de casual, algo que
   nenhum contador permite.

Combinando com a coleta reativa do bot: sincronizando ao fim de cada partida
e guardando o contexto observado, **o delta entre dois snapshots passa a ser
atribuível a um mapa e a um modo**. É o que `StatSnapshot.matchMap` e
`matchMode` guardam.

Detalhe de implementação que custou tempo: veio do **estado de persona**
(`getPersonas`), não de `requestRichPresence` — este último devolveu vazio
nos testes. Quem for reimplementar deve olhar a persona.

Limites conhecidos: exige amizade com o bot, exige o bot online no momento
da partida, e o valor observado é o do último estado antes de sair. Partida
em servidor local (treino com bots) publica `game:server = offline`.

### `last_match_*` parece ser legado morto

A primeira leitura foi que esses contadores refletiam só partidas oficiais,
já que não se moveram com a casual. Medindo melhor, a explicação é outra:
eles ficaram **congelados em `8 kills / 16 mortes / 1151 de dano` por dois
dias e ao menos duas partidas**, enquanto `total_matches_played` subia.

A hipótese mais provável é resquício do CS:GO que a Valve deixou de escrever
na migração para o CS2 — coerente com o fato de todas as ferramentas de
mercado usarem auth code e parsing de demo para dado por partida, em vez da
Web API.

Não há confirmação oficial, e o comportamento pode variar por modo, então o
código **detecta por evidência** em vez de assumir: `gaugesLookStale()`
compara a primeira e a última coleta e, se houve partida nova sem nenhum
`last_match_*` mudar, avisa na tela. Confirmar em definitivo exige uma
partida competitiva ou premier observada entre duas coletas.

Corroborando: `total_time_played` marca 751h contra 1.987h de
`playtime_forever`. 62% do tempo em jogo não entra em contador nenhum — menu,
workshop, servidores da comunidade.

### Estes contadores não produzem ADR nem rating

Tentador comparar com os números de mercado. Não funciona, e o teste é
rápido: numa conta com K/D vitalício de 0,70, `total_damage_done /
total_rounds_played` dá **94,4** — acima da mediana de ADR dos profissionais
do top 100 (82,5, via `api.csapi.de`). As duas coisas não podem ser verdade.

A causa é a mesma mistura de modos: o dano soma deathmatch e casual, onde se
causa muito dano por round, enquanto os rounds não incrementam na mesma
proporção. Sinal de apoio: os dados implicam 41,3 rounds por hora de jogo,
contra ~30 esperados numa partida MR12.

Conclusão para o produto: estes contadores servem para **comparar o jogador
com ele mesmo ao longo do tempo**. Benchmark contra terceiros exige dado de
demo, e cai no caminho 4.

### Contadores por mapa estão congelados

A Valve parou de adicionar mapas. Existem:

```
ar_baggage  ar_monastery  ar_shoots  cs_assault  cs_office  de_bank
de_cbble    de_dust2      de_house   de_inferno  de_lake    de_nuke
de_safehouse de_stmarc    de_train   de_vertigo
```

Do pool ativo, **Mirage, Ancient, Anubis e Overpass não são rastreados**.
Qualquer análise por mapa cobre no máximo metade do que se joga hoje.

### Limites reais

O número documentado é 100.000 chamadas/dia por chave. O que os fóruns
relatam, e que a documentação não diz:

- Existem **limites por IP não documentados**. Há relato de `429` a cada
  10–20 minutos com apenas uma requisição a cada 120 segundos.
- A Valve aplica **shadow ban** quando o padrão de uso parece scraping. O
  canal para contestar é `webapi@valvesoftware.com`.
- O endpoint de inventário (`steamcommunity.com/inventory/...`) **não** entra
  na cota de 100k: tem limite próprio, mais agressivo, e não é documentado.
- `GetPlayerSummaries` aceita **até 100 SteamIDs por chamada**. Nosso cron
  hoje faz uma chamada por usuário; ao escalar, agrupar é ganho imediato.

### Privacidade

Perfis privados devolvem biblioteca e stats vazias. Esta é a maior causa de
dashboard vazio, e o caminho 2 existe para resolvê-la.

---

## 2. Bot amigo — o mecanismo menos conhecido

A Web API respeita a privacidade **em relação ao dono da chave**, não em
relação ao mundo. Se a conta que gerou a chave da plataforma for amiga do
jogador, perfis marcados como "Somente amigos" passam a responder
normalmente. Desfeita a amizade, a API volta a devolver vazio.

Ou seja: uma conta bot que o usuário adiciona converte perfil restrito em
perfil legível, **sem nenhuma mudança de código na coleta**.

É o que o Leetify faz — ao vincular a conta, o usuário recebe pedido de
amizade do bot deles.

Custo: uma conta Steam dedicada, um processo que envie e aceite pedidos
(`node-steam-user`), um passo de onboarding pedindo o aceite, e o teto de
1.000 amigos por conta — acima disso, sharding de bots.

---

## 3. Game Coordinator — rank e Premier

Com um bot conectado ao GC do CS2 (`node-steam-user` + `globaloffensive`),
`requestPlayersProfile()` devolve rank (0–18 com contagem de vitórias),
comendações, medalhas, nível e XP privado, status de VAC e partida em
andamento.

**Não verificado.** A documentação do módulo diz que o alvo precisa estar na
lista de amigos do bot **e** jogando CS no momento — o que faria disso uma
coleta oportunista, não sob demanda. A doc é da era CS:GO. Antes de desenhar
qualquer coisa em cima, precisa de um experimento com bot real para
descobrir se o CS Rating do Premier realmente vem e sob quais condições.

Exige processo persistente: não roda em serverless.

### O `game_type` da reserva é um bitmask, e ele diz o modo

Verificado em 2026-09-16 com seis partidas de produção. O `game_type` que
o GC devolve em `roundstats.reservation` tem duas partes: o byte baixo é o
modo — `8` competitivo, `7` casual, `10` Wingman, `12` skirmish (Arms
Race, Demolição, Retakes, cada um com o próprio bit alto), `13` Danger
Zone — e os bits altos são o mapa da fila quando a fila foi de um mapa só
(`32768` Mirage, `4096` Inferno, `512` Dust II, `8388608` Anubis…). O
Premier é `8` com o bit 25 (`33554440`) e nenhum bit de mapa, porque o
mapa sai do veto. Assim `32776` = competitivo em Mirage e `4104` =
competitivo em Inferno, exatamente o que o cabeçalho da demo leu nas seis.
A tabela mora em `src/lib/game-type.ts`; a fonte, além das partidas, é a
calibração pública do CSGO-GCServer (`game_type_calibration.go`).

Consequência: **competitivo e Premier se separam sem o bot de presença**,
para qualquer partida com share code. A presença continua sendo a única
fonte para casual e para quem não liga a corrente de códigos.

---

## 4. Share codes e parsing de demos — a camada profunda

Toda estatística que csstats, csrep e Leetify mostram e que não existe na Web
API — ADR, KAST, rating, clutches, entry duels, utility, posições — é
calculada por eles **a partir dos arquivos de demo**.

### Como a trilha funciona

O usuário fornece duas coisas, uma vez:

1. **Authentication Code** (`steamidkey`), gerado em
   `steamcommunity.com/my/gcpd/730`. É a autorização explícita para
   terceiros pedirem as demos dele.
2. **Um share code recente** (`knowncode`), o ponto de partida.

Com isso o backend caminha a cadeia:

```
GET https://api.steampowered.com/ICSGOPlayers_730/GetNextMatchSharingCode/v1
      ?key=<chave da plataforma, no cogniflow>
      &steamid=<SteamID64>
      &steamidkey=<Authentication Code>
      &knowncode=<ultimo share code conhecido>
   -> proximo share code  ->  vira o knowncode da chamada seguinte
```

Cada share code (`CSGO-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`) decodifica para
`matchId`, `reservationId` e `tvPort`, que dão a URL do demo no CDN da Valve.
A biblioteca `csgo-sharecode` (npm, de akiver) faz essa decodificação.

### Restrições que moldam a arquitetura

- O `knowncode` precisa ter **no máximo ~30 dias**. Se o usuário some por
  mais de um mês, a trilha se rompe e ele tem que colar um código novo.
  Isso torna a coleta **obrigatoriamente agendada** — botão não resolve.
- Um demo tem ~100 MB e leva dezenas de segundos para parsear. **Não roda em
  serverless.** O desenho é fila de share codes pendentes + workers.
- Só cobre **matchmaking oficial da Valve**. Unranked, Wingman e scrimmage
  ficam de fora (ver caminho 5).

### Parsers

- **demoinfocs-golang** — Go, o mais completo e rápido
- **demoparser2** — Rust, com bindings Python e JS
- **awpy** — Python sobre demoparser2; já calcula ADR e KAST prontos

### Alternativa: comprar em vez de construir

O **csrep.gg tem API pública v2** (`https://csrep.gg/api`, auth por header
`X-API-Key`), com `POST /matches/import`, `POST /matches/import/faceit`,
`GET /matches/{id}`, `GET /matches/faceit/{id}`,
`GET /matches/gamersclub/{id}` e endpoints de Players. Spec OpenAPI 3.0
disponível na documentação deles.

Isso permitiria ter as métricas profundas sem construir fila nem parsing.
O custo é uma dependência de terceiro que também é concorrente direto.

---

## 5. GCPD — o caminho da extensão

`steamcommunity.com/my/gcpd/730/?tab=<aba>` é a página de dados pessoais do
jogo. São **20 abas**:

| Aba | Conteúdo |
|---|---|
| Account Information | tempo de atividade, privacidade, Prime, carteira |
| Authentication Codes | registros de credenciais |
| Matchmaking | rank competitivo, vitórias/derrotas, partidas jogadas |
| Competitive / Casual / Wingman / Scrimmage Matches | mapa, resultado, data |
| Match Stats | métricas de desempenho da partida |
| Match Events | log detalhado de eventos |
| Latency | região, ping, coordenadas e **IP** |
| Loadout | skins equipadas, IDs de item, time |
| Commendations | quem elogiou, tipo, quando |
| Reports | denúncias de conduta |
| Leaderboards, Prime, Major Pick'Em, Operations, Favorite Events | diversos |

As abas de partida listam jogos **com link de download do demo**, incluindo
os tipos que share code não cobre.

**A restrição decisiva:** isso exige o cookie de sessão da Steam do próprio
usuário. Um servidor não tem como acessar. Por isso o Leetify distribui uma
**extensão de Chrome** (`leetify/leetify-gcpd-upload`) que, rodando como o
usuário, requisita as páginas de GCPD, extrai as partidas com demo
disponível e envia os links para o backend deles. Sincroniza a cada 15
minutos, ao visitar o Leetify, ao visitar o GCPD, ou por botão.

---

## O que fica de fora, e por quê

Existem bibliotecas (`steam-session`) que obtêm refresh tokens via QR do
app móvel, dando acesso completo à conta.

A documentação da Web API da Valve é explícita: autenticar pedindo usuário e
senha no seu site **viola os Termos de Uso da API** — é a razão de o OpenID
existir. O fluxo por QR contorna a senha mas mantém o problema de fundo:
você passa a segurar uma credencial que move skins, e é o vetor exato dos
golpes de "verificação de trade" em CS2. Para uma plataforma de
estatísticas, o passivo não paga.

---

## Fontes

- https://steamcommunity.com/dev — Termos de Uso e OpenID
- https://github.com/SteamTracking/SteamTracking/blob/master/API/ICSGOPlayers_730.json
- https://github.com/SteamTracking/SteamTracking-GDPR/blob/master/csgo_730_gcpd.md
- https://github.com/leetify/leetify-gcpd-upload
- https://github.com/akiver/csgo-sharecode
- https://github.com/DoctorMcKay/node-globaloffensive
- https://github.com/markus-wa/demoinfocs-golang
- https://github.com/LaihoE/demoparser
- https://github.com/pnxenopoulos/awpy
- https://leetify.com/blog/share-codes/
- https://csstats.gg/getting-the-sharecode
- https://csrep.gg/docs/api-reference
- https://steamcommunity.com/discussions/forum/7/1729827777339922602/ — amizade e privacidade
- https://dev.doctormckay.com/topic/4390-how-am-i-exceeding-steam-apis-rate-limit/ — limites por IP
