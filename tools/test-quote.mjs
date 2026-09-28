import assert from 'node:assert/strict';
import {normalizeIranMobile} from '../dist/quote.js';
import {strings} from '../dist/i18n.js';

const validNumbers = [
  ['09123624305', '09123624305'],
  ['+989123624305', '09123624305'],
  ['00989123624305', '09123624305'],
  ['98 912 362 4305', '09123624305'],
  ['۰۹۱۲۳۶۲۴۳۰۵', '09123624305'],
  ['٠٩١٢٣٦٢٤٣٠٥', '09123624305'],
];

for (const [input, expected] of validNumbers) {
  assert.equal(normalizeIranMobile(input), expected, `normalizes ${input}`);
}

for (const input of ['', '9123624305', '0912362430', '08123624305', '091236243051']) {
  assert.equal(normalizeIranMobile(input), '', `rejects ${input}`);
}

assert.deepEqual(Object.keys(strings.fa).sort(), Object.keys(strings.en).sort(), 'Persian and English keys stay in sync');
for (const key of ['quoteTitle', 'quoteMobile', 'quotePhoneInvalid', 'quoteName', 'quoteEmail', 'quoteSaveNotice']) {
  assert.ok(strings.fa[key] && strings.en[key], `${key} exists in both languages`);
}

console.log(`${validNumbers.length} valid and 5 invalid Iranian mobile formats passed.`);
