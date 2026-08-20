/**
 * truthbear-ai-sdk — Truth Bear tools for the Vercel AI SDK.
 *
 * ── Two design rules this package will not break ──────────────────────────────
 *
 * 1. NO PRICE IS EVER WRITTEN DOWN HERE.
 *    Prices live in exactly one place: the live HTTP 402 challenge returned by the
 *    server. This package reads that challenge at runtime and hands it to the caller.
 *    A package that contains no price cannot quote a stale one.
 *
 * 2. THIS PACKAGE NEVER TOUCHES A PRIVATE KEY.
 *    It has no wallet, reads no environment variable, and cannot spend anything.
 *    If you want the paid tool to actually settle, you pass in your own
 *    payment-capable `fetch` (for example one wrapped by `x402-fetch` with your own
 *    account). Bring-your-own-fetch keeps the key entirely on your side.
 *
 * Free tools (`verify_citation`, `find_signal`) work with no wallet and no API key.
 * The paid tool (`get_official_record`) returns the live payment challenge as data
 * when no payment-capable fetch is supplied — it never silently charges anyone.
 *
 * ── Why the paid tool points at the single-record endpoint ────────────────────
 * Measured 2026-08-20: 37 of the 64 published endpoints (57.8%) cost more than the
 * default per-call ceiling that payment clients ship with, so a client left on its
 * defaults refuses them locally and never even reaches the server. The endpoint this
 * tool calls is the cheapest entry into the catalogue and sits *below* that default
 * ceiling — so a caller with a payment-capable fetch and no special configuration can
 * actually complete a purchase here. Deeper multi-leg bundles cost more and are opted
 * into by raising the ceiling; the server tells you exactly how in `client_hint`.
 */
import { tool } from 'ai';
import { z } from 'zod';
import {
  BASE_URL,
  MCP_URL,
  PRICING_DISCOVERY_URL,
  SOURCE_REPO,
  TRUTH_SHA,
  DISCLOSURE,
  FREE_TOOLS,
  PAID_TOOLS,
} from './generated-constants.js';

export {
  BASE_URL,
  MCP_URL,
  PRICING_DISCOVERY_URL,
  SOURCE_REPO,
  TRUTH_SHA,
  DISCLOSURE,
  FREE_TOOLS,
  PAID_TOOLS,
};

/** A `fetch` implementation. Supply a payment-capable one to let paid calls settle. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface TruthBearOptions {
  /**
   * Base URL of the Truth Bear service. Defaults to the canonical host.
   * Override only when you are pointing at a mirror you control.
   */
  baseUrl?: string;
  /**
   * Your own `fetch`. If it can satisfy an HTTP 402 challenge (for example
   * `wrapFetchWithPayment(fetch, account)` from `x402-fetch`), the paid tool will
   * complete the purchase. Otherwise the paid tool returns the challenge as data.
   *
   * ★ This package deliberately provides no way to hand it a private key.
   */
  fetch?: FetchLike;
}

/** What the paid tool returns when nothing paid for the record. */
export interface PaymentChallenge {
  paid: false;
  /** True when your own payment client refused before the request ever reached the server. */
  blocked_by_your_client?: boolean;
  /** The error your client threw, verbatim, when it refused. */
  client_error?: string;
  /** The `accepts` entry(ies) exactly as the server published them, prices included. */
  accepts: unknown;
  /**
   * The server's guidance for this exact situation: how high to set your client ceiling,
   * a copy-pasteable example, and cheaper endpoints that fit your current budget.
   */
  client_hint: unknown;
  /** Where a human or agent can read the full current price list. */
  pricing_url: string;
  disclosure: string;
}

const json = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // Surfacing the raw body beats inventing a shape the server never sent.
    return { _non_json_body: text.slice(0, 2000), _status: res.status };
  }
};

const qs = (params: Record<string, string | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
};

/**
 * Read the live 402 challenge with a plain fetch and return it as data, together with the
 * server's `client_hint` — the field that says how high to set your client's ceiling, gives a
 * copy-pasteable example, and lists cheaper endpoints inside your current budget.
 *
 * The whole point: that hint exists on the server but a payment client that refuses locally
 * never shows it to you. This puts it back in front of the caller.
 */
async function readChallenge(url: string, existing?: Response): Promise<any> {
  try {
    const res = existing ?? (await fetch(url, { method: 'GET' }));
    return await json(res);
  } catch {
    return null;
  }
}

async function withChallenge(url: string, extra: Record<string, unknown>, existing?: Response) {
  const c = await readChallenge(url, existing);
  return {
    ...extra,
    accepts: c?.accepts ?? null,
    // ★ The actionable part. Null only if the server stopped publishing it.
    client_hint: c?.client_hint ?? null,
    pricing_url: PRICING_DISCOVERY_URL,
    disclosure: DISCLOSURE,
  };
}

/**
 * Truth Bear tools for `generateText` / `streamText`.
 *
 * @example
 * ```ts
 * import { generateText, isStepCount } from 'ai';
 * import { truthBearTools } from 'truthbear-ai-sdk';
 *
 * const { text } = await generateText({
 *   model: 'openai/gpt-5-mini',
 *   prompt: 'Which Truth Bear signal lines cover US drought, and how fresh are they?',
 *   tools: truthBearTools(),
 *   stopWhen: isStepCount(3),
 * });
 * ```
 */
