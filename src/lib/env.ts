import { z } from "zod";

// Validado uma vez, no boot do servidor. Falhar aqui é muito melhor do que
// descobrir um STEAM_API_KEY vazio dentro de um fetch em produção.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  STEAM_API_KEY: z.string().min(1, "Pegue a chave em https://steamcommunity.com/dev/apikey"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET precisa ter ao menos 32 caracteres"),
  NEXT_PUBLIC_APP_URL: z.url(),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (cached) return cached;

  const parsed = schema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    STEAM_API_KEY: process.env.STEAM_API_KEY,
    AUTH_SECRET: process.env.AUTH_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
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
