// This pins one of the main reasons this package exists.
//
// The problem, measured on 2026-08-20:
//   The server publishes a thorough `client_hint` inside its 402 body - the exact amount to raise
//   your ceiling to, a copy-pasteable example, and cheaper endpoints that fit your current budget.
//   But a payment client refuses LOCALLY. `x402-fetch` at its default ceiling throws
//       "Payment amount exceeds maximum allowed"
//   and discards the 402 body. Checking the message the caller actually receives:
//       client_hint / maxValue / the amount / within_your_budget  -> none of them present.
//   So the remedy exists on the server and is structurally invisible to the person who needs it.
//   (The hint's own text even says "you will see no error from us" - it predicted this.)
//
// What this pins: when the client refuses locally, the tool must still hand the server's
// guidance to the caller.
//
// It calls production, but it costs nothing: the flow stops at the client's own refusal and can
// never reach settlement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truthBearTools } from '../dist/index.js';

// What x402-fetch really does at its default ceiling: it receives the 402, then throws this
// locally without passing the body on.
const CLIENT_REFUSAL = 'Payment amount exceeds maximum allowed';
const refusingFetch = async () => { throw new Error(CLIENT_REFUSAL); };

const LIVE = process.env.OFFLINE !== '1';

test('when the client refuses locally, the server guidance still reaches the caller', { skip: !LIVE && 'offline' }, async () => {
  const tools = truthBearTools({ fetch: refusingFetch });
  const out = await tools.get_official_record.execute({
    signal_id: 'hydrology.river-level',
    entity: '07010000',
  });

  assert.equal(out.paid, false, 'must not claim the call was paid');
  assert.equal(out.blocked_by_your_client, true, 'must say it was the caller own client that refused, not a server refusal');
  assert.equal(out.client_error, CLIENT_REFUSAL, 'must pass the client error through verbatim');

  // The point: without these the caller sees only a generic refusal and has nothing to act on.
  assert.ok(out.accepts, 'without accepts the caller cannot know what it actually costs');
  assert.ok(out.pricing_url, 'must point at the full live price list');
  assert.ok(out.disclosure, 'an external paid service must be disclosed');
});

test('a plain fetch gets the challenge as data and is never charged silently', { skip: !LIVE && 'offline' }, async () => {
  const tools = truthBearTools();          // the default is plain fetch: no payment capability
  const out = await tools.get_official_record.execute({
    signal_id: 'hydrology.river-level',
    entity: '07010000',
  });
  assert.equal(out.paid, false);
  assert.ok(out.accepts, 'the challenge must come back as data, not as a contentless error');
  // Nothing that looks like delivery may appear: no payment means no goods.
  assert.equal(out.record_hash, undefined, 'a record_hash without payment would be a free leak');
});

test('the free tools work without a wallet', { skip: !LIVE && 'offline' }, async () => {
  const tools = truthBearTools();
  const out = await tools.find_signal.execute({});
  assert.ok(out && typeof out === 'object', 'find_signal should return an object');
  assert.equal(out._status, undefined, `find_signal should not return a non-JSON body: ${JSON.stringify(out).slice(0, 200)}`);
});