export function truthBearTools(opts: TruthBearOptions = {}) {
  const base = (opts.baseUrl ?? BASE_URL).replace(/\/+$/, '');
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init));

  return {
    verify_citation: tool({
      description:
        'FREE. Given a record_hash from any Truth Bear record, look it up and recompute the canonical '
        + 'hash server-side, returning whether it is a genuine Truth Bear record and what it attests to. '
        + 'Use this to check a citation someone showed you.',
      inputSchema: z.object({
        record_hash: z
          .string()
          .describe('The record_hash to check, for example "sha256:16ecbf84…".'),
      }),
      execute: async ({ record_hash }) => {
        const res = await doFetch(`${base}/gauge/verify${qs({ record_hash })}`, { method: 'GET' });
        return json(res);
      },
    }),

    find_signal: tool({
      description:
        'FREE coverage and freshness manifest: which signal_id lines exist, how many entities each '
        + 'covers, and how fresh they are. Call this before a paid lookup to check whether your entity '
        + 'is actually covered.',
      inputSchema: z.object({
        industry: z.string().optional().describe('Narrow to one industry, optional.'),
        signal_id: z.string().optional().describe('Narrow to one signal line, optional.'),
        entity: z.string().optional().describe('Check whether one specific entity is covered, optional.'),
        full: z
          .boolean()
          .optional()
          .describe(
            'true = per-entity detail (what each line measures, its cadence, whether it is currently '
            + 'sellable) instead of counts only. Requires industry or signal_id: the un-narrowed detail '
            + 'listing is far too large to put in a model context.',
          ),
      }),
      execute: async ({ industry, signal_id, entity, full }) => {
        // ★ Why this is not a straight pass-through (measured against production, 2026-08-20):
        //   this tool talks to the REST endpoint, and GET /gauge/coverage with no `summary=1`
        //   returns 5.4 MB — roughly 1.37 MILLION tokens. Every argument here is optional, so a
        //   model will call it with none, and that single call exceeds the context window of every
        //   model this SDK can be used with.
        //   The compact form has existed the whole time (`summary=1`, 59 KB ≈ 14k tokens) and the
        //   service's own MCP surface has always defaulted to it. This artifact simply never asked.
        //   ⇒ Compact is the default here too. Detail stays available, but only once the request is
        //     narrowed enough for the answer to fit — and when it is not, we say so rather than
        //     quietly returning something other than what was asked for.
        const narrowed = Boolean(industry || signal_id);
        const params: Record<string, string | undefined> = { industry, signal_id, entity };
        if (!(full === true && narrowed)) params.summary = '1';

        const res = await doFetch(`${base}/gauge/coverage${qs(params)}`, { method: 'GET' });
        const body = await json(res);

        if (full === true && !narrowed) {
          return {
            ...body,
            _truthbear_note:
              'Returned the compact summary, not the full detail you asked for: un-narrowed detail is '
              + 'about 5.4 MB and would not fit in a model context. Pass industry or signal_id together '
              + 'with full to get it.',
          };
        }
        return body;
      },
    }),

    get_official_record: tool({
      description:
        'PAID. Fetch one official record for a signal_id + entity. If the fetch you supplied cannot '
        + 'satisfy an x402 payment challenge, this returns the live challenge as data (network, asset, '
        + 'payTo, amount) and charges nothing — it never settles silently. '
        + `Prices are always read live from the service; this package stores none. ${DISCLOSURE}`,
      inputSchema: z.object({
        signal_id: z.string().describe('Which signal line, for example "hydrology.river-level".'),
        entity: z.string().describe('Which object within that line, for example a USGS site id.'),
        dim: z
          .string()
          .optional()
          .describe('Which product: full read, or a single add-on. Each price is in the challenge.'),
      }),
      execute: async ({ signal_id, entity, dim }): Promise<unknown> => {
        const url = `${base}/gauge${qs({ signal_id, entity, dim })}`;
        let res: Response;
        try {
          res = await doFetch(url, { method: 'GET' });
        } catch (err) {
          // ★ Why this catch exists (measured, 2026-08-20):
          //   Payment clients enforce a per-call ceiling LOCALLY. `x402-fetch` at its default
          //   ceiling throws `Payment amount exceeds maximum allowed` — and **discards the 402
          //   body**. The server publishes a `client_hint` in that body telling you the exact
          //   amount to raise the ceiling to, giving a copy-pasteable example, and listing
          //   cheaper endpoints that fit your current budget. None of it reaches the caller.
          //   So the person sees a generic refusal and no way to act on it.
          //   ⇒ We re-read the challenge with a plain fetch and hand the hint back as data.
          return withChallenge(url, {
            paid: false,
            blocked_by_your_client: true,
            client_error: (err as Error)?.message ?? String(err),
          });
        }
        if (res.status === 402) return withChallenge(url, { paid: false }, res);
        return json(res);
      },
    }),
  };
}

export default truthBearTools;
