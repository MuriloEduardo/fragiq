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
