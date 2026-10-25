-- HISTÓRICO: ya NO hace falta. Desde la migración 20261025120000_mierdi_ranking_lazy.sql la RPC crea la
-- fila del juego en su primer envío válido, y la Edge Function mierdi-ranking solo la llama para ids
-- del catálogo publicado. Se conserva como referencia de la semilla manual de antes; ejecutarla no
-- hace daño (on conflict do nothing).
-- Juegos con orden ascendente (menos es mejor) requieren además cambiar la RPC, la Edge Function y
-- ranking.js; el contrato del generador exige "más es mejor".
insert into public.mierdi_ranking (id_juego) values ('NNN-slug') on conflict (id_juego) do nothing;
