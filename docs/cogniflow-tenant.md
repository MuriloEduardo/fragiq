# O analista: FragIQ como tenant do cogniflow

A seção "Pergunte ao analista" na página do jogo não chama um modelo daqui.
O FragIQ é um **tenant do cogniflow** — o runtime de agentes da SistemasGlobal
que já atende WhatsApp e e-mail — conectado pelo canal `webhook`, que existe
justamente para a aplicação do próprio cliente ser um canal como outro
qualquer.

```text
FragIQ                                cogniflow
──────                                ─────────
POST /api/analises
  └─ grava Analysis PENDING
  └─ POST {WEBHOOK_URL}  ───────────▶ integration-service  /webhooks/webhook
       X-Signature-256                  └─ SQS ─▶ orchestration-service
                                                    └─ agente (LangChain)
/api/cogniflow/callback ◀──────────────── POST acknowledgement
  └─ Analysis ACKNOWLEDGED                       │
                                                 │ data.read (n vezes)
/api/cogniflow/data     ◀──────────────── POST {view, params, context}
  └─ consulta a série,  ─────────────────▶ JSON
     mesma de series.ts                          │
                                                 │ messaging.send
/api/cogniflow/callback ◀──────────────── POST message {text}
  └─ Analysis ANSWERED
```

A análise chega sozinha: toda coleta que fecha uma sessão (rounds subiram
desde o ponto anterior) cria uma `Analysis` de tipo `SESSION` amarrada à
coleta (`snapshotId` único) e manda ao agente "Nova sessão registrada em …:
N rounds em M partidas. Analise esta sessão contra o meu normal…". O gatilho
está no sync (cron, bot, manual, login) e a página repete o pedido ao abrir
se a sessão mais recente ainda não tem análise. Perguntar continua possível,
como acompanhamento.

Um único segredo (HMAC-SHA256 do corpo, header `X-Signature-256`) assina os
três caminhos. A conversa no cogniflow é `${userId}:${appId}`, então o agente
tem memória por jogador e jogo: "e no Mirage?" depois de "como fui esta
semana?" funciona.

O que mora em cada lado:

| Onde | O quê |
|---|---|
| `src/lib/cogniflow.ts` | assinatura, envio da pergunta, leitura do corpo assinado |
| `src/lib/analista.ts` | as views que o `data.read` consulta (contrato abaixo) |
| `src/app/api/analises` | POST pergunta / GET lista (a tela consulta enquanto espera) |
| `src/app/api/cogniflow/*` | callback e endpoint de dados, ambos assinados |
| cogniflow `integration-service/app/integrations/webhook/` | o canal genérico |
| cogniflow `orchestration-service/app/tools/data.py` | a capability `data.read` |

## Provisionamento

Ordem: (1) deploy dos dois serviços do cogniflow com o canal `webhook` e o
`data.read` (`cogniflow/deploy-service.sh <serviço>`: build, push com a tag do
commit, nova revisão de task definition em cada serviço ECS, espera o
rollout); (2) segredo e canal; (3) tenant e agente no Postgres; (4) env na
Vercel. Tudo isto foi executado em 2026-09-13 e está no ar; fica registrado
para o próximo tenant ou para reconstruir.

O orchestration entrega o texto final do agente mesmo que o modelo não chame
`messaging.send` — regra do runtime, em qualquer canal; no primeiro turno real
ele consultou os dados, escreveu a resposta e não chamou a ferramenta. O
prompt ainda pede a chamada, mas a entrega não depende dela.

### 1. Segredo de plataforma (`cogniflow/prod`, Secrets Manager)

Gere o segredo compartilhado:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Acrescente ao JSON do segredo, sob `tenants`:

```json
"fragiq": {
  "webhook": {
    "web": {
      "WEBHOOK_SIGNING_SECRET": "<o valor gerado>",
      "WEBHOOK_CALLBACK_URL": "https://<dominio-do-fragiq>/api/cogniflow/callback",
      "WEBHOOK_DATA_URL": "https://<dominio-do-fragiq>/api/cogniflow/data"
    }
  }
}
```

Os dois serviços leem o segredo no boot e cacheiam; depois de editar, reinicie
as tasks ECS (`integration-service`, `integration-inbound-worker`,
`integration-worker`, `orchestration-service`).

### 2. Canal (`cogniflow-channels`, DynamoDB)

```bash
aws dynamodb put-item --table-name cogniflow-channels --item '{
  "pk":             {"S": "webhook:http#fragiq"},
  "tenant_id":      {"S": "fragiq"},
  "connection_key": {"S": "webhook:http#web"},
  "connection_id":  {"S": "web"},
  "provider":       {"S": "webhook"},
  "product":        {"S": "http"},
  "external_id":    {"S": "fragiq"},
  "status":         {"S": "active"}
}'
```

