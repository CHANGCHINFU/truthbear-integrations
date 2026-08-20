// The two design rules of this package, pinned by tests rather than by comments.
//
//   1. NO PRICE APPEARS IN THE PUBLISHED ARTIFACT.
//      Prices live in exactly one place: the live 402 challenge. A package that contains no
//      price cannot quote a stale one.
//
//   2. THIS PACKAGE NEVER TOUCHES A PRIVATE KEY.
//      No wallet, no environment variable, nothing it could spend. Paying is done by a
//      payment-capable `fetch` the caller supplies, so the key stays on their side.
//
// These scan `dist`, not `src`, on purpose: `dist` is what a consumer installs. Scanning `src`
// would pass while the published bundle was wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath is required: the project path contains non-ASCII characters, so
// `new URL(...).pathname` returns a percent-encoded string (with a leading slash on Windows),
// and readdir would fail on it.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const distFiles = () => {
  assert.ok(existsSync(DIST), 'dist is missing - run `npm run build` first, or these gates scan nothing');
  const fs = readdirSync(DIST).filter((f) => /\.(js|d\.ts|mjs|cjs)$/.test(f));
  // Population floor: fewer than two files means the build broke, not that the output is clean.
  assert.ok(fs.length >= 2, `dist holds only ${fs.length} file(s) - the population is wrong, not the check`);
  return fs.map((f) => [f, readFileSync(join(DIST, f), 'utf8')]);
};

test('the published artifact contains no price literal (prices live only in the live 402 challenge)', () => {
  const bad = [];
  for (const [name, body] of distFiles()) {
    body.split('\n').forEach((ln, i) => {
      if (/\$\s?\d/.test(ln)) bad.push(`${name}:${i + 1}  ${ln.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(bad, [],
    'These lines put a price into the published artifact, where it will not follow a price change:\n  '
    + bad.join('\n  '));
});

test('the published artifact reads no environment variable and mentions no key material', () => {
  const bad = [];
  for (const [name, body] of distFiles()) {
    for (const pat of [/process\.env/, /privateKey/i, /PRIVATE_KEY/, /mnemonic/i, /\bseed\s*phrase\b/i]) {
      if (pat.test(body)) bad.push(`${name} matched ${pat}`);
    }
  }
  assert.deepEqual(bad, [],
    'This package promises it holds no key and reads no environment. The build says otherwise:\n  '
    + bad.join('\n  '));
});

test('the published artifact embeds no on-chain address (payTo and asset come from the live challenge)', () => {
  const bad = [];
  for (const [name, body] of distFiles()) {
    const hits = body.match(/0x[a-fA-F0-9]{40}/g) || [];
    if (hits.length) bad.push(`${name}: ${[...new Set(hits)].join(', ')}`);
  }
  assert.deepEqual(bad, [], 'The artifact embeds on-chain addresses, which go stale:\n  ' + bad.join('\n  '));
});

test('no runtime dependencies - the AI SDK and zod belong to the host app', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies || {}), [],
    'This package should have zero runtime dependencies; ai and zod are peerDependencies');
  assert.ok(pkg.peerDependencies?.ai, 'ai should be a peer dependency');
  assert.ok(pkg.peerDependencies?.zod, 'zod should be a peer dependency');
  assert.equal(pkg.license, 'MIT');
});

test('generated-constants is generated and must not be hand-edited', () => {
  const body = readFileSync(join(ROOT, 'src', 'generated-constants.ts'), 'utf8');
  assert.match(body, /DO NOT EDIT/,
    'The generated-file header is gone, which means someone edited it by hand');
  assert.match(body, /truth-sha: [0-9a-f]{16}/,
    'Without truth-sha nobody can tell which revision of the source of truth produced this package');
});
