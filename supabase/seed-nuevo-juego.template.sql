-- Plantilla: sembrar el ranking de un juego NUEVO (paso humano tras publicarlo).
-- La RPC pública rechaza juegos sin fila, así que hasta que se ejecute esto el juego muestra
-- "ranking no disponible" y no se puede enviar nada. Sustituye NNN-slug por el id exacto
-- (p. ej. 038-mi-juego) y ejecútalo en el SQL editor de Supabase con un usuario administrador.
-- `npm run nightly` deja este SQL ya relleno en .local/runs/<stamp>/ranking-seed.sql.
-- Juegos con orden ascendente (menos es mejor) requieren además cambiar la RPC; el contrato
-- del generador exige "más es mejor".
insert into public.mierdi_ranking (id_juego) values ('NNN-slug') on conflict (id_juego) do nothing;
