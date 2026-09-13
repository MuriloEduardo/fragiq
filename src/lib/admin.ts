import { prisma } from "./prisma";

/**
 * Quem pode abrir /admin.
 *
 * Uma lista de SteamIDs numa variável de ambiente, e não uma coluna no
 * banco: o painel existe para quem opera o produto, e isso muda por deploy,
 * não por clique. Sem a variável, ninguém é admin — o padrão seguro.
 */
export function isAdmin(steamId: string | null | undefined): boolean {
  if (!steamId) return false;
  const lista = (process.env.ADMIN_STEAM_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return lista.includes(steamId);
}

/**
 * O selo de quem entrou na comunidade: fundador para os cem primeiros,
 * beta para os demais, nada para quem não entrou.
 */
export async function seloDe(userId: string): Promise<"fundador" | "beta" | null> {
  const eu = await prisma.participant.findUnique({
    where: { userId },
    select: { createdAt: true },
  });
  if (!eu) return null;
  const antes = await prisma.participant.count({ where: { createdAt: { lt: eu.createdAt } } });
  return antes < 100 ? "fundador" : "beta";
}
