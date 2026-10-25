// Comprobaciones estáticas de las migraciones del ranking. La original (20261024120000) es HISTÓRICA:
// sembraba el catálogo baseline y daba la RPC a anon. La de creación perezosa (20261025120000) la
// sustituye: la RPC crea la fila y solo la ejecuta service_role (Edge Function mierdi-ranking).
// La ejecución real del SQL está en supabase/tests (PGlite o rama de Supabase), fuera de npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../scripts/lib/paths.mjs';
import { rankingSeedSql } from '../scripts/lib/ranking-seed.mjs';
import { LEGACY } from './ranking-fin.mjs';

const dir = join(REPO_ROOT, 'supabase/migrations');
const file = '20261024120000_mierdi_ranking.sql';
const sql = readFileSync(join(dir, file), 'utf8');
const LAZY = '20261025120000_mierdi_ranking_lazy.sql';
const lazy = existsSync(join(dir, LAZY)) ? readFileSync(join(dir, LAZY), 'utf8') : '';

test('migración perezosa: aditiva, la más reciente, sustituye la RPC sin tocar la tabla ni sembrar', () => {
  assert.ok(lazy, `falta supabase/migrations/${LAZY}`);
  assert.equal(readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().at(-1), LAZY);
  assert.doesNotMatch(lazy, /\b(drop|alter|truncate|delete)\b/i, 'solo sustituye la función y sus permisos');
  assert.doesNotMatch(lazy, /grant[^;]*on table/i, 'la tabla conserva solo SELECT para anon');
  const fn = lazy.slice(lazy.indexOf('create or replace function public.mierdi_enviar_resultado'), lazy.indexOf('$$;') + 3);
  assert.match(fn, /security definer/);
  assert.match(fn, /set search_path = ''/);
  assert.doesNotMatch(fn, /[^.]\bmierdi_ranking\b(?!')/, 'tabla siempre cualificada');
  const validacion = fn.indexOf("raise exception 'resultado no válido'");
  const insert = fn.search(/insert into public\.mierdi_ranking \(id_juego\) values \(p_id_juego\) on conflict \(id_juego\) do nothing;/);
  const lock = fn.search(/from public\.mierdi_ranking r[\s\S]*?for update/);
  assert.ok(validacion > 0 && insert > validacion, 'valida todo antes de crear la fila');
  assert.ok(lock > insert, 'INSERT … ON CONFLICT DO NOTHING antes del SELECT … FOR UPDATE');
  assert.match(fn, /p_id_juego !~ '\^\[0-9\]\{3\}-\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$'/, 'formato de id validado en la RPC');
  assert.match(fn, /length\(p_id_juego\) > 52/);
  assert.match(fn, /v_asc constant boolean := p_id_juego = '030-brachistocrona'/);
  assert.match(lazy, /revoke all on function public\.mierdi_enviar_resultado\(text, text, numeric\) from public, anon, authenticated;/);
  assert.match(lazy, /grant execute on function public\.mierdi_enviar_resultado\(text, text, numeric\) to service_role;/);
  assert.doesNotMatch(lazy, /grant execute on function [^;]*\) to [^;]*\b(anon|authenticated|public)\b/i);
  assert.doesNotMatch(lazy, /insert into public\.mierdi_ranking \(id_juego\) values \('/, 'sin semillas');
});

test('HISTÓRICA: la migración siembra exactamente los 37 juegos del catálogo baseline con []', () => {
  const seed = sql.slice(sql.indexOf('insert into public.mierdi_ranking'));
  const ids = [...seed.matchAll(/\('(\d{3}-[a-z0-9-]+)'\)/g)].map((m) => m[1]);
  assert.deepEqual(ids, LEGACY);
  assert.equal(ids.length, 37);
});

test('HISTÓRICA: la RPC original era estrecha: definer, search_path vacío, tabla cualificada, sin crear filas', () => {
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

test('HISTÓRICO: helper y plantilla de semilla manual (ya no hacen falta: la RPC crea la fila)', () => {
  assert.equal(rankingSeedSql('038-nuevo-juego'),
    "insert into public.mierdi_ranking (id_juego) values ('038-nuevo-juego') on conflict (id_juego) do nothing;\n");
  for (const bad of ["038-x'); drop table x;--", 'Mal', '', '038-']) assert.throws(() => rankingSeedSql(bad));
  const template = readFileSync(join(REPO_ROOT, 'supabase/seed-nuevo-juego.template.sql'), 'utf8');
  assert.match(template, /insert into public\.mierdi_ranking \(id_juego\) values \('NNN-slug'\) on conflict \(id_juego\) do nothing;/);
});
