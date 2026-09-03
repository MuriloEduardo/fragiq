import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Este arquivo é lido apenas pelo CLI (migrate, studio) — o runtime usa
    // o adapter em src/lib/prisma.ts. Por isso a distinção importa: provedores
    // serverless (Neon, Supabase) entregam uma URL com pooler para a aplicação
    // e uma direta para DDL. Migrations por pooler falham ou travam, então
    // preferimos a direta quando existir.
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,
  },
});
