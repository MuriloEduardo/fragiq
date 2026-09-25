-- Traz o histórico do Neon para o Supabase sem pisar no que o site gravou
-- depois da troca de banco (2026-09-23). Ver docs/recuperacao-neon.md.
--
-- Pré-requisito: os dados do Neon carregados no schema `neon_import`, no
-- mesmo banco, com as mesmas tabelas de `public` (mesma migration).
--
--   psql "$SUPABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/recuperacao/merge-neon.sql
--       ensaio: faz tudo, mostra as contagens e desfaz (ROLLBACK)
--   psql "$SUPABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -v aplicar=1 -f scripts/recuperacao/merge-neon.sql
--       grava (COMMIT)
--
-- Regras, tabela a tabela:
--   users           quem voltou depois da troca tem duas linhas (mesmo steamId,
--                   ids diferentes). Fica o id do Neon, que é dono do histórico;
--                   a linha nova é renomeada para ele e o ON UPDATE CASCADE das
--                   FKs leva junto tudo o que já apontava para ela.
--   user_games      mesma coisa por (userId, gameAppId).
--   matches         a do Neon vence quando está DONE e a do Supabase não (o GC
--                   esquece em ~30 dias; o Neon pode ser o único que ainda tem).
--   match_demos     idem (a Valve apaga as demos).
--   participants    a do Neon vence (é a inscrição original).
--   bot_amigos      `desde` e convites do Neon, `saiuEm` do Supabase.
--   sessions,       não são copiadas: derivadas. `npm run recompute:sessions`
--   insights        e `recompute:insights` refazem depois do merge.
--   pending_captures  não são copiadas: capturas vencidas antes da queda.
--   steam_messages  as que ficaram PENDING no Neon entram como FAILED, para o
--                   bot não mandar agora uma mensagem de dias atrás.
--   resto           entra tudo; em conflito de chave fica a linha do Supabase
--                   (é a leitura mais recente).

\set ON_ERROR_STOP 1
\set QUIET 1
\if :{?aplicar}
\else
  \set aplicar 0
\endif

BEGIN;

-- Nada de escrita concorrente no meio: o cron e o webhook do bot esperam.
LOCK TABLE public.users, public.user_games, public.matches IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF to_regnamespace('neon_import') IS NULL THEN
    RAISE EXCEPTION 'schema neon_import não existe: carregue o dump do Neon antes';
  END IF;
END $$;

-- Copia as linhas de neon_import.<tabela> para public.<tabela>, só com as
-- colunas que existem nos dois lados. Enums de neon_import são tipos
-- diferentes dos de public, então toda coluna USER-DEFINED passa por text.
CREATE FUNCTION pg_temp.copiar(tabela text, conflito text DEFAULT 'ON CONFLICT DO NOTHING', filtro text DEFAULT 'true')
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  destino text;
  origem text;
  n bigint;
BEGIN
  SELECT string_agg(format('%I', d.column_name), ', ' ORDER BY d.ordinal_position),
         string_agg(CASE WHEN d.data_type = 'USER-DEFINED'
                         THEN format('n.%I::text::public.%I', d.column_name, d.udt_name)
                         ELSE format('n.%I', d.column_name) END, ', ' ORDER BY d.ordinal_position)
    INTO destino, origem
    FROM information_schema.columns d
    JOIN information_schema.columns o
      ON o.table_schema = 'neon_import' AND o.table_name = d.table_name AND o.column_name = d.column_name
   WHERE d.table_schema = 'public' AND d.table_name = tabela;

  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM neon_import.%I n WHERE %s %s',
                 tabela, destino, origem, tabela, filtro, conflito);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '% : % linha(s) do Neon', rpad(tabela, 22), n;
  RETURN n;
END $$;

-- 1. Quem existe dos dois lados --------------------------------------------

CREATE TEMP TABLE mapa_usuario ON COMMIT DROP AS
SELECT p.id AS novo, n.id AS antigo, p."steamId"
  FROM public.users p
  JOIN neon_import.users n USING ("steamId")
 WHERE p.id <> n.id;

SELECT count(*) AS "jogadores que voltaram depois da troca" FROM mapa_usuario;

-- Colunas com id de usuário sem FK: o cascade não chega nelas.
UPDATE public.eventos e SET "userId" = m.antigo FROM mapa_usuario m WHERE e."userId" = m.novo;
UPDATE public.bot_observations b SET "userId" = m.antigo FROM mapa_usuario m WHERE b."userId" = m.novo;
UPDATE public.matches x SET "descobertaPorId" = m.antigo FROM mapa_usuario m WHERE x."descobertaPorId" = m.novo;

-- Derivadas: somem e voltam no recompute (guardam ids de user_games e de
-- snapshots sem FK, que o merge muda).
DELETE FROM public.insights i USING mapa_usuario m WHERE i."userId" = m.novo;
DELETE FROM public.sessions s USING mapa_usuario m WHERE s."userId" = m.novo;

