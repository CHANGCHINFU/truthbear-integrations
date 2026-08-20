// This pins a bug that shipped in every published version up to 0.1.3: `verify_citation` had
// never verified anything.
//
// Measured against production on 2026-08-20:
//   GET /gauge/verify?record_hash=<h>  ->  HTTP 400  "missing ?hash=sha256:<64 hex>"
//   GET /gauge/verify?hash=<h>         ->  HTTP 200  found:true verified:true
//
// The query parameter is `hash`. `record_hash` is what the service's MCP tool surface calls this
// input, and the MCP server maps it to `hash` before calling REST. This package talks to REST
// directly, so it has to do that mapping itself - and it did not. Same root cause as the coverage
// size bug: these artifacts speak REST but were modelled on the MCP tool surface, and nothing
// checked that the two agree.
//
// Why the old tests missed it: the one named "the free tools work without a wallet" only called
// find_signal, and its only assertion was that an object came back - which an HTTP 400 body
// satisfies. A test whose name claims more than it checks is worse than no test, because it makes
// the gap look covered.
//
// So there are two kinds of test here:
//   1. offline, on the URL this package builds  - deterministic, and the exact thing that broke
//   2. live, on a known-good hash               - proves the whole path, not just our half of it
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truthBearTools } from '../dist/index.js';

const LIVE = process.env.OFFLINE !== '1';

/** A real, published record. Anyone can re-derive one from the free GET /gauge/sample. */
const KNOWN_GOOD_HASH =
  'sha256:f72ec61a78a208fdd1988eb2d5b7a28097b495cda4e56bc2710485632eac436c';

function spyFetch() {
  const calls = [];
  const fetchLike = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ found: true, verified: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { calls, fetchLike };
}

test('verify_citation sends the parameter the service actually reads', async () => {
  const { calls, fetchLike } = spyFetch();
  await truthBearTools({ fetch: fetchLike })
    .verify_citation.execute({ record_hash: KNOWN_GOOD_HASH }, {});
  const q = new URL(calls[0]).searchParams;
  assert.equal(q.get('hash'), KNOWN_GOOD_HASH,
    'the endpoint reads ?hash= ; sending anything else returns HTTP 400 and verifies nothing');
  assert.equal(q.get('record_hash'), null,
    '?record_hash= is the MCP surface name and is not understood by the REST endpoint');
});

test('a genuine record verifies against the live service', { skip: !LIVE && 'offline' }, async () => {
  const out = await truthBearTools().verify_citation.execute(
    { record_hash: KNOWN_GOOD_HASH }, {});
  // ★ Assert the VERDICT, not merely that something came back. The previous test asserted
  //   "an object was returned", and an HTTP 400 body is an object.
  assert.equal(out.is_truth_bear_record, true, `expected a genuine record, got: ${JSON.stringify(out).slice(0, 300)}`);
  assert.equal(out.verified, true);
  assert.equal(out.found, true);
  assert.equal(out.recomputed_hash, KNOWN_GOOD_HASH,
    'the service must recompute the same hash, or the citation proves nothing');
});

test('a hash that is not ours is reported as not ours', { skip: !LIVE && 'offline' }, async () => {
  const fake = 'sha256:' + '0'.repeat(64);
  const out = await truthBearTools().verify_citation.execute({ record_hash: fake }, {});
  // The negative answer is the point of the tool: it is how someone catches a forged citation.
  assert.equal(out.is_truth_bear_record, false);
  assert.equal(out.found, false);
});
