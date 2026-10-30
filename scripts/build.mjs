// Build : src/ -> dist/ (JS bundlé avec Three.js, CSS Tailwind, fichiers statiques).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// 1. JavaScript (ESM -> IIFE minifié)
await build({
  entryPoints: [path.join(src, 'meteo.js')],
  outfile: path.join(dist, 'meteo.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020', 'safari15'],
  legalComments: 'none'
});

// 2. CSS Tailwind (inclut meteo.css)
const tailwindBin = path.join(root, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs');
execFileSync(process.execPath, [tailwindBin, '-i', path.join(src, 'tailwind.css'), '-o', path.join(dist, 'app.css'), '--minify'], {
  stdio: 'inherit',
  cwd: root
});

// 3. Fichiers statiques
for (const f of ['index.html', 'privacy.html', 'manifest.json', 'icon-192.png', 'icon-512.png']) {
  await cp(path.join(src, f), path.join(dist, f));
}

// Émojis 3D + service worker (liste des émojis injectée pour le mode hors-ligne)
await cp(path.join(src, 'emoji'), path.join(dist, 'emoji'), { recursive: true });
const emoji = (await readdir(path.join(src, 'emoji'))).filter(f => f.endsWith('.webp')).map(f => f.replace('.webp', ''));
const sw = (await readFile(path.join(src, 'sw.js'), 'utf8')).replace('/*EMOJI_LIST*/', emoji.map(n => `'${n}'`).join(', '));
await writeFile(path.join(dist, 'sw.js'), sw);

console.log('Build terminé -> dist/');
