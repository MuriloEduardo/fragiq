import { z } from "zod";

// Validado uma vez, no boot do servidor. Falhar aqui é muito melhor do que
// descobrir um STEAM_API_KEY vazio dentro de um fetch em produção.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  STEAM_API_KEY: z.string().min(1, "Pegue a chave em https://steamcommunity.com/dev/apikey"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET precisa ter ao menos 32 caracteres"),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (cached) return cached;

  const parsed = schema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    STEAM_API_KEY: process.env.STEAM_API_KEY,
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
