// Dev server with live reload. Reachable from a phone on the same Wi-Fi (prints LAN URLs).
import * as esbuild from 'esbuild';
import { rmSync, writeFileSync, watch } from 'node:fs';
import { esbuildOptions, renderIndex, copyPublic, lanUrls } from './shared.mjs';

const OUT = '.tmp/dev';
const PORT = Number(process.env.PORT || 5173);
rmSync(OUT, { recursive: true, force: true });
copyPublic(OUT);
const writeIndex = () => writeFileSync(`${OUT}/index.html`, renderIndex({
  js: './assets/main.js',
  css: './assets/main.css',
  extraHead: `<script>new EventSource('/esbuild').addEventListener('change', () => location.reload());</script>`,
}));
writeIndex();
watch('index.html', writeIndex);

const ctx = await esbuild.context(esbuildOptions({
  outdir: `${OUT}/assets`,
  entryNames: '[name]',
  assetNames: '[name]-[hash]',
  sourcemap: 'inline',
  define: { ...esbuildOptions().define, __DEV__: 'true' },
}));
await ctx.watch();
await ctx.serve({ servedir: OUT, host: '0.0.0.0', port: PORT });
console.log(`\n  LAST CONVOY dev server\n  Local:   http://localhost:${PORT}`);
for (const u of lanUrls(PORT)) console.log(`  Network: ${u}   <- open this on your phone (same Wi-Fi)`);
