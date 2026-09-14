import { z } from "zod";

// Validado uma vez, no boot do servidor. Falhar aqui é muito melhor do que
// descobrir uma variável vazia dentro de um fetch em produção.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET precisa ter ao menos 32 caracteres"),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (cached) return cached;

  const parsed = schema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/**
 * URL pública da aplicação, usada para montar o `realm` e o `return_to` do
 * OpenID da Steam e todos os redirects de autenticação.
 *
 * Deriva sozinha em vez de exigir configuração porque, num primeiro deploy,
 * a URL só existe *depois* de subir — exigir a variável antes criaria um
 * ovo-e-galinha (deploy quebrado, corrige a env, redeploy).
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` é o domínio estável do projeto, igual em
 * todos os deployments. Usamos ele mesmo em preview de propósito: cada
 * preview tem URL própria e aleatória, e mandar o OpenID para uma delas só
 * espalharia sessões por domínios efêmeros.
 */
export function appUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

/**
 * Conexão com o cogniflow, o serviço que responde às perguntas do analista.
 *
 * Opcional de propósito: sem as três variáveis a seção "Pergunte ao analista"
 * não aparece, e o resto do site não sabe que ela existe. Exigir no boot
 * quebraria o dev local de quem só quer mexer nos gráficos.
 *
 * O segredo assina os dois sentidos — o que enviamos ao webhook e o que o
 * cogniflow nos devolve no callback e pede no endpoint de dados — então é um
 * valor só, o mesmo que está em `tenants.fragiq.webhook.web` no segredo de
 * plataforma deles.
 */
export type Cogniflow = {
  webhookUrl: string;
  clientId: string;
  signingSecret: string;
};

export function cogniflow(): Cogniflow | null {
  const webhookUrl = process.env.COGNIFLOW_WEBHOOK_URL?.trim();
  const clientId = process.env.COGNIFLOW_CLIENT_ID?.trim();
  const signingSecret = process.env.COGNIFLOW_SIGNING_SECRET?.trim();
  if (!webhookUrl || !clientId || !signingSecret) return null;
  return { webhookUrl, clientId, signingSecret };
}

/**
 * A API de capabilities do cogniflow, por onde lemos a Steam.
 *
 * O FragIQ não tem chave da Steam: quem fala com a Web API é o cogniflow,
 * com a chave da plataforma, e nós chamamos `POST /capabilities/steam.*`
 * assinando com o mesmo segredo da conexão webhook. Sem estas variáveis
 * nenhuma coleta funciona — mas o site abre, e o `npm run seed` continua
 * servindo para mexer nos gráficos sem falar com ninguém. Por isso a
 * validação é na primeira chamada, não no boot.
 */
export type CogniflowApi = {
  apiUrl: string;
  tenantId: string;
  connectionId: string;
  signingSecret: string;
};

let apiCached: CogniflowApi | null = null;

export function cogniflowApi(): CogniflowApi {
  if (apiCached) return apiCached;
  const apiUrl = process.env.COGNIFLOW_API_URL?.trim().replace(/\/$/, "");
  const tenantId = process.env.COGNIFLOW_TENANT_ID?.trim();
  const connectionId = process.env.COGNIFLOW_CONNECTION_ID?.trim();
  const signingSecret = process.env.COGNIFLOW_SIGNING_SECRET?.trim();
  if (!apiUrl || !tenantId || !connectionId || !signingSecret) {
    throw new Error(
      "A leitura da Steam passa pelo cogniflow: defina COGNIFLOW_API_URL, COGNIFLOW_TENANT_ID, " +
        "COGNIFLOW_CONNECTION_ID e COGNIFLOW_SIGNING_SECRET (ver docs/cogniflow-tenant.md).",
    );
  }
  apiCached = { apiUrl, tenantId, connectionId, signingSecret };
  return apiCached;
}