`external_id` é o `client_id` que o FragIQ manda em cada pergunta
(`COGNIFLOW_CLIENT_ID`).

### 3. Tenant e agente (Postgres do orchestration-service)

O banco fica na VPC da plataforma, então o provisionador roda como task avulsa
do ECS com a imagem do orchestration. É idempotente: cria o que falta, mantém
o que existe e nunca substitui uma versão publicada.

```bash
aws ecs run-task --cluster cogniflow --launch-type FARGATE \
  --task-definition orchestration-service \
  --network-configuration "$(aws ecs describe-services --cluster cogniflow \
      --services orchestration-worker --query 'services[0].networkConfiguration' --output json)" \
  --overrides '{"containerOverrides":[{"name":"orchestration-service","command":[
    "python","-m","app.admin.provision",
    "--tenant","fragiq","--name","FragIQ","--connection","web",
    "--agent-slug","analista","--agent-name","Analista do FragIQ",
    "--model","openai:gpt-4o-mini","--monthly-budget-usd","20",
    "--prompt","<o prompt da seção abaixo>"]}]}'
```

A saída (`created: …` / `kept: …`) fica no log group `/ecs/orchestration-service`,
stream `ecs/orchestration-service/<id da task>`. Feito em 2026-09-13; v1 do
prompt publicada.

Versões seguintes do prompt entram pelo painel admin
(`POST /admin/agents/fragiq/analista/versions` com `publish=true`), que copia
capabilities e graph da anterior.

### 4. FragIQ na Vercel

| Variável | Valor |
|---|---|
| `COGNIFLOW_WEBHOOK_URL` | `https://<dominio-do-integration-service>/webhooks/webhook` |
| `COGNIFLOW_CLIENT_ID` | `fragiq` |
| `COGNIFLOW_SIGNING_SECRET` | o mesmo `WEBHOOK_SIGNING_SECRET` do passo 1 |

Sem as três, a seção não aparece e nenhuma rota `/api/cogniflow/*` aceita
nada (404). Depois de setar, redeploy.

## Contrato do `data.read` (o que o agente pode perguntar)

Implementado em `src/lib/analista.ts`; o prompt abaixo descreve o mesmo
contrato para o modelo. **Mudar um sem o outro quebra o analista em
silêncio.** Todo `params` aceita `modo` e `mapa` (ids crus: `competitive`,
`de_dust2`) como recorte por contexto de partida, quando o bot de presença
registrou.

| view | params | devolve |
|---|---|---|
| `resumo` | — | período, painel (12 estatísticas: período × vitalício), leituras, contextos observados, grupos |
| `metricas` | `grupo`, `limite` (≤200), `incluirParadas` | todas as métricas por round, período × vitalício, ordenadas por impacto |
| `serie` | `metrica`*, `denominador`, `calculo` (delta/perHour/ratio/cumulative), `bucket` (raw/day/week/month), `pontos` (≤120) | pontos `{t, valor}` + vitalício |
| `partidas` | `limite` (≤60) | intervalos com jogo, do mais recente: mapa, modo, placar, rounds, kills, deaths, kd, dano/round |
| `mapas` | — | rounds e vitórias por mapa, período × vitalício (só pool antigo) |
| `armas` | `minimoTiros` | kills, tiros, acertos, precisão por arma, período × vitalício |

Erros de uso voltam como 400 `{"error": "..."}` e o cogniflow entrega o texto
ao modelo, que corrige. Teto de resposta: 256 KiB.

## Prompt do agente

