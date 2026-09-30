/*
 * Generator for tools/test-equivalence.mjs.
 *
 * It copies `expression`, `field`, `selectedOptions`, `quantity`, `facts` and
 * `directConflicts` VERBATIM out of dist/engine.js and embeds them in the test as the
 * frozen reference. Regenerate with:
 *   node tools/build-equivalence-test.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');
const engineSrc = read('dist/engine.js');

const VERBATIM = ['expression', 'field', 'selectedOptions', 'quantity', 'selectionItems', 'facts', 'directConflicts'];

function slice(name) {
  const start = engineSrc.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`function not found in engine.js: ${name}`);
  let depth = 0;
  let i = engineSrc.indexOf('{', start);
  for (; i < engineSrc.length; i += 1) {
    if (engineSrc[i] === '{') depth += 1;
    else if (engineSrc[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return engineSrc.slice(start, i + 1);
}

const embedded = new Map(VERBATIM.map((name) => [name, slice(name)]));

// Constants the frozen functions close over, copied verbatim (trailing comma stripped so the
// generated file stays valid).
const constBlock = ['const MULTI_CATEGORIES', 'const RULE_PATHS']
  .map((decl) => {
    const line = engineSrc.split('\n').find((l) => l.startsWith(decl));
    if (!line) throw new Error(`constant not found in engine.js: ${decl}`);
    return line.replace(/,\s*$/, ';');
  })
  .join('\n');

// Guard: the extractor must have found real source, otherwise the frozen reference is a lie.
// Note: engine.js packs several functions per physical line, so this must not be anchored.
const found = new Set([...engineSrc.matchAll(/function\s+(\w+)\s*\(/g)].map((m) => m[1]));
const expectedTopLevel = new Set(['field', 'expression', 'facts', 'activeFindings', 'directConflicts', 'optionCheck', 'containsSelected', 'itemNeeds', 'requiredKits', 'selectedOptions', 'quantity', 'selectionItems']);
const missing = [...expectedTopLevel].filter((n) => !found.has(n));
if (missing.length) throw new Error(`engine.js no longer defines: ${missing.join(', ')} — update the extractor and the frozen reference deliberately.`);
for (const [name, body] of embedded) {
  if (!body.startsWith(`function ${name}(`)) throw new Error(`bad extraction for ${name}`);
}

const header = read('tools/lib/equivalence-head.mjs.txt');
const footer = read('tools/lib/equivalence-body.mjs.txt');

const frozen = VERBATIM
  .map((name) => `/* ---- verbatim from dist/engine.js: ${name} ---- */\n${embedded.get(name)}`)
  .join('\n\n');

const out = `${header}\n${constBlock}\n\n${frozen}\n\n${footer}`;
writeFileSync(join(here, 'test-equivalence.mjs'), out);
console.log(`Wrote tools/test-equivalence.mjs (${out.length} bytes, ${VERBATIM.length} functions + ${constBlock.split('\n').length} constants embedded verbatim).`);
