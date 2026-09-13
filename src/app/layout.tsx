import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FragIQ — suas estatísticas de CS2 ao longo do tempo",
  description:
    "A Steam guarda só o total acumulado desde sempre. O FragIQ coleta periodicamente e mostra a diferença entre as coletas: 178 estatísticas de CS2 em série temporal, com leituras em português, painel fixo e todos os contadores comparados com o vitalício. Beta aberto.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
