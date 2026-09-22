import type { PanelStat } from "./cs2-panel";

/**
 * Um formatador para cada coisa, num lugar só.
 *
 * O mesmo K/D saía como `0,57`, `0.57` e `0,5700` conforme o componente; a
 * mesma taxa de headshot como `52,9%`, `53%` e `52.9`. Cada cartão tinha o
 * seu `fmt`. Aqui a regra é uma: a estatística diz quantas casas e qual
 * unidade (`cs2-panel.ts`), o locale diz o separador, e ninguém mais
 * chama `toLocaleString` por conta própria.
 *
 * `getLocale()` devolve pt-BR hoje. Quando a internacionalização entrar,
 * é a única função que muda — todo número e toda data já passam por aqui.
 */
export type Locale = { locale: string; tz: string };

export function getLocale(): Locale {
  return { locale: "pt-BR", tz: "America/Sao_Paulo" };
}

export function formatarNumero(v: number, casas = 0, l = getLocale()): string {
  return v.toLocaleString(l.locale, { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Até `casas` decimais, sem zeros à direita: para valores de escala variável. */
export function formatarNumeroAte(v: number, casas: number, l = getLocale()): string {
  return v.toLocaleString(l.locale, { maximumFractionDigits: casas });
}

/** Porcentagem já em 0–100. */
export function formatarPct(v: number, casas = 0, l = getLocale()): string {
  return `${formatarNumero(v, casas, l)}%`;
}

/** Diferença em pontos percentuais, sem sinal — o sinal é do chip. */
export function formatarPp(v: number, l = getLocale()): string {
  return `${formatarNumero(Math.abs(v), Math.abs(v) < 1 ? 1 : 0, l)} pp`;
}

/** O valor de uma estatística do painel, nas casas e unidade que ela declara. */
export function formatarStat(stat: Pick<PanelStat, "decimals" | "unit">, v: number, l = getLocale()): string {
  return formatarNumero(v, stat.decimals, l) + (stat.unit ?? "");
}

/** `14 set, 19:17` — quando uma sessão terminou. */
export function formatarQuando(d: Date, l = getLocale()): string {
  const data = d.toLocaleDateString(l.locale, { day: "2-digit", month: "short", timeZone: l.tz }).replace(".", "");
  const hora = d.toLocaleTimeString(l.locale, { hour: "2-digit", minute: "2-digit", timeZone: l.tz });
  return `${data}, ${hora}`;
}

/** `14 set` — só o dia. */
export function formatarDia(d: Date, l = getLocale()): string {
  return d.toLocaleDateString(l.locale, { day: "2-digit", month: "short", timeZone: l.tz }).replace(".", "");
}

/** `47 min` / `2 h 10 min`. */
export function formatarDuracao(minutos: number): string {
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Tamanho de payload, para o painel de dados crus.
 *
 * Vive aqui pela mesma razão que o resto: é um número na tela, e números na
 * tela têm um formatador só. Base 1024 e não 1000 porque o que se compara é
 * com o que o banco e o editor dizem, não com o que o disco anuncia.
 */
export function formatarBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const { locale } = getLocale();
  if (n < 1024 * 1024) return `${(n / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} KB`;
  return `${(n / (1024 * 1024)).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
}
