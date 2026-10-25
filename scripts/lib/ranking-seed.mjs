// Ranking de los juegos nuevos: AUTOMÁTICO. La Edge Function mierdi-ranking comprueba en cada envío
// que el id está en el catálogo publicado y la RPC crea la fila en el primer envío; nightly/publish
// no siembran nada ni guardan credenciales de Supabase. RANKING_AUTO es lo que anotan en su resultado.
// rankingSeedSql es HISTÓRICO (semilla manual de antes de la creación perezosa); el pipeline ya no lo usa.
import { parseId } from './catalog.mjs';

export const RANKING_AUTO = Object.freeze({ status: 'automatic', via: 'supabase/functions/mierdi-ranking', check: 'https://mierdijuegos.com/games/games.json' });

export function rankingSeedSql(id) {
  if (!parseId(id) || id.length > 52) throw new Error(`invalid game id for ranking seed: ${id}`);
  return `insert into public.mierdi_ranking (id_juego) values ('${id}') on conflict (id_juego) do nothing;\n`;
}
