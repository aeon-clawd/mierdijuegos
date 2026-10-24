-- Tests del ranking arcade. SOLO ROLLBACK: todo ocurre dentro de una transacción
-- que se deshace al final; no deja datos. Ejecutar después de la migración, p. ej. en
-- una rama de Supabase o con `node --test supabase/tests/pglite.test.mjs` (PGlite local).
-- Cualquier fallo lanza una excepción y aborta el script.
begin;

create function pg_temp.debe_fallar(p_sql text, p_codigo text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_codigo is not null and sqlstate <> p_codigo then
      raise exception 'esperaba % y fue % (%): %', p_codigo, sqlstate, sqlerrm, p_sql;
    end if;
    return;
  end;
  raise exception 'debería haber fallado: %', p_sql;
end $$;

create function pg_temp.igual(p_real jsonb, p_esperado jsonb, p_caso text) returns void
language plpgsql as $$
begin
  if p_real is distinct from p_esperado then
    raise exception '%: esperaba %, fue %', p_caso, p_esperado, p_real;
  end if;
end $$;

create function pg_temp.top(p_id text) returns jsonb
language sql as $$ select ranking from public.mierdi_ranking where id_juego = p_id $$;

grant execute on all functions in schema pg_temp to anon, authenticated;

-- Semilla y permisos -----------------------------------------------------------
do $$
begin
  if (select count(*) from public.mierdi_ranking) < 37 then raise exception 'faltan filas sembradas'; end if;
  if exists (select 1 from public.mierdi_ranking where ranking <> '[]'::jsonb) then raise exception 'semilla no vacía'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.mierdi_ranking'::regclass) then raise exception 'RLS desactivado'; end if;
  if has_table_privilege('anon', 'public.mierdi_ranking', 'INSERT,UPDATE,DELETE,TRUNCATE')
     or has_table_privilege('authenticated', 'public.mierdi_ranking', 'INSERT,UPDATE,DELETE,TRUNCATE') then
    raise exception 'anon/authenticated pueden escribir la tabla';
  end if;
  if not has_table_privilege('anon', 'public.mierdi_ranking', 'SELECT') then raise exception 'anon no puede leer'; end if;
  if not has_function_privilege('anon', 'public.mierdi_enviar_resultado(text,text,numeric)', 'EXECUTE') then raise exception 'anon no puede ejecutar la RPC'; end if;
  if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             where p.oid = 'public.mierdi_enviar_resultado(text,text,numeric)'::regprocedure and a.grantee = 0) then
    raise exception 'PUBLIC conserva EXECUTE';
  end if;
  if not (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
          where oid = 'public.mierdi_enviar_resultado(text,text,numeric)'::regprocedure) then
    raise exception 'la RPC no es SECURITY DEFINER con search_path vacío';
  end if;
  raise notice 'ok: semilla y permisos';
end $$;

-- Escrituras directas y filas no sembradas (como anon y authenticated) ----------
set local role anon;
do $$
begin
  if (select count(*) from public.mierdi_ranking) < 37 then raise exception 'anon no lee las filas'; end if;
  perform pg_temp.debe_fallar($q$insert into public.mierdi_ranking (id_juego) values ('999-pirata')$q$, '42501');
  perform pg_temp.debe_fallar($q$update public.mierdi_ranking set ranking = '[{"siglas":"HAX","resultado":1}]'$q$, '42501');
  perform pg_temp.debe_fallar($q$delete from public.mierdi_ranking$q$, '42501');
  perform pg_temp.debe_fallar($q$select public.mierdi_enviar_resultado('999-pirata', 'HAX', 1)$q$, '22023');
  perform pg_temp.debe_fallar($q$select public.mierdi_enviar_resultado('../../x', 'HAX', 1)$q$, '22023');
  if exists (select 1 from public.mierdi_ranking where id_juego = '999-pirata') then raise exception 'se creó una fila'; end if;
  raise notice 'ok: escrituras directas y juegos no sembrados rechazados (anon)';
end $$;
reset role;
set local role authenticated;
do $$
begin
  perform pg_temp.debe_fallar($q$update public.mierdi_ranking set ranking = '[]'$q$, '42501');
  perform pg_temp.debe_fallar($q$insert into public.mierdi_ranking (id_juego) values ('998-otro')$q$, '42501');
  raise notice 'ok: escrituras directas rechazadas (authenticated)';
end $$;
reset role;

-- Entradas inválidas ------------------------------------------------------------
set local role anon;
do $$
declare
  v_caso text;
begin
  foreach v_caso in array array[
    $q$(null, 'ABC', 1)$q$, $q$('001-espejo-invertido', null, 1)$q$, $q$('001-espejo-invertido', 'ABC', null)$q$,
    $q$('001-espejo-invertido', 'abc', 1)$q$, $q$('001-espejo-invertido', 'AB', 1)$q$, $q$('001-espejo-invertido', 'ABCD', 1)$q$,
    $q$('001-espejo-invertido', 'AB1', 1)$q$, $q$('001-espejo-invertido', 'ÑAB', 1)$q$, $q$('001-espejo-invertido', ' AB', 1)$q$,
    $q$('001-espejo-invertido', 'ABC', -1)$q$, $q$('001-espejo-invertido', 'ABC', 'NaN')$q$,
    $q$('001-espejo-invertido', 'ABC', 'Infinity')$q$, $q$('001-espejo-invertido', 'ABC', '-Infinity')$q$,
    $q$('001-espejo-invertido', 'ABC', 1000000001)$q$,
    $q$('030-brachistocrona', 'ABC', 0)$q$, $q$('030-brachistocrona', 'ABC', 0.004)$q$
  ] loop
    perform pg_temp.debe_fallar('select public.mierdi_enviar_resultado' || v_caso, '22023');
  end loop;
  perform pg_temp.igual(pg_temp.top('001-espejo-invertido'), '[]', 'nada guardado tras entradas inválidas');
  raise notice 'ok: entradas inválidas rechazadas';
