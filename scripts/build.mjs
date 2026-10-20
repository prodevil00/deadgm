// Production build: bundles src/main.ts with esbuild into dist/, copies public/,
// writes index.html and a service worker with a versioned precache list.
import * as esbuild from 'esbuild';
import { rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { esbuildOptions, renderIndex, copyPublic, pkg } from './shared.mjs';

const OUT = 'dist';
rmSync(OUT, { recursive: true, force: true });

const result = await esbuild.build(esbuildOptions({
  outdir: `${OUT}/assets`,
  entryNames: '[name]-[hash]',
  assetNames: '[name]-[hash]',
  minify: true,
  sourcemap: false,
  metafile: true,
  legalComments: 'none',
}));

const outputs = Object.keys(result.metafile.outputs).map((p) => relative(OUT, p).replaceAll('\\', '/'));
const js = outputs.find((p) => p.endsWith('.js'));
const css = outputs.find((p) => p.endsWith('.css'));
copyPublic(OUT);
writeFileSync(join(OUT, 'index.html'), renderIndex({ js: `./${js}`, css: css ? `./${css}` : '' }));

// Service worker: precache every built file so the game works offline after the first visit.
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative(OUT, p).replaceAll('\\', '/'));
  }
})(OUT);
const precache = ['./', ...files.filter((f) => f !== 'sw.js' && !f.endsWith('.txt')).map((f) => `./${f}`)];
const version = `${pkg.version}-${Date.now().toString(36)}`;
const sw = readFileSync('src/sw-template.js', 'utf8')
  .replace('__SW_VERSION__', version)
  .replace('__PRECACHE__', JSON.stringify(precache, null, 0));
writeFileSync(join(OUT, 'sw.js'), sw);

let total = 0;
for (const f of files) total += statSync(join(OUT, f)).size;
console.log(`\nBuilt ${files.length} files (${(total / 1024).toFixed(0)} KiB) into ${OUT}/  — sw ${version}`);
