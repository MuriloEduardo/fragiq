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

## Fontes

- https://github.com/SteamTracking/SteamTracking/blob/master/API/ICSGOPlayers_730.json
- https://leetify.com/blog/share-codes/
- https://csstats.gg/getting-the-sharecode
- https://github.com/markus-wa/demoinfocs-golang
- https://github.com/LaihoE/demoparser
- https://github.com/pnxenopoulos/awpy
