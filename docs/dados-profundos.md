# Dados profundos de CS2

Como obter ADR, KAST, rating, clutches e dados por round — que **não existem**
na Steam Web API.

## Duas camadas, dois custos

| | Camada 1 — Web API | Camada 2 — demos |
|---|---|---|
| **Já implementado** | sim | não |
| **Atrito para o usuário** | zero (só login) | precisa colar 2 códigos |
| **Granularidade** | diária, agregada | por round e por evento |
| **Métricas** | kills, mortes, HS%, precisão, dano, rounds, vitórias | tudo acima + ADR, KAST, rating, clutch, entry, utility, posições |
| **Custo de infra** | uma chamada HTTP | download + parsing de ~100 MB por partida |
| **Escopo** | qualquer jogo Steam | só CS2, e só partidas de matchmaking Valve |

## Como a camada 2 funciona

A Valve não expõe estatísticas de partida. Ela expõe uma trilha de **share
codes**, e cada share code aponta para um arquivo de demo. Toda estatística
profunda que csstats/csrep/Leetify mostram é calculada por eles a partir
desses arquivos.

O usuário fornece duas coisas, uma vez:

1. **Authentication Code** (`steamidkey`) — gerado em
   `https://steamcommunity.com/my/gcpd/730` (Game State / histórico de
   partidas). É a autorização explícita para terceiros pedirem as demos dele.
2. **Um share code recente** (`knowncode`) — o ponto de partida da trilha.

Com isso o backend caminha a cadeia:

```
GET https://api.steampowered.com/ICSGOPlayers_730/GetNextMatchSharingCode/v1
      ?key=<STEAM_API_KEY>
      &steamid=<SteamID64>
      &steamidkey=<Authentication Code>
      &knowncode=<último share code conhecido>
   → próximo share code  →  vira o knowncode da chamada seguinte
```

Repete até esgotar. Cada share code decodifica para `matchId / outcomeId /
tokenId`, que dão a URL do demo no CDN da Valve.

**Restrição operacional importante:** o `knowncode` precisa ter no máximo ~30
dias. Se o usuário some por mais de um mês, a trilha se rompe e ele tem que
colar um share code novo. Isso torna a coleta da camada 2 **obrigatoriamente
agendada** — diferente da camada 1, aqui não dá para depender de um botão.

## Parsing

Demos de CS2 são protobuf. Bibliotecas maduras:

- **demoinfocs-golang** — Go, a mais completa e rápida; boa para um worker
- **demoparser2** — Rust com bindings Python/JS
- **awpy** — Python sobre demoparser2; já calcula ADR e KAST prontos

Isso não roda numa serverless function: um demo tem ~100 MB e leva dezenas de
segundos. O desenho seria uma fila (share codes pendentes) e workers separados
gravando o resultado no mesmo banco.

## Encaixe no modelo atual

O `StatSnapshot.metrics` já é um balde JSONB genérico — as métricas de demo
entram nele sem migração. O que falta modelar é a granularidade por partida:
uma tabela `Match` (share code, mapa, placar, data) com métricas por partida,
já que o snapshot atual é por instante de coleta, não por partida.

Feito isso, o explorador ganha as métricas novas automaticamente: o catálogo
é montado a partir dos dados, não de uma lista fixa.

## Amizade na Steam: sim, desbloqueia dados

Este é o mecanismo menos conhecido e o mais barato de implementar.

A Web API respeita a privacidade **em relação ao dono da chave**, não em
relação ao mundo. Se a conta que gerou a `STEAM_API_KEY` for amiga do
jogador, perfis marcados como "Somente amigos" passam a responder — a
biblioteca e as stats vêm normalmente. Desfeita a amizade, a API volta a
devolver vazio.

Consequência prática: um **bot amigo** converte a maior causa de dashboard
vazio (perfil não-público) em algo resolvível. O Leetify faz exatamente isso —
ao vincular a conta, o usuário recebe um pedido de amizade do bot deles.

Custo: uma conta Steam dedicada, um fluxo que peça ao usuário para aceitar, e
o limite de 1.000 amigos por conta (ou seja, sharding de bots ao crescer).

### O que a amizade abre além disso

Com um bot **conectado ao Game Coordinator** do CS2 (via `node-steam-user` +
`globaloffensive`), `requestPlayersProfile()` devolve rank, comendações,
medalhas, nível e XP. A documentação do módulo diz que o alvo precisa estar
na lista de amigos do bot **e** jogando CS — ou seja, é uma coleta
oportunista, não sob demanda. **Não testamos isso**; antes de desenhar
qualquer coisa em cima, vale um experimento com uma conta bot real para
descobrir se o CS Rating do Premier realmente vem e sob quais condições.

## Outros caminhos, e o que eles custam

| Caminho | O que dá | Custo / risco |
|---|---|---|
| **Bot amigo (Web API)** | perfis "somente amigos" | conta bot, aceite do usuário, 1.000 amigos/conta |
| **Bot no Game Coordinator** | rank, medalhas, comendações | bot com CS2, alvo online, não verificado |
| **Auth code + share code** | demos → ADR, KAST, rating, clutch | 2 códigos colados, fila + workers, `knowncode` expira em 30 dias |
| **Inventário** | skins, valor de inventário | endpoint público não documentado, rate limit agressivo por IP |
| **Login com credencial / QR** | tudo | **não fazer** — ver abaixo |

### Por que não pedir credencial

Existem bibliotecas (`steam-session`) que obtêm refresh tokens via QR do app
móvel, e isso daria acesso completo à conta — inclusive inventário e trades.

A documentação da Web API da Valve é explícita: autenticar sem OpenID, pedindo
usuário e senha no seu site, **viola os Termos de Uso da API**. O fluxo por QR
contorna a senha mas mantém o problema de fundo: você passa a segurar uma
credencial que move skins. É também o vetor exato dos golpes de "verificação
de trade" em CS2. Para uma plataforma de estatísticas, o retorno não paga o
passivo.

## Fontes

- https://github.com/SteamTracking/SteamTracking/blob/master/API/ICSGOPlayers_730.json
- https://leetify.com/blog/share-codes/
- https://csstats.gg/getting-the-sharecode
- https://github.com/markus-wa/demoinfocs-golang
- https://github.com/LaihoE/demoparser
- https://github.com/pnxenopoulos/awpy
- https://github.com/DoctorMcKay/node-globaloffensive
- https://steamcommunity.com/dev (Termos de Uso e OpenID)
- https://steamcommunity.com/discussions/forum/7/1729827777339922602/ (amizade e privacidade na Web API)
