// DO NOT EDIT — generated from truth/ by scripts/gen.mjs
// truth-sha: a8b6a66c771c3193
// Edit truth/service.json or truth/tools.json instead, then run: node scripts/gen.mjs


import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';

// The service base URL. It is a node parameter (not an environment variable) because verified
// community nodes may not read the environment or the file system.
const DEFAULT_BASE_URL = "https://api.truthbear.co";
const PRICING_URL = "https://api.truthbear.co/manifest";
const DISCLOSURE = "Truth Bear is an external paid service. The free tools (verify_citation, find_signal) need no wallet and no API key. The paid tool returns an x402 payment challenge; this artifact surfaces that challenge as data and never holds, requests, or transacts a private key.";

export class TruthBear implements INodeType {
	description: INodeTypeDescription = {
		displayName: "Truth Bear",
		name: 'truthBear',
		icon: { light: 'file:truthbear.svg', dark: 'file:truthbear.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: "Truth Bear returns official-source records for AI agents: every record carries the official source URL, a record_hash you can recompute offline, a freshness stamp, and a did:key signature.",
		defaults: { name: 'Truth Bear' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		// Officially recommended: "When in doubt, set it to true." This node has main input and
		// output and is not a trigger, so an AI Agent may call it as a tool.
		usableAsTool: true,
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'Official Record', value: 'record' }],
				default: 'record',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['record'] } },
				options: [
					{
						name: "Verify Citation",
						value: "verifyCitation",
						action: "Verify a record hash",
						description: "FREE. Given a record_hash from any Truth Bear record, look it up and recompute the canonical hash server-side, returning whether it is a genuine Truth Bear official record plus a plain-language revers.",
					},
					{
						name: "Find Signal",
						value: "findSignal",
						action: "Find coverage and freshness",
						description: "FREE coverage + freshness manifest: which signal_id lines exist, how many entities each covers, and fresh/recent/stale counts - so you can check \"is my entity covered and how fresh\" BEFORE paying. Opt.",
					},
					{
						name: "Get Price Quote",
						value: "getPriceQuote",
						action: "Get the live price quote for a record",
						description: "Ask the service what one record costs right now - this operation does not pay and cannot pay; it returns the live payment challenge and the guidance that comes with it, so you decide",
					},
				],
				default: "verifyCitation",
			},
			{
				displayName: "Record Hash",
				name: "record_hash",
				type: 'string',
				default: '',
				required: true,
				description: "Sha256:&lt;64 hex&gt;, or a &gt;=8-hex prefix as posted publicly",
				displayOptions: { show: { operation: ["verifyCitation"] } },
			},
			{
				displayName: "Industry",
				name: "industry",
				type: 'string',
				default: '',
				description: "Restrict to one domain, e.g. hydrology, agriculture, energy",
				displayOptions: { show: { operation: ["findSignal"] } },
			},
			{
				displayName: "Signal ID",
				name: "signal_id",
				type: 'string',
				default: '',
				description: "E.g. hydrology.river-level.",
				displayOptions: { show: { operation: ["findSignal"] } },
			},
			{
				displayName: "Entity",
				name: "entity",
				type: 'string',
				default: '',
				description: "Object ID, e.g. a USGS site ID",
				displayOptions: { show: { operation: ["findSignal"] } },
			},
			{
				displayName: "Signal ID",
				name: "signal_id",
				type: 'string',
				default: '',
				required: true,
				description: "Which signal line, e.g. hydrology.river-level - use find_signal to list them",
				displayOptions: { show: { operation: ["getPriceQuote"] } },
			},
			{
				displayName: "Entity",
				name: "entity",
				type: 'string',
				default: '',
				required: true,
				description: "Which object within that line, e.g. the USGS site ID 07010000",
				displayOptions: { show: { operation: ["getPriceQuote"] } },
			},
			{
				displayName: 'Service URL',
				name: 'baseUrl',
				type: 'string',
				default: DEFAULT_BASE_URL,
				description: 'Override only if you are pointing at a mirror you control',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const operation = this.getNodeParameter('operation', i) as string;
			const baseUrl = (this.getNodeParameter('baseUrl', i, DEFAULT_BASE_URL) as string).replace(/\/+$/, '');

			const spec = OPERATIONS[operation];
			const qs: Record<string, string> = {};
			for (const arg of spec.args) {
				const v = this.getNodeParameter(arg, i, '') as string;
				if (v) qs[arg] = v;
			}

			try {
				// returnFullResponse + ignoreHttpStatusErrors on purpose: this service answers 402 with a
				// payment challenge and 422 with an honest "not charged" explanation. Both are information
				// the caller wants. Payment clients typically throw on 402 and discard that body, which is
				// exactly the gap this node closes.
				const res = await this.helpers.httpRequest({
					method: 'GET',
					url: baseUrl + spec.path,
					qs,
					json: true,
					returnFullResponse: true,
					ignoreHttpStatusErrors: true,
				});

				const body = (res.body ?? {}) as IDataObject;
				const json: IDataObject =
					res.statusCode === 402
						? {
								paid: false,
								accepts: body.accepts ?? null,
								// The part a payment client would have thrown away: how high to set your
								// ceiling, a copy-pasteable example, and cheaper endpoints in budget.
								client_hint: body.client_hint ?? null,
								pricing_url: PRICING_URL,
								disclosure: DISCLOSURE,
							}
						: { statusCode: res.statusCode, ...body };

				// pairedItem keeps the link back to the input item (required by n8n review).
				out.push({ json, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeApiError(this.getNode(), error as never, { itemIndex: i });
			}
		}

		return [out];
	}
}

const OPERATIONS: Record<string, { path: string; args: string[] }> = {
	verifyCitation: { path: "/gauge/verify", args: ["record_hash"] },
	findSignal: { path: "/gauge/coverage", args: ["industry","signal_id","entity"] },
	getPriceQuote: { path: "/gauge", args: ["signal_id","entity"] },
};
