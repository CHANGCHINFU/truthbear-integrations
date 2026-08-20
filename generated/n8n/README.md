<!-- DO NOT EDIT — generated from truth/ by scripts/gen.mjs -->
<!-- truth-sha: 9439ce51af17dff6 -->
<!-- Edit truth/service.json or truth/tools.json instead, then run: node scripts/gen.mjs -->

# n8n-nodes-truthbear

Truth Bear returns official-source records for AI agents: every record carries the official source URL, a record_hash you can recompute offline, a freshness stamp, and a did:key signature.

## What this node does

- **verify_citation** *(free)*
- **find_signal** *(free)*
- **get_official_record** *(returns the payment challenge only — this node never pays)*

## What this node deliberately does not do

- It does **not** take a private key, and it cannot spend anything.
- It does **not** read environment variables or files (n8n verification requirement).
- It has **no runtime dependencies**.

Truth Bear is an external paid service. The free tools (verify_citation, find_signal) need no wallet and no API key. The paid tool returns an x402 payment challenge; this artifact surfaces that challenge as data and never holds, requests, or transacts a private key.

## Install

Community node: `n8n-nodes-truthbear`

## Source

https://github.com/CHANGCHINFU/mcp-gauge · License: MIT
