// Shared helpers for the esbuild-based build, dev server and preview server.
import { readFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

export const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export function esbuildOptions(overrides = {}) {
  return {
    entryPoints: ['src/main.ts'],
    bundle: true,
    format: 'esm',
    target: ['es2020', 'safari15', 'chrome100'],
    loader: { '.woff': 'file', '.woff2': 'file', '.png': 'file' },
    define: { __APP_VERSION__: JSON.stringify(pkg.version), __DEV__: 'false' },
    logLevel: 'info',
    ...overrides,
  };
}

/** Builds index.html from the template, injecting the hashed JS/CSS file names. */
export function renderIndex({ js, css, extraHead = '' }) {
  const tpl = readFileSync('index.html', 'utf8');
  return tpl
    .replace('<!--APP_CSS-->', css ? `<link rel="stylesheet" href="${css}" />` : '')
    .replace('<!--APP_JS-->', `<script type="module" src="${js}"></script>${extraHead}`);
}

export function copyPublic(outDir) {
  mkdirSync(outDir, { recursive: true });
  if (existsSync('public')) cpSync('public', outDir, { recursive: true });
}

export function lanUrls(port) {
  const urls = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) urls.push(`http://${a.address}:${port}`);
  }
  return urls;
}
