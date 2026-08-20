<!-- DO NOT EDIT — generated from truth/ by scripts/gen.mjs -->
<!-- truth-sha: a8b6a66c771c3193 -->
<!-- Edit truth/service.json or truth/tools.json instead, then run: node scripts/gen.mjs -->

# Truth Bear for Dify

Truth Bear returns official-source records for AI agents: every record carries the official source URL, a record_hash you can recompute offline, a freshness stamp, and a did:key signature.

## Tools

- **verify_citation** — FREE. Given a record_hash from any Truth Bear record, look it up and recompute the canonical hash server-side, returning whether it is a genuine Truth Bear offi
- **find_signal** — FREE coverage + freshness manifest: which signal_id lines exist, how many entities each covers, and fresh/recent/stale counts - so you can check "is my entity c
- **get_official_record** — Returns the REAL x402 payment challenge (accepts[]: network / asset / payTo / amount) for the paid endpoint that serves a given signal_id+entity. This tool does

## Credentials

None. The free tools work with no API key and no wallet.

## External paid service

Truth Bear is an external paid service. The free tools (verify_citation, find_signal) need no wallet and no API key. The paid tool returns an x402 payment challenge; this artifact surfaces that challenge as data and never holds, requests, or transacts a private key.

Current prices are always read live from the service — this plugin never stores a price.
See https://api.truthbear.co/manifest.

## Source

https://github.com/CHANGCHINFU/mcp-gauge
