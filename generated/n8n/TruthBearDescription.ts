// DO NOT EDIT — generated from truth/ by scripts/gen.mjs
// truth-sha: 9439ce51af17dff6
// Edit truth/service.json or truth/tools.json instead, then run: node scripts/gen.mjs

import type { INodeProperties } from 'n8n-workflow';

export const BASE_URL = 'https://api.truthbear.co';
export const MCP_URL = 'https://api.truthbear.co/mcp';
export const TRUTH_SHA = '9439ce51af17dff6';

export const operations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    default: 'verify_citation',
    options: [
      {
        name: 'verify_citation',
        value: 'verify_citation',
        description: "FREE. Given a record_hash from any Truth Bear record, look it up and recompute the canonical hash server-side, returning whether it is a genuine Truth Bear official record plus a plain-language reverse lookup of what exa",
        action: 'Free lookup',
      },
      {
        name: 'find_signal',
        value: 'find_signal',
        description: "FREE coverage + freshness manifest: which signal_id lines exist, how many entities each covers, and fresh/recent/stale counts - so you can check \"is my entity covered and how fresh\" BEFORE paying. Optional filters: indus",
        action: 'Free lookup',
      },
      {
        name: 'get_official_record',
        value: 'get_official_record',
        description: "Returns the REAL x402 payment challenge (accepts[]: network / asset / payTo / amount) for the paid endpoint that serves a given signal_id+entity. This tool does NOT deliver paid data and does NOT take payment - MCP has n",
        action: 'Get the live payment challenge (does not pay)',
      },
    ],
  },
  {
    displayName: 'record_hash',
    name: 'record_hash',
    type: 'string',
    default: '',
    required: true,
    description: "sha256:<64 hex>, or a >=8-hex prefix as posted publicly",
    displayOptions: { show: { operation: ['verify_citation'] } },
  },
  {
    displayName: 'industry',
    name: 'industry',
    type: 'string',
    default: '',
    required: false,
    description: "restrict to one domain, e.g. hydrology, agriculture, energy",
    displayOptions: { show: { operation: ['find_signal'] } },
  },
  {
    displayName: 'signal_id',
    name: 'signal_id',
    type: 'string',
    default: '',
    required: false,
    description: "e.g. hydrology.river-level",
    displayOptions: { show: { operation: ['find_signal'] } },
  },
  {
    displayName: 'entity',
    name: 'entity',
    type: 'string',
    default: '',
    required: false,
    description: "object id, e.g. a USGS site id",
    displayOptions: { show: { operation: ['find_signal'] } },
  },
  {
    displayName: 'full',
    name: 'full',
    type: 'string',
    default: '',
    required: false,
    description: "true = per-entity detail (larger); default compact summary",
    displayOptions: { show: { operation: ['find_signal'] } },
  },
  {
    displayName: 'signal_id',
    name: 'signal_id',
    type: 'string',
    default: '',
    required: true,
    description: "which signal line, e.g. hydrology.river-level - use find_signal to list them",
    displayOptions: { show: { operation: ['get_official_record'] } },
  },
  {
    displayName: 'entity',
    name: 'entity',
    type: 'string',
    default: '',
    required: true,
    description: "which object within that line, e.g. the USGS site id 07010000",
    displayOptions: { show: { operation: ['get_official_record'] } },
  },
  {
    displayName: 'dim',
    name: 'dim',
    type: 'string',
    default: '',
    required: false,
    description: "which product: full read (gauge) or a single add-on; the price of each is in the 402 challenge this tool returns, never here",
    displayOptions: { show: { operation: ['get_official_record'] } },
  },
];
