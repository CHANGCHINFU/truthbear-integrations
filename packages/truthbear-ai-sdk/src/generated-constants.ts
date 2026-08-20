// DO NOT EDIT — generated from truth/ by scripts/gen.mjs
// truth-sha: a8b6a66c771c3193
// Edit truth/service.json or truth/tools.json instead, then run: node scripts/gen.mjs

export const BASE_URL = 'https://api.truthbear.co';
export const MCP_URL = 'https://api.truthbear.co/mcp';
export const MCP_TRANSPORT = 'streamable-http';
export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const PRICING_DISCOVERY_URL = 'https://api.truthbear.co/manifest';
export const SOURCE_REPO = 'https://github.com/CHANGCHINFU/mcp-gauge';
export const TRUTH_SHA = 'a8b6a66c771c3193';
export const DISCLOSURE = "Truth Bear is an external paid service. The free tools (verify_citation, find_signal) need no wallet and no API key. The paid tool returns an x402 payment challenge; this artifact surfaces that challenge as data and never holds, requests, or transacts a private key.";
export const FREE_TOOLS = ["verify_citation","find_signal"] as const;
export const PAID_TOOLS = ["get_official_record"] as const;

/** Tool names + descriptions as published by the live server at generation time.
 *  ★ Descriptions are a convenience snapshot only — the authoritative list is tools/list at runtime. */
export const TOOL_SNAPSHOT = [
  {
    "name": "verify_citation",
    "description": "FREE. Given a record_hash from any Truth Bear record, look it up and recompute the canonical hash server-side, returning whether it is a genuine Truth Bear official record plus a plain-language reverse lookup of what exactly that hash attests. Use this to check a citation you were handed by another agent or document BEFORE relying on it. No payment, no API key."
  },
  {
    "name": "find_signal",
    "description": "FREE coverage + freshness manifest: which signal_id lines exist, how many entities each covers, and fresh/recent/stale counts - so you can check \"is my entity covered and how fresh\" BEFORE paying. Optional filters: industry, signal_id, entity."
  },
  {
    "name": "get_official_record",
    "description": "Returns the REAL x402 payment challenge (accepts[]: network / asset / payTo / amount) for the paid endpoint that serves a given signal_id+entity. This tool does NOT deliver paid data and does NOT take payment - MCP has no payment layer. Pay at the returned url with your own x402 client (USDC on Base or Solana, gasless EIP-3009; pay from a plain EOA) and you receive the record directly, with record_hash you can verify offline. This tool only fetches the 402 challenge; it delivers no paid data and collects no payment."
  }
] as const;
