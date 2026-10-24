// Ejecuta la migración y supabase/tests/mierdi_ranking.test.sql en un Postgres local (PGlite, WASM).
// No es parte de `npm test`: PGlite no es dependencia del repo. Instalación local, ignorada por git:
//   npm install --no-save --prefix .local/pglite @electric-sql/pglite@0.3
//   node --test supabase/tests/pglite.test.mjs
// Limitación: PGlite no es Supabase (sin PostgREST ni sus privilegios por defecto); los roles
// anon/authenticated se crean aquí con los mismos nombres. Nunca toca una base de datos remota.
import { test } from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../scripts/lib/paths.mjs';

const lib = join(REPO_ROOT, '.local/pglite/node_modules/@electric-sql/pglite/dist/index.js');
const migrations = join(REPO_ROOT, 'supabase/migrations');

test('SQL ranking: migración + tests rollback-only en PGlite', { skip: !existsSync(lib) && 'PGlite no instalado en .local/pglite' }, async () => {
  const { PGlite } = await import(lib);
  const db = new PGlite();
  const notices = [];
  // Imitamos el privilegio por defecto de Supabase (EXECUTE/ALL a anon y authenticated) para
  // comprobar que la migración lo revoca explícitamente.
  await db.exec(`create role anon nologin; create role authenticated nologin;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    grant usage on schema public to anon, authenticated;`);
  const files = existsSync(migrations) ? readdirSync(migrations).filter((f) => /ranking.*\.sql$/.test(f)).sort() : [];
  if (!files.length) throw new Error('no hay migración de ranking en supabase/migrations');
  for (const f of files) await db.exec(readFileSync(join(migrations, f), 'utf8'));
  await db.exec(readFileSync(join(REPO_ROOT, 'supabase/tests/mierdi_ranking.test.sql'), 'utf8'), {
    onNotice: (n) => notices.push(n.message),
  });
  console.log(notices.join('\n'));
  const after = await db.query(`select count(*)::int n from public.mierdi_ranking where ranking <> '[]'::jsonb`);
  if (after.rows[0].n !== 0) throw new Error('los tests dejaron datos (no se hizo rollback)');
  await db.close();
});
