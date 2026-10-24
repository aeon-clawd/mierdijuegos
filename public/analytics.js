// Vercel Web Analytics de Mierdijuegos: solo las páginas vistas estándar. Vanilla, sin dependencias.
// La home lo carga desde Layout.astro y los juegos estáticos a través de /ranking.js. Solo actúa en
// mierdijuegos.com y www (localhost, 127.0.0.1 y previews *.vercel.app quedan inertes). No envía eventos
// propios ni datos de partida (siglas, resultados, Supabase) y no crea cookies ni localStorage.
// Equivale a inject() de @vercel/analytics: cola window.va y el script oficial same-origin una sola vez.
(() => {
  'use strict';
  if (location.hostname !== 'mierdijuegos.com' && location.hostname !== 'www.mierdijuegos.com') return;
  const SRC = '/_vercel/insights/script.js';
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  if (document.querySelector(`script[src="${SRC}"]`)) return;
  const s = document.createElement('script');
  s.src = SRC;
  s.defer = true;
  s.onerror = () => {}; // bloqueado por un adblocker: sin analítica, la página sigue igual
  document.head.appendChild(s);
})();
