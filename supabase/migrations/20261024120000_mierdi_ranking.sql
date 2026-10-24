-- Ranking arcade (top 5 por juego) de Mierdijuegos.
-- Una fila por juego con un array JSONB de como mucho 5 entradas {siglas, resultado}.
-- Los clientes (clave publishable = rol anon) solo pueden LEER la tabla y ejecutar la RPC.
-- La RPC no crea filas: solo acepta juegos ya sembrados. Juegos nuevos: ver
-- supabase/seed-nuevo-juego.template.sql (paso humano, requiere acceso de administrador).

create table public.mierdi_ranking (
  id_juego text primary key check (id_juego ~ '^[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$' and length(id_juego) <= 52),
  ranking jsonb not null default '[]'::jsonb
    check (jsonb_typeof(ranking) = 'array' and jsonb_array_length(ranking) <= 5)
);

alter table public.mierdi_ranking enable row level security;
revoke all on table public.mierdi_ranking from public, anon, authenticated;
grant select on table public.mierdi_ranking to anon, authenticated;
create policy mierdi_ranking_lectura on public.mierdi_ranking for select to anon, authenticated using (true);

-- Envía un resultado. Solo 030-brachistocrona es ascendente (menos tiempo = mejor, > 0);
-- el resto, más es mejor. Empates: gana quien llegó antes. Reenviar las mismas siglas con el
-- mismo resultado (reintento de red) no duplica. Devuelve el ranking resultante.
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
  if p_id_juego is null or p_siglas is null or p_siglas !~ '^[A-Z]{3}$' then
    raise exception 'siglas o juego no válidos' using errcode = '22023';
  end if;
  if p_resultado is null or p_resultado = 'NaN'::numeric or p_resultado < 0 or p_resultado > 1000000000 then
    raise exception 'resultado no válido' using errcode = '22023';
  end if;
  v_resultado := round(p_resultado, 2);
  if v_asc and v_resultado <= 0 then
    raise exception 'resultado no válido' using errcode = '22023';
  end if;

  -- Bloqueo de la fila: los envíos simultáneos al mismo juego se serializan.
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
grant execute on function public.mierdi_enviar_resultado(text, text, numeric) to anon, authenticated;

-- Semilla: los 37 juegos publicados a 2026-10-24.
insert into public.mierdi_ranking (id_juego) values
  ('001-espejo-invertido'),
  ('002-memoria-ciega'),
  ('003-gravedad-liquida'),
  ('004-ritmo-caotico'),
  ('005-eco-temporal'),
  ('006-latido'),
  ('007-peso-muerto'),
  ('008-tres-cuerpos'),
  ('009-chladni'),
  ('010-pulsar'),
  ('011-refraccion'),
  ('012-efecto-doppler'),
  ('013-demonio-maxwell'),
  ('014-automata'),
  ('015-fourier'),
  ('016-morfogenesis'),
  ('017-lissajous'),
  ('018-ising'),
  ('023-eigenvalor'),
  ('019-bloqueo-mareal'),
  ('020-bifurcacion'),
  ('021-soliton'),
  ('022-penrose'),
  ('024-efecto-tunel'),
  ('025-eco-espin'),
  ('026-apolonio'),
  ('027-percolacion'),
  ('028-geodesica'),
  ('029-cristal-de-tiempo'),
  ('030-brachistocrona'),
  ('031-fase-de-berry'),
  ('032-resonancia-forzada'),
  ('033-mobius-persecucion'),
  ('034-topologico'),
  ('035-ventanilla-tres'),
  ('036-tortilla-al-vuelo'),
  ('037-rebano-rebelde');
