// Comprobaciones estáticas de la migración del ranking frente al catálogo del baseline (los juegos
// posteriores se siembran aparte con rankingSeedSql, no en esta migración histórica).
// La ejecución real del SQL está en supabase/tests (PGlite o rama de Supabase), fuera de npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../scripts/lib/paths.mjs';
import { rankingSeedSql } from '../scripts/lib/ranking-seed.mjs';
import { LEGACY } from './ranking-fin.mjs';

const dir = join(REPO_ROOT, 'supabase/migrations');
const file = readdirSync(dir).find((f) => /ranking.*\.sql$/.test(f));
const sql = file ? readFileSync(join(dir, file), 'utf8') : '';

test('la migración siembra exactamente los 37 juegos del catálogo baseline con []', () => {
  assert.ok(file, 'falta supabase/migrations/*ranking*.sql');
  const seed = sql.slice(sql.indexOf('insert into public.mierdi_ranking'));
  const ids = [...seed.matchAll(/\('(\d{3}-[a-z0-9-]+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(ids, LEGACY);
  assert.equal(ids.length, 37);
});

test('la RPC es estrecha: definer, search_path vacío, tabla cualificada, sin crear filas', () => {
  const fn = sql.slice(sql.indexOf('create or replace function public.mierdi_enviar_resultado'), sql.indexOf('$$;') + 3);
  assert.match(fn, /security definer/);
  assert.match(fn, /set search_path = ''/);
  assert.match(fn, /from public\.mierdi_ranking r[\s\S]*for update/);
  assert.doesNotMatch(fn, /\binsert\b/i, 'la RPC no debe crear filas');
  assert.doesNotMatch(fn, /[^.]\bmierdi_ranking\b(?!')/, 'tabla siempre cualificada');
  assert.match(sql, /revoke all on function public\.mierdi_enviar_resultado\(text, text, numeric\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.mierdi_enviar_resultado\(text, text, numeric\) to anon, authenticated;/);
  assert.match(sql, /revoke all on table public\.mierdi_ranking from public, anon, authenticated;/);
  assert.match(sql, /grant select on table public\.mierdi_ranking to anon, authenticated;/);
  assert.match(sql, /enable row level security/);
  assert.doesNotMatch(sql, /service_role/);
});

test('plantilla de semilla para juegos futuros', () => {
  assert.equal(rankingSeedSql('038-nuevo-juego'),
    "insert into public.mierdi_ranking (id_juego) values ('038-nuevo-juego') on conflict (id_juego) do nothing;\n");
  for (const bad of ["038-x'); drop table x;--", 'Mal', '', '038-']) assert.throws(() => rankingSeedSql(bad));
  const template = readFileSync(join(REPO_ROOT, 'supabase/seed-nuevo-juego.template.sql'), 'utf8');
  assert.match(template, /insert into public\.mierdi_ranking \(id_juego\) values \('NNN-slug'\) on conflict \(id_juego\) do nothing;/);
});
