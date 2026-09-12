import {
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

/**
 * Valores sensíveis vêm do AWS Secrets Manager quando FRAGIQ_SECRET_ID está
 * definido (produção, na EC2 com role). Sem ele, o bot cai no .env — é o
 * caminho de desenvolvimento e o do primeiro login com senha.
 *
 * O segredo é um JSON plano: { "STEAM_BOT_REFRESH_TOKEN": "...", ... }. As
 * chaves têm o mesmo nome das variáveis de ambiente de propósito, para que
 * config.ts não precise saber de onde cada valor veio.
 */

export const secretId = process.env.FRAGIQ_SECRET_ID?.trim() || null;

const client = secretId ? new SecretsManagerClient({}) : null;

export async function lerSegredos(): Promise<Record<string, string>> {
  if (!client || !secretId) return {};
  const out = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  return JSON.parse(out.SecretString ?? "{}");
}

/**
 * O steam-user renova o refresh token sozinho antes de expirar. Se o novo
 * valor não for gravado, o próximo reboot loga com um token morto — então o
 * bot escreve de volta onde leu.
 */
export async function gravarRefreshToken(token: string): Promise<void> {
  if (!client || !secretId) throw new Error("FRAGIQ_SECRET_ID não definido");
  const atual = await lerSegredos();
  await client.send(
    new PutSecretValueCommand({
      SecretId: secretId,
      SecretString: JSON.stringify({ ...atual, STEAM_BOT_REFRESH_TOKEN: token }),
    }),
  );
}