end $$;

-- Orden desc, recorte a 5, empates, idempotencia ---------------------------------
do $$
declare
  r jsonb;
begin
  perform public.mierdi_enviar_resultado('002-memoria-ciega', 'AAA', 10);
  perform public.mierdi_enviar_resultado('002-memoria-ciega', 'BBB', 30);
  r := public.mierdi_enviar_resultado('002-memoria-ciega', 'CCC', 20);
  perform pg_temp.igual(r, '[{"siglas":"BBB","resultado":30},{"siglas":"CCC","resultado":20},{"siglas":"AAA","resultado":10}]', 'orden desc');
  perform pg_temp.igual(pg_temp.top('002-memoria-ciega'), r, 'la RPC devuelve lo guardado');

  -- Empate: llega después → queda detrás.
  r := public.mierdi_enviar_resultado('002-memoria-ciega', 'DDD', 20);
  perform pg_temp.igual(r -> 1, '{"siglas":"CCC","resultado":20}', 'empate: primero el que llegó antes');
  perform pg_temp.igual(r -> 2, '{"siglas":"DDD","resultado":20}', 'empate: el nuevo detrás');

  -- Reintento de red: misma siglas+resultado no duplica.
  r := public.mierdi_enviar_resultado('002-memoria-ciega', 'DDD', 20);
  if jsonb_array_length(r) <> 4 then raise exception 'reintento duplicó: %', r; end if;

  -- Quinto puesto y recorte.
  perform public.mierdi_enviar_resultado('002-memoria-ciega', 'EEE', 5);
  r := public.mierdi_enviar_resultado('002-memoria-ciega', 'FFF', 25);
  perform pg_temp.igual(r, '[{"siglas":"BBB","resultado":30},{"siglas":"FFF","resultado":25},{"siglas":"CCC","resultado":20},{"siglas":"DDD","resultado":20},{"siglas":"AAA","resultado":10}]', 'recorte a 5');
  -- Empatar con el 5º no entra; peor tampoco.
  r := public.mierdi_enviar_resultado('002-memoria-ciega', 'GGG', 10);
  perform pg_temp.igual(r -> 4, '{"siglas":"AAA","resultado":10}', 'empate con el 5º no entra');
  r := public.mierdi_enviar_resultado('002-memoria-ciega', 'HHH', 1);
  if jsonb_array_length(r) <> 5 or r::text like '%HHH%' then raise exception 'peor que el 5º entró: %', r; end if;
  -- Mismas siglas con otro resultado sí cuentan como partida nueva.
  r := public.mierdi_enviar_resultado('002-memoria-ciega', 'BBB', 31);
  perform pg_temp.igual(r -> 0, '{"siglas":"BBB","resultado":31}', 'mismas siglas, otra puntuación');
  -- 0 es válido en desc; decimales se redondean a 2.
  r := public.mierdi_enviar_resultado('003-gravedad-liquida', 'ZZZ', 0);
  perform pg_temp.igual(r, '[{"siglas":"ZZZ","resultado":0}]', 'cero válido en desc');
  r := public.mierdi_enviar_resultado('003-gravedad-liquida', 'YYY', 1000000000);
  perform pg_temp.igual(r -> 0, '{"siglas":"YYY","resultado":1000000000}', 'máximo permitido');
  raise notice 'ok: orden desc, recorte, empates, idempotencia';
end $$;

-- 030: ascendente, solo positivos --------------------------------------------------
do $$
declare
  r jsonb;
begin
  perform public.mierdi_enviar_resultado('030-brachistocrona', 'AAA', 3.5);
  perform public.mierdi_enviar_resultado('030-brachistocrona', 'BBB', 1.234);
  r := public.mierdi_enviar_resultado('030-brachistocrona', 'CCC', 2);
  perform pg_temp.igual(r, '[{"siglas":"BBB","resultado":1.23},{"siglas":"CCC","resultado":2},{"siglas":"AAA","resultado":3.5}]', 'orden asc y redondeo');
  r := public.mierdi_enviar_resultado('030-brachistocrona', 'BBB', 1.23);
  if jsonb_array_length(r) <> 3 then raise exception 'reintento redondeado duplicó: %', r; end if;
  raise notice 'ok: 030 ascendente';
end $$;
reset role;

-- Restricciones de la tabla (incluso para el propietario) ---------------------------
do $$
begin
  perform pg_temp.debe_fallar($q$update public.mierdi_ranking set ranking = '[1,2,3,4,5,6]' where id_juego = '004-ritmo-caotico'$q$, '23514');
  perform pg_temp.debe_fallar($q$update public.mierdi_ranking set ranking = '{}' where id_juego = '004-ritmo-caotico'$q$, '23514');
  perform pg_temp.debe_fallar($q$insert into public.mierdi_ranking (id_juego) values ('Mal Id')$q$, '23514');
  raise notice 'ok: restricciones de la tabla';
end $$;

rollback;
