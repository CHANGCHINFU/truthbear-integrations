// This pins the fix for a defect that shipped in 0.1.2 and made find_signal unusable as a tool.
//
// Measured against production on 2026-08-20:
//   GET /gauge/coverage without `summary=1` returns about 5.4 MB - roughly 1.37 MILLION tokens.
//   Every argument of find_signal is optional, so a model WILL call it with none, and that single
//   call exceeds the context window of every model this SDK can be used with.
//   The compact form (`summary=1`, ~59 KB) had existed the whole time, and the service's own MCP
//   surface has always defaulted to it. This artifact simply never asked for it.
//
// Note where the bug was NOT: the production MCP server honours its own declared default
// ("true = per-entity detail (larger); default compact summary") and returns 147 KB with no
// arguments. Only the artifacts that call the REST endpoint directly were affected.
//
// These tests use an injected fetch, so they are deterministic and need no network: what is being
// pinned is the REQUEST this package builds, which is where the defect lived.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { truthBearTools } from '../dist/index.js';

/** Captures the URL instead of calling anything, and answers with a minimal well-formed body. */
function spyFetch() {
  const calls = [];
  const fetchLike = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ signals: [], totals: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { calls, fetchLike };
}

const q = (url) => new URL(url).searchParams;

test('no arguments asks for the compact form, not the 5.4 MB listing', async () => {
  const { calls, fetchLike } = spyFetch();
  await truthBearTools({ fetch: fetchLike }).find_signal.execute({}, {});
  assert.equal(calls.length, 1);
  assert.equal(q(calls[0]).get('summary'), '1',
    'find_signal with no arguments must request summary=1; without it the response is ~1.37M tokens');
});

test('narrowing alone still asks for the compact form', async () => {
  const { calls, fetchLike } = spyFetch();
  await truthBearTools({ fetch: fetchLike }).find_signal.execute({ industry: 'hydrology' }, {});
  assert.equal(q(calls[0]).get('summary'), '1');
  assert.equal(q(calls[0]).get('industry'), 'hydrology');
});

test('full detail is honoured once the request is narrowed', async () => {
  const { calls, fetchLike } = spyFetch();
  await truthBearTools({ fetch: fetchLike })
    .find_signal.execute({ full: true, signal_id: 'hydrology.river-level' }, {});
  assert.equal(q(calls[0]).get('summary'), null,
    'with a narrowing filter the caller may have the detail form');
  assert.equal(q(calls[0]).get('signal_id'), 'hydrology.river-level');
});

test('full detail without narrowing is downgraded, and the downgrade is stated', async () => {
  const { calls, fetchLike } = spyFetch();
  const out = await truthBearTools({ fetch: fetchLike }).find_signal.execute({ full: true }, {});
  assert.equal(q(calls[0]).get('summary'), '1',
    'un-narrowed detail is ~5.4 MB and must not be requested');
  // Returning something other than what was asked for is only acceptable if we say so.
  assert.match(String(out._truthbear_note), /compact summary/i);
});
