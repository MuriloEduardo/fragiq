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
 * O carregamento é preguiçoso — na primeira leitura de um segredo, dentro
 * de uma requisição — e não no boot. Foi medido do jeito errado primeiro:
 * um `instrumentation.ts` derrubou a produção em 14/09/2026 porque o token
 * OIDC da Vercel é um header da requisição (`x-vercel-oidc-token`), e
 * antes da primeira requisição não há token para trocar por credencial.
 * Depois da primeira leitura o valor fica em `process.env` para a vida da
 * instância; uma falha zera o cache e a próxima requisição tenta de novo.
 *
 * O que fica de fora, e por quê: `DATABASE_URL` e `DIRECT_DATABASE_URL`
 * porque o build roda `prisma migrate deploy` antes de existir runtime;
 * `CRON_SECRET` porque a Vercel só manda o Bearer do cron se a variável
 * estiver nela. O resto — assinatura de sessão, segredo do cogniflow, do
 * bot — sai daqui, e as variáveis correspondentes podem ser apagadas.
 */
export const CHAVES_DO_SEGREDO = ["AUTH_SECRET", "COGNIFLOW_SIGNING_SECRET", "BOT_WEBHOOK_SECRET"] as const;
export type ChaveDoSegredo = (typeof CHAVES_DO_SEGREDO)[number];

let carregado: Promise<void> | null = null;

function carregarSegredos(): Promise<void> {
  carregado ??= carregar().catch((err) => {
    carregado = null;
    throw err;
  });
  return carregado;
}

/** O valor de um segredo, ou null se não está no segredo nem no ambiente. */
export async function segredoOpcional(nome: ChaveDoSegredo): Promise<string | null> {
  await carregarSegredos();
  return process.env[nome]?.trim() || null;
}

/** O valor de um segredo; sem ele o site não funciona, então lança. */
export async function segredo(nome: ChaveDoSegredo): Promise<string> {
  const valor = await segredoOpcional(nome);
  if (!valor) {
    throw new Error(
      `${nome} não está em ${process.env.FRAGIQ_SECRET_ID ?? "FRAGIQ_SECRET_ID (não definido)"} nem no ambiente (ver docs/segredos.md).`,
    );
  }
  return valor;
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
