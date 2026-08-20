// DO NOT EDIT — generated from truth/ by scripts/gen.mjs
// truth-sha: a8b6a66c771c3193
// Edit truth/service.json or truth/tools.json instead, then run: node scripts/gen.mjs
// Paste this object into vercel/ai -> content/tools-registry/registry.ts (tools array).

{
  slug: 'truthbear',
  name: 'Truth Bear',
  description:
    'Truth Bear returns official-source records for AI agents: every record carries the official source URL, a record_hash you can recompute offline, a freshness stamp, and a did:key signature. The paid tool does not charge you here — it returns the live x402 payment challenge (network / asset / payTo / amount) so your own client can decide. Free tools (verify_citation, find_signal) need no wallet and no API key.',
  packageName: 'truthbear-ai-sdk',
  tags: ['data', 'verification', 'official-sources', 'x402'],
  installCommand: {
    pnpm: 'pnpm add truthbear-ai-sdk',
    npm: 'npm install truthbear-ai-sdk',
    yarn: 'yarn add truthbear-ai-sdk',
    bun: 'bun add truthbear-ai-sdk',
  },
  codeExample: `import { generateText, isStepCount } from 'ai';
import { truthBearTools } from 'truthbear-ai-sdk';

const { text } = await generateText({
  model: 'openai/gpt-5-mini',
  prompt: 'Which Truth Bear signal lines cover US unemployment, and how fresh are they?',
  tools: truthBearTools(),
  stopWhen: isStepCount(3),
});

console.log(text);`,
  docsUrl: 'https://github.com/CHANGCHINFU/truthbear-integrations#readme',
  websiteUrl: 'https://truthbear.co',
  npmUrl: 'https://www.npmjs.com/package/truthbear-ai-sdk',
}
