import SteamUser from "steam-user";
import { config } from "./config.js";

/**
 * Ferramenta de uma vez: cria o grupo "FragIQ" na comunidade Steam com a
 * conta do bot e publica o anúncio convidando a testar. Roda com o bot
 * parado (uma sessão por conta).
 *
 *   tsx src/grupo.ts inspecionar   — mostra os campos do formulário de criação
 *   tsx src/grupo.ts criar         — cria o grupo
 *   tsx src/grupo.ts anunciar      — publica o anúncio no grupo
 */
const [, , acao = "inspecionar"] = process.argv;

const client = new SteamUser({ autoRelogin: false });

client.on("error", (err) => {
  console.error("Erro:", err.message);
  process.exit(1);
});

client.on("webSession", async (sessionID: string, cookies: string[]) => {
  console.log("Sessão web pronta.");
  try {
    if (acao === "inspecionar") await inspecionar(cookies);
    if (acao === "criar") await criar(cookies, sessionID);
    if (acao === "perfil") await perfil(cookies, sessionID);
    if (acao === "anunciar") await anunciar(cookies, sessionID);
  } catch (err) {
    console.error("Falhou:", err);
  }
  client.logOff();
  process.exit(0);
});

const cabecalho = (cookies: string[]) => ({
  cookie: cookies.join("; "),
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  "accept-language": "pt-BR,pt;q=0.9",
});

async function inspecionar(cookies: string[]) {
  const res = await fetch(process.env.URL_INSPECAO ?? "https://steamcommunity.com/actions/GroupCreate", { headers: cabecalho(cookies), redirect: "manual" });
  console.log("status", res.status, res.headers.get("location") ?? "");
  const html = await res.text();
  if (process.env.SO_HTML) {
    console.log(html);
    return;
  }
  const form = html.match(/<form[^>]*>[\s\S]*?<\/form>/gi) ?? [];
  for (const f of form) {
    const abertura = f.match(/<form[^>]*>/i)?.[0];
    console.log("\n---", abertura);
    for (const campo of f.matchAll(/<(input|select|textarea)[^>]*>/gi)) {
      const tag = campo[0];
      const nome = tag.match(/name="([^"]+)"/)?.[1];
      const tipo = tag.match(/type="([^"]+)"/)?.[1];
      const valor = tag.match(/value="([^"]*)"/)?.[1];
      if (nome) console.log(`  ${campo[1]} ${nome} ${tipo ?? ""} ${valor ? `= ${valor.slice(0, 40)}` : ""}`);
    }
  }
  if (form.length === 0) console.log(html.replace(/\s+/g, " ").slice(0, 1500));
}

const GRUPO = {
  nome: "FragIQ Brasil",
  url: "fragiqbr",
  abreviacao: "FragIQ",
  resumo:
    "Sua evolução no CS2, sessão a sessão — não só o total. Beta gratuito. " +
    "Login pela Steam (só o SteamID), só leitura do que já é público, nada na conta é alterado. " +
    "https://fragiq-rouge.vercel.app",
};

async function criar(cookies: string[], sessionID: string, step = "1") {
  const corpo = new URLSearchParams({
    sessionID,
    step,
    groupName: GRUPO.nome,
    abbreviation: GRUPO.abreviacao,
    groupLink: GRUPO.url,
    bIsPublic: "1",
  });
  const res = await fetch("https://steamcommunity.com/actions/GroupCreate", {
    method: "POST",
    headers: { ...cabecalho(cookies), "content-type": "application/x-www-form-urlencoded", origin: "https://steamcommunity.com", referer: "https://steamcommunity.com/actions/GroupCreate" },
    body: corpo,
    redirect: "manual",
  });
  console.log("status", res.status, res.headers.get("location") ?? "");
  const texto = await res.text();
  const passo = texto.match(/name="step"[^>]*value="(\d+)"/)?.[1];
  const limpo = texto.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const miolo = limpo.slice(limpo.indexOf("Criar um grupo", 200));
  console.log("step do formulário devolvido:", passo ?? "(nenhum)");
  console.log(miolo.slice(0, 900));
  for (const campo of texto.matchAll(/<(input|select|textarea)[^>]*name="([^"]+)"[^>]*>/gi)) console.log("  campo:", campo[2]);
  // A Steam confirma em duas etapas: a resposta do passo 1 é o mesmo
  // formulário com step=2 e os dados repetidos. Reenviamos uma vez.
  if (step === "1" && passo === "2") await criar(cookies, sessionID, "2");
}

