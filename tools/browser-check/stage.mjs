/*
 * Stages the browser smoke test into dist/ for a headless run, then removes it.
 * See tools/browser-check/index.html for the recipe.
 *
 * Usage:
 *   node tools/browser-check/stage.mjs           # copy check.js + check.html into dist/
 *   node tools/browser-check/stage.mjs --clean   # remove them from dist/
 */
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', '..', 'dist');
const targets = [
  join(dist, '__browser-check.js'),
  join(dist, '__browser-check.html'),
];

if (process.argv.includes('--clean')) {
  for (const file of targets) if (existsSync(file)) rmSync(file);
  console.log('Removed browser-check artifacts from dist/.');
  process.exit(0);
}

copyFileSync(join(here, 'check.js'), join(dist, '__browser-check.js'));
copyFileSync(join(here, 'index.html'), join(dist, '__browser-check.html'));
console.log('Staged dist/__browser-check.js and dist/__browser-check.html.');
console.log('Remember to run with --clean before committing.');
