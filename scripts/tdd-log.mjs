#!/usr/bin/env node
// Dev helper: run node --test on the given files and keep the full output as
// RED/GREEN evidence in .local/logs/<label>.log (ignored by git).
// Usage: node scripts/tdd-log.mjs <label> <test-file...>
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './lib/paths.mjs';

const [label, ...files] = process.argv.slice(2);
if (!label || files.length === 0) {
  console.error('usage: node scripts/tdd-log.mjs <label> <test-file...>');
  process.exit(2);
}
const args = ['--test', '--test-reporter=spec', ...files];
const res = spawnSync(process.execPath, args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 600_000 });
const out = [
  `# ${label}`,
  `date: ${new Date().toISOString()}`,
  `command: node ${args.join(' ')}`,
  `exit: ${res.status}${res.signal ? ` signal=${res.signal}` : ''}`,
  '',
  res.stdout,
  res.stderr,
].join('\n');
const dir = join(REPO_ROOT, '.local', 'logs');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${label}.log`), out);
const summary = (res.stdout || '').split('\n').filter((l) => /^ℹ (tests|pass|fail)/.test(l)).join(' | ');
console.log(`${label}: exit=${res.status} ${summary}`);
if (res.status !== 0) console.log((res.stdout + res.stderr).split('\n').filter((l) => /✖|Error|error/.test(l)).slice(0, 15).join('\n'));
process.exit(res.status ?? 1);
