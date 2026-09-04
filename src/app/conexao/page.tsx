import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { appUrl } from "@/lib/env";
import { SiteHeader } from "@/components/site-header";
import { CopyBlock } from "@/components/copy-block";

export const dynamic = "force-dynamic";

/**
 * Ligar o CS2 ao FragIQ pelo Game State Integration.
 *
 * O jogo lê arquivos `gamestate_integration_*.cfg` da pasta de config e passa
 * a fazer POST do estado para a URI que estiver lá. Isso resolve de uma vez
 * o que a Web API não dá: mapa (inclusive os modernos, que os contadores da
 * Steam ignoram), modo, e o placar da partida em vez de contador vitalício.
 *
 * O token é gerado aqui, na primeira visita, porque ele só faz sentido junto
 * do arquivo — pedir para a pessoa clicar em "gerar" antes de ver para que
 * serve seria um passo a mais sem informação nenhuma.
 */
export default async function ConexaoPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { personaName: true, avatarUrl: true, lastSyncedAt: true, gsiToken: true },
  });
  if (!user) redirect("/");

  let token = user.gsiToken;
  if (!token) {
    token = randomBytes(24).toString("base64url");
    await prisma.user.update({ where: { id: session.userId }, data: { gsiToken: token } });
  }

  const uri = `${appUrl()}/api/gsi`;

  // timeout 5s porque o padrão do jogo é 1,1s e não sobrevive a um cold start
  // de função serverless — e sem 2XX o CS2 desiste do cálculo de delta.
  const cfg = `"FragIQ v.1"
{
  "uri" "${uri}"
  "timeout" "5.0"
  "buffer" "1.0"
  "throttle" "5.0"
  "heartbeat" "60.0"
  "auth"
  {
    "token" "${token}"
  }
  "data"
  {
    "provider" "1"
    "map" "1"
    "player_id" "1"
    "player_match_stats" "1"
  }
}
`;

  return (
    <>
      <SiteHeader
        personaName={user.personaName}
        avatarUrl={user.avatarUrl}
        lastSyncedAt={user.lastSyncedAt}
      />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Ligar o CS2 ao FragIQ
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Com isto o próprio jogo passa a relatar cada partida: mapa, modo e
          placar. É o que os contadores da Steam não sabem dizer — eles somam
          todos os modos e não conhecem Mirage, Ancient, Anubis nem Overpass.
        </p>

        <ol className="mt-8 space-y-6">
          <Passo n={1} titulo="Abra a pasta de configuração do CS2">
            <p className="text-sm text-ink-muted">
              Na Steam, clique com o botão direito em Counter-Strike 2 →{" "}
              <em>Gerenciar</em> → <em>Explorar arquivos locais</em>, e entre em{" "}
              <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">game/csgo/cfg</code>.
            </p>
          </Passo>

          <Passo n={2} titulo="Crie o arquivo gamestate_integration_fragiq.cfg">
            <p className="text-sm text-ink-muted">
              O nome precisa começar com{" "}
              <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">
                gamestate_integration_
              </code>{" "}
              e o arquivo não pode ter BOM UTF-8, senão o jogo o ignora em
              silêncio. Cole exatamente isto:
            </p>
            <CopyBlock texto={cfg} className="mt-3" />
            <p className="mt-2 text-xs text-ink-faint">
              O token aí dentro é seu e identifica suas partidas. Quem tiver
              ele pode gravar partidas na sua conta — trate como senha.
            </p>
          </Passo>

          <Passo n={3} titulo="Reinicie o CS2">
            <p className="text-sm text-ink-muted">
              O jogo só lê esses arquivos ao abrir. Depois disso não há mais
              nada a fazer: jogue, e as partidas aparecem sozinhas.
            </p>
          </Passo>
        </ol>

        <p className="mt-8 rounded-xl border border-line bg-surface px-4 py-3 text-xs leading-relaxed text-ink-faint">
          O jogo só reporta enquanto está aberto, e só o que acontece a partir
          de agora — não há histórico retroativo. A coleta pela Web API
          continua funcionando em paralelo: uma conta o vitalício, a outra
          conta cada partida.
        </p>
      </main>
    </>
  );
}

function Passo({
  n,
  titulo,
  children,
}: {
  n: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="tnum flex size-7 shrink-0 items-center justify-center rounded-full border border-line text-sm text-ink-muted">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-medium">{titulo}</h2>
        <div className="mt-1">{children}</div>
      </div>
    </li>
  );
}
