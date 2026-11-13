// Bundles the game into one self-contained HTML file.
//   node tools/build.mjs                 -> dist/elements.html (open it anywhere, no server needed)
//   node tools/build.mjs --fragment out  -> body-only variant for hosts that supply their own <head>
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const three = {
  name: 'vendored-three',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: resolve(root, 'vendor/three.module.min.js') }));
    b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: resolve(root, 'vendor/addons', a.path.slice('three/addons/'.length)) }));
  },
};
const out = await build({
  entryPoints: [resolve(root, 'js/main.js')], bundle: true, minify: true, format: 'iife', target: 'es2020',
  write: false, plugins: [three], legalComments: 'none',
});
const js = out.outputFiles[0].text;
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const css = readFileSync(resolve(root, 'css/style.css'), 'utf8');
const app = html.slice(html.indexOf('<!--APP-->') + 10, html.indexOf('<!--/APP-->'));
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const title = html.match(/<title>[^<]+<\/title>/)[0];

const i = process.argv.indexOf('--fragment');
if (i > 0) {
  const file = resolve(process.argv[i + 1]);
  writeFileSync(file, `${title}\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style>\n${css}</style>\n${app}\n<script>\n${js}</script>\n`);
  console.log('wrote', file, (js.length / 1024).toFixed(0) + ' KB of script');
} else {
  mkdirSync(resolve(root, 'dist'), { recursive: true });
  const file = resolve(root, 'dist/elements.html');
  writeFileSync(file, `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n${title}\n${fonts}\n<style>\n${css}</style>\n</head>\n<body>\n${app}\n<script>\n${js}</script>\n</body>\n</html>\n`);
  console.log('wrote', file, (js.length / 1024).toFixed(0) + ' KB of script');
}
