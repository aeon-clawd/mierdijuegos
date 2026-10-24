import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {smokeGame} from '../scripts/lib/smoke.mjs';
const fixture=new URL('./fixtures/test-only-good-game.html',import.meta.url);
function site(mutator=h=>h){const root=mkdtempSync(join(tmpdir(),'mierdi-browser-test-'));mkdirSync(join(root,'public/games/test'),{recursive:true});writeFileSync(join(root,'public/games/test/index.html'),mutator(readFileSync(fixture,'utf8')));copyFileSync(new URL('../public/ranking.js',import.meta.url),join(root,'public/ranking.js'));return root;}
test('real Chromium: test-only fixture starts, accepts touch/mouse, reaches forced end and retries',async()=>{
 const out=await smokeGame({site:site(),entry:{id:'test'}});
 assert.equal(out.viewport.width,390);assert.equal(out.externalRequests.length,0);assert.equal(out.errors.length,0);
 // Supabase mockeado: el hook real envía la puntuación real del juego; nada sale a la red.
 assert.equal(out.ranking.gets,2,'un GET por partida terminada (fin + reset funcionan)');
 assert.deepEqual(out.ranking.posts,[{p_id_juego:'test',p_siglas:'TST',p_resultado:out.ranking.score}]);
 assert.ok(out.ranking.score>0);
});
test('real Chromium smoke rejects a game whose end never reaches the ranking',async()=>{
 await assert.rejects(smokeGame({site:site(h=>h.replace('window.mierdiRanking?.fin(score)','void 0')),entry:{id:'test'}}),/ranking/);
});
test('real Chromium smoke rejects a game that never re-arms the ranking on retry',async()=>{
 await assert.rejects(smokeGame({site:site(h=>h.replace('window.mierdiRanking?.reset()','void 0')),entry:{id:'test'}}),/ranking/);
});
test('real Chromium blocks a game that throws at runtime',async()=>{
 await assert.rejects(smokeGame({site:site(h=>h.replace('loop();\n','loop(); throw new Error("intentional runtime error");\n')),entry:{id:'test'}}),/intentional runtime error/);
});
