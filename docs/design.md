# FragIQ — plano de design da área do jogo

Escopo: as abas de `/games/[appId]` (Resumo, Estatísticas, Sessões, Partidas,
Métricas, Análises, `painel/[key]`, `metricas/[key]`), o submenu de modo, os
cartões com gráfico, o cartão do analista e os avisos. Não muda identidade
(escuro, laranja, números em mono, rótulos HUD); muda o que cada tela diz e
em que ordem.

Evidência: capturas de produção de 14/09/2026, conta real com 22 coletas, 7
sessões, 3 com modo (1 Premier, 2 Competitivo). Referências `[S0]…[S9]`
abaixo apontam para `screenshot-1789424988689-0.jpg` … `-9.jpg`.

Vocabulário usado neste documento:

- **coleta** — um snapshot dos contadores vitalícios da Steam.
- **sessão** — o delta entre duas coletas em que `total_rounds_played` subiu.
- **normal** — a referência contra a qual uma sessão é lida.
- **lente** — o modo de jogo aplicado como destaque, não como corte.

---

## 1. Diagnóstico

Doze problemas, do mais grave ao mais cosmético. Cada um aponta a captura e
o trecho de código que o produz.

### D1. A lente de modo esvazia os gráficos `[S7]`

Em "Premier" (1 sessão) os doze tiles de Estatísticas perdem sparkline e
delta: sobra um número solto por tile. Causa: `StatPanel` passa
`filter: { mode }` para `buildSeries`, que descarta todo par fora do modo;
sobra 1 ponto e `Sparkline` exige 2. O mesmo filtro entra em
`lifetimeValue`, que com filtro vira `accumulatedValue` sobre o mesmo único
par — a referência é a própria sessão, então o delta é 0 e o chip some.
Este é o rebaixamento que o dono apontou: os cartões que tinham gráfico
ficaram sem gráfico.

### D2. A sessão é comparada consigo mesma `[S5]`

No hero em modo Premier os três números mostram `0%` e a linha de referência
diz "no Premier 0,65" — o mesmo 0,65 do número grande. `vitaliciosDoHero`
com filtro acumula as sessões do modo, e com uma sessão o acumulado é ela.
`0%` aqui parece "igual ao normal" e é, na verdade, "não existe normal".

### D3. O cartão do analista repete o hero `[S0] [S5]`

Logo abaixo do hero (três números grandes com delta) vem o cartão de
análise com **os mesmos três números, os mesmos chips e os mesmos deltas**
(`Numeros` em `analista.tsx`). Na primeira dobra do Resumo o K/D 0,57
aparece duas vezes em 30 px de fonte. Dois `glow` na mesma tela, contra a
regra do próprio `globals.css` ("para um elemento por tela").

### D4. A heurística de manchete promove um parágrafo `[S5]`

"Na sessão de 66 rounds em 3 partidas, aqui estão as mudanças em relação ao
seu desempenho" virou título de 24 px. `lerAnalise` promove qualquer primeiro
bloco com ≤ 140 caracteres e sem quebra de linha. Não há marca no texto que
diga "isto é manchete"; a regra adivinha, e erra quando o modelo escreve uma
introdução curta.

### D5. O mesmo número aparece quatro vezes na mesma página `[S0] [S1] [S3]`

