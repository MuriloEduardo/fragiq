import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { awsCredentialsProvider } from "@vercel/functions/oidc";

/**
 * Os segredos do FragIQ vêm do Secrets Manager, não de variável na Vercel.
 *
 * O tenant tem um segredo próprio — `cogniflow/tenants/fragiq`, um JSON com
 * as mesmas chaves das variáveis — e a Vercel chega nele sem chave estática:
 * OIDC federation, um role que só lê esse ARN. Em dev, sem `FRAGIQ_SECRET_ID`,
 * nada acontece e o `.env` continua valendo; com ele e sem `AWS_ROLE_ARN`,
 * usa-se a cadeia de credenciais da máquina (perfil, SSO).
 *
 * O que fica de fora, e por quê: `DATABASE_URL` e `DIRECT_DATABASE_URL`
 * porque o build roda `prisma migrate deploy` antes de existir runtime;
 * `CRON_SECRET` porque a Vercel só manda o Bearer do cron se a variável
 * estiver nela. O resto — assinatura de sessão, segredo do cogniflow, do
 * bot — sai daqui, e as variáveis correspondentes podem ser apagadas.
 */
export const CHAVES_DO_SEGREDO = ["AUTH_SECRET", "COGNIFLOW_SIGNING_SECRET", "BOT_WEBHOOK_SECRET"] as const;

let carregado: Promise<void> | null = null;

export function carregarSegredos(): Promise<void> {
  carregado ??= carregar().catch((err) => {
    carregado = null;
    throw err;
  });
  return carregado;
}

async function carregar() {
  const secretId = process.env.FRAGIQ_SECRET_ID?.trim();
  if (!secretId) return;

  const roleArn = process.env.AWS_ROLE_ARN?.trim();
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION ?? "us-east-1",
    ...(roleArn ? { credentials: awsCredentialsProvider({ roleArn }) } : {}),
  });
  const resposta = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  const valores = JSON.parse(resposta.SecretString ?? "{}") as Record<string, unknown>;

  const faltando: string[] = [];
  for (const chave of CHAVES_DO_SEGREDO) {
    const valor = valores[chave];
    if (typeof valor === "string" && valor.trim()) process.env[chave] = valor.trim();
    else if (!process.env[chave]) faltando.push(chave);
  }
  if (faltando.length) console.warn(`[segredos] ${secretId} não tem: ${faltando.join(", ")} (usando o ambiente, se houver)`);
  console.log(`[segredos] carregado de ${secretId}${roleArn ? " via OIDC" : ""}`);
}
