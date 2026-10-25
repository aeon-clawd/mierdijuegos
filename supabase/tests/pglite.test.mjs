// Ejecuta las migraciones del ranking y sus tests rollback-only en un Postgres local (PGlite, WASM).
// No es parte de `npm test`: PGlite no es dependencia del repo. Instalación local, ignorada por git:
//   npm install --no-save --prefix .local/pglite @electric-sql/pglite@0.3
//   node --test supabase/tests/pglite.test.mjs
// Limitación: PGlite no es Supabase (sin PostgREST ni sus privilegios por defecto); los roles
// anon/authenticated/service_role se crean aquí con los mismos nombres. Nunca toca una base de datos remota.
import { test } from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../scripts/lib/paths.mjs';

const lib = join(REPO_ROOT, '.local/pglite/node_modules/@electric-sql/pglite/dist/index.js');
const migrations = join(REPO_ROOT, 'supabase/migrations');
const HISTORICA = '20261024120000_mierdi_ranking.sql';
const skip = !existsSync(lib) && 'PGlite no instalado en .local/pglite';

async function ejecutar(files, testFile) {
  const { PGlite } = await import(lib);
  const db = new PGlite();
  const notices = [];
  // Imitamos el privilegio por defecto de Supabase (EXECUTE/ALL a anon y authenticated) para
  // comprobar que las migraciones lo revocan explícitamente.
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;`);
  for (const f of files) await db.exec(readFileSync(join(migrations, f), 'utf8'));
  await db.exec(readFileSync(join(REPO_ROOT, 'supabase/tests', testFile), 'utf8'), { onNotice: (n) => notices.push(n.message) });
  console.log(notices.join('\n'));
  const after = await db.query(`select count(*)::int n from public.mierdi_ranking where ranking <> '[]'::jsonb`);
  if (after.rows[0].n !== 0) throw new Error('los tests dejaron datos (no se hizo rollback)');
  await db.close();
}

// Histórico: la migración original (filas sembradas, RPC para anon, sin crear filas) con su test de entonces.
test('SQL ranking HISTÓRICO: migración 20261024120000 + mierdi_ranking.test.sql', { skip }, () =>
  ejecutar([HISTORICA], 'mierdi_ranking.test.sql'));

// Actual: TODAS las migraciones en orden y la RPC perezosa solo para service_role.
test('SQL ranking ACTUAL: todas las migraciones + mierdi_ranking_lazy.test.sql', { skip }, () =>
  ejecutar(readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort(), 'mierdi_ranking_lazy.test.sql'));
