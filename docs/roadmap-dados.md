# Qual caminho de dados atacar primeiro

Decisão de sequência sobre os cinco caminhos mapeados em
[dados-profundos.md](./dados-profundos.md).

## A resposta curta

**Nenhum deles, ainda.** E quando chegar a hora, a ordem é 2 → 4 → 5 → 3.

O resto deste documento explica por quê, e qual medição transforma a
primeira decisão em algo baseado em dado e não em palpite.

---

## Por que nenhum ainda

O produto tem uma tese: *a média vitalícia esconde a forma atual, e a série
temporal revela*. Hoje essa tese está **implementada mas não demonstrada** —
cada usuário tem uma coleta. Com um ponto não existe série, e sem série o
diferencial não existe na tela.

O que falta não é métrica. São duas coisas mais chatas:

1. **Continuidade.** O cron nunca rodou em produção — a primeira execução
   é amanhã às 05:00 UTC. Até que se prove que ele roda todo dia sem falhar,
   toda a proposta de valor é teórica.
2. **Usuários jogando.** A série de um jogador ganha forma em semanas, não
   em dias.

Adicionar ADR e KAST agora resolveria zero desses dois problemas. Pior:
aumentaria a superfície de coisa quebrando enquanto o mecanismo central
ainda não tem prova de vida.

**Marco anterior a tudo:** uma dezena de betas com 3+ semanas de coleta
contínua. Se nesse ponto a série temporal não estiver dizendo nada que o
csstats já não diga, o problema é a tese — e nenhum dos cinco caminhos
conserta uma tese errada.

---

## A ordem, quando a hora chegar

### 1º — Caminho 2: bot amigo

**Por que primeiro:** é o único que aumenta a *cobertura* em vez da
*profundidade*. Perfil privado devolve biblioteca vazia, e um usuário com
dashboard vazio está perdido antes de ver qualquer gráfico. Nenhum outro
caminho vale nada para esse usuário — não adianta ter ADR se a coleta
devolve `[]`.

Também é o mais barato: uma conta bot, um processo que aceita amizades, um
passo de onboarding. **Zero mudança na coleta** — a mesma chamada de API
simplesmente passa a responder.

**Antes de construir, meça.** O dado já existe no banco: um sync que
encontrou perfil restrito grava `gamesSeen = 0`.

```sql
-- Colunas em camelCase: o schema mapeia o nome da tabela, nao o dos campos.
SELECT
  count(*) FILTER (WHERE s."gamesSeen" = 0) AS vazios,
  count(*)                                  AS total
FROM sync_runs s
JOIN (
  SELECT "userId", max("startedAt") AS ultimo
  FROM sync_runs
  WHERE status = 'SUCCESS'
  GROUP BY "userId"
) u ON u."userId" = s."userId" AND u.ultimo = s."startedAt";
```

Se `vazios/total` for baixo, o bot é esforço mal gasto e a ordem muda: pule
direto para o caminho 4.

### 2º — Caminho 4: share codes e demos

**Em pé desde 18/09/2026** ([demos.md](./demos.md)): o bot baixa e reduz a
demo, o site calcula ADR, KAST, aberturas, trocas, clutches, utilitário e
zonas por jogador. O parágrafo do custo abaixo foi escrito antes e ficou
menor do que previa: o parser leva 3 s e o processo inteiro cabe no bot
que já existia. O que continua verdadeiro é o "validar a demanda".

**Por que segundo:** é o moat de verdade. ADR e KAST sozinhos são paridade
com três concorrentes; ADR e KAST **em série temporal com consulta montada
pelo usuário** não existe em lugar nenhum. O valor vem do cruzamento com o
motor que já está pronto, não das métricas em si.

**Por que não primeiro:** é o mais caro de longe. Exige UX de dois códigos
colados, caminhamento de trilha com expiração de 30 dias, download de ~100 MB
por partida, workers fora da serverless, e storage. Semanas de trabalho e
custo de infraestrutura recorrente — para um produto que ainda não provou
que alguém volta na segunda semana.

**Atalho a considerar antes:** a API pública do csrep.gg entrega essas
métricas já calculadas. Integrar custa dias em vez de semanas e permite
**validar a demanda antes de construir**: se os betas não usarem as métricas
profundas quando elas aparecerem prontas, não valia construir a fila.

O risco é óbvio e precisa ser dito: csrep é concorrente direto. Pode não
vender, pode cortar depois, e a dependência entra no caminho crítico do
produto. Trate como instrumento de validação com prazo, não como
arquitetura final.

### 3º — Caminho 5: extensão de GCPD

**Por que terceiro:** cobre unranked, Wingman e scrimmage, que share code
não alcança, e abre 20 abas de dados. Mas o problema aqui é tanto de
distribuição quanto técnico: exige o usuário instalar uma extensão e a
extensão passar pela revisão da Chrome Web Store.

Pedir instalação de extensão a quem ainda não tem hábito com o produto é
queimar o pouco de disposição que ele tem. Isso vem depois de o produto ser
algo que a pessoa abre sozinha.

### 4º — Caminho 3: bot no Game Coordinator

**Ficou sem motivo em 18/09/2026:** a demo de cada partida traz o
`rank_update` dos dez jogadores — o CS Rating antes e depois — e o caminho
4 já a lê ([demos.md](./demos.md) §2). O que segue abaixo é o raciocínio
de antes, mantido pelo registro.

**Por que último:** o único item aqui é o CS Rating do Premier ao longo do
tempo — e essa é exatamente **a única coisa que o csstats já graficamente
bem**. Ou seja, alto custo para chegar à paridade no ponto onde o
concorrente é forte.

Some-se a isso que é o caminho menos verificado: a documentação sugere que o
alvo precisa estar jogando no momento da consulta, o que tornaria a coleta
oportunista e a série cheia de buracos.

**Se for fazer, faça o experimento antes do plano.** Uma conta bot, uma
consulta, uma pergunta: o CS Rating vem, e sob quais condições? Isso é uma
tarde de trabalho e decide se o caminho existe.

---

## O que não entra em ordem nenhuma

**Login por credencial ou QR.** Viola os Termos de Uso da Web API da Valve e
coloca sob sua guarda uma credencial que move skins. Ver
[dados-profundos.md](./dados-profundos.md#o-que-fica-de-fora-e-por-quê).

---

## Dívidas técnicas que vencem antes disso tudo

Coisas pequenas que o crescimento transforma em incidente:

- ~~**Agrupar `GetPlayerSummaries`.**~~ Feito em 25/09: o cron lê os perfis
  do lote numa chamada só e entrega cada um a `syncUser` (`opcoes.perfil`).
- **Cron do plano Hobby.** 1×/dia com 60s de função dá ~25 usuários/dia. O
  campo `skipped` na resposta do cron avisa quando a fila deixa de ser
  vazada — é o gatilho para migrar para Pro ou para um worker.
- **Limites por IP não documentados.** Como toda a coleta sai de um IP da
  Vercel compartilhado, um `429` inesperado é plausível bem antes dos 100k
  diários. Desde 25/09 toda recusa deixa `steam.recusa` no diário
  (`/admin`), com o status do cogniflow e o da Steam.