-- A renomeação: cascateia para user_games, sync_runs, match_players,
-- follows, participants, inventory_items, steam_messages, pending_captures...
UPDATE public.users u SET id = m.antigo FROM mapa_usuario m WHERE u.id = m.novo;

-- Perfil (nome, avatar, amizade com o bot, inventário) fica o do Supabase,
-- que é a leitura de agora. O que a pessoa configurou à mão vem do Neon, a
-- menos que ela já tenha refeito depois da troca.
UPDATE public.users u SET
  "createdAt"          = LEAST(u."createdAt", n."createdAt"),
  "perfilPublico"      = n."perfilPublico",
  "curvaVisivel"       = n."curvaVisivel",
  "avisoSteam"         = n."avisoSteam",
  "avisosPrivacidade"  = GREATEST(u."avisosPrivacidade", n."avisosPrivacidade"),
  "avisoPrivacidadeEm" = GREATEST(u."avisoPrivacidadeEm", n."avisoPrivacidadeEm"),
  "avisosPartidas"     = GREATEST(u."avisosPartidas", n."avisosPartidas"),
  "avisoPartidasEm"    = GREATEST(u."avisoPartidasEm", n."avisoPartidasEm"),
  -- A corrente de share codes anda junta: código, posição, erro e data.
  "steamAuthCode"      = CASE WHEN u."steamAuthCode" IS NULL THEN n."steamAuthCode"      ELSE u."steamAuthCode" END,
  "shareCodeAtual"     = CASE WHEN u."steamAuthCode" IS NULL THEN n."shareCodeAtual"     ELSE u."shareCodeAtual" END,
  "partidasErro"       = CASE WHEN u."steamAuthCode" IS NULL THEN n."partidasErro"       ELSE u."partidasErro" END,
  "partidasAtivadasEm" = CASE WHEN u."steamAuthCode" IS NULL THEN n."partidasAtivadasEm" ELSE u."partidasAtivadasEm" END
FROM neon_import.users n
WHERE u.id = n.id AND u.id IN (SELECT antigo FROM mapa_usuario);

-- 2. Jogos por usuário que existem dos dois lados --------------------------

CREATE TEMP TABLE mapa_jogo ON COMMIT DROP AS
SELECT p.id AS novo, n.id AS antigo
  FROM public.user_games p
  JOIN neon_import.user_games n USING ("userId", "gameAppId")
 WHERE p.id <> n.id;

UPDATE public.user_games g SET id = m.antigo FROM mapa_jogo m WHERE g.id = m.novo;  -- cascateia stat_snapshots
UPDATE public.user_games g SET "firstSeenAt" = LEAST(g."firstSeenAt", n."firstSeenAt")
  FROM neon_import.user_games n WHERE g.id = n.id;

-- 3. Partidas e demos em que o Neon sabe mais ------------------------------

-- Apagar a linha do Supabase leva junto jogadores e demos dela (cascade); o
-- passo 4 põe no lugar as do Neon.
DELETE FROM public.matches p USING neon_import.matches n
 WHERE p.id = n.id AND n.status::text = 'DONE' AND p.status::text <> 'DONE';
DELETE FROM public.match_demos p USING neon_import.match_demos n
 WHERE p."matchId" = n."matchId" AND n.status::text = 'DONE' AND p.status::text <> 'DONE';
DELETE FROM public.match_player_demos p
 WHERE NOT EXISTS (SELECT 1 FROM public.match_demos d WHERE d."matchId" = p."matchId" AND d.status::text = 'DONE')
   AND EXISTS (SELECT 1 FROM neon_import.match_demos d WHERE d."matchId" = p."matchId" AND d.status::text = 'DONE');
DELETE FROM public.match_team_demos p
 WHERE NOT EXISTS (SELECT 1 FROM public.match_demos d WHERE d."matchId" = p."matchId" AND d.status::text = 'DONE')
   AND EXISTS (SELECT 1 FROM neon_import.match_demos d WHERE d."matchId" = p."matchId" AND d.status::text = 'DONE');

-- 4. O resto do Neon, pais antes de filhos ---------------------------------