const ANUNCIO = {
  titulo: "Beta aberto: ajude a testar o FragIQ",
  corpo: `O FragIQ grava a sua evolução no CS2 sessão a sessão — a Steam só guarda o total vitalício, e depois de mil horas o K/D não se move. A gente guarda a curva e analisa cada sessão contra o seu normal, sem você digitar nada.

É gratuito e está em beta. Estamos procurando jogadores para testar e dizer o que falta.

[url=https://fragiq-rouge.vercel.app]fragiq-rouge.vercel.app[/url]

Como funciona, sem letra miúda:
[list]
[*]Login pela própria Steam (OpenID). Recebemos só o SteamID — nunca senha, e-mail ou Steam Guard.
[*]Só leitura do que já é público no seu perfil. Nada na sua conta é alterado. Inventário, skins e trocas nunca são tocados.
[*]Você baixa tudo o que temos sobre você em um clique, e apaga tudo em outro.
[*]Este bot ([url=https://steamcommunity.com/profiles/76561198647798293]FragIQ[/url]) é opcional: como amigo, ele percebe quando você termina uma partida e manda a análise no chat.
[/list]

Quem participar do beta ganha o selo de beta tester na plataforma. Feedback, bugs e ideias: [url=https://fragiq-rouge.vercel.app/comunidade]fragiq-rouge.vercel.app/comunidade[/url] ou aqui no grupo.`,
};

async function perfil(cookies: string[], sessionID: string) {
  const corpo = new URLSearchParams({
    sessionID,
    type: "profileSave",
    abbreviation: GRUPO.abreviacao,
    headline: "Sua evolução no CS2, sessão a sessão. Beta gratuito.",
    summary: GRUPO.resumo,
    customURL: GRUPO.url,
    language: "brazilian",
    country: "BR",
    state: "",
    city: "",
    associate_game: "",
    favorite_games: "730",
  });
  const res = await fetch(`https://steamcommunity.com/groups/${GRUPO.url}/edit/profile`, {
    method: "POST",
    headers: { ...cabecalho(cookies), "content-type": "application/x-www-form-urlencoded", origin: "https://steamcommunity.com", referer: `https://steamcommunity.com/groups/${GRUPO.url}/edit` },
    body: corpo,
    redirect: "manual",
  });
  console.log("perfil:", res.status, res.headers.get("location") ?? "");
  const texto = (await res.text()).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  console.log(texto.slice(texto.indexOf("Editar"), texto.indexOf("Editar") + 300));
}

async function anunciar(cookies: string[], sessionID: string) {
  const titulo = process.env.TITULO ?? ANUNCIO.titulo;
  const texto0 = process.env.CORPO ?? ANUNCIO.corpo;
  const corpo = new URLSearchParams({
    sessionID,
    action: "post",
    headline: titulo,
    body: texto0,
    "languages[0][headline]": titulo,
    "languages[0][body]": texto0,
  });
  const res = await fetch(`https://steamcommunity.com/groups/${GRUPO.url}/announcements`, {
    method: "POST",
    headers: { ...cabecalho(cookies), "content-type": "application/x-www-form-urlencoded", origin: "https://steamcommunity.com", referer: `https://steamcommunity.com/groups/${GRUPO.url}/announcements/create` },
    body: corpo,
    redirect: "manual",
  });
  console.log("status", res.status, res.headers.get("location") ?? "");
  const texto = (await res.text()).replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  console.log(texto.slice(0, 500));
  const lista = await fetch(`https://steamcommunity.com/groups/${GRUPO.url}/announcements/`, { headers: cabecalho(cookies) });
  const html = await lista.text();
  console.log("como dono, a listagem tem o anúncio?", html.includes(titulo), "| hidden?", /is_hidden|oculto|hidden_announcement/i.test(html));
  const limpo = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  console.log(limpo.slice(limpo.indexOf("Anúncios"), limpo.indexOf("Anúncios") + 600));
}

client.logOn({ refreshToken: config.refreshToken ?? undefined });
