<!-- DO NOT EDIT — generated from truth/ by scripts/gen.mjs -->
<!-- truth-sha: a8b6a66c771c3193 -->
<!-- Edit truth/service.json or truth/tools.json instead, then run: node scripts/gen.mjs -->

# Truth Bear integrations

Distribution artifacts for [Truth Bear](https://truthbear.co) — one package per platform, all generated
from a single source of truth.

Truth Bear returns official-source records for AI agents: every record carries the official source URL, a record_hash you can recompute offline, a freshness stamp, and a did:key signature.

## What is here

| Path | What it is |
|---|---|
| `packages/truthbear-ai-sdk` | Tools for the Vercel AI SDK (npm) |
| `packages/n8n-nodes-truthbear` | Community node for n8n (npm) |
| `generated/dify` | Plugin for the Dify Marketplace |
| `generated/vercel` | The entry to add to the AI SDK tools registry |
| `truth/` | **The only hand-editable source of truth** |
| `generated/` | Everything produced from it — never edit by hand |
| `scripts/` | The generator and the gates |

## Two rules everything here obeys

**1. No artifact contains a price.**
Prices live in exactly one place: the live HTTP 402 challenge from the service, and every
artifact reads it at runtime. An artifact that contains no price cannot quote a stale one —
which is the only real fix for price drift, because syncing several copies only slows it down.

**2. No artifact ever touches a private key.**
None of these packages has a wallet, reads an environment variable, or can spend anything.
Where payment is possible at all the caller supplies their own payment-capable client, so the
key never leaves their side. Where it is not, the artifact returns the payment challenge as
data and charges nothing.

## The gates

| Gate | What it refuses |
|---|---|
| A | A generated file that no longer matches `truth/` |
| B | A price literal anywhere; a URL or on-chain address outside the source of truth |
| D | Anything that must not become public — publishing cannot be undone |

The generator is fail-closed as well: it refuses to emit YAML whose scalars would not parse.

## Regenerating

```bash
node scripts/gen.mjs          # write generated/
node scripts/gen.mjs --check  # gate A
node scripts/lint-no-literals.mjs
node scripts/preflight-public.mjs
```

## Connect without installing anything

Truth Bear speaks MCP over streamable-http:

```json
{ "url": "https://api.truthbear.co/mcp", "transport": "streamable-http" }
```

Truth Bear is an external paid service. The free tools (verify_citation, find_signal) need no wallet and no API key. The paid tool returns an x402 payment challenge; this artifact surfaces that challenge as data and never holds, requests, or transacts a private key.

License: MIT
