// Static rules for a NEWLY generated game (legacy games are not held to these).
// These are cheap heuristics; the browser smoke is the real gate, and neither proves the game is fun or novel.

export const MAX_NEW_GAME_BYTES = 80 * 1024;

// Namespace URIs used with createElementNS are not network access.
const ALLOWED_URLS = [/^https?:\/\/www\.w3\.org\//];

const FORBIDDEN = [
  [/\bfetch\s*\(/, 'network: fetch()'],
  [/\bXMLHttpRequest\b/, 'network: XMLHttpRequest'],
  [/\bWebSocket\b/, 'network: WebSocket'],
  [/\bEventSource\b/, 'network: EventSource'],
  [/\bsendBeacon\b/, 'network: navigator.sendBeacon'],
  [/\bRTCPeerConnection\b/, 'network: WebRTC'],
  [/\bimportScripts\b|\bimport\s*\(/, 'network: dynamic import/importScripts'],
  [/serviceWorker/, 'service worker'],
  [/\bnew\s+(Shared)?Worker\s*\(/, 'web worker'],
  [/getUserMedia|mediaDevices/, 'permission: camera/microphone'],
  [/\bgeolocation\b/, 'permission: geolocation'],
  [/requestPermission/, 'permission prompt (orientation/motion/notifications)'],
  [/\bNotification\b/, 'permission: notifications'],
  [/navigator\.(bluetooth|usb|serial|hid|clipboard)/, 'permission: device/clipboard API'],
  [/document\.cookie/, 'cookies'],
  [/window\.open\s*\(/, 'popups'],
  [/<\s*(iframe|object|embed|frame)\b/i, 'embedded frames/objects'],
  [/<\s*form\b[^>]*\baction\s*=/i, 'form submission'],
  [/<\s*base\b/i, '<base> tag'],
  [/http-equiv\s*=\s*["']?refresh/i, 'meta refresh'],
  [/sk-ant-|AKIA[0-9A-Z]{12,}|ghp_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(api[_-]?key|secret|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i, 'something that looks like a secret'],
];

export function validateNewGameHtml(html) {
  const errors = [];
  const warnings = [];
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > MAX_NEW_GAME_BYTES) errors.push(`size ${bytes} bytes exceeds ${MAX_NEW_GAME_BYTES}`);
  if (bytes < 1000) errors.push(`size ${bytes} bytes is suspiciously small for a game`);

  if (!/^\s*<!doctype html>/i.test(html)) errors.push('missing <!doctype html>');
  if (!/<html[^>]*\blang\s*=\s*["']es(-[A-Za-z]+)?["']/i.test(html)) errors.push('missing <html lang="es">');
  if (!/<meta[^>]+name\s*=\s*["']viewport["'][^>]*width\s*=\s*device-width/i.test(html)) errors.push('missing mobile viewport meta');
  if (!/<title>\s*[^<\s][^<]*<\/title>/i.test(html)) errors.push('missing <title>');

  // Any absolute or protocol-relative URL is an external request unless allow-listed.
  const urls = html.match(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'<>)]*/gi) || [];
  for (const u of urls) {
    if (!/^https?:/i.test(u) && !/(src|href|url|action)\s*=?\s*\(?\s*["']?$/i.test(html.slice(Math.max(0, html.indexOf(u) - 12), html.indexOf(u)))) continue;
    if (!ALLOWED_URLS.some((re) => re.test(u))) errors.push(`external URL: ${u.slice(0, 80)}`);
  }
  if (/\b(src|href)\s*=\s*["'](?!\/(?!\/)|#|data:|blob:|javascript:void)/i.test(html.replace(/\b(src|href)\s*=\s*["']\s*["']/gi, ''))) {
    // Relative asset paths (e.g. src="sprite.png") would 404: the game must be a single file.
    const m = html.match(/\b(src|href)\s*=\s*["'](?!\/(?!\/)|#|data:|blob:)([^"']*)/i);
    if (m && !/^https?:/i.test(m[2])) errors.push(`external/relative asset reference: ${m[0].slice(0, 80)}`);
  }
  if (/<script\b[^>]*\bsrc\s*=/i.test(html)) errors.push('external <script src>');
  if (/<link\b[^>]*rel\s*=\s*["']?(stylesheet|preconnect|preload|prefetch|manifest|modulepreload)/i.test(html)) errors.push('external <link> resource');

  for (const [re, label] of FORBIDDEN) if (re.test(html)) errors.push(`forbidden: ${label}`);

  if (!/data-action\s*=\s*["']start["']/.test(html)) errors.push('missing start control [data-action="start"]');
  if (!/data-action\s*=\s*["']retry["']/.test(html)) errors.push('missing retry control [data-action="retry"]');
  const back = html.match(/<a\b[^>]*data-action\s*=\s*["']back["'][^>]*>/i);
  if (!back || !/href\s*=\s*["']\/["']/.test(back[0])) errors.push('missing back link <a href="/" data-action="back">');
  if (!/window\.mierdiTest\s*=/.test(html)) errors.push('missing window.mierdiTest test hook');

  const pointer = /pointer(down|move|up)/.test(html);
  const touch = /touch(start|move|end)/.test(html);
  // Menu button click handlers alone do not establish mouse gameplay support.
  const mouse = /mouse(down|move|up)|(?:canvas|\bc\b)\.addEventListener\(\s*['"]click['"]|onmousedown/.test(html);
  if (!pointer && !(touch && mouse)) errors.push('input must support touch and mouse (pointer events, or touch + mouse handlers)');

  if (/localStorage/.test(html)) warnings.push('uses localStorage (fine for a high score, nothing else)');
  if (/AudioContext/.test(html)) warnings.push('uses Web Audio (must start after a user gesture)');
  return { errors, warnings, bytes };
}
