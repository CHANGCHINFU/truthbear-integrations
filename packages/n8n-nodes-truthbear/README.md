<!-- DO NOT EDIT — generated from truth/ by scripts/gen.mjs -->
<!-- truth-sha: a8b6a66c771c3193 -->
<!-- Edit truth/service.json or truth/tools.json instead, then run: node scripts/gen.mjs -->

# n8n-nodes-truthbear

Truth Bear returns official-source records for AI agents: every record carries the official source URL, a record_hash you can recompute offline, a freshness stamp, and a did:key signature.

## Operations

- **Verify Citation** — Verify a record hash *(free)*
- **Find Signal** — Find coverage and freshness *(free)*
- **Get Price Quote** — Get the live price quote for a record *(returns a quote only; this node never pays)*

## What this node deliberately cannot do

- It **cannot pay**. It has no wallet, takes no private key, and has no credentials at all.
- It **does not read environment variables or files** (n8n verification requirement).
- It has **no runtime dependencies**.

### Why a "quote" operation exists

Payment clients enforce a spending ceiling locally. When a record costs more than that ceiling,
the client refuses **before the request leaves your machine** and typically discards the server's
reply — so you see a generic refusal and nothing you can act on.

**Get Price Quote** asks the service directly and returns what the client would have thrown away:
the exact amount, how high to set your ceiling, a copy-pasteable example, and cheaper endpoints
that fit your current budget.

Truth Bear is an external paid service. The free tools (verify_citation, find_signal) need no wallet and no API key. The paid tool returns an x402 payment challenge; this artifact surfaces that challenge as data and never holds, requests, or transacts a private key.

Current prices are always read live from the service — this package stores none.
See https://api.truthbear.co/manifest.

## Install

Settings → Community nodes → Install → `n8n-nodes-truthbear`

## Source

https://github.com/CHANGCHINFU/mcp-gauge · License: MIT
