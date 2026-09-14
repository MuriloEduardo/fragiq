/**
 * Roda uma vez por instância do servidor, antes de qualquer rota: é onde
 * os segredos do Secrets Manager entram em `process.env`, para que o
 * resto do código continue lendo variáveis como sempre leu.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { carregarSegredos } = await import("./lib/segredos");
  await carregarSegredos();
}
