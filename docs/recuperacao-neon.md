# Recuperar o histórico do Neon

Em 2026-09-23 a produção saiu do Neon (cota estourada, recusando até
leitura) e foi para o Supabase. O site voltou, mas vazio: o histórico
ficou no Neon. Este é o passo a passo para trazê-lo sem pisar no que o
site gravou desde a troca.

Os dois scripts estão em `scripts/recuperacao/` e foram ensaiados num
Postgres local com um Neon e um Supabase de mentira (jogador que voltou
depois da troca, jogador que só existe no Neon, jogador novo, partida
repetida nos dois lados, mensagem presa na fila). O merge roda em modo
ensaio por padrão: faz tudo, mostra as contagens e desfaz.

## O que pode colidir

Quem entrou de novo depois da troca tem **duas** linhas de usuário: a
antiga no Neon, dona do histórico, e uma nova no Supabase, com outro id e
o mesmo `steamId`. Todo o resto decorre disso.

- **Fica o id do Neon.** A linha nova é renomeada para ele. Toda FK do
  schema é `ON UPDATE CASCADE`, então tudo o que já apontava para a linha
  nova vai junto.
- Algumas colunas guardam id de usuário **sem FK**, e o cascade não chega
  nelas: `eventos.userId`, `bot_observations.userId`,
  `matches.descobertaPorId`. O script atualiza essas à mão.
- `user_games` colide do mesmo jeito, por `(userId, gameAppId)`, e é
  resolvido do mesmo jeito.
- `sessions` e `insights` não são copiadas: guardam ids de snapshots e de
  `user_games` sem FK. Depois do merge, `recompute:sessions` e
  `recompute:insights` refazem as duas a partir dos fatos, e o intervalo que
  atravessa a queda vira uma sessão só.

| Tabela | Regra |
|---|---|
| `users` | Perfil (nome, avatar, amizade com o bot, inventário) fica o do Supabase, que é a leitura de agora. O que a pessoa configurou à mão (`perfilPublico`, `curvaVisivel`, `avisoSteam`) vem do Neon. A corrente de share codes vem do Neon, a menos que a pessoa já tenha colado o código de novo. `createdAt` fica o mais antigo. |
| `matches`, `match_demos` | Fica a do Neon quando ela está `DONE` e a do Supabase não. O GC esquece em uns 30 dias e a Valve apaga as demos, então o Neon pode ser o único que ainda tem. |
| `participants` | Fica a do Neon (é a inscrição original). |
| `bot_amigos` | `desde` mais antigo, maior número de convites, `saiuEm` do Supabase. |
| `steam_messages` | As que ficaram `PENDING` no Neon entram como `FAILED`, para o bot não mandar agora uma mensagem de dias atrás. |
| `pending_captures` | Não entram: são capturas que venceram antes da queda. |
| `bot_status`, `_prisma_migrations` | Não entram: o Supabase já tem o seu. |
| resto | Entra tudo. Em conflito de chave fica a linha do Supabase. |

`users.steamAuthCode` é cifrado com uma chave derivada do `AUTH_SECRET`
(`src/lib/partidas.ts`). Se o `AUTH_SECRET` do segredo
`cogniflow/tenants/fragiq` não mudou na troca, os códigos antigos continuam
abrindo.

## Passo a passo

### 1. Fazer o Neon responder de novo

Os dados não se perderam: o branch do Neon está intacto, só o compute
recusa conexão porque a cota do plano acabou. Duas saídas:

1. **Subir o projeto do Neon para um plano pago por um dia** (recomendado).
   O limite cai na hora, você faz o passo 2 e depois volta para o free ou
   apaga o projeto.
2. **Esperar a cota zerar** no começo do próximo ciclo de cobrança (a data
   está na página de billing do Neon). Não custa nada, mas o histórico
   fica fora do site até lá.

Restaurar um branch não ajuda: os dados não estão danificados, e o restore
também precisa de compute.

### 2. Dump do Neon (só leitura)

Use a URL **direta** (sem `-pooler` no host) e um `pg_dump` pelo menos tão
novo quanto o Postgres do Neon.

```bash
pg_dump "$NEON_DIRECT_URL" --data-only --format=custom --no-owner --no-privileges \
  -n public --exclude-table=_prisma_migrations -f neon-data.dump

# em que migration o Neon estava (tem que ser a mesma do Supabase)
psql "$NEON_DIRECT_URL" -c 'select migration_name from _prisma_migrations order by finished_at desc limit 3'
```

Depois disso o Neon pode voltar a dormir. Guarde o `neon-data.dump` fora
do repositório: ele tem Steam IDs e códigos de autenticação cifrados.

### 3. Backup do Supabase como está agora

```bash
pg_dump "$SUPABASE_DIRECT_URL" --format=custom --no-owner -n public -f supabase-antes-do-merge.dump
```

É deste arquivo, e não do backup diário, que se volta se algo der errado.
Se a sua rede não tiver IPv6, a conexão direta do Supabase não responde:
use a URL do *session pooler* (porta 5432) no lugar.

### 4. Preparar o schema `neon_import`

O `pg_restore` devolve as linhas ao schema de onde vieram (`public`), o que
bateria de frente com o site. O script restaura num Postgres descartável
(o do `docker compose up -d` serve), renomeia o schema e despeja só ele:

```bash
docker compose up -d
scripts/recuperacao/preparar-neon-import.sh neon-data.dump \
  "postgresql://fragiq:fragiq@localhost:5433/neon_rascunho" > neon_import.sql
```

Ele mostra quantas linhas cada tabela tinha no Neon. Se o Neon estiver
numa migration diferente da do repositório, é aqui que o restore reclama,
e não em produção.

### 5. Ensaiar, e depois gravar

```bash
psql "$SUPABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -f neon_import.sql
psql "$SUPABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/recuperacao/merge-neon.sql
```

A primeira linha cria o schema `neon_import` ao lado do `public`, sem
tocar em nada do site. A segunda é o ensaio: roda o merge inteiro numa
transação, mostra quantos jogadores voltaram depois da troca, quantas
linhas cada tabela trouxe e a conferência (toda linha do Neon precisa
estar em `public` pela chave natural), e desfaz. Se a conferência acusar
falta, o script aborta sozinho.

Com o ensaio limpo, pause os crons na Vercel por alguns minutos e grave:

```bash
psql "$SUPABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -v aplicar=1 -f scripts/recuperacao/merge-neon.sql
DATABASE_URL="$SUPABASE_DIRECT_URL" npm run recompute:sessions
DATABASE_URL="$SUPABASE_DIRECT_URL" npm run recompute:insights
```

O merge trava `users`, `user_games` e `matches` contra escrita enquanto
roda, e pode ser rodado de novo sem duplicar nada.

### 6. Conferir e limpar

- Abrir `/p/<steamId>` de dois ou três jogadores que voltaram depois da
  troca: a curva tem que vir de antes de 2026-09-23 sem buraco, e sem
  partida repetida.
- No painel, o total de jogadores tem que ser o do Neon mais os novos, e
  não a soma dos dois bancos.
- Religar os crons.
- `DROP SCHEMA neon_import CASCADE` no Supabase. Guardar os dois dumps por
  umas semanas e depois apagar.
- Voltar o Neon para o free ou apagar o projeto, e tirar da Vercel as
  variáveis que a integração do Neon deixou. Em especial
  `DATABASE_URL_UNPOOLED`: sem `DIRECT_DATABASE_URL`, o `prisma.config.ts`
  prefere ela ao `DATABASE_URL`, e as migrations do build iriam para o Neon.