K/D 0,57 no Resumo: hero → cartão do analista → texto do analista ("K/D
ainda não mostrou um avanço") → Leituras ("0,57 · K/D no período contra 0,7
de vitalício — -19%") → tile "0,57 / 0,70 -19%". Headshot 52,9% idem. A
página inteira é o mesmo dado em cinco roupas. O usuário não sabe qual
olhar, e por isso "os dados não estão claros".

### D6. Os sparklines carregam a mesma forma, isto é, nenhuma informação `[S3] [S6]`

Nos tiles K/D, Dano por round e Kills por round a linha é idêntica: um pico
(a sessão de 6,30 de K/D, amostra minúscula) e o resto achatado. O domínio
vertical inclui o outlier sem peso por amostra. "Vitórias" desenha uma
serra 0 % / 100 % — taxa de vitória por sessão de 1–2 partidas é binária e
não é uma série. Não há indicação de quantos pontos nem de que período.

### D7. Um outlier achata o gráfico grande `[S8] [S9]`

`painel/kd`: eixo 0–6,30 por causa de uma sessão; as outras 20 vivem entre
0,36 e 1,00 como uma linha reta no rodapé. Abaixo, uma lista "data → valor"
que repete o gráfico com menos informação (sem rounds, sem modo, sem delta).
Três cartões "agora / vitalício / contra o seu normal" — o terceiro é um
chip de delta inflado a 30 px.

### D8. O submenu de modo parece navegação e funciona como filtro global `[S0]`

Pílulas "Tudo · Premier 1 · Competitivo 2" numa segunda barra sob as abas.
Os contadores 1 e 2 são um convite a telas vazias. Em "Tudo", nada indica que
19 das 22 coletas não têm modo — o número "mistura tudo" sem dizer.

### D9. Semântica de cor inconsistente entre componentes

O laranja (`--accent`) é marca, aba ativa, linha do gráfico **e** "subiu".
Em `StatPanel` subir é laranja e cair é cinza; em `Leituras` "ruim" é
`--danger` e "bom" é laranja; no hero cair é `bg-surface-2`. Vitórias
`-100%` sai em cinza. Não existe token para "bom" nem para "ruim", e nenhum
componente sabe se subir é bom (deaths, rounds por partida) — a direção é
sempre "mais é melhor".

### D10. Formatação do mesmo valor diverge entre componentes

Headshot: `52,9%` no hero, `53%` no cartão do analista (`toFixed(0)`),
`52,9%` no tile. Dano por round: `74` no hero, `74,063` no texto do analista.
Cada componente tem seu próprio `fmt`; há `"pt-BR"` literal em oito lugares
e `FUSO_BR` fixo — i18n vai quebrar tudo de uma vez.

### D11. Estados vazios são caixas de texto diferentes entre si, em jargão

"Nenhuma sessão de Premier ainda.", "Sem pontos para desenhar. Modos
derivados precisam de ao menos duas coletas com partidas entre elas.",
"Precisa de duas coletas com partidas entre elas.", "O analista entra a
partir da segunda coleta com partidas." — quatro textos para a mesma
situação, com palavras internas ("modos derivados", "coletas", "pares").
Nenhum diz o que fazer.

### D12. O hero mistura dado e ação, e a linha de contexto confunde

"14 de set 01:45 → 14 de set 19:17" é o intervalo entre coletas, não o
tempo jogado: 17 h para 2 partidas. Abaixo dos números, a régua "Essa sessão
foi… Competitivo Premier Casual Deathmatch Wingman · o bot marca sozinho…"
disputa atenção com os números. E o texto das Leituras ("Cada round pesa
3,1 % de tudo que está aqui embaixo…") é um parágrafo onde cabia um chip.

---

## 2. Princípios

1. **Um número, um lugar.** Cada valor aparece grande uma vez por tela; nas
   outras vezes é referência pequena ou não aparece.
2. **A série é inteira; o modo é uma lente.** Nenhum gráfico perde pontos
   por causa do modo — o modo destaca, escolhe a última sessão e a
   referência, e diz quantas sessões cobre.
3. **Referência honesta ou nenhuma.** O normal nunca inclui a sessão que
   está sendo lida e nunca tem menos de N sessões; sem isso o chip diz
   "sem base", nunca `0%`.
4. **Escassez declarada.** Todo gráfico diz quantos pontos tem e desde
   quando; abaixo do mínimo mostra pontos em vez de linha; um bloco vazio
   sempre nomeia o que falta e o próximo passo.
5. **Rótulo antes de frase.** Copy curto, baseado em rótulo, número e data
   formatados por locale; se um bloco precisa de um parágrafo para ser
   entendido, o bloco está errado.

---

## 3. Sistema

### 3.1 Tokens

**Espaçamento** (base 4): `4 · 8 · 12 · 16 · 24 · 32 · 48`. Dentro do cartão
`16` (mobile) / `20` (desktop); entre cartões `12`; entre seções `40`.

**Raio**: cartão `16`; bloco interno / chip `8`; pílula `999`.

**Tipografia** (a fonte já existe: Geist Sans + Geist Mono):

| Papel | Classe | Tamanho / peso | Uso |
|---|---|---|---|
| `hud` | existente | 11 mono, tracking 0,12em, caixa alta | rótulo de cartão, cabeçalho de tabela, título de seção |
| `body` | `text-sm` | 14 / 400 | texto corrido, células |
| `body-lg` | `text-[15px]` | 15 / 400 | corpo da análise |
| `num-sm` | `num text-sm` | 14 mono | células numéricas, referência |
| `num-md` | `num text-xl` | 20 mono 600 | linha de destaque, painel mobile |
| `num-lg` | `num text-3xl` | 30 mono 600 | número do tile |
| `num-xl` | `num text-5xl` | 48 mono 600 (mobile 32) | hero |
| `title` | `text-xl font-semibold tracking-tight` | 20 / 600 | manchete da análise, título de página |

Regra: **nenhum número grande fora de `num`**; nenhum `text-[11px]` ou
`text-[10px]` solto — é `hud` ou `text-xs`.

**Cores** — acrescentar papéis semânticos ao `:root` e ao `@theme inline`,
sem tocar nos existentes:

```
--good:       #4fd1a5     /* mint frio: contrasta com o laranja, 8,9:1 sobre --surface */
--good-soft:  #0f2b22
--bad:        var(--danger)   /* #ff7b6e, já existe */
--bad-soft:   #331a17
--neutral:    var(--ink-muted)
--warn:       já existe
--accent:     marca e atenção — aba ativa, lente ativa, linha principal do gráfico, ação
```

Regra dura: **`--accent` nunca codifica valência.** Subiu/caiu é
`--good`/`--bad`; laranja é "olhe aqui", não "bom".

Cada estatística declara a direção:

```ts
melhorQuando: "sobe" | "desce" | "nenhuma"
// kd, adr, kpr, hs, winrate, mvp, acc_*: "sobe"
// deaths (na Métricas), rounds por partida: "nenhuma"
```

`nenhuma` pinta o chip em `--neutral` com sinal, sem verde/vermelho.

### 3.2 Anatomia do cartão de estatística

Um componente só (`stat-card.tsx`) serve o tile de Estatísticas, o tile do
Resumo e o bloco-resumo de `painel/[key]`. Seis zonas, todas opcionais
exceto rótulo e número:

```
┌─────────────────────────────────────────────┐
│ K/D                              ● Premier  │  1 rótulo (hud) + chip da lente (só quando lente ≠ Tudo)
│                                             │
│ 0,57  ▼ 19%                                 │  2 número (num-lg) + chip de delta
│ normal 0,70 · 22 sessões                    │  3 linha de referência (num-sm, ink-faint)
│                                             │
│ ┄┄┄┄┄┄┄┄┄●┄┄┄┄┄┄┄┄○┄┄┄┄┄┄●┄┄┄┄┄┄┄┄┄┄┄┄┄┄●   │  4 área do gráfico (h 40; sparkline + baseline)
│                                             │
│ 11 sessões · 12 dias                     ↗  │  5 rodapé: cobertura + seta de navegação
└─────────────────────────────────────────────┘
```

- **1 Rótulo**: `stat.label`. O chip de lente só aparece quando a lente
  está ativa e diz de qual modo é o número grande.
- **2 Número**: a última sessão (da lente, se ativa; senão a última de
  qualquer modo). Formatado por `formatarStat(key, valor, locale)` — um
  formatador por `key`, importado por todo componente (resolve D10).
- **3 Referência**: `normal {valor} · {n} sessões` ou
  `vitalício {valor}` ou `sem base · 1 de 5 sessões`. É a única linha que
  explica o chip; nunca mais de uma.
- **4 Gráfico**: regras em 3.3. Nunca vazio: se não há pontos, a área mostra
  a baseline tracejada com o rótulo `sem sessões` centralizado.
- **5 Rodapé**: `{n} sessões · {desde}`; a seta indica que o cartão é link.
  Em estado degradado o rodapé é a explicação: `só vitalício · jogue uma
  partida`, `sem uso no período`.

O cartão inteiro é `<a>` para `painel/[key]` (mantém o comportamento atual);
`hover:ring-accent/50` permanece.

### 3.3 Regras de gráfico

Os gráficos continuam **SVG à mão, renderizados no servidor** (`sparkline.tsx`,
`serie-chart.tsx`). Recharts está no `package.json` mas não é usado em
`src/`; não introduzir — hover e seleção de ponto são resolvidos com CSS
(`:hover`/`:focus-visible` em `<g tabindex="0">`) sem JavaScript, o que
funciona no toque e no teclado.

**Entrada de um gráfico** deixa de ser `number[]` e passa a ser
`PontoSerie[]`:

```ts
type PontoSerie = {
  t: number;           // fim da sessão
  valor: number;
  rounds: number;      // peso / amostra (partidas para stats por partida)
  modo: string | null; // para a lente
  sessaoId: string | null;
};
```

**Mínimos de pontos**

| Pontos elegíveis | Sparkline | Gráfico grande |
|---|---|---|
| 0 | baseline tracejada + `sem sessões` | estado E4 (3.5) |
| 1 | um ponto cheio sobre a baseline | um ponto rotulado + baseline |
| 2 | dois pontos e o traço entre eles | idem, rotulados |
| ≥ 3 | linha | linha |

**Amostra mínima por ponto**: um ponto com `rounds < MIN_ROUNDS` (padrão
10; `winrate`/`mvp`: `partidas < 3`) é **fraco**: desenhado vazado
(`fill: none; stroke: ink-faint`), excluído do cálculo de domínio e do
normal, mas presente na linha. É o que impede o 6,30 de 7 rounds de mandar
no eixo.

**Domínio vertical (anti-outlier)**

```
elegíveis = pontos fortes
m   = mediana(elegíveis.valor)
MAD = mediana(|v − m|)   ; se 0 → max(0,1·|m|, menor unidade da stat)
dentro = elegíveis com |v − m| ≤ 3·MAD
domínio = [min(dentro ∪ {normal}), max(dentro ∪ {normal})] com 10 % de folga
stats em %: domínio recortado a [0, 100]
```

Pontos fora do domínio são **grampeados na borda** e desenhados com um
marcador distinto (triângulo `▲`/`▼` de 6 px em `ink-faint`). No gráfico
grande o marcador recebe rótulo com o valor real e a amostra:
`6,30 ▲ · 7 rounds`. No sparkline, sem rótulo (o tile é resumo). Nunca
esconder o ponto: grampear é honesto, omitir não.

**Stats por partida (`winrate`, `mvp`, `rounds`)**: o valor de cada ponto é
a razão **móvel das últimas 5 sessões** (somatório dos deltas), não a razão
da sessão isolada. Rodapé do tile: `média móvel · 5 sessões`. Resolve a
serra 0/100 de D6.

**Baseline**: a linha do normal, tracejada `4 4` em `ink-faint`, sempre
dentro do domínio. No gráfico grande, rótulo na ponta direita:
`normal 0,70`. Se o normal é o vitalício, `vitalício 0,70`. Sem normal, sem
linha.

**Lente de modo no gráfico**: a linha inteira é desenhada em `--line`
(cinza) quando a lente está ativa; os pontos do modo escolhido são cheios em
`--accent` com raio 4; os demais, raio 2,5 em `ink-faint`. Sem lente, a
linha é `--accent` como hoje. Não se desenha uma segunda linha ligando só
os pontos do modo — ligaria sessões com semanas de buraco.

**Hover / seleção (gráfico grande)**: cada ponto é `<g tabindex="0">` com
um `<text>` filho oculto; `:hover` e `:focus-visible` mostram
`{valor} · {data curta} · {modo} · {rounds} r`. Uma linha vertical fina
acompanha. No toque, o primeiro tap foca e mostra; a tabela abaixo destaca
a linha correspondente (`:target` via `id`). Sem tooltip no sparkline.

**Eixo do tempo (gráfico grande)**: primeiro e último instante como hoje,
mais marcas de semana quando o intervalo > 14 dias; formatação
`Intl.DateTimeFormat(locale, {day, month:"short"})`.

**Animação `tracar`**: manter, mas só no gráfico grande. Nos tiles, 12
animações simultâneas de 1,1 s é ruído — remover a classe.

### 3.4 Chip de delta

Componente `delta-chip.tsx`, usado por hero, tile, tabela de sessões e
`painel`. Nunca um cálculo local de delta em outro lugar.

```ts
type Delta =
  | { estado: "ok"; valor: number; unidade: "%" | "pp"; direcao: "sobe" | "desce" | "igual"; valencia: "good" | "bad" | "neutral"; fraco: boolean }
  | { estado: "sem-base"; motivo: "sem-normal" | "poucas-sessoes" | "propria-sessao" | "sem-amostra" };
```

Regras:

- **Unidade**: stats com `unit: "%"` (HS, vitórias, precisão) mostram
  diferença em **pontos percentuais** (`▼ 41 pp`), não razão (`-100%`).
  As outras, razão relativa (`▼ 19%`).
- **Limiar de "igual"**: |Δ| < 3 % (ou < 1 pp) → chip `≈` em `--neutral`,
  sem sinal. Abaixo disso a diferença é ruído.
- **Sinal e ícone**: `▲ 19%` / `▼ 19%` / `≈`. O ícone é o sinal; não
  repetir `+`/`−`.
- **Cor**: `valencia = direcao × melhorQuando`. `good` → texto `--good`,
  fundo `--good-soft`; `bad` → `--bad`/`--bad-soft`; `neutral` → `--neutral`
  sem fundo.
- **Fraco** (`rounds < MIN_ROUNDS` na sessão): borda pontilhada, sem fundo,
  `title="amostra de 7 rounds"`. A cor permanece.
- **Sem base**: o chip não é renderizado; a linha de referência do cartão
  diz o motivo em hud: `sem base · 1 de 5 sessões` / `sem base · vitalício
  indisponível` / `sem amostra`. **`0%` nunca é impresso** por ausência de
  base.
- Formatação: `Intl.NumberFormat(locale, { maximumFractionDigits: 0 })`; o
  sinal vem do ícone.

### 3.5 Catálogo de estados vazios e escassos

Um componente `estado.tsx` com `variante` fixa e três campos: `titulo`
(hud, ≤ 5 palavras), `texto` (≤ 1 linha, opcional), `acao` (link,
opcional). Substitui as sete caixas tracejadas diferentes.

| Id | Situação | Onde | Título / texto / ação |
|---|---|---|---|
| E0 | Steam sem "Detalhes do jogo" público | página inteira | `Sem estatísticas` / `A Steam não deixa ler.` / `Abrir privacidade` |
| E1 | 1 coleta | tiles, hero, sessões | número = vitalício, rodapé `só vitalício · jogue uma partida`; hero substituído por `Primeira coleta gravada` + `A próxima partida vira a primeira sessão.` |
| E2 | sessões sem modo (bot não amigo) | rodapé de tile, célula de Sessões, lente oculta | `modo desconhecido` / `Adicionar o bot` |
| E3 | lente ativa com < N_MIN sessões | referência do cartão | `sem base · 2 de 5 sessões` (chip omitido, gráfico inteiro) |
| E4 | stat sem uso no período (ex.: AWP) | tile | número = vitalício, área do gráfico `sem uso no período` |
| E5 | análise pendente | cartão do analista | skeleton (3.6 / 6) |
| E6 | análise falhou | cartão do analista | `Sem análise desta vez` / — / `Pedir de novo` |
| E7 | partidas oficiais desligadas | aba Partidas | convite curto (5.4) |
| E8 | denominador zero (0 partidas no período) | qualquer razão | `—`, nunca `0,0%` |
| E9 | lente ativa, lista vazia (Sessões/Partidas/Análises) | listas | `0 de 22 sessões em Premier` / — / `Ver todas` |
| E10 | contadores `last_match_*` congelados | Métricas | grupo colapsado `19 contadores congelados pela Valve` |

### 3.6 Skeletons

Só onde há busca no cliente: o corpo do cartão do analista (polling de
`/api/analises`). Três barras `h-3` (`w-4/5`, `w-full`, `w-2/3`) em
`bg-surface-2 animate-pulse`, mais uma barra `h-8 w-1/2` no lugar da
manchete. O cabeçalho do cartão (contexto da sessão) vem do servidor e não
tem skeleton. Nenhuma outra página tem skeleton — são server components.

---

## 4. Modo de jogo

### 4.1 Decisão

O modo continua **global** (URL `?modo=` + cookie, como hoje) porque as
listas — Sessões, Partidas, Análises — são naturalmente filtráveis e um
filtro vazio nelas é honesto (E9). O que muda é o **contrato com os
números e gráficos**: neles o modo é uma **lente**, e uma lente nunca
remove pontos.

Com lente ativa, um cartão/hero/gráfico:

1. mostra a **série inteira** (todas as sessões), com os pontos do modo em
   destaque e os outros apagados (3.3);
2. usa como **número grande a última sessão do modo**;
3. usa como **normal** a regra de 4.3;
4. diz no chip do cartão de que modo é o número, e no rodapé quantas sessões
   do modo existem.

Efeito em D1: em "Premier" com 1 sessão o tile de K/D continua com os 11
pontos da linha, um deles laranja, número 0,65 com chip `Premier`, sem
delta, referência `sem base · 1 de 5 sessões`.

### 4.2 Apresentação

A segunda barra de pílulas sai. O controle vai para a **mesma linha das
abas**, à direita, como controle segmentado com rótulo hud `MODO`:

```
desktop (≥ 1024)
┌──────────────────────────────────────────────────────────────────────────────┐
│ [img] Counter-Strike 2                                                       │
│       2.029 h · 36,2 h em 2 semanas · 22 coletas                             │
│                                                                              │
│ Resumo  Estatísticas  Sessões  Partidas  Métricas  Análises   MODO ┌────┬────────┬─────────────┐ │
│ ‾‾‾‾‾‾                                                             │Tudo│Premier │Competitivo  │ │
│                                                                    └────┴────────┴─────────────┘ │
│ 3 de 7 sessões com modo · Adicionar o bot                              (só quando < 100 %)      │
└──────────────────────────────────────────────────────────────────────────────┘
```

```
mobile (390)
┌──────────────────────────────────┐
│ Counter-Strike 2                 │
│ 2.029 h · 22 coletas             │
│                                  │
│ Resumo  Estatísticas  Sessões  P…│  ← rolagem horizontal, fade nas bordas
│ ‾‾‾‾‾‾                           │
│ MODO ┌────┬────────┬───────────┐ │
│      │Tudo│Premier │Competit…  │ │  ← segmentado, rolagem horizontal
│      └────┴────────┴───────────┘ │
│ 3 de 7 sessões com modo · bot →  │
└──────────────────────────────────┘
```

- Sem contagens nas opções (o "1" e o "2" eram convite a tela vazia). A
  contagem vive na linha de cobertura e no rodapé dos cartões.
- A **linha de cobertura** `3 de 7 sessões com modo · Adicionar o bot`
  aparece só quando há sessões sem modo; some quando 100 %. É o único
  lembrete do bot fora do onboarding (ver 7).
- Opção ativa: `bg-accent-soft text-accent ring-accent/40` (como hoje).
  Só modos com ≥ 1 sessão viram opção (regra atual de `abasDeModo`).
- Sem nenhuma sessão com modo o controle não aparece; no lugar dele, a linha
  de cobertura: `Sessões sem modo · Adicionar o bot`.

### 4.3 O normal por modo

```
N_MIN = 5 sessões  e  R_MIN = 150 rounds (somados) no modo, excluindo a sessão lida

normal(stat, lente, sessão):
  se lente = Tudo:
      vitalício da Steam (último contador; a sessão pesa < 5 % dele)  → rótulo "vitalício"
  senão:
      base = sessões do modo, fortes (3.3), excluindo `sessão`
      se |base| ≥ N_MIN e rounds(base) ≥ R_MIN:
          acumulado(base)                                            → rótulo "normal · Premier · 8 sessões"
      senão:
          vitalício da Steam                                          → rótulo "vs vitalício · Premier sem base (2 de 5)"
          chip de delta com borda pontilhada (estado `fraco`)
```

Por que cair no vitalício e não em "sem base": o produto promete comparação
e o vitalício existe desde a primeira coleta. O que não se pode é fingir que
o vitalício é o normal do Premier — daí o rótulo explícito e o chip fraco.
Quando o modo chega a 5 sessões o rótulo troca sozinho; o rodapé do cartão
mostra a progressão (`2 de 5`) para a pessoa saber que está construindo a
própria base.

Onde a regra vive: uma função `normalDe(spec, rows, lente, sessaoId)` em
`series.ts`, substituindo os dois caminhos de `lifetimeValue`
(`accumulatedValue` fica como interno). `vitaliciosDoHero`, `lerSerie`,
`todasAsMetricas`, `StatPanel` e `analises.ts` passam a chamá-la — hoje cada
um monta a referência por conta própria (D2).

### 4.4 Bloco "Por modo"

Como o modo é uma lente, o Resumo ganha um bloco que mostra os modos **lado
a lado**, sem filtrar — é onde "não misturar" acontece sem esvaziar nada:

```
POR MODO
┌──────────────┬──────────┬────────┬────────────┬────────┬───────────────┐
│ modo         │ sessões  │ K/D    │ Dano/round │ HS     │ última        │
├──────────────┼──────────┼────────┼────────────┼────────┼───────────────┤
│ ● Premier    │ 1 · 2/5  │ 0,65   │ 80         │ 50 %   │ 14 set        │  ← ink-faint: base incompleta
│ ● Competitivo│ 2 · 2/5  │ 0,57   │ 74         │ 53 %   │ 14 set        │
│ ○ sem modo   │ 4        │ 0,48   │ 69         │ 41 %   │ 12 set        │  ← link "marcar"
│   vitalício  │ —        │ 0,70   │ 95         │ 36 %   │               │
└──────────────┴──────────┴────────┴────────────┴────────┴───────────────┘
```

Linha com menos de N_MIN sessões em `ink-faint` com `2/5`. Clique na linha
= ativar a lente. Mobile: cada linha vira um cartão de duas linhas
(`Premier · 1 sessão` / `0,65 · 80 · 50 %`).

---

## 5. Páginas

Ordem de leitura comum a todas: **contexto → número → referência → gráfico
→ o que falta**. Larguras: `max-w-6xl` como hoje; grid de tiles 3 colunas
(≥ 1024), 2 (≥ 640), 1 abaixo.

### 5.1 Resumo

**Propósito**: responder "como foi a última sessão, e o que fazer na
próxima" em uma dobra e meia.

Hierarquia:

1. Onboarding compacto (só enquanto faltar passo — ver 7)
2. Hero: a última sessão (da lente)
3. Análise: manchete + ação (sem números)
4. Estatísticas: 6 tiles
5. Por modo

```
desktop
┌──────────────────────────────────────────────────────────────────────────┐
│ ÚLTIMA SESSÃO   ● Competitivo · Mirage · 13–9 · 2 partidas · 32 r · 47 min│
│                                                          14 set, 19:17   │
│                                                                          │
│   K/D                    DANO / ROUND              HEADSHOT              │
│   0,57  ▼ 19%            74  ▼ 22%                 52,9%  ▲ 17 pp        │
│   normal 0,70            normal 95                 normal 36,1%          │
│                                                                          │
│   ⚠ amostra curta · 32 rounds        ◌ 12 de 32 rounds em mapa não contado│  ← chips-nota, só quando aplicável
└──────────────────────────────────────────────────────────────────────────┘

ANÁLISE                                                        histórico →
┌──────────────────────────────────────────────────────────────────────────┐
│ Mira alta, trocas ruins                                                  │  ← manchete (title). Só se marcada.
│ Headshot e AK acima do normal; K/D caiu porque as mortes vieram em       │
│ duelos de perto com a Glock…                             ler análise ▾   │  ← 2 linhas, expande
│ → Próxima: comprar armor + Glock só no pistol; evitar peek duplo.        │  ← ação, sempre que existir
└──────────────────────────────────────────────────────────────────────────┘

ESTATÍSTICAS                                                       todas →
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ K/D          │ │ DANO / ROUND │ │ KILLS / ROUND│
│ 0,57  ▼ 19%  │ │ 74  ▼ 22%    │ │ 0,53  ▼ 18%  │
│ normal 0,70  │ │ normal 95    │ │ normal 0,65  │
│ ┄┄●┄┄○┄┄●┄┄  │ │ ┄┄●┄┄○┄┄●┄┄  │ │ ┄┄●┄┄○┄┄●┄┄  │
│ 11 s · 12 d ↗│ │ 11 s · 12 d ↗│ │ 11 s · 12 d ↗│
└──────────────┘ └──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ HEADSHOT     │ │ VITÓRIAS     │ │ PRECISÃO AK  │
│ …            │ │ 40%  ▼ 1 pp  │ │ …            │
│              │ │ média móvel·5│ │              │
└──────────────┘ └──────────────┘ └──────────────┘

POR MODO
(tabela de 4.4)
```

Hero — o que muda:

- Linha de contexto: `modo · mapa · placar · partidas · rounds · duração`
  e, à direita, **o fim da sessão** (`14 set, 19:17`). O intervalo
  `de → até` sai da tela (vai para `title`).
- Os três números mantêm `num-xl`; o chip de delta segue 3.4; a linha de
  referência é uma só (`normal 0,70` / `vitalício 0,70` / `sem base · 1 de
  5`).
- `MarcarModo` sai do hero como régua. Quando a sessão não tem modo, o chip
  de modo é um botão `modo? ▾` que abre as 5 opções em popover; a frase "o
  bot marca sozinho quando é seu amigo" some (a cobertura em 4.2 já diz).
- Leituras `amostra` e `mapas` viram **chips-nota** no rodapé do hero (uma
  linha, hud + número). As leituras `kd`, `hs` e `modo` **são removidas**:
  são o hero. `arma-melhor`/`arma-pior` vão para Estatísticas (5.2).
- Um `glow` só: o hero. O cartão de análise perde `glow` e `grid-bg`.

Mobile (390):

- Contexto em duas linhas: chips (modo, mapa, placar) / `2 partidas · 32 r
  · 47 min · 14 set 19:17`.
- Três números em `grid-cols-3`, `num` 28 px; chip abaixo do número, não ao
  lado. Se algum valor tiver mais de 5 caracteres, empilhar em uma coluna.
- Análise: manchete + ação; corpo colapsado por padrão.
- Tiles em 1 coluna, sparkline `h-10`.
- Por modo: cartões de duas linhas.

O que sai do Resumo: seção Leituras (componente `Leituras` fica só com
`arma-*`, usado em Estatísticas), os números do cartão de análise, o segundo
`glow`, o `PendenciasBanner` (7).

### 5.2 Estatísticas

**Propósito**: "como estou, estatística por estatística", com a série
inteira sempre à vista.

1. Destaques: 1–2 linhas (`arma-melhor`, `arma-pior`), formato
   `8,8%  Precisão AK-47 · normal 7,7% · ▲ 1 pp · 331 tiros`
2. 12 tiles (3.2)
3. `Sobre estes contadores` — `details` colapsado, **encurtado para 4
   linhas** (sem modo / mapas legados / última partida congelada / não é
   ADR) com link para `docs/dados-profundos.md`

```
DESTAQUES
 8,8%   Precisão AK-47 · normal 7,7% · ▲ 1 pp · 331 tiros
 2,6%   Precisão Glock · normal 12,9% · ▼ 10 pp · 77 tiros

ESTATÍSTICAS                              12 · 11 sessões · desde 03 set
┌──────┐ ┌──────┐ ┌──────┐
│      │ │      │ │      │   × 4 linhas
└──────┘ └──────┘ └──────┘

▸ Sobre estes contadores
```

O que sai: a barra `ContextFilterBar` (recorte por mapa). Mapa como filtro
tem o mesmo defeito de D1 e ainda menos dados; mapa passa a ser coluna em
Sessões e dimensão de partida em Partidas. `CounterScope` é reduzido, não
removido.

Mobile: 1 coluna; destaques em duas linhas cada.

### 5.3 Sessões

**Propósito**: cada sessão como uma linha, comparável com o normal.

Colunas (desktop): `quando · modo · mapa · placar · partidas · rounds · K/D
(+chip) · dano/round · HS · min`. Kills/deaths/MVP saem para o `title` da
linha e para a página da sessão (não existe; não criar agora). O chip de
delta de K/D usa o normal da lente (3.4), o que torna a tabela a resposta
para "em qual noite eu estive acima do meu normal".

```
QUANDO        MODO         MAPA     PLACAR  PART  ROUNDS  K/D           DANO/R  HS     MIN
14 set 19:17  ● Competit.  Mirage   13–9    2     32      0,57 ▼ 19%    74      53%    47
14 set 01:45  ○ modo? ▾    —        —       1     21      0,40 ▼ 43%    62      38%    29
```

- Sessão sem modo: chip `modo? ▾` (o mesmo popover do hero). É aqui que a
  marcação em massa acontece.
- Lente ativa: linhas fora do modo **ficam** na tabela em `ink-faint`
  (lente, não corte), e um rótulo acima diz `2 de 7 sessões em Competitivo`.
  Isso muda o comportamento atual (a lista era filtrada). Motivo: a tabela
  com 7 linhas cabe na tela; esconder 5 delas não ajuda ninguém.
- Mobile: cada linha vira cartão: linha 1 `14 set 19:17 · ● Competitivo ·
  Mirage · 13–9`; linha 2 `0,57 ▼ 19% · 74 · 53% · 32 r`.

### 5.4 Partidas

**Propósito**: partidas oficiais, uma a uma, com o placar dos dez.

- Convite (corrente desligada) encurtado: título `Partidas oficiais`, uma
  frase `Cada partida com placar e os dez jogadores. Um código da Steam,
  colado uma vez.`, três bullets de 5 palavras (`Só histórico de partidas`,
  `Cifrado; revogável aqui`, `FACEIT e GC não entram`), formulário à
  direita. O texto atual tem 90 palavras; cabe em 30.
- Tabela como está; coluna `modo` vira chip com a cor da lente; lente
  ativa filtra (é lista) com rótulo `E9`.
- Rodapé "Corrente ligada · última conhecida CSGO-xxxx…" → `Corrente ligada
  · Revogar` (o share code inteiro não interessa a ninguém na tela).
- Mobile: cartão por partida: `Mirage · 13–9 · Premier · 14 set` /
  `24-18-6 · K/D 1,33 · HS 42% · 41 min`.

### 5.5 Métricas

**Propósito**: os 178 contadores, comparados, para quem quer procurar.

- Busca como está; acrescentar chips de grupo `Geral · Por arma · Por mapa`
  (o `groupOf` já existe).
- Grupo `Última partida` colapsado no fim como E10 quando `gaugesLookStale`.
- Linha: `label / grupo · total no período` — `período` — `normal` — chip —
  sparkline. O sparkline segue 3.3 (lente destaca). O chip segue 3.4; a
  coluna "variação" em texto sai.
- Mobile: sparkline oculto (já é); chip e período na mesma linha do label.

`metricas/[key]`: mantém a estrutura; os dois gráficos passam a `SerieChart`
novo (domínio robusto, hover CSS); a lista "coleta a coleta" ganha cabeçalho
hud e vira tabela com as mesmas colunas de 5.7. Prioridade baixa.

### 5.6 Análises

**Propósito**: histórico das leituras do analista, uma por sessão.

Lista de cartões (6), o mais recente aberto, os anteriores com corpo
colapsado. Sem bloco `Numeros`. Sem `glow`. Lente ativa filtra (é lista) com
E9.

### 5.7 painel/[key]

**Propósito**: a estatística de perto — cada sessão como ponto, com amostra
e modo.

```
← Estatísticas
ESTATÍSTICA                                     [cada sessão | dia | semana | mês]
K/D

┌──────────────────────────────────────────────────────────────┐
│ ÚLTIMA SESSÃO  ● Competitivo · 14 set                        │
│ 0,57  ▼ 19%     normal 0,70 · 22 sessões                     │  ← um cartão (não três)
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ 1,2 ┤                              ▲ 6,30 · 7 r              │  ← grampeado na borda, rotulado
│ 1,0 ┤        ●                                               │
│ 0,8 ┤   ●        ●     ○   ●                    ●            │
│ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ normal 0,70│
│ 0,6 ┤                     ●    ●        ●   ●        ●  ●    │
│ 0,4 ┤                                        ○               │
│     └────┬────────┬────────┬────────┬────────┬──────         │
│        03 set    06       09       12      14 set            │
└──────────────────────────────────────────────────────────────┘
 ● sessão   ○ amostra < 10 rounds   ▲ fora da escala   ● modo da lente

SESSÕES                                                   22 · desde 03 set
QUANDO        MODO         ROUNDS   K/D      Δ NORMAL
14 set 19:17  Competitivo  32       0,57     ▼ 19%
14 set 01:45  —            21       0,40     ▼ 43%
13 set 20:51  —            7        6,30     ▲ 800%  ⚠ amostra
…
```

- Os três `Numero` viram um cartão de estatística (3.2) sem sparkline.
- Legenda de marcadores em hud abaixo do gráfico, uma linha.
- Tabela substitui a lista `data → valor`: `quando · modo · rounds · valor ·
  Δ normal`. Ao focar um ponto do gráfico a linha correspondente recebe
  `bg-surface-2` (`:target`).
- Buckets `dia/semana/mês`: o ponto agregado carrega `rounds` somados e
  `modo` = o modo predominante ou `—`; a tabela mostra a mesma agregação.
- Mobile: gráfico `h-56`, rótulos dos pontos só no foco; tabela em 3
  colunas (`quando · valor · Δ`).

---

## 6. Cartão do analista

### 6.1 O que o hero mostra e o que a análise mostra

| | Hero | Análise |
|---|---|---|
| Pergunta | "quanto?" | "por quê, e o que fazer?" |
| Conteúdo | 3 números, delta, referência, contexto | manchete, juízo em 2–3 parágrafos, uma ação |
| Números | grandes, formatados por `formatarStat` | só inline no texto, em negrito, nunca em bloco |
| Referência | linha `normal …` | nenhuma |
| Destaque visual | `glow` | nenhum |

O bloco `Numeros` de `analista.tsx` é **apagado**. O contexto (modo, mapa,
placar, quando) fica como cabeçalho do cartão porque na aba Análises não há
hero acima — no Resumo ele é redundante mas barato (uma linha).

### 6.2 Anatomia

```
┌──────────────────────────────────────────────────────────────┐
│ ● Competitivo · Mirage · 13–9                    14 set, 19:17│  cabeçalho (chips + time)
│                                                              │
│ Mira alta, trocas ruins                                      │  manchete (title) — opcional
│                                                              │
│ Headshot e AK acima do normal; K/D caiu porque as mortes     │  corpo (body-lg), colapsado a 2 linhas
│ vieram em duelos de perto com a Glock…         ler análise ▾ │  no Resumo; aberto em Análises
│                                                              │
│ → Próxima: comprar armor + Glock só no pistol.               │  ação — opcional, sempre destacada
└──────────────────────────────────────────────────────────────┘
```

- Corpo: parágrafos e listas como hoje (`comNegrito`), `text-[15px]`. No
  Resumo, `line-clamp-2` com `ler análise ▾` (client, `useState`); na aba
  Análises o mais recente vem aberto.
- Ação: caixa `border-accent/30 bg-accent-soft/60` como hoje; o rótulo
  `próxima` em hud.

### 6.3 Manchete: contrato, não heurística

`lerAnalise` deixa de adivinhar. Uma manchete só é manchete quando **vem
marcada**: primeiro bloco em negrito inteiro (`**…**`) ou iniciado por `# `,
com ≤ 90 caracteres e sem `:` no fim. O prompt do agente
(`docs/cogniflow-tenant.md`) passa a exigir `**manchete**` na primeira
linha. Análises antigas e respostas desobedientes **não têm manchete** — o
cartão começa pelo corpo. Isso é o oposto de hoje, onde não ter marca e ter
uma introdução curta produz um título de 24 px (D4).

### 6.4 Fallback exato

| Texto tem | Mostra |
|---|---|
| manchete + corpo + ação | tudo |
| corpo + ação | corpo (aberto na primeira linha, sem clamp de 2 → clamp de 3) + ação |
| manchete + corpo | manchete + corpo; sem caixa de ação |
| só corpo | corpo, clamp 3, `ler análise ▾`; nada mais |
| vazio / `FAILED` | E6: `Sem análise desta vez` + `Pedir de novo` (POST `/api/analises`) |
| `PENDING`/`ACKNOWLEDGED` | skeleton 3.6 com o cabeçalho real; polling como hoje |

Quando a ação vem colada no fim de um parágrafo (`separarAcaoColada`) a
regra continua valendo.

### 6.5 Copy do analista

O texto de `[S1]` repete os números do hero em cinco bullets ("Taxa de
headshots: notável melhoria para 52,9 %… em relação ao vitalício de
36,1 %"). Isso é problema de prompt, não de cartão: o prompt deve pedir
juízo e causa, e proibir listar cada métrica com valor e vitalício —
"o cartão ao lado já mostra os números". Registrar em
`docs/cogniflow-tenant.md`; fora do escopo deste plano de UI, mas sem isso
o cartão continua repetindo o hero.

---

## 7. Avisos e pendências

Três portas (`stats`, `bot`, `partidas`), três lugares, sem repetição:

| Porta | Onde vive | Forma | Frequência |
|---|---|---|---|
| `stats` (detalhes privados) | página inteira (E0) e `PrimeirosPassos` | bloqueante: nada funciona sem | sempre, até resolver |
| `bot` (sem modo/mapa) | linha de cobertura sob as abas (4.2); rodapé de tile `modo desconhecido`; chip `modo? ▾` em Sessões/hero | inline, factual | sempre — é estado, não aviso; não tem "dispensar" |
| `partidas` (corrente) | aba Partidas (E7) e um passo do onboarding | convite | só ali |

`PendenciasBanner` (a pilha amarela em toda aba) **sai**. Um aviso
`warn` repetido em seis abas, dispensável por sete dias, é o pior dos dois
mundos: irrita quem já decidiu não adicionar o bot e não ajuda quem quer —
a informação chega longe do lugar onde o dado falta. Inline, o aviso está
exatamente onde a lacuna aparece.

`PrimeirosPassos` no Resumo:

- Enquanto `stats` pendente: cartão completo, como hoje.
- Com `stats` ok e outros passos pendentes: **linha compacta** `Primeiros
  passos · 2 de 4 ▾` (hud + progresso), expansível; o cartão completo só ao
  expandir.
- 4 de 4: some.

Tom: HUD. Título ≤ 5 palavras, texto ≤ 1 linha, verbo na ação. O texto
atual dos passos (3 linhas cada, com caminho de menu da Steam) vai para o
estado expandido; colapsado só o título e o botão.

Mensagens no chat da Steam: sem mudança — a cadência com teto
(`lembrarPendenciasNoSteam`, três lembretes, um por semana) já está em
`src/lib/pendencias.ts` e é o canal certo para insistir; a interface não
insiste.

---

## 8. Plano de implementação

Ordem por dependência e por impacto. Tamanhos: S (≤ 2 h), M (½ dia),
L (1–2 dias). Nada aqui exige biblioteca nova nem migração de banco.

### Passo 1 — Formatação e semântica (fundação) · M

- **Criar** `src/lib/formato.ts`: `formatarStat(key, v, locale)`,
  `formatarNumero`, `formatarPct`, `formatarPp`, `formatarQuando(d, locale,
  tz)`, `formatarDuracao`. Tudo por `Intl.*`; `locale` e `tz` vêm de um
  `getLocale()` (hoje devolve `pt-BR`/`America/Sao_Paulo`; amanhã lê o
  usuário).
- **Editar** `src/lib/cs2-panel.ts`: acrescentar `melhorQuando` e
  `minAmostra` a cada `PanelStat`; `decimals`/`unit` viram a fonte única de
  formatação.
- **Editar** `src/app/globals.css`: tokens `--good`, `--good-soft`,
  `--bad`, `--bad-soft`, `--neutral` no `:root` e no `@theme inline`.
- **Apagar** os `fmt`/`n`/`toLocaleString("pt-BR")` locais em
  `stat-panel.tsx`, `sessao-hero.tsx`, `analista.tsx`, `leituras.ts`,
  `metric-table.tsx`, `sessoes/page.tsx`, `painel/[key]/page.tsx`,
  `metricas/[key]/page.tsx`, `partidas-tabela.tsx`, `serie-chart.tsx`.

### Passo 2 — O normal e o delta (motor) · M

- **Editar** `src/lib/series.ts`: `normalDe(spec, rows, lente, sessaoId)`
  com a regra 4.3 (N_MIN, R_MIN, leave-one-out, fallback rotulado);
  `buildSeries` devolve `PontoSerie` (com `rounds`, `modo`, `sessaoId`) e
  **não aplica mais** `filter.mode` como corte quando chamado pelos
  cartões — a lente é aplicada na apresentação. `lifetimeValue` vira
  wrapper de compatibilidade e depois some.
- **Criar** `src/lib/delta.ts`: `calcularDelta(stat, valor, normal,
  rounds)` → `Delta` (3.4).
- **Editar** `src/lib/sessoes.ts` (`vitaliciosDoHero` → `normalDoHero`
  usando `normalDe`), `src/lib/analises.ts` (`referencia` idem),
  `src/lib/leituras.ts` (`todasAsMetricas` idem; `lerSerie` reduzido a
  `amostra`, `mapas`, `arma-melhor`, `arma-pior`).
- Testes de unidade para `normalDe` com 1, 4, 5 sessões no modo e para o
  domínio robusto (Passo 3).

### Passo 3 — Gráficos · L

- **Reescrever** `src/components/sparkline.tsx`: entrada `PontoSerie[]`,
  domínio robusto (MAD), grampeamento com marcador, pontos fracos vazados,
  lente (linha cinza + pontos do modo em laranja), estados 0/1/2 pontos,
  sem `tracar`.
- **Reescrever** `src/components/serie-chart.tsx`: idem + eixo de tempo com
  marcas, rótulo da baseline, `<g tabindex>` com rótulo em
  `:hover/:focus-visible`, `id` por ponto para `:target`, legenda de
  marcadores.
- **Criar** `src/lib/dominio.ts` com `dominioRobusto(pontos, normal, stat)`
  compartilhado pelos dois.

### Passo 4 — Cartão de estatística e chip · M

- **Criar** `src/components/delta-chip.tsx` (3.4) e
  `src/components/stat-card.tsx` (3.2).
- **Criar** `src/components/estado.tsx` (3.5) e substituir as sete caixas
  tracejadas (`stat-panel`, `leituras`, `serie-chart`, `sessoes/page`,
  `partidas/page`, `analista/page`, `page.tsx` do Resumo).
- **Reescrever** `src/components/stat-panel.tsx` como grade de `StatCard`;
  o `Tile` interno some.

### Passo 5 — Lente de modo · M

- **Editar** `src/components/nav-jogo.tsx` + `modo-nav.tsx`: uma linha, abas
  à esquerda e segmentado `MODO` à direita; sem contagens; linha de
  cobertura `x de y sessões com modo · Adicionar o bot`.
- **Editar** `src/app/games/[appId]/layout.tsx`: remover a segunda barra e
  o `PendenciasBanner`; passar `cobertura` (sessões com modo / total) que
  `abasDoUsuario` já sabe calcular.
- **Criar** `src/components/por-modo.tsx` (4.4) e usar no Resumo.
- **Editar** `src/components/estatisticas.tsx`: remover `ContextFilterBar` e
  o estado de mapa. **Apagar** `context-filter.tsx` se nenhum outro lugar
  usar (`p/[steamId]` usa? conferir; se sim, manter só lá).

### Passo 6 — Resumo e hero · M

- **Editar** `src/components/sessao-hero.tsx`: nova linha de contexto, fim
  da sessão à direita, `DeltaChip`, uma linha de referência, chips-nota
  (`amostra`, `mapas`), chip `modo? ▾` no lugar da régua.
- **Editar** `src/components/marcar-modo.tsx`: vira popover acionado por
  chip; reutilizado em Sessões.
- **Editar** `src/app/games/[appId]/page.tsx`: ordem hero → análise →
  tiles → por modo; remover seção Leituras.
- **Editar** `src/components/primeiros-passos.tsx`: variante compacta.

### Passo 7 — Analista · S

- **Editar** `src/lib/analise-texto.ts`: manchete só marcada (6.3);
  testes com a resposta de `[S5]` (não deve promover) e com uma marcada
  (deve).
- **Editar** `src/components/analista.tsx`: apagar `Numeros`; corpo com
  clamp e `ler análise ▾`; skeleton; E6 com `Pedir de novo`; sem `glow`.
- **Editar** `docs/cogniflow-tenant.md`: prompt exige `**manchete**` e
  proíbe repetir os números do cartão.

### Passo 8 — Sessões, Partidas, Métricas · M

- **Editar** `src/app/games/[appId]/sessoes/page.tsx`: colunas 5.3, chip de
  delta, lente como destaque (linhas fora do modo em `ink-faint`), cartões
  no mobile, chip `modo? ▾`.
- **Editar** `src/app/games/[appId]/partidas/page.tsx`: convite encurtado,
  rodapé encurtado; `partidas-tabela.tsx`: cartões no mobile.
- **Editar** `src/components/metric-table.tsx`: chips de grupo, `DeltaChip`,
  grupo congelado colapsado; `metricas/page.tsx` passa `gaugesLookStale`.

### Passo 9 — painel/[key] e metricas/[key] · M

- **Editar** `painel/[key]/page.tsx`: um `StatCard` no lugar dos três
  `Numero`; `SerieChart` novo; tabela de sessões com `Δ normal`; legenda.
- **Editar** `metricas/[key]/page.tsx`: `SerieChart` novo; tabela com
  cabeçalho. Baixa prioridade; pode ficar para depois do Passo 10.

### Passo 10 — Limpeza · S

- **Apagar**: `pendencias-banner.tsx`; `Leituras` como seção do Resumo (o
  componente fica, só para Destaques); os `fmt` locais restantes;
  `lifetimeValue` se nada mais chamar; `context-filter.tsx` se órfão;
  `counter-scope.tsx` reduzido a 4 itens.
- Conferir no 390 px: header, abas com fade, segmentado, hero em 3 colunas,
  tiles em 1 coluna, tabelas em cartões, nenhum scroll horizontal da página.

### Ordem de entrega

1 → 2 → 3 → 4 desbloqueiam tudo; 5 e 6 são o que o dono vê primeiro
(lente + Resumo); 7 é curto e resolve D3/D4; 8–10 fecham. Entre 4 e 5 a
aplicação já roda com tiles corretos em "Tudo" — o ponto de checagem é
abrir "Premier" e ver **onze pontos na linha, um laranja, e `sem base · 1
de 5`** onde hoje há um número solto.
