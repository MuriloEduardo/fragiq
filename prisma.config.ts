import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Lido apenas pelo CLI (migrate, studio) — o runtime usa o adapter em
    // src/lib/prisma.ts com DATABASE_URL.
    //
    // A distinção importa em provedores serverless: a aplicação recebe uma
    // URL com pooler, mas o pgbouncer em modo transaction não suporta os
    // advisory locks que o Prisma usa para migrar, então DDL precisa da
    // conexão direta.
    //
    // DATABASE_URL_UNPOOLED é o nome que a integração Neon↔Vercel injeta
    // sozinha; DIRECT_DATABASE_URL fica como escape hatch para outros
    // provedores. Assim nada precisa ser copiado à mão.
    url:
      process.env.DIRECT_DATABASE_URL ||
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.DATABASE_URL,
  },
});
