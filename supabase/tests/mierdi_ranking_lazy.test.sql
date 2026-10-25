-- Tests de la RPC con creación perezosa (migración 20261025120000_mierdi_ranking_lazy.sql), aplicada
-- sobre TODAS las migraciones. SOLO ROLLBACK. La RPC solo la ejecuta service_role (la Edge Function
-- mierdi-ranking, que antes valida el id contra el catálogo publicado); anon/authenticated solo leen.
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

create function pg_temp.filas() returns int
language sql as $$ select count(*)::int from public.mierdi_ranking $$;

grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

-- Permisos ------------------------------------------------------------------------
do $$
declare
  f constant text := 'public.mierdi_enviar_resultado(text,text,numeric)';
begin
  if has_function_privilege('anon', f, 'EXECUTE') then raise exception 'anon conserva EXECUTE (saltaría el catálogo)'; end if;
  if has_function_privilege('authenticated', f, 'EXECUTE') then raise exception 'authenticated conserva EXECUTE'; end if;
  if not has_function_privilege('service_role', f, 'EXECUTE') then raise exception 'service_role no puede ejecutar la RPC'; end if;
  if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
             where p.oid = f::regprocedure and a.grantee = 0) then
    raise exception 'PUBLIC conserva EXECUTE';
  end if;
  if not (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = f::regprocedure) then
    raise exception 'la RPC no es SECURITY DEFINER con search_path vacío';
  end if;
  if has_table_privilege('anon', 'public.mierdi_ranking', 'INSERT,UPDATE,DELETE,TRUNCATE')
     or has_table_privilege('authenticated', 'public.mierdi_ranking', 'INSERT,UPDATE,DELETE,TRUNCATE') then
    raise exception 'anon/authenticated pueden escribir la tabla';
  end if;
  if not has_table_privilege('anon', 'public.mierdi_ranking', 'SELECT') then raise exception 'anon no puede leer'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.mierdi_ranking'::regclass) then raise exception 'RLS desactivado'; end if;
  -- Las filas ya existentes (37 + 6 importados) no se tocan.
  if pg_temp.filas() <> 43 then raise exception 'esperaba 43 filas previas, hay %', pg_temp.filas(); end if;
  if exists (select 1 from public.mierdi_ranking where ranking <> '[]'::jsonb) then raise exception 'filas previas no vacías'; end if;
  raise notice 'ok: permisos (solo service_role ejecuta; anon solo lee)';
end $$;

-- anon y authenticated no pueden llamar a la RPC ni escribir ------------------------
set local role anon;
do $$
begin
  perform pg_temp.debe_fallar($q$select public.mierdi_enviar_resultado('001-espejo-invertido', 'HAX', 1)$q$, '42501');
  perform pg_temp.debe_fallar($q$select public.mierdi_enviar_resultado('999-pirata', 'HAX', 1)$q$, '42501');
  perform pg_temp.debe_fallar($q$insert into public.mierdi_ranking (id_juego) values ('999-pirata')$q$, '42501');
  if pg_temp.filas() <> 43 or exists (select 1 from public.mierdi_ranking where ranking <> '[]'::jsonb) then raise exception 'anon cambió algo'; end if;
  raise notice 'ok: anon sin RPC ni escritura';
end $$;
reset role;
set local role authenticated;
do $$
begin
  perform pg_temp.debe_fallar($q$select public.mierdi_enviar_resultado('001-espejo-invertido', 'HAX', 1)$q$, '42501');
  perform pg_temp.debe_fallar($q$update public.mierdi_ranking set ranking = '[]'$q$, '42501');
  raise notice 'ok: authenticated sin RPC ni escritura';
end $$;
reset role;

set local role service_role;

-- Entradas inválidas: nunca crean fila ----------------------------------------------
do $$
declare
  v_caso text;
