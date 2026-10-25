// Entrada Deno de la Edge Function mierdi-ranking. Toda la lógica está en handler.js
// (mismo fichero que prueba test/ranking-edge.test.mjs). El secreto sale solo del entorno
// de la función en Supabase (SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SECRET_KEYS); las claves
// publishable aceptadas, de SUPABASE_PUBLISHABLE_KEYS (o SUPABASE_ANON_KEY legacy).
import { createHandler } from './handler.js';

Deno.serve(createHandler({ fetch: (url, init) => fetch(url, init), env: (k: string) => Deno.env.get(k) }));
