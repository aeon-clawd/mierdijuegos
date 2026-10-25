// Ranking arcade (top 5 por juego) de Mierdijuegos. Vanilla, sin dependencias.
// API para los juegos: window.mierdiRanking.reset() al empezar/reintentar una partida y
// window.mierdiRanking.fin(resultado) en el fin de partida real. Solo cuenta el primer fin()
// de cada partida; los callbacks terminales repetidos se ignoran hasta el siguiente reset().
// La clave es la publishable (rol anon), pública por diseño: la tabla es de solo lectura por RLS
// y la única escritura es la Edge Function mierdi-ranking, que valida todo en el servidor (también
// que el juego esté publicado en el catálogo) y crea el ranking del juego en su primer envío.

// Cargador común de analítica de los juegos estáticos (todos incluyen este fichero): solo en producción
// inyecta una vez /analytics.js (páginas vistas de Vercel). No comparte nada con el ranking.
if (/^(www\.)?mierdijuegos\.com$/.test(location.hostname) && !document.querySelector('script[src="/analytics.js"]')) {
  const s = document.createElement('script');
  s.src = '/analytics.js';
  s.defer = true;
  document.head.appendChild(s);
}

(() => {
  'use strict';
  const SUPABASE = 'https://grldrwbiovglfxqjdicv.supabase.co';
  const CLAVE = 'sb_publishable_kZd05N2bT3RFmYf_pUvDyw_jVwWXIwn';
  const ASC = { '030-brachistocrona': ' s' }; // menos es mejor (debe coincidir con la RPC y la Edge Function)
  const MAX = 1e9;
  const m = location.pathname.match(/\/games\/([^/]+)\//);
  const ID = m ? decodeURIComponent(m[1]) : '';
  const asc = Object.prototype.hasOwnProperty.call(ASC, ID);

  let armado = true; // ¿acepta un fin() la partida actual?
  let intento = 0; // cambia en cada reset()/fin(): las respuestas de otro intento se descartan
  let actual = null; // { n, resultado, ranking, payload, enviando, guardado }
  let ctrl = null;
  let ui = null;
  let foco = null;

  const fmt = (r) => (Number.isInteger(r) ? String(r) : Number(r).toFixed(2)) + (ASC[ID] || '');

  function pedir(metodo, ruta, cuerpo) {
    if (ctrl) ctrl.abort();
    const c = (ctrl = new AbortController());
    const t = setTimeout(() => c.abort(), api.timeoutMs);
    return fetch(SUPABASE + ruta, {
      method: metodo,
      headers: { apikey: CLAVE, Accept: 'application/json', ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: c.signal,
      cache: 'no-store',
    }).then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).finally(() => {
      clearTimeout(t);
      if (ctrl === c) ctrl = null;
    });
  }

  function montar() {
    const host = document.createElement('div');
    host.id = 'mierdi-ranking';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:none';
    const root = host.attachShadow({ mode: 'open' });
    // Plantilla fija: ningún dato de usuario o del servidor pasa por innerHTML.
    root.innerHTML = `<style>
:host{all:initial}
[hidden]{display:none!important}
.fondo{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;
 background:rgba(10,10,10,.85);font-family:'Courier New',monospace;color:#00ff41;touch-action:manipulation}
.caja{width:100%;max-width:340px;max-height:100%;overflow:auto;box-sizing:border-box;background:#0a0a0a;border:3px solid #ff00ff;
 box-shadow:0 0 18px #ff00ff,inset 0 0 12px rgba(255,0,255,.35);padding:16px;text-align:center;outline:none}
h2{margin:0 0 10px;font-size:22px;letter-spacing:3px;color:#ffff00;text-shadow:0 0 8px #ffff00}
ol{list-style:none;margin:0 0 12px;padding:0;font-size:19px;line-height:1.6;text-align:left;white-space:pre}
li{color:#00ffff;overflow:hidden;text-overflow:ellipsis}li.tu{color:#ffff00;text-shadow:0 0 8px #ffff00}
p{margin:0 0 12px;font-size:15px;line-height:1.35;color:#fff}
form{display:flex;gap:8px;justify-content:center;margin:0 0 12px}
input{width:5.2em;font:inherit;font-size:26px;letter-spacing:6px;text-align:center;text-transform:uppercase;color:#ffff00;
 background:#000;border:2px solid #00ffff;padding:6px;-webkit-user-select:text;user-select:text}
button{font:inherit;font-size:16px;font-weight:bold;min-height:44px;min-width:44px;padding:8px 14px;color:#0a0a0a;
 background:#00ff41;border:0;cursor:pointer}
button[data-r=cerrar]{background:none;color:#ff00ff;border:2px solid #ff00ff}
button:disabled{opacity:.5}
:focus-visible{outline:3px solid #ffff00;outline-offset:2px}
</style><div class="fondo"><div class="caja" role="dialog" aria-modal="true" aria-labelledby="t" tabindex="-1">
<h2 id="t">🏆 TOP 5</h2><ol data-r="lista"></ol><p data-r="estado" role="status" aria-live="polite"></p>
<form data-r="form" hidden><input name="siglas" maxlength="3" aria-label="Tus 3 iniciales (A-Z)" autocomplete="off"
 autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="send"><button data-r="guardar" type="submit">GUARDAR</button></form>
<button data-r="reintentar" type="button" hidden>REINTENTAR</button> <button data-r="cerrar" type="button">CERRAR ✕</button>
</div></div>`;
    const $ = (s) => root.querySelector(s);
    ui = { host, caja: $('.caja'), lista: $('ol'), estado: $('[data-r=estado]'), form: $('form'), input: $('input'), guardar: $('[data-r=guardar]'), reintentar: $('[data-r=reintentar]') };
    // Nada de lo que pasa en el panel llega a los listeners del juego (p. ej. 014 escucha teclas
    // en window y 031 reinicia con un clic en document).
    for (const t of ['click', 'dblclick', 'auxclick', 'contextmenu', 'pointerdown', 'pointerup', 'pointermove', 'pointercancel',
      'mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'wheel', 'keydown', 'keyup', 'keypress', 'input']) {
      host.addEventListener(t, (e) => {
        e.stopPropagation();
        if (t === 'keydown' && e.key === 'Escape') cerrar();
      });
    }
    ui.input.addEventListener('input', () => { ui.input.value = ui.input.value.toUpperCase(); });
    ui.form.addEventListener('submit', (e) => { e.preventDefault(); guardar(); });
    ui.reintentar.addEventListener('click', cargar);
    $('[data-r=cerrar]').addEventListener('click', cerrar);
    document.body.appendChild(host);
  }

  function abrir() {
    if (!ui) montar();
    if (ui.host.style.display === 'none') {
      foco = document.activeElement;
      ui.host.style.display = 'block';
    }
    ui.input.value = '';
    ui.input.disabled = false;
    ui.guardar.disabled = false;
    ui.guardar.textContent = 'GUARDAR';
    // Foco en el diálogo (accesible) pero no en el input: en móvil no se abre el teclado solo.
    ui.caja.focus({ preventScroll: true });
  }

  function cerrar() {
    if (!ui || ui.host.style.display === 'none') return;
    ui.host.style.display = 'none';
    if (foco && foco.isConnected && foco.focus) foco.focus({ preventScroll: true });
    foco = null;
  }

  function pintar(mensaje) {
    const r = actual.ranking || [];
    const p = actual.guardado && actual.payload;
    let marcado = false;
    ui.lista.replaceChildren(...[0, 1, 2, 3, 4].map((i) => {
      const li = document.createElement('li');
      const e = r[i];
      li.textContent = `${i + 1}. ` + (e ? `${e.siglas} ${fmt(Number(e.resultado))}` : '--- ---');
      if (p && e && !marcado && e.siglas === p.p_siglas && Number(e.resultado) === p.p_resultado) { li.className = 'tu'; marcado = true; }
      return li;
    }));
    ui.estado.textContent = mensaje;
  }

  function entra(r, ranking) {
    if (ranking.length < 5) return true;
    const ultimo = Number(ranking[ranking.length - 1].resultado);
    return asc ? r < ultimo : r > ultimo;
  }

  function cargar() {
    const n = intento;
    ui.reintentar.hidden = true;
    ui.form.hidden = true;
    actual.ranking = null;
    pintar('Cargando top 5…');
    pedir('GET', `/rest/v1/mierdi_ranking?select=ranking&id_juego=eq.${encodeURIComponent(ID)}`).then((filas) => {
      if (n !== intento) return;
      // [] = el juego aún no tiene fila (nadie ha guardado todavía): top 5 vacío. Lo demás raro es un fallo.
      if (!Array.isArray(filas) || filas.length > 1) throw new Error('respuesta rara');
      const ranking = filas.length ? filas[0] && filas[0].ranking : [];
      if (!Array.isArray(ranking)) throw new Error('respuesta rara');
      actual.ranking = ranking;
      const si = entra(actual.resultado, ranking);
      ui.form.hidden = !si;
      pintar(si ? `¡${fmt(actual.resultado)} entra en el top 5! Escribe 3 iniciales (A-Z).`
        : `No entras en el top 5 con ${fmt(actual.resultado)}. ¡Otra partida!`);
    }).catch(() => {
      if (n !== intento) return;
      ui.reintentar.hidden = false;
      pintar('Ranking no disponible ahora mismo. Reintenta o cierra.');
    });
  }

  function guardar() {
    if (!actual || actual.enviando || actual.guardado) return;
    if (!actual.payload) {
      const siglas = ui.input.value.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(siglas)) { ui.estado.textContent = 'Pon exactamente 3 letras A-Z (sin Ñ, acentos ni números).'; return; }
      // Desde aquí el envío es fijo: un reintento manda exactamente lo mismo y el servidor no lo duplica.
      actual.payload = { p_id_juego: ID, p_siglas: siglas, p_resultado: actual.resultado };
      ui.input.disabled = true;
    }
    const n = intento;
    actual.enviando = true;
    ui.guardar.disabled = true;
    ui.estado.textContent = 'Guardando…';
    pedir('POST', '/functions/v1/mierdi-ranking', actual.payload).then((ranking) => {
      if (n !== intento) return;
      if (!Array.isArray(ranking)) throw new Error('respuesta rara');
      actual.ranking = ranking;
      actual.guardado = true;
      ui.form.hidden = true;
      pintar(`¡Guardado! ${actual.payload.p_siglas} · ${fmt(actual.resultado)}`);
      if (!ui.lista.querySelector('.tu')) ui.estado.textContent += ' (alguien te ha adelantado: ya no sale en el top 5)';
    }).catch(() => {
      if (n !== intento) return;
      ui.guardar.textContent = 'REINTENTAR ENVÍO';
      ui.estado.textContent = 'No sé si se guardó (red o servidor). Reintenta: el mismo envío no se duplica.';
    }).finally(() => {
      if (n !== intento) return;
      actual.enviando = false;
      ui.guardar.disabled = false;
    });
  }

  function reset() {
    armado = true;
    intento++;
    actual = null;
    if (ctrl) ctrl.abort();
    cerrar();
  }

  function fin(resultado) {
    if (!armado || typeof resultado !== 'number' || !Number.isFinite(resultado)) return;
    const r = Math.round(resultado * 100) / 100;
    if (r < 0 || r > MAX || (asc && r <= 0) || !document.body) return;
    armado = false;
    intento++;
    actual = { resultado: r, ranking: null, payload: null, enviando: false, guardado: false };
    abrir();
    cargar();
  }

  const api = { reset, fin, timeoutMs: 8000 };
  window.mierdiRanking = api;
})();
