import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const GAMES_REL = join('public', 'games');
export const CATALOG_REL = join('public', 'games', 'games.json');

export function repoPaths(root = REPO_ROOT) {
  return {
    root,
    gamesDir: join(root, GAMES_REL),
    catalog: join(root, CATALOG_REL),
    local: join(root, '.local'),
    runs: join(root, '.local', 'runs'),
    attempts: join(root, '.local', 'state', 'attempts'),
    lock: join(root, '.local', 'nightly.lock'),
    instructions: join(root, 'scripts', 'generate-game.md'),
  };
}
