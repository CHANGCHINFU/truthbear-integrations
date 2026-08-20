<!-- DO NOT EDIT — generated from truth/ by scripts/gen.mjs -->
<!-- truth-sha: a8b6a66c771c3193 -->
<!-- Edit truth/service.json or truth/tools.json instead, then run: node scripts/gen.mjs -->

# truthbear-ai-sdk

Truth Bear returns official-source records for AI agents: every record carries the official source URL, a record_hash you can recompute offline, a freshness stamp, and a did:key signature.

Tools for the [Vercel AI SDK](https://sdk.vercel.ai). No API key. No account.

## Install

```bash
npm install truthbear-ai-sdk
```

## Use

```ts
import { generateText, isStepCount } from 'ai';
import { truthBearTools } from 'truthbear-ai-sdk';

const { text } = await generateText({
  model: 'openai/gpt-5-mini',
  prompt: 'Which Truth Bear signal lines cover US drought, and how fresh are they?',
  tools: truthBearTools(),
  stopWhen: isStepCount(3),
});
```

The example above uses only the free tools, so it runs with no wallet.

## Tools

### `verify_citation` (free)

FREE. Given a record_hash from any Truth Bear record, look it up and recompute the canonical hash server-side, returning whether it is a genuine Truth Bear official record plus a plain-language reverse lookup of what exactly that hash attests. Use this to check a citation you were handed by another agent or document BEFORE relying on it. No payment, no API key.

### `find_signal` (free)

FREE coverage + freshness manifest: which signal_id lines exist, how many entities each covers, and fresh/recent/stale counts - so you can check "is my entity covered and how fresh" BEFORE paying. Optional filters: industry, signal_id, entity.

### `get_official_record` (paid)

Returns the REAL x402 payment challenge (accepts[]: network / asset / payTo / amount) for the paid endpoint that serves a given signal_id+entity. This tool does NOT deliver paid data and does NOT take payment - MCP has no payment layer. Pay at the returned url with your own x402 client (USDC on Base or Solana, gasless EIP-3009; pay from a plain EOA) and you receive the record directly, with record_hash you can verify offline. This tool only fetches the 402 challenge; it delivers no paid data and collects no payment.

## Paying for a record

This package **has no wallet and never sees a private key**. It reads no environment
variable and cannot spend anything.

If you want `get_official_record` to actually settle, hand it your own
payment-capable `fetch` — the key stays entirely on your side:

```ts
import { wrapFetchWithPayment } from 'x402-fetch';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount(process.env.MY_KEY as `0x${string}`);
const tools = truthBearTools({ fetch: wrapFetchWithPayment(fetch, account) });
```

Without that, the paid tool returns the live payment challenge as **data**
(network / asset / payTo / amount) and charges nothing.

> **Note on `maxValue`.** Payment clients ship a default per-call ceiling.
> If a record costs more than your client's default, the client stops before paying.
> Set the ceiling from the tier you actually call. The live prices are at
> https://api.truthbear.co/manifest.

## Prices

**This package stores no prices.** They exist in exactly one place — the live 402
challenge — and are read at runtime. See https://api.truthbear.co/manifest.

Truth Bear is an external paid service. The free tools (verify_citation, find_signal) need no wallet and no API key. The paid tool returns an x402 payment challenge; this artifact surfaces that challenge as data and never holds, requests, or transacts a private key.

## Also available over MCP

```json
{ "url": "https://api.truthbear.co/mcp", "transport": "streamable-http" }
```

## Source

https://github.com/CHANGCHINFU/mcp-gauge · License: MIT
