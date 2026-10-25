-- Ranking con creación perezosa. ADITIVA: sustituye solo public.mierdi_enviar_resultado y sus permisos;
-- no toca la tabla, la RLS, sus permisos (anon/authenticated siguen con solo SELECT) ni las filas existentes.
-- - La RPC crea la fila del juego en su primer envío válido (INSERT … ON CONFLICT DO NOTHING) antes de
--   bloquearla con SELECT … FOR UPDATE. Ya no hace falta sembrar juegos nuevos a mano.
-- - EXECUTE solo para service_role: la única llamante es la Edge Function mierdi-ranking, que antes
--   comprueba que el id está en el catálogo publicado (https://mierdijuegos.com/games/games.json).
--   Si anon pudiera llamarla, cualquiera crearía filas para ids inventados.
-- Se conservan validación, top 5, empates (gana quien llegó antes), idempotencia por (siglas, resultado)
-- y el orden ascendente de 030-brachistocrona.
create or replace function public.mierdi_enviar_resultado(p_id_juego text, p_siglas text, p_resultado numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asc constant boolean := p_id_juego = '030-brachistocrona';
  v_resultado numeric;
  v_ranking jsonb;
begin
  if p_id_juego is null or p_id_juego !~ '^[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$' or length(p_id_juego) > 52
     or p_siglas is null or p_siglas !~ '^[A-Z]{3}$' then
    raise exception 'siglas o juego no válidos' using errcode = '22023';
  end if;
  if p_resultado is null or p_resultado = 'NaN'::numeric or p_resultado < 0 or p_resultado > 1000000000 then
    raise exception 'resultado no válido' using errcode = '22023';
  end if;
  v_resultado := round(p_resultado, 2);
  if v_asc and v_resultado <= 0 then
    raise exception 'resultado no válido' using errcode = '22023';
  end if;

  -- Todo validado: crea la fila si es el primer envío del juego y luego la bloquea; los envíos
  -- simultáneos (también el primero) se serializan sobre la misma fila.
  insert into public.mierdi_ranking (id_juego) values (p_id_juego) on conflict (id_juego) do nothing;
  select r.ranking into v_ranking from public.mierdi_ranking r where r.id_juego = p_id_juego for update;
  if not found then
    raise exception 'juego desconocido' using errcode = '22023';
  end if;

  if exists (select 1 from jsonb_array_elements(v_ranking) e(x)
             where e.x ->> 'siglas' = p_siglas and (e.x ->> 'resultado')::numeric = v_resultado) then
    return v_ranking;
  end if;

  select coalesce(jsonb_agg(t.x order by t.k, t.n), '[]'::jsonb) into v_ranking
  from (
    select u.x, u.n, case when v_asc then (u.x ->> 'resultado')::numeric else -(u.x ->> 'resultado')::numeric end as k
    from (
      select e.x, e.n from jsonb_array_elements(v_ranking) with ordinality e(x, n)
      union all
      select jsonb_build_object('siglas', p_siglas, 'resultado', v_resultado), 1000
    ) u
    order by k, u.n
    limit 5
  ) t;

  update public.mierdi_ranking r set ranking = v_ranking where r.id_juego = p_id_juego;
  return v_ranking;
end
$$;

revoke all on function public.mierdi_enviar_resultado(text, text, numeric) from public, anon, authenticated;
grant execute on function public.mierdi_enviar_resultado(text, text, numeric) to service_role;
