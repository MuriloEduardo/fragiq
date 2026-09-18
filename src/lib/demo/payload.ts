import { z } from "zod";

/**
 * O que o bot entrega de uma demo (`bot/src/demo-parse.ts`): fatos, não
 * métricas. O contrato é validado aqui porque quem grava no banco somos
 * nós; a versão sobe quando um campo muda de significado.
 */

export const VERSAO_PAYLOAD = 1;

const lado = z.enum(["CT", "T"]);
const steamId = z.string().min(1);
const ponto = z.tuple([z.number(), z.number(), z.number()]);

const morte = z.object({
  t: z.literal("morte"),
  tick: z.number().int(),
  round: z.number().int(),
  vitima: steamId,
  ladoVitima: lado,
  zonaVitima: z.string().nullable(),
  autor: steamId.nullable(),
  ladoAutor: lado.nullable(),
  zonaAutor: z.string().nullable(),
  assistente: steamId.nullable(),
  flashAssist: z.boolean(),
  arma: z.string(),
  hs: z.boolean(),
  atravesSmoke: z.boolean(),
  cego: z.boolean(),
  noscope: z.boolean(),
  penetrou: z.boolean(),
  distancia: z.number(),
  pos: ponto.nullable(),
  posAutor: ponto.nullable(),
});

const dano = z.object({
  t: z.literal("dano"),
  tick: z.number().int(),
  round: z.number().int(),
  vitima: steamId,
  autor: steamId.nullable(),
  arma: z.string(),
  vida: z.number().int(),
  colete: z.number().int(),
  parte: z.string(),
  restou: z.number().int(),
});

const cego = z.object({
  t: z.literal("cego"),
  tick: z.number().int(),
  round: z.number().int(),
  vitima: steamId,
  autor: steamId.nullable(),
  segundos: z.number(),
});

const granada = z.object({
  t: z.literal("granada"),
  tick: z.number().int(),
  round: z.number().int(),
  tipo: z.enum(["smoke", "flash", "he", "molotov", "decoy"]),
  autor: steamId.nullable(),
  pos: ponto,
});

const bomba = z.object({
  t: z.literal("bomba"),
  tick: z.number().int(),
  round: z.number().int(),
  acao: z.enum(["plantando", "plantada", "desarmada", "explodiu"]),
  autor: steamId.nullable(),
  site: z.string().nullable(),
});

const zona = z.object({
  t: z.literal("zona"),
  tick: z.number().int(),
  round: z.number().int(),
  jogador: steamId,
  lado,
  zona: z.string().nullable(),
});

const saiu = z.object({ t: z.literal("saiu"), tick: z.number().int(), round: z.number().int(), jogador: steamId, motivo: z.number().int() });

const rank = z.object({
  t: z.literal("rank"),
  tick: z.number().int(),
  jogador: steamId,
  tipo: z.number().int(),
  antes: z.number().int(),
  depois: z.number().int(),
  mudanca: z.number().int(),
  vitorias: z.number().int(),
});

export const evento = z.discriminatedUnion("t", [morte, dano, cego, granada, bomba, zona, saiu, rank]);

export const round = z.object({
  n: z.number().int(),
  inicio: z.number().int(),
  jogo: z.number().int().nullable(),
  fim: z.number().int(),
  vencedor: lado.nullable(),
  motivo: z.string().nullable(),
});

export const demoPayload = z.object({
  versao: z.number().int(),
  parser: z.string().max(80),
  mapa: z.string().max(64).nullable(),
  servidor: z.string().max(200).nullable(),
  ticks: z.number().int().nonnegative(),
  jogadores: z.array(z.object({ steamId, nome: z.string().max(200) })).max(64),
  rounds: z.array(round).max(100),
  eventos: z.array(evento).max(200_000),
  tiros: z.record(steamId, z.record(z.string(), z.number().int().nonnegative())),
});

export type DemoPayload = z.infer<typeof demoPayload>;
export type Evento = z.infer<typeof evento>;
export type Morte = z.infer<typeof morte>;
export type Round = z.infer<typeof round>;
export type Lado = z.infer<typeof lado>;
