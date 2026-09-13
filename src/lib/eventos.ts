import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

/**
 * O diário de operação.
 *
 * `registrar` deixa uma linha para o painel; `reportarErro` faz o mesmo
 * com um erro, além do console — porque um `catch` que só escreve no log
 * da Vercel é um erro que ninguém vê. Nunca lança: o diário não pode
 * derrubar o que está registrando.
 */
export async function registrar(nome: string, opts: { userId?: string | null; dados?: Prisma.InputJsonValue } = {}) {
  try {
    await prisma.evento.create({ data: { nome, userId: opts.userId ?? null, dados: opts.dados } });
  } catch (e) {
    console.error("[eventos] não registrou:", nome, e instanceof Error ? e.message : e);
  }
}

export async function reportarErro(contexto: string, err: unknown, userId?: string | null) {
  const mensagem = err instanceof Error ? err.message : String(err);
  console.error(`[${contexto}]`, mensagem);
  await registrar("erro", { userId, dados: { contexto, mensagem: mensagem.slice(0, 500) } });
}
