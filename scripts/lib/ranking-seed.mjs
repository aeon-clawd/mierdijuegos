// SQL para sembrar la fila del ranking de un juego nuevo. No se ejecuta automáticamente:
// requiere credenciales de administrador de Supabase, que este repo no usa (paso humano).
import { parseId } from './catalog.mjs';

export function rankingSeedSql(id) {
  if (!parseId(id) || id.length > 52) throw new Error(`invalid game id for ranking seed: ${id}`);
  return `insert into public.mierdi_ranking (id_juego) values ('${id}') on conflict (id_juego) do nothing;\n`;
}
