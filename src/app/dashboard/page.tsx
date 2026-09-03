import { redirect } from "next/navigation";

/**
 * O dashboard listava a biblioteca inteira da Steam. Com o produto focado em
 * CS2, mostrar Manor Lords e GTA V era ruído — e a tela não respondia a
 * nenhuma pergunta que a página do CS2 não respondesse melhor.
 *
 * Mantido só como redirect: a URL já circulou.
 */
export default function DashboardRedirect() {
  redirect("/games/730");
}
