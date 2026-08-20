<!-- DO NOT EDIT — generated from truth/ by scripts/gen.mjs -->
<!-- truth-sha: a8b6a66c771c3193 -->
<!-- Edit truth/service.json or truth/tools.json instead, then run: node scripts/gen.mjs -->

# Connect Truth Bear

Truth Bear speaks MCP over streamable-http (protocol 2025-06-18).

## Any MCP client

```json
{ "url": "https://api.truthbear.co/mcp", "transport": "streamable-http" }
```

## Dify

Tools → MCP → add `https://api.truthbear.co/mcp`, or install the Truth Bear plugin from the Marketplace.

## n8n

Use the built-in **MCP Client Tool** node with `https://api.truthbear.co/mcp`, or install `n8n-nodes-truthbear`.

## Vercel AI SDK

```bash
npm install truthbear-ai-sdk
```

Truth Bear is an external paid service. The free tools (verify_citation, find_signal) need no wallet and no API key. The paid tool returns an x402 payment challenge; this artifact surfaces that challenge as data and never holds, requests, or transacts a private key.
