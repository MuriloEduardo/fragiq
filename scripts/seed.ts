/**
 * Popula um usuário de demonstração com 90 dias de coletas de CS2, para
 * conseguir avaliar o explorador sem uma chave da Steam Web API.
 *
 *   npm run seed
 *
 * Os contadores crescem como os reais: cumulativos, e com uma "forma" que
 * oscila ao longo das semanas — sem isso todo gráfico derivado sai reto e
 * não dá para julgar se a visualização funciona.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

export const DEMO_STEAM_ID = "76561197960287930";

const DAYS = 90;

const CS2_STAT_SCHEMA: Record<string, string> = {
  total_kills: "Total de kills",
  total_deaths: "Total de mortes",
  total_kills_headshot: "Kills de headshot",
  total_shots_fired: "Tiros disparados",
  total_shots_hit: "Tiros acertados",
  total_damage_done: "Dano causado",
  total_rounds_played: "Rounds jogados",
  total_matches_played: "Partidas jogadas",
  total_matches_won: "Partidas vencidas",
  total_mvps: "MVPs",
  total_time_played: "Tempo jogado",
};

function main() {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { steamId: DEMO_STEAM_ID },
      create: {
        steamId: DEMO_STEAM_ID,
        personaName: "demo_player",
        avatarUrl: null,
        lastSyncedAt: new Date(),
      },
      update: { lastSyncedAt: new Date() },
    });

    await tx.game.upsert({
      where: { appId: 730 },
      create: {
        appId: 730,
        name: "Counter-Strike 2",
        statSchema: CS2_STAT_SCHEMA,
        schemaFetchedAt: new Date(),
      },
      update: { statSchema: CS2_STAT_SCHEMA, schemaFetchedAt: new Date() },
    });

    const userGame = await tx.userGame.upsert({
      where: { userId_gameAppId: { userId: user.id, gameAppId: 730 } },
      create: { userId: user.id, gameAppId: 730 },
      update: {},
    });

    // Recomeça do zero a cada execução para o seed ser idempotente.
    await tx.statSnapshot.deleteMany({ where: { userGameId: userGame.id } });

    // Ponto de partida: uma conta com histórico, como qualquer jogador real.
    const totals: Record<string, number> = {
      total_kills: 28_400,
      total_deaths: 30_100,
      total_kills_headshot: 9_100,
      total_shots_fired: 402_000,
      total_shots_hit: 78_500,
      total_damage_done: 3_940_000,
      total_rounds_played: 46_800,
      total_matches_played: 1_820,
      total_matches_won: 870,
      total_mvps: 3_240,
      total_time_played: 4_100_000,
    };

    let playtimeMin = Math.round(totals.total_time_played / 60);
    const snapshots: {
      userGameId: string;
      capturedAt: Date;
      playtimeForeverMin: number;
      metrics: Record<string, number>;
      achievementsUnlocked: number;
      achievementsTotal: number;
    }[] = [];

    for (let day = DAYS; day >= 0; day--) {
      const date = new Date();
      date.setDate(date.getDate() - day);
      date.setHours(5, 0, 0, 0); // horário do cron.

      // Nem todo dia tem jogo — buracos são realistas e testam connectNulls.
      const matches = [0, 0, 1, 1, 2, 2, 3][Math.floor(pseudo(day) * 7)];

      if (matches > 0) {
        // Forma oscilando em ciclo de ~3 semanas, com ruído por cima.
        const form = 0.88 + 0.24 * Math.sin((DAYS - day) / 21) + (pseudo(day * 7) - 0.5) * 0.1;

        for (let m = 0; m < matches; m++) {
          const rounds = 18 + Math.floor(pseudo(day * 13 + m) * 12);
          const kills = Math.round(rounds * 0.72 * form);
          const deaths = Math.round(rounds * 0.78 / Math.max(form, 0.5));
          const shots = kills * 26 + Math.floor(pseudo(day + m) * 200);

          totals.total_rounds_played += rounds;
          totals.total_kills += kills;
          totals.total_deaths += deaths;
          totals.total_kills_headshot += Math.round(kills * (0.30 + form * 0.12));
          totals.total_shots_fired += shots;
          totals.total_shots_hit += Math.round(shots * (0.17 + form * 0.06));
          totals.total_damage_done += Math.round(rounds * 78 * form);
          totals.total_matches_played += 1;
          totals.total_matches_won += pseudo(day * 3 + m) < 0.42 + (form - 1) * 0.5 ? 1 : 0;
          totals.total_mvps += Math.round(kills * 0.11);
          totals.total_time_played += rounds * 115;
          playtimeMin += Math.round((rounds * 115) / 60);
        }
      }

      // Sem partidas o snapshot repetiria o anterior — o coletor real também
      // pula esse dia, então o seed não deve gravá-lo.
      if (matches === 0 && day !== DAYS) continue;

      snapshots.push({
        userGameId: userGame.id,
        capturedAt: date,
        playtimeForeverMin: playtimeMin,
        metrics: { ...totals },
        achievementsUnlocked: 128,
        achievementsTotal: 167,
      });
    }

    await tx.statSnapshot.createMany({ data: snapshots });

    await tx.userGame.update({
      where: { id: userGame.id },
      data: {
        playtimeForeverMin: playtimeMin,
        playtimeTwoWeeksMin: 640,
        lastPlayedAt: new Date(),
      },
    });

    return { user: user.personaName, snapshots: snapshots.length };
  });
}

/** PRNG determinístico — o mesmo seed sempre gera o mesmo histórico. */
function pseudo(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

main()
  .then((r) => console.log(`Seed pronto: ${r.snapshots} coletas para ${r.user}.`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
