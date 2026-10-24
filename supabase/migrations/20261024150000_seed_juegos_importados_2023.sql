-- Semilla ADITIVA e idempotente: filas vacías del top 5 para los seis juegos importados del
-- Mierdijuegos original de 2023 (imports/diug22-mierdijuegos-2023/manifest.json).
-- No toca filas existentes ni puntuaciones, ni la RLS, ni los permisos, ni la RPC: solo inserta los
-- ids nuevos y, si ya existen, no hace nada. Los seis son "más es mejor" (orden por defecto de la RPC).
-- Paso humano: revisarla y aplicarla en Supabase con un usuario administrador (SQL editor o
-- `supabase db push`). Este repo no la ejecuta.
insert into public.mierdi_ranking (id_juego) values
  ('038-zigzag-salto'),
  ('039-cazador-de-estrellas'),
  ('040-conexion-cuantica'),
  ('041-colorblitz'),
  ('042-wave-river'),
  ('043-sound-scape')
on conflict (id_juego) do nothing;
