/*
 * Stages a browser harness into dist/ for a headless run, then removes it.
 *
 * Usage:
 *   node tools/browser-check/stage.mjs            # copy the smoke test into dist/
 *   node tools/browser-check/stage.mjs --shot     # copy the screenshot driver into dist/
 *   node tools/browser-check/stage.mjs --clean    # remove them from dist/
 */
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', '..', 'dist');
const artifacts = [
  join(dist, '__browser-check.js'),
  join(dist, '__browser-check.html'),
  join(dist, '__shot.js'),
  join(dist, '__shot.html'),
];

if (process.argv.includes('--clean')) {
  for (const file of artifacts) if (existsSync(file)) rmSync(file);
  console.log('Removed browser harness artifacts from dist/.');
  process.exit(0);
}

if (process.argv.includes('--shot')) {
  copyFileSync(join(here, 'shot.js'), join(dist, '__shot.js'));
  copyFileSync(join(here, 'shot.html'), join(dist, '__shot.html'));
  console.log('Staged dist/__shot.js and dist/__shot.html for screenshots.');
} else {
  copyFileSync(join(here, 'check.js'), join(dist, '__browser-check.js'));
  copyFileSync(join(here, 'index.html'), join(dist, '__browser-check.html'));
  console.log('Staged dist/__browser-check.js and dist/__browser-check.html.');
}
console.log('Remember to run with --clean before committing.');
