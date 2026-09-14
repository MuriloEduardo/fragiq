/**
 * Diagnóstico da integração com a Steam.
 *
 *   npm run probe -- <SteamID64>
 *
 * Verifica se o caminho até a Steam funciona (as variáveis COGNIFLOW_* e os
 * grants steam.* do tenant), se o perfil está com a privacidade correta e
 * quais contadores o jogo expõe — sem gravar nada no banco. É o primeiro
 * lugar a olhar quando um usuário reclama que o dashboard veio vazio.
 */

import "dotenv/config";
import { getOwnedGames, getPlayerSummary, getUserStatsForGame } from "../src/lib/steam/api";

const DESTAQUES = [
  "total_kills",
  "total_deaths",
  "total_kills_headshot",
  "total_shots_fired",
  "total_shots_hit",
  "total_damage_done",
  "total_rounds_played",
  "total_matches_played",
  "total_matches_won",
  "total_mvps",
  "total_time_played",
];

async function main() {
  const steamId = process.argv[2];
  if (!steamId || !/^7656119\d{10}$/.test(steamId)) {
    console.error("Uso: npm run probe -- <SteamID64>");
    process.exit(1);
  }

  const perfil = await getPlayerSummary(steamId);
  console.log("== perfil ==");
  if (!perfil) {
    console.log("  não encontrado");
    return;
  }
  console.log("  persona:", perfil.personaname);
  console.log(
    "  visibilidade:",
    perfil.communityvisibilitystate,
    perfil.communityvisibilitystate === 3 ? "(público)" : "(PRIVADO — biblioteca virá vazia)",
  );

  const jogos = await getOwnedGames(steamId);
  const jogados = jogos.filter((g) => g.playtime_forever > 0);
  console.log("\n== biblioteca ==");
  console.log(`  ${jogos.length} jogos, ${jogados.length} com tempo registrado`);
  for (const g of [...jogados]
    .sort((a, b) => b.playtime_forever - a.playtime_forever)
    .slice(0, 10)) {
    const horas = (g.playtime_forever / 60).toFixed(0).padStart(5);
    console.log(`  ${String(g.appid).padStart(7)}  ${horas}h  ${g.name ?? "?"}`);
  }

  // Amostra os jogos mais jogados para ver quais realmente expõem stats.
  console.log("\n== contadores por jogo ==");
  for (const g of [...jogados]
    .sort((a, b) => b.playtime_forever - a.playtime_forever)
    .slice(0, 6)) {
    const stats = await getUserStatsForGame(steamId, g.appid);
    const nome = (g.name ?? String(g.appid)).slice(0, 30).padEnd(30);
    if (!stats) {
      console.log(`  ${nome} — sem stats públicas`);
      continue;
    }
    console.log(
      `  ${nome} ${String(Object.keys(stats.metrics).length).padStart(3)} contadores` +
        (stats.achievementsTotal
          ? `, ${stats.achievementsUnlocked}/${stats.achievementsTotal} conquistas`
          : ""),
    );
  }

  const cs = await getUserStatsForGame(steamId, 730);
  if (!cs) return;

  console.log("\n== CS2 (730) ==");
  for (const chave of DESTAQUES) {
    if (chave in cs.metrics) {
      console.log(`  ${chave.padEnd(24)} ${cs.metrics[chave].toLocaleString("pt-BR")}`);
    }
  }

  const m = cs.metrics;
  console.log("\n  derivadas vitalícias:");
  if (m.total_deaths) console.log("    K/D      ", (m.total_kills / m.total_deaths).toFixed(2));
  if (m.total_kills)
    console.log("    HS%      ", ((m.total_kills_headshot / m.total_kills) * 100).toFixed(1) + "%");
  if (m.total_shots_fired)
    console.log(
      "    precisão ",
      ((m.total_shots_hit / m.total_shots_fired) * 100).toFixed(1) + "%",
    );
  if (m.total_rounds_played)
    console.log("    dano/round", (m.total_damage_done / m.total_rounds_played).toFixed(0));
}

main().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