```text
Você é o analista do FragIQ, uma plataforma que guarda a série temporal das
estatísticas de Counter-Strike 2 de cada jogador. Você conversa com um
jogador sobre a série DELE, em português do Brasil, em tom direto e
honesto — como um treinador que respeita a inteligência de quem lê.

# Como você trabalha

1. NUNCA responda de memória. Todo número vem de data_read. Comece quase
   toda conversa com data_read(view="resumo") e aprofunde com as outras
   views conforme a pergunta pedir. Uma pergunta típica usa de 1 a 4
   consultas.
2. Responda pelo canal: a resposta final PRECISA ser entregue com
   messaging_send (parâmetro text). Texto que você não enviar por
   messaging_send não chega ao jogador. Uma única mensagem por pergunta.
3. Diga a base amostral. Um K/D de 2,0 em 12 rounds é uma noite boa, não
   uma tendência. Se o período tiver menos de 50 rounds, avise que é
   indício. Se o resumo trouxer leituras com tom "aviso", elas vão na
   resposta.
4. Compare com o vitalício do próprio jogador, não com o mundo. O produto
   é "você contra o seu normal".
5. O que a Steam não mede, você não inventa: não existe ADR do HLTV, KAST,
   rating, clutch, entry. "Dano por round" aqui soma todos os modos e não
   se compara ao ADR de sites de terceiros. Os contadores por mapa não
   cobrem Mirage, Ancient, Anubis e Overpass. total_shots_hit global está
   quebrado; precisão só por arma (view armas).
6. Se a pergunta não for sobre a série (pedido de config, papo aleatório),
   responda curto e volte ao que você sabe fazer.

# Formato da resposta

Texto corrido, no máximo ~150 palavras. Pode usar **negrito** para o número
central e listas com "- " quando houver 2 a 4 itens paralelos. Sem
cabeçalhos, sem tabelas, sem emojis. Números no formato brasileiro (1,21 e
não 1.21). Termine com uma frase acionável quando houver o que fazer.

# data_read: views e parâmetros

Toda view aceita os parâmetros opcionais modo e mapa para recortar por
contexto de partida (ids crus, ex.: modo="competitive", mapa="de_dust2").
Os contextos que existem na série aparecem em resumo.contextosObservados;
não filtre por um que não está lá.

- resumo: sem parâmetros obrigatórios. Devolve periodo (de, ate, rounds,
  partidas, mapa, modo do último intervalo com jogo), painel (K/D, dano por
  round, kills por round, headshot %, vitórias %, MVP por partida, rounds
  por partida, precisão AK-47/M4A1/AWP, kills AK por round, kills com
  granada), cada um com periodo e vitalicio; leituras (frases prontas com
  tom bom/ruim/neutro/aviso); contextosObservados; coletas.
- metricas: grupo ("Geral", "Por arma", "Por mapa", "Última partida"),
  limite (padrão 40, máx 200), incluirParadas (true para ver contadores que
  não se moveram). Cada linha: chave, nome, periodo e vitalicio por round,
  variacao (fração: 0.25 = +25%), totalNoPeriodo, relevante.
- serie: metrica (obrigatória, ex.: total_kills), denominador (para
  razão, ex.: total_deaths), calculo (delta | perHour | ratio |
  cumulative; padrão ratio se houver denominador, senão delta), bucket
  (raw | day | week | month; padrão day), pontos (padrão 30, máx 120).
  Devolve pontos {t, valor} do mais antigo ao mais recente e vitalicio.
- partidas: limite (padrão 15, máx 60). Cada intervalo com jogo, do mais
  recente ao mais antigo: de, ate, mapa, modo, placar (quando o bot
  observou), minutosJogados, rounds, partidas, vitorias, kills, deaths,
  headshots, dano, mvps, kd, danoPorRound. Sem bot, uma linha é uma
  sessão entre duas coletas, não uma partida.
- mapas: rounds, roundsGanhos e taxaDeVitoria por mapa, periodo e
  vitalicio. roundsForaDosMapasContados diz quantos rounds do período
  caíram em mapas que a Steam não conta.
- armas: minimoTiros (padrão 1). Por arma: kills, tiros, acertos, precisao
  (%), periodo e vitalicio.

Chaves de métrica seguem o schema da Steam: total_kills, total_deaths,
total_kills_headshot, total_damage_done, total_rounds_played,
total_matches_played, total_matches_won, total_mvps, total_kills_<arma>,
total_shots_<arma>, total_hits_<arma>, total_rounds_map_<mapa>,
total_wins_map_<mapa>. Se errar uma chave, a recusa diz como listar.
```

## Testando sem a Vercel

Com o Next rodando local e as três variáveis apontando para um receptor
qualquer, os três caminhos se testam com `curl` assinado — o corpo assinado
com o mesmo segredo em Python ou Node produz o mesmo header. O que checar:

- `POST /api/analises` responde 202 e o receptor recebe `client_id`,
  `conversation_id`, `sender`, `message`, `context` com `X-Signature-256`
  válida; uma segunda pergunta enquanto a primeira está aberta é 409.
- `POST /api/cogniflow/callback` com `type=acknowledgement` muda o status
  para ACKNOWLEDGED; com `type=message` grava a resposta; repetir o mesmo
  `id` devolve `duplicate: true` sem escrever.
- `POST /api/cogniflow/data` com `view=resumo` devolve o JSON; view errada é
  400 com mensagem; `context` de outro usuário é 403; assinatura errada é 403.
