#!/usr/bin/env bash
# Transforma o dump do Neon em um schema `neon_import`, pronto para o
# merge-neon.sql, sem encostar no `public` de ninguém. Ver docs/recuperacao-neon.md.
#
#   scripts/recuperacao/preparar-neon-import.sh neon-data.dump <url-de-um-postgres-descartável> > neon_import.sql
#
# O Postgres descartável pode ser o do docker compose (porta 5433): o banco
# informado é apagado e recriado. O pg_restore devolve as linhas ao schema de
# origem (`public`), por isso a volta: restaura num banco vazio com as
# migrations do repo, renomeia `public` para `neon_import` e despeja só ele.
set -euo pipefail

dump="$1"
url="$2"
semquery="${url%%\?*}"
query=""; [[ "$url" == *\?* ]] && query="?${url#*\?}"
base="${semquery%/*}"
banco="${semquery##*/}"

psql "${base}/postgres${query}" -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE IF EXISTS \"${banco}\"" -c "CREATE DATABASE \"${banco}\"" >&2

# O schema vem das migrations do repo: se o Neon estiver numa migration
# diferente, o restore reclama de coluna aqui, e não no Supabase.
DIRECT_DATABASE_URL="$url" npx prisma migrate deploy >&2

pg_restore --data-only --no-owner --no-privileges --disable-triggers \
  -d "$url" "$dump" >&2

psql "$url" -v ON_ERROR_STOP=1 -q -c "ALTER SCHEMA public RENAME TO neon_import" -c "ANALYZE" >&2

echo "Linhas por tabela no Neon:" >&2
psql "$url" -At -c "SELECT relname || ' ' || n_live_tup FROM pg_stat_user_tables WHERE schemaname = 'neon_import' ORDER BY 1" >&2 || true

pg_dump "$url" -n neon_import --no-owner --no-privileges
