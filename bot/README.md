# Bot de presença

Processo separado que fica online na Steam como amigo dos usuários e avisa a
aplicação quando alguém termina de jogar CS2.

## Por que existe

A coleta agendada roda uma vez por dia e captura o que houver. Se a pessoa
jogou cinco partidas entre duas execuções, a série ganha um ponto só — a
diferença agregada, não a evolução dentro da sessão.

O bot troca isso por coleta reativa: percebe o fim de cada partida — o rich
presence perde o mapa quando a pessoa volta ao lobby, ou ela fecha o jogo —
e avisa a aplicação naquele momento. Como as estatísticas do CS2 são gravadas
ao fim da partida, isso rende um ponto por partida sem o usuário clicar em
nada.

Como efeito colateral, a amizade também destrava perfis marcados como
"somente amigos" — a Web API respeita a privacidade em relação ao dono da
chave, e é a maior causa de dashboard vazio.

## O bot é um sensor; a memória é do site

O aviso (`POST /api/sync/steam-event`) só grava um pedido de coleta, com o
mapa, modo e placar observados. A Steam demora a publicar (medido: mais de
5 min depois de sair do jogo), então o site espera 90 s e tenta; se as stats
vieram iguais, tenta de novo em 2, 4, 8 e 16 min; depois desiste — e, se a
pessoa nunca teve um ponto, avisa no chat que os "Detalhes do jogo" estão
privados. Tudo isso vive na tabela `pending_captures`. O bot só chama
`GET /api/bot/tick` a cada 30 s (`BOT_TICK_MS`) para o site processar o que
venceu: reiniciar o bot não perde nada, e o cron processa o mesmo balde.

Além do tick, o bot busca duas filas do site: mensagens de chat
(`/api/bot/outbox`) e share codes para perguntar ao Game Coordinator
(`/api/bot/partidas`).

## Por que não roda na Vercel

Um cliente Steam mantém conexão TCP persistente. Serverless não comporta.
Precisa de um host sempre ligado: Railway, Fly.io ou um VPS pequeno.

## EC2

Roda numa `t2.micro` (free tier) em `us-east-1`, instância `fragiq-bot`,
Amazon Linux 2023 com Docker. O Fly ficou como plano B: o `fly.toml` continua
válido, mas o trial acabou antes do primeiro deploy.

- Acesso: `ssh -i ~/.ssh/fragiq-bot.pem ec2-user@<ip>`. O security group só
  abre a 22 para o IP de quem criou a instância; mudou de rede, atualize a
  regra.
- Não há `.env` no servidor. O refresh token e o segredo do webhook vivem no
  Secrets Manager (`fragiq/bot`, JSON com as mesmas chaves das variáveis);
  a instância tem a role `fragiq-bot-ec2`, que só pode ler e escrever esse
  segredo. O bot lê no boot e grava de volta quando o steam-user renova o
  token — sem isso o próximo reboot logaria com token morto.
- Variáveis não sensíveis (conta, URL do webhook, grace) ficam no
  `/opt/fragiq-bot/run.sh`, que reconstrói a imagem e sobe o container com
  `--restart unless-stopped`. `./deploy.sh` faz rsync do código e chama ele.
- Para trocar um valor do segredo: `aws secretsmanager put-secret-value
  --secret-id fragiq/bot --secret-string '{...}'` e `sudo docker restart
  fragiq-bot`.
- Logs: `sudo docker logs -f fragiq-bot`.

## Primeiro login

A conta precisa ser **dedicada**. Ela ficará amiga de desconhecidos, e um
comprometimento numa conta pessoal levaria inventário e trades junto.

```bash
cp .env.example .env      # preencha ACCOUNT e PASSWORD
npm install
npm start                 # confirme o Steam Guard quando pedir
```

O steam-user imprime um refresh token. Guarde-o em
`STEAM_BOT_REFRESH_TOKEN`, apague `STEAM_BOT_PASSWORD` e reinicie — daí em
diante ele reconecta sozinho.

## Limite de amigos

O teto é 250 mais 5 por nível da conta — uma conta nova para em torno de 300,
não em 1.000 como se costuma dizer. Medido: a conta recém-criada mostrava
"1 / 300".

Isso antecipa o momento de precisar de um segundo bot. Subir o nível custa
dinheiro (é preciso comprar itens ou jogos), então na prática o caminho é
sharding: várias contas, cada uma responsável por uma faixa de SteamID.

## Experimento pendente

```bash
npm run probe -- <SteamID64>
```

Com o alvo **dentro de uma partida**, imprime os campos de rich presence que
o CS2 publica e responde se o mapa está entre eles. Se estiver, dá para
rastrear mapa sem parsear demo — o que contornaria a ausência de Mirage,
Ancient, Anubis e Overpass nos contadores da Steam.

## Mensagens no chat

O site enfileira a análise de cada sessão em `GET /api/bot/outbox` (mesmo
Bearer do webhook). O bot busca a cada 20 s (`BOT_OUTBOX_POLL_MS`), entrega
por `client.chat.sendFriendMessage` a quem é amigo e confirma em
`POST /api/bot/outbox` com `SENT` ou `FAILED`. Quem não é amigo não recebe
— o chat da Steam só existe entre amigos. `FRAGIQ_OUTBOX_URL` sobrescreve a
URL, que por padrão deriva de `FRAGIQ_WEBHOOK_URL`.
