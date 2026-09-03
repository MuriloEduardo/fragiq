# Bot de presença

Processo separado que fica online na Steam como amigo dos usuários e avisa a
aplicação quando alguém termina de jogar CS2.

## Por que existe

A coleta agendada roda uma vez por dia e captura o que houver. Se a pessoa
jogou cinco partidas entre duas execuções, a série ganha um ponto só — a
diferença agregada, não a evolução dentro da sessão.

O bot troca isso por coleta reativa: percebe o fim da sessão e dispara o sync
naquele momento. Como as estatísticas do CS2 são gravadas ao fim da partida,
isso rende aproximadamente um ponto por sessão sem o usuário clicar em nada.

Como efeito colateral, a amizade também destrava perfis marcados como
"somente amigos" — a Web API respeita a privacidade em relação ao dono da
chave, e é a maior causa de dashboard vazio.

## Por que não roda na Vercel

Um cliente Steam mantém conexão TCP persistente. Serverless não comporta.
Precisa de um host sempre ligado: Railway, Fly.io ou um VPS pequeno.

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
