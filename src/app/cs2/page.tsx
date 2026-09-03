import { redirect } from "next/navigation";

/**
 * Rota canônica do app. A implementação vive em /games/[appId] porque o
 * motor continua agnóstico de jogo por dentro — mas o produto é de CS2, e a
 * URL deve dizer isso.
 */
export default function Cs2Page() {
  redirect("/games/730");
}