\o /dev/null
SELECT pg_temp.copiar('users');
SELECT pg_temp.copiar('games');
SELECT pg_temp.copiar('user_games');
SELECT pg_temp.copiar('sync_runs');
SELECT pg_temp.copiar('cron_runs');
SELECT pg_temp.copiar('stat_snapshots');
SELECT pg_temp.copiar('analyses');
SELECT pg_temp.copiar('feedback');
SELECT pg_temp.copiar('follows');
SELECT pg_temp.copiar('participants',
  'ON CONFLICT ("userId") DO UPDATE SET "githubLogin" = EXCLUDED."githubLogin", papeis = EXCLUDED.papeis,
     mensagem = EXCLUDED.mensagem, visivel = EXCLUDED.visivel, "createdAt" = EXCLUDED."createdAt"');
SELECT pg_temp.copiar('steam_messages');
-- Mensagem que ficou na fila do Neon não sai mais: chegaria dias depois,
-- falando de uma sessão velha. Entra no histórico como falha.
UPDATE public.steam_messages s SET status = 'FAILED', error = 'perdida na troca de banco (2026-09-23)'
  FROM neon_import.steam_messages n WHERE s.id = n.id AND n.status::text = 'PENDING';
SELECT pg_temp.copiar('matches');
SELECT pg_temp.copiar('match_players');
SELECT pg_temp.copiar('match_demos');
SELECT pg_temp.copiar('match_player_demos');
SELECT pg_temp.copiar('match_team_demos');
SELECT pg_temp.copiar('inventory_items');
SELECT pg_temp.copiar('inventarios_publicos');
SELECT pg_temp.copiar('item_prices');
SELECT pg_temp.copiar('bot_amigos',
  'ON CONFLICT ("steamId") DO UPDATE SET desde = LEAST(bot_amigos.desde, EXCLUDED.desde),
     convites = GREATEST(bot_amigos.convites, EXCLUDED.convites),
     "ultimoConviteEm" = GREATEST(bot_amigos."ultimoConviteEm", EXCLUDED."ultimoConviteEm")');
SELECT pg_temp.copiar('bot_observations');
SELECT pg_temp.copiar('bot_logs');
SELECT pg_temp.copiar('eventos');
\o
-- Fora de propósito: sessions, insights (recompute), pending_captures
-- (vencidas), bot_status (o do Supabase é o estado de agora),
-- _prisma_migrations.

-- 5. Conferência -----------------------------------------------------------
-- Toda linha do Neon tem que estar em public pela chave natural. O que for
-- diferente de zero aborta (e o ROLLBACK desfaz tudo).

CREATE TEMP TABLE conferencia ON COMMIT DROP AS
SELECT 'users' AS tabela, count(*) AS faltando FROM neon_import.users n
  WHERE NOT EXISTS (SELECT 1 FROM public.users p WHERE p."steamId" = n."steamId")
UNION ALL SELECT 'user_games', count(*) FROM neon_import.user_games n
  WHERE NOT EXISTS (SELECT 1 FROM public.user_games p WHERE p."userId" = n."userId" AND p."gameAppId" = n."gameAppId")
UNION ALL SELECT 'stat_snapshots', count(*) FROM neon_import.stat_snapshots n
  WHERE NOT EXISTS (SELECT 1 FROM public.stat_snapshots p WHERE p."userGameId" = n."userGameId" AND p."capturedAt" = n."capturedAt")
UNION ALL SELECT 'matches', count(*) FROM neon_import.matches n
  WHERE NOT EXISTS (SELECT 1 FROM public.matches p WHERE p.id = n.id)
UNION ALL SELECT 'match_players', count(*) FROM neon_import.match_players n
  WHERE NOT EXISTS (SELECT 1 FROM public.match_players p WHERE p."matchId" = n."matchId" AND p."steamId" = n."steamId")
UNION ALL SELECT 'match_player_demos', count(*) FROM neon_import.match_player_demos n
  WHERE NOT EXISTS (SELECT 1 FROM public.match_player_demos p WHERE p."matchId" = n."matchId" AND p."steamId" = n."steamId")
UNION ALL SELECT 'follows', count(*) FROM neon_import.follows n
  WHERE NOT EXISTS (SELECT 1 FROM public.follows p WHERE p."seguidorId" = n."seguidorId" AND p."seguidoId" = n."seguidoId")
UNION ALL SELECT 'sync_runs', count(*) FROM neon_import.sync_runs n
  WHERE NOT EXISTS (SELECT 1 FROM public.sync_runs p WHERE p.id = n.id)
UNION ALL SELECT 'analyses', count(*) FROM neon_import.analyses n
  WHERE NOT EXISTS (SELECT 1 FROM public.analyses p WHERE p.id = n.id)
UNION ALL SELECT 'bot_observations', count(*) FROM neon_import.bot_observations n
  WHERE NOT EXISTS (SELECT 1 FROM public.bot_observations p WHERE p.id = n.id);

SELECT * FROM conferencia;

SELECT (SELECT count(*) FROM public.users) AS "usuários agora",
       (SELECT count(*) FROM neon_import.users) AS "no Neon",
       (SELECT count(*) FROM public.users p WHERE NOT EXISTS
          (SELECT 1 FROM neon_import.users n WHERE n."steamId" = p."steamId")) AS "novos depois da troca";

DO $$
DECLARE falta text;
BEGIN
  SELECT string_agg(tabela || '=' || faltando, ', ') INTO falta FROM conferencia WHERE faltando > 0;
  IF falta IS NOT NULL THEN
    RAISE EXCEPTION 'linhas do Neon que não entraram: %', falta;
  END IF;
END $$;

\if :aplicar
  COMMIT;
  \echo 'Gravado. Agora: npm run recompute:sessions && npm run recompute:insights'
\else
  ROLLBACK;
  \echo 'Ensaio: nada foi gravado. Rode de novo com -v aplicar=1 para gravar.'
\endif
