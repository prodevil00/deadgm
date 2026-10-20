// Bundles tests/*.test.ts with esbuild and runs them with Node's built-in test runner.
//   npm test          -> all fast tests (logic, save, missions, smoke balance)
//   npm run balance   -> full campaign balance simulation (slow, ~1-3 min)
import * as esbuild from 'esbuild';
import { readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const mode = process.argv[2] ?? 'fast';
const OUT = '.tmp/tests';
rmSync(OUT, { recursive: true, force: true });
const all = readdirSync('tests').filter((f) => f.endsWith('.test.ts'));
const picked = mode === 'balance' ? all.filter((f) => f.startsWith('balance')) : all.filter((f) => !f.startsWith('balance'));
await esbuild.build({
  entryPoints: picked.map((f) => `tests/${f}`),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outdir: OUT,
  outExtension: { '.js': '.mjs' },
  define: { __APP_VERSION__: '"test"' },
  logLevel: 'warning',
});
const files = readdirSync(OUT).filter((f) => f.endsWith('.mjs')).map((f) => `${OUT}/${f}`);
const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
