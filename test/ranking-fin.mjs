// Compartido por los tests de cableado (estático), de navegador por juego y de la migración.
import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from '../scripts/lib/paths.mjs';

// Juegos anteriores al ranking, congelados en este commit: el catálogo vivo crece cada noche, esto no.
export const BASELINE = '3412ee1';
export const gitBaseline = (path) => execFileSync('git', ['show', `${BASELINE}:${path}`], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1 << 24 });
export const LEGACY = JSON.parse(gitBaseline('public/games/games.json')).map((g) => g.id);

// Expresión exacta que cada juego pasa a fin(): la puntuación final real (030: tiempo, solo victorias).
export const FIN = {
  '001-espejo-invertido': 'score', '002-memoria-ciega': 'score', '003-gravedad-liquida': 'score', '004-ritmo-caotico': 'score',
  '005-eco-temporal': 'sc', '006-latido': 'score', '007-peso-muerto': 'score', '008-tres-cuerpos': 'score', '009-chladni': 'score',
  '010-pulsar': 'score', '011-refraccion': 'score', '012-efecto-doppler': 'score', '013-demonio-maxwell': 'score', '014-automata': 'score',
  '015-fourier': 'score', '016-morfogenesis': 'score', '017-lissajous': 'score', '018-ising': 'score', '019-bloqueo-mareal': 'score',
  '020-bifurcacion': 'score', '021-soliton': 'score', '022-penrose': 'score', '023-eigenvalor': 'score', '024-efecto-tunel': 'score',
  '025-eco-espin': 'score', '026-apolonio': 'score', '027-percolacion': 'score', '028-geodesica': 'score', '029-cristal-de-tiempo': 'score',
  '030-brachistocrona': 'currentTime', '031-fase-de-berry': 'score', '032-resonancia-forzada': 'score', '033-mobius-persecucion': 'score',
  '034-topologico': 'gameState.score', '035-ventanilla-tres': 'score', '036-tortilla-al-vuelo': 'score', '037-rebano-rebelde': 'score',
};