begin
  foreach v_caso in array array[
    $q$(null, 'ABC', 1)$q$, $q$('044-nuevo', null, 1)$q$, $q$('044-nuevo', 'ABC', null)$q$,
    $q$('044-nuevo', 'abc', 1)$q$, $q$('044-nuevo', 'AB', 1)$q$, $q$('044-nuevo', 'ABCD', 1)$q$,
    $q$('044-nuevo', 'AB1', 1)$q$, $q$('044-nuevo', 'ÑAB', 1)$q$, $q$('044-nuevo', ' AB', 1)$q$,
    $q$('044-nuevo', 'ABC', -1)$q$, $q$('044-nuevo', 'ABC', 'NaN')$q$,
    $q$('044-nuevo', 'ABC', 'Infinity')$q$, $q$('044-nuevo', 'ABC', '-Infinity')$q$,
    $q$('044-nuevo', 'ABC', 1000000001)$q$,
    $q$('Mal Id', 'ABC', 1)$q$, $q$('../../x', 'ABC', 1)$q$, $q$('044-', 'ABC', 1)$q$, $q$('44-x', 'ABC', 1)$q$,
    $q$('044-a--b', 'ABC', 1)$q$, $q$('044-nuevo ', 'ABC', 1)$q$, $q$('', 'ABC', 1)$q$,
    $q$('044-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'ABC', 1)$q$,
    $q$('030-brachistocrona', 'ABC', 0)$q$, $q$('030-brachistocrona', 'ABC', 0.004)$q$
  ] loop
    perform pg_temp.debe_fallar('select public.mierdi_enviar_resultado' || v_caso, '22023');
  end loop;
  if pg_temp.filas() <> 43 then raise exception 'una entrada inválida creó fila'; end if;
  if pg_temp.top('044-nuevo') is not null then raise exception 'se creó 044-nuevo'; end if;
  raise notice 'ok: entradas inválidas rechazadas sin crear filas';
end $$;

-- Creación perezosa: el primer envío válido crea la fila --------------------------------
do $$
declare
  r jsonb;
begin
  r := public.mierdi_enviar_resultado('044-nuevo-juego', 'AAA', 10);
  perform pg_temp.igual(r, '[{"siglas":"AAA","resultado":10}]', 'primer envío crea fila con la entrada');
  perform pg_temp.igual(pg_temp.top('044-nuevo-juego'), r, 'fila creada y guardada');
  if pg_temp.filas() <> 44 then raise exception 'esperaba 44 filas'; end if;
  -- Reintento idéntico del primer envío: ni duplica entrada ni fila.
  r := public.mierdi_enviar_resultado('044-nuevo-juego', 'AAA', 10);
  perform pg_temp.igual(r, '[{"siglas":"AAA","resultado":10}]', 'reintento del primer envío idempotente');
  if pg_temp.filas() <> 44 then raise exception 'reintento creó otra fila'; end if;
  -- Fila existente (sembrada) sigue funcionando y no se reinicia.
  r := public.mierdi_enviar_resultado('001-espejo-invertido', 'BBB', 5);
  r := public.mierdi_enviar_resultado('001-espejo-invertido', 'CCC', 7);
  perform pg_temp.igual(r, '[{"siglas":"CCC","resultado":7},{"siglas":"BBB","resultado":5}]', 'fila existente conserva y mezcla');
  if pg_temp.filas() <> 44 then raise exception 'fila existente duplicada'; end if;
  raise notice 'ok: creación perezosa e idempotencia del primer envío';
end $$;

-- Orden desc, recorte a 5, empates, idempotencia (preservado) ---------------------------
do $$
declare
  r jsonb;
begin
  perform public.mierdi_enviar_resultado('045-otro-nuevo', 'AAA', 10);
  perform public.mierdi_enviar_resultado('045-otro-nuevo', 'BBB', 30);
  r := public.mierdi_enviar_resultado('045-otro-nuevo', 'CCC', 20);
  perform pg_temp.igual(r, '[{"siglas":"BBB","resultado":30},{"siglas":"CCC","resultado":20},{"siglas":"AAA","resultado":10}]', 'orden desc');
  r := public.mierdi_enviar_resultado('045-otro-nuevo', 'DDD', 20);
  perform pg_temp.igual(r -> 1, '{"siglas":"CCC","resultado":20}', 'empate: primero el que llegó antes');
  perform pg_temp.igual(r -> 2, '{"siglas":"DDD","resultado":20}', 'empate: el nuevo detrás');
  r := public.mierdi_enviar_resultado('045-otro-nuevo', 'DDD', 20);
  if jsonb_array_length(r) <> 4 then raise exception 'reintento duplicó: %', r; end if;
  perform public.mierdi_enviar_resultado('045-otro-nuevo', 'EEE', 5);
  r := public.mierdi_enviar_resultado('045-otro-nuevo', 'FFF', 25);
  perform pg_temp.igual(r, '[{"siglas":"BBB","resultado":30},{"siglas":"FFF","resultado":25},{"siglas":"CCC","resultado":20},{"siglas":"DDD","resultado":20},{"siglas":"AAA","resultado":10}]', 'recorte a 5');
  r := public.mierdi_enviar_resultado('045-otro-nuevo', 'GGG', 10);
  perform pg_temp.igual(r -> 4, '{"siglas":"AAA","resultado":10}', 'empate con el 5º no entra');
  r := public.mierdi_enviar_resultado('045-otro-nuevo', 'HHH', 1);
  if jsonb_array_length(r) <> 5 or r::text like '%HHH%' then raise exception 'peor que el 5º entró: %', r; end if;
  r := public.mierdi_enviar_resultado('045-otro-nuevo', 'BBB', 31);
  perform pg_temp.igual(r -> 0, '{"siglas":"BBB","resultado":31}', 'mismas siglas, otra puntuación');
  r := public.mierdi_enviar_resultado('046-cero', 'ZZZ', 0);
  perform pg_temp.igual(r, '[{"siglas":"ZZZ","resultado":0}]', 'cero válido en desc (y crea fila)');
  r := public.mierdi_enviar_resultado('046-cero', 'YYY', 1000000000);
  perform pg_temp.igual(r -> 0, '{"siglas":"YYY","resultado":1000000000}', 'máximo permitido');
  r := public.mierdi_enviar_resultado('046-cero', 'XXX', 2.345);
  perform pg_temp.igual(r -> 1, '{"siglas":"XXX","resultado":2.35}', 'redondeo a 2 decimales');
  raise notice 'ok: orden desc, recorte, empates, idempotencia, redondeo';
end $$;

-- 030: ascendente, solo positivos (preservado) ---------------------------------------------
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

-- Restricciones de la tabla intactas -------------------------------------------------------
do $$
begin
  perform pg_temp.debe_fallar($q$update public.mierdi_ranking set ranking = '[1,2,3,4,5,6]' where id_juego = '004-ritmo-caotico'$q$, '23514');
  perform pg_temp.debe_fallar($q$insert into public.mierdi_ranking (id_juego) values ('Mal Id')$q$, '23514');
  raise notice 'ok: restricciones de la tabla';
end $$;

rollback;
