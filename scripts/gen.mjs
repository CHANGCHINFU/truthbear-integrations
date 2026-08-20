// 生成器:truth/ → generated/。三個通路的所有 artifact 都從這裡出來。
//
// 【硬規則】生成物裡【不准出現價格】。價格只活在伺服器的 402 挑戰裡,artifact 在 runtime 顯示它。
//   ⇒ artifact 裡沒有價格,artifact 就不可能報錯價。這是 §1.55 的核心處方,
//     也是「79 項價格錯」那次事故的唯一根治法(同步只能降低漂移速度,消不掉)。
//
// 用法:
//   node scripts/gen.mjs            寫入 generated/
//   node scripts/gen.mjs --check    只比對,有差異就 exit 1(閘 A,給 CI 用)
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { service, tools, tool, TRUTH_SHA, MCP_URL, GEN_DIR, header } from './truth.mjs';

const CHECK = process.argv.includes('--check');
const out = new Map();
// ★fail-closed:YAML 的純量值裡若含「: 」又沒加引號,整個檔就是無效 YAML。
//   這【真的發生過】(2026-08-20):宣傳詞裡有「for AI agents: every record…」,
//   生出來的 manifest.yaml 與 provider yaml 兩個檔都解析不了 —— 而 Dify 會直接拒收。
//   ⇒ 與其事後再加一道閘,不如讓生成器【生不出壞檔】。
function assertYamlScalarsQuoted(rel, body) {
  const bad = [];
  body.split('\n').forEach((ln, i) => {
    if (/^\s*#/.test(ln)) return;                       // 註解行
    const m = ln.match(/^\s*(?:- )?[\w.$-]+:\s+(\S.*)$/);
    if (!m) return;
    const v = m[1].trim();
    if (/^["'|>]/.test(v)) return;                      // 已引號或區塊純量
    if (/:\s/.test(v)) bad.push(`${rel}:${i + 1}  ${ln.trim().slice(0, 100)}`);
  });
  if (bad.length) {
    throw new Error(
      '★生成器拒絕產出無效 YAML —— 下列純量含「: 」卻沒加引號:\n  ' + bad.join('\n  ')
      + '\n  修法:在 gen.mjs 用 JSON.stringify(...) 把那個值包起來。');
  }
}

const emit = (rel, body) => {
  const text = body.endsWith('\n') ? body : body + '\n';
  if (rel.endsWith('.yaml') || rel.endsWith('.yml')) assertYamlScalarsQuoted(rel, text);
  out.set(rel, text);
};

const { canonicalUrl, humanSite, sourceRepo, distributionRepo, license, disclosure, mcpTransport, mcpProtocolVersion } = service;
const V = service.targets.vercel, N = service.targets.n8n, DF = service.targets.dify;

// ── 共用文案(只有一份)──────────────────────────────────────────
const FREE = service.freeTools.join(', ');
const PITCH =
  'Truth Bear returns official-source records for AI agents: every record carries the official source URL, '
  + 'a record_hash you can recompute offline, a freshness stamp, and a did:key signature.';
const PAY_NOTE =
  `The paid tool does not charge you here — it returns the live x402 payment challenge `
  + `(network / asset / payTo / amount) so your own client can decide. `
  + `Free tools (${FREE}) need no wallet and no API key.`;

// ── 1) Vercel AI SDK tools registry ────────────────────────────
// 官方要求(contributing/add-new-tool-to-registry.md):套件已發到 npm、有文件、codeExample 可跑。
// ★codeExample 刻意用【免費】那支 —— reviewer 複製貼上就會動,不需要錢包。
emit('vercel/registry-entry.ts', header('ts',
  'Paste this object into vercel/ai -> content/tools-registry/registry.ts (tools array).') + `
{
  slug: '${V.slug}',
  name: '${V.displayName}',
  description:
    '${PITCH} ${PAY_NOTE}',
  packageName: '${V.packageName}',
  tags: ['data', 'verification', 'official-sources', 'x402'],
  installCommand: {
    pnpm: 'pnpm add ${V.packageName}',
    npm: 'npm install ${V.packageName}',
    yarn: 'yarn add ${V.packageName}',
    bun: 'bun add ${V.packageName}',
  },
  codeExample: \`import { generateText, isStepCount } from 'ai';
import { truthBearTools } from '${V.packageName}';

const { text } = await generateText({
  model: 'openai/gpt-5-mini',
  prompt: 'Which Truth Bear signal lines cover US unemployment, and how fresh are they?',
  tools: truthBearTools(),
  stopWhen: isStepCount(3),
});

console.log(text);\`,
  docsUrl: '${distributionRepo}#readme',
  websiteUrl: '${humanSite}',
  npmUrl: 'https://www.npmjs.com/package/${V.packageName}',
}
`);

// ── 2) Dify plugin ─────────────────────────────────────────────
// 官方兩條硬規則(原文已查證,見 docs 技術坑 §1.55):
//   ①「No functional duplicates. Don't reskin an existing Marketplace plugin.」
//      ⇒ 這是【GAUGE 服務本身的 tool plugin】,工具直接打我方端點,
//        **不是**「連到某個 MCP server」的通用連接器(那個 Marketplace 已經有了,做了會被拒)。
//   ② Marketplace Agreement 4.2:(b) 不得含付費購買/訂閱功能 (c) 需要外部付費服務必須明確揭露。
//      ⇒ plugin 本身【不做付款】。付費工具只把 402 挑戰當資料回傳,並在描述與 README 揭露。
// 結構完全照官方範例(langgenius/dify-official-plugins/tools/wikipedia)的欄位與順序。
const DIFY_TAGS = ['utilities', 'search'];

emit('dify/manifest.yaml', header('yaml') + `
version: 0.0.1
type: plugin
author: ${DF.author}
name: ${DF.pluginName}
label:
  en_US: ${JSON.stringify(V.displayName)}
description:
  en_US: ${JSON.stringify(PITCH)}
icon: icon.svg
tags:
${DIFY_TAGS.map((t) => `  - ${t}`).join('\n')}
resource:
  memory: 1048576
  permission:
    tool:
      enabled: true
plugins:
  tools:
    - provider/${DF.pluginName}.yaml
meta:
  version: 0.0.1
  arch:
    - amd64
    - arm64
  runner:
    language: python
    version: '3.12'
    entrypoint: main
privacy: PRIVACY.md
repo: ${sourceRepo}
`);

emit(`dify/provider/${DF.pluginName}.yaml`, header('yaml') + `
identity:
  author: ${DF.author}
  name: ${DF.pluginName}
  label:
    en_US: ${JSON.stringify(V.displayName)}
  description:
    en_US: ${JSON.stringify(PITCH)}
  icon: icon.svg
  tags:
${DIFY_TAGS.map((t) => `    - ${t}`).join('\n')}
tools:
${tools.map((t) => `  - tools/${t.name}.yaml`).join('\n')}
extra:
  python:
    source: provider/${DF.pluginName}.py
`);

// 工具 YAML:參數逐項從 truth/tools.json 的 inputSchema 生出來,不手抄。
const difyToolYaml = (name, label) => {
  const t = tool(name);
  const props = (t.inputSchema && t.inputSchema.properties) || {};
  const req = (t.inputSchema && t.inputSchema.required) || [];
  const one = (k, v) => {
    const d = String(v.description || k).replace(/\s+/g, ' ').slice(0, 240);
    return [
      `  - name: ${k}`,
      `    type: string`,
      `    required: ${req.includes(k)}`,
      `    form: llm`,
      `    label:`,
      `      en_US: ${JSON.stringify(k)}`,
      `    human_description:`,
      `      en_US: ${JSON.stringify(d)}`,
      `    llm_description: ${JSON.stringify(d)}`,
    ].join('\n');
  };
  const params = Object.entries(props).map(([k, v]) => one(k, v)).join('\n');
  const desc = String(t.description).replace(/\s+/g, ' ');
  return header('yaml') + `
identity:
  name: ${name}
  author: ${DF.author}
  label:
    en_US: ${JSON.stringify(label)}
  icon: icon.svg
description:
  human:
    en_US: ${JSON.stringify(desc.slice(0, 240))}
  llm: ${JSON.stringify(desc)}
parameters:
${params || '  []'}
extra:
  python:
    source: tools/${name}.py
`;
};

emit('dify/tools/verify_citation.yaml', difyToolYaml('verify_citation', 'Verify a record_hash'));
emit('dify/tools/find_signal.yaml', difyToolYaml('find_signal', 'Find coverage and freshness'));
emit('dify/tools/get_official_record.yaml', difyToolYaml('get_official_record', 'Get an official record'));

// ★Python 常數:與 npm 套件同一個道理 —— 網址只從這裡來,手寫檔一律不准帶字面量。
emit('dify/_config.py', header('py') + `
"""Generated from truth/. Do not edit."""

BASE_URL = "${canonicalUrl}"
PRICING_URL = "${canonicalUrl}${service.pricingDiscoveryPath}"
SOURCE_REPO = "${sourceRepo}"
TRUTH_SHA = "${TRUTH_SHA}"
DISCLOSURE = ${JSON.stringify(disclosure)}
`);

// ★圖示是【品牌資產】,不是我該發明的東西 —— 這裡只放一個一眼看得出是佔位的幾何標記,
//   並在 README 與待裁決清單裡標明「送件前要換成正式品牌圖」。
//   (本專案規範:店面/品牌文案是老闆地盤,助理不代做。)
emit('dify/_assets/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Truth Bear placeholder mark">
  <!-- PLACEHOLDER - replace with the official brand mark before submitting to the Marketplace. -->
  <rect width="64" height="64" rx="14" fill="#111827"/>
  <path d="M32 12 L50 20 v14 c0 10-7.5 16.5-18 20-10.5-3.5-18-10-18-20V20z" fill="none" stroke="#f5f5f4" stroke-width="3" stroke-linejoin="round"/>
  <path d="M23 33 l6.5 7 L42 26" fill="none" stroke="#f5f5f4" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`);

emit('dify/main.py', header('py') + `
from dify_plugin import Plugin, DifyPluginEnv

plugin = Plugin(DifyPluginEnv())

if __name__ == '__main__':
    plugin.run()
`);

emit('dify/pyproject.toml', header('toml') + `
[project]
name = "dify-${DF.pluginName}"
version = "0.0.1"
description = "${V.displayName} tools for Dify"
readme = "README.md"
requires-python = ">=3.12"

# Exactly one dependency: Dify's own SDK. HTTP goes through the standard library rather than
#   requests - fewer dependencies means a cheaper review and cheaper long-term maintenance.
dependencies = [
    "dify_plugin>=0.9.0",
]
`);

// 共用的 HTTP 層:三支工具都用它,免得各寫一份而分歧。
emit('dify/tools/_http.py', header('py') + `
"""Shared HTTP layer. Standard library only - this plugin has no third-party HTTP dependency."""
import json
import urllib.error
import urllib.parse
import urllib.request

from _config import BASE_URL

TIMEOUT_SECONDS = 30


def call(path: str, params: dict) -> tuple[int, dict]:
    """GET one endpoint. Returns (status, parsed_body).

    A non-2xx status is NOT an exception here: this service answers 402 with a payment
    challenge and 422 with an honest "not charged" explanation, and both of those are
    information the caller wants, not failures to hide.
    """
    clean = {k: v for k, v in params.items() if v not in (None, "")}
    url = BASE_URL + path
    if clean:
        url += "?" + urllib.parse.urlencode(clean)
    req = urllib.request.Request(url, method="GET", headers={"accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as res:
            return res.status, _parse(res.read())
    except urllib.error.HTTPError as e:
        return e.code, _parse(e.read())


def _parse(raw: bytes) -> dict:
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        # Handing back what the server actually said beats inventing a shape it never sent.
        return {"_non_json_body": raw.decode("utf-8", "replace")[:2000]}
`);

emit(`dify/provider/${DF.pluginName}.py`, header('py') + `
from dify_plugin import ToolProvider


class TruthBearProvider(ToolProvider):
    def _validate_credentials(self, credentials: dict) -> None:
        """This plugin takes no credentials.

        The free tools need no key and no wallet. The paid tool never pays - it returns the
        service's live payment challenge as data, so there is nothing to validate here.
        """
        return None
`);

// ★2026-08-20 對產線量過:這些產物打的是 REST /gauge/coverage,而它【不帶 summary=1 就回 5.4 MB】
//   (≈137 萬 tokens)。find_signal 每個參數都是選填 ⇒ 模型一定會不帶參數呼叫,
//   而那一次呼叫就超過所有模型的 context 上限。
//   ★病【不在】產線 MCP 伺服器:它不帶參數只回 147 KB,宣告的「預設 compact summary」是兌現的。
//     缺的是這幾個產物從來沒去要那個 compact 形式。
//   ⇒ 預設送 summary=1;full 仍然拿得到,但要先收斂(industry 或 signal_id),
//     沒收斂就降級【並講出來】,不默默回一個跟人家要的不一樣的東西。
const COVERAGE_PRELUDE_PY = `        industry = tool_parameters.get("industry")
        signal_id = tool_parameters.get("signal_id")
        entity = tool_parameters.get("entity")
        full = tool_parameters.get("full")
        narrowed = bool(industry or signal_id)
        params = {"industry": industry, "signal_id": signal_id, "entity": entity}
        if not (full and narrowed):
            # Un-narrowed detail is about 5.4 MB and does not fit in a model context.
            params["summary"] = "1"
`;

const COVERAGE_TAIL_PY = `        if full and not narrowed:
            body = dict(body)
            body["_truthbear_note"] = (
                "Returned the compact summary, not the full detail you asked for: un-narrowed "
                "detail is about 5.4 MB and would not fit in a model context. Pass industry or "
                "signal_id together with full to get it."
            )

`;

const difyToolPy = (name, cls, path, argNames, paid, extra = {}) => header('py') + `
from collections.abc import Generator
from typing import Any

from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage

from _config import DISCLOSURE, PRICING_URL
from tools._http import call


class ${cls}(Tool):
    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage, None, None]:
${extra.prelude || ''}        status, body = call(
            "${path}",
            ${extra.argsExpr || `{${argNames.map((a) => `"${a}": tool_parameters.get("${a}")`).join(', ')}}`},
        )
${paid ? `
        if status == 402:
            # ★ This plugin does not pay. Dify's Marketplace Agreement 4.2(b) forbids building a
            #   purchase function into a plugin; 4.2(c) allows relying on an external paid service
            #   as long as it is clearly disclosed. So we hand the live challenge back as data and
            #   let the person decide, with the server's own guidance attached.
            yield self.create_json_message(
                {
                    "paid": False,
                    "accepts": body.get("accepts"),
                    "client_hint": body.get("client_hint"),
                    "pricing_url": PRICING_URL,
                    "disclosure": DISCLOSURE,
                }
            )
            return
` : ''}
        if status >= 400:
            # The service explains refusals in the body (including when it did not charge you).
            # Passing that through beats replacing it with a generic error.
            yield self.create_json_message({"status": status, **body})
            return

${extra.tail || ''}        yield self.create_json_message(body)
`;

// ★同上:REST 端點讀的是 `hash`,而使用者／模型看到的參數名維持 `record_hash`(與 MCP 面一致)。
emit('dify/tools/verify_citation.py',
  difyToolPy('verify_citation', 'VerifyCitationTool', '/gauge/verify', ['record_hash'], false,
    { argsExpr: '{"hash": tool_parameters.get("record_hash")}' }));
emit('dify/tools/find_signal.py',
  difyToolPy('find_signal', 'FindSignalTool', '/gauge/coverage', ['industry', 'signal_id', 'entity', 'full'], false,
    { prelude: COVERAGE_PRELUDE_PY, argsExpr: 'params', tail: COVERAGE_TAIL_PY }));
emit('dify/tools/get_official_record.py',
  difyToolPy('get_official_record', 'GetOfficialRecordTool', '/gauge', ['signal_id', 'entity', 'dim'], true));

emit('dify/PRIVACY.md', header('md') + `
# Privacy Policy

## What this plugin sends

This plugin sends **only the parameters you pass to a tool** (for example a \`record_hash\`,
a \`signal_id\`, or an \`entity\` name) to the Truth Bear service at \`${canonicalUrl}\`.

## What it does not do

- It does **not** collect, store, or transmit personal data.
- It does **not** read environment variables or files.
- It does **not** hold, request, or transact a private key or wallet.
- It does **not** log your inputs anywhere outside the request it makes.

## External paid service disclosure

${disclosure}

## Contact

Source and issue tracker: ${sourceRepo}
`);

emit('dify/README.md', header('md') + `
# ${V.displayName} for Dify

${PITCH}

## Tools

${tools.map((t) => `- **${t.name}** — ${String(t.description).replace(/\n/g, ' ').slice(0, 160)}`).join('\n')}

## Credentials

None. The free tools work with no API key and no wallet.

## External paid service

${disclosure}

Current prices are always read live from the service — this plugin never stores a price.
See ${canonicalUrl}${service.pricingDiscoveryPath}.

## Source

${sourceRepo}
`);

// ── 3) n8n community node ──────────────────────────────────────
// 官方驗證準則(已逐條查過 @n8n/eslint-plugin-community-nodes 的 44 條規則):
//   no-runtime-dependencies(dependencies 必須空)/ valid-peer-dependencies(只准 n8n-workflow)/
//   no-restricted-globals(禁 process、globalThis、setTimeout、__dirname…)/
//   missing-paired-item(輸出必須帶 pairedItem)/ node-connection-type-literal(用 enum 不用字面量)/
//   require-node-api-error(catch 要包成 NodeApiError)/ node-usable-as-tool(「When in doubt, set it to true」)/
//   icon-validation + icon-prefer-themed-variants(light/dark 兩個【不同】檔、用 file: 協定)/
//   valid-author(name 與 email 都要)/ require-homepage / require-files-array / package-name-convention。
//
// ★零依賴 × x402 技術上不相容(EIP-712 要 keccak256+secp256k1,Node 內建 crypto 沒有 Ethereum Keccak)
//   ⇒ 這個 node 【不做付款、不收私鑰】,只做免費面 + 報價。
// ★而「報價」正是它的產品價值:實測 x402-fetch 在本地拒付時會【丟掉 402 body】,
//   買家只看到 "Payment amount exceeds maximum allowed"。這個 node 把 402 連同
//   client_hint(要調到多少、範例、更便宜的替代端點)原樣交出來。
const N8N_NODE_DIR = '../packages/n8n-nodes-truthbear';

emit(`${N8N_NODE_DIR}/package.json`, JSON.stringify({
  name: N.packageName,
  version: '0.1.3',   // 同上:verifyCitation 的查詢參數要送 hash 不是 record_hash
  description: 'Official-source records for AI agents: source URL, offline-recomputable record_hash, freshness and a did:key signature. Free lookups plus a live price quote; this node never pays and never takes a key.',
  license,
  homepage: humanSite,
  keywords: ['n8n-community-node-package', 'n8n', 'truthbear', 'official-data', 'provenance', 'verification'],
  author: { name: service.npmAuthor, email: `noreply@${humanSite.replace(/^https?:\/\//, '')}` },
  repository: { type: 'git', url: `${distributionRepo}.git` },
  scripts: {
    build: 'n8n-node build',
    dev: 'n8n-node dev',
    lint: 'n8n-node lint',
    'lint:fix': 'n8n-node lint --fix',
    scan: 'npx -y @n8n/scan-community-package .',
    release: 'n8n-node release',
    // ★刻意不放 prepublishOnly。官方 starter 的那一行是 `n8n-node prerelease`,
    //   它的作用是【擋住直接 npm publish、要你改走互動式的 n8n-node release】。
    //   而我方的發布路徑是 GitHub Actions(不互動),那個守衛在 CI 裡只會讓 job 失敗。
    //   它也不在官方驗證規則的必要項裡(no-forbidden-lifecycle-scripts 禁的是
    //   prepare/preinstall/postinstall,不含 prepublishOnly)。
  },
  files: ['dist'],
  n8n: {
    n8nNodesApiVersion: 1,
    strict: true,
    nodes: ['dist/nodes/TruthBear/TruthBear.node.js'],
  },
  devDependencies: { '@n8n/node-cli': '*', typescript: '5.9.3' },
  peerDependencies: { 'n8n-workflow': '*' },
  // provenance 不寫在這裡:官方文件明寫「When you publish using trusted publishing from
  //   GitHub Actions… npm automatically generates and publishes provenance attestations】,
  //   而【本機首發】沒有 OIDC,寫了會直接失敗。
  publishConfig: { access: 'public' },
}, null, 2));

// ★照官方 n8n-nodes-starter 的 tsconfig 原樣(它是【獨立設定】,
//   @n8n/node-cli 只匯出 ./eslint,沒有 tsconfig 可 extends —— 我第一版寫錯了)。
emit(`${N8N_NODE_DIR}/tsconfig.json`, JSON.stringify({
  compilerOptions: {
    strict: true,
    module: 'commonjs',
    moduleResolution: 'node',
    target: 'es2019',
    lib: ['es2019', 'es2020', 'es2022.error'],
    removeComments: true,
    useUnknownInCatchVariables: false,
    forceConsistentCasingInFileNames: true,
    noImplicitAny: true,
    noImplicitReturns: true,
    noUnusedLocals: true,
    strictNullChecks: true,
    preserveConstEnums: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    incremental: true,
    // ★把建置快取檔移出 dist —— 它本來會被一起打包發上 npm
    //   (dry-run 量到 203.6kB,佔整包 90%）,而它對使用者沒有任何用處。
    tsBuildInfoFile: './.tsbuildinfo',
    declaration: true,
    sourceMap: true,
    skipLibCheck: true,
    outDir: './dist/',
  },
  include: ['nodes/**/*', 'nodes/**/*.json', 'package.json'],
}, null, 2));

emit(`${N8N_NODE_DIR}/nodes/TruthBear/TruthBear.node.json`, JSON.stringify({
  node: 'n8n-nodes-truthbear.truthBear',
  nodeVersion: '1.0',
  codexVersion: '1.0',
  categories: ['Data & Storage'],
  resources: {
    primaryDocumentation: [{ url: `${distributionRepo}#readme` }],
  },
}, null, 2));

// 兩個【不同】的圖示檔 —— icon-prefer-themed-variants 會檢查 light/dark 不可相同。
// ★仍是佔位:品牌資產是老闆地盤,送件前要換。
const n8nIcon = (stroke, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Truth Bear placeholder mark">
  <!-- PLACEHOLDER - replace with the official brand mark before submitting for verification. -->
  <rect width="64" height="64" rx="14" fill="${bg}"/>
  <path d="M32 12 L50 20 v14 c0 10-7.5 16.5-18 20-10.5-3.5-18-10-18-20V20z" fill="none" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M23 33 l6.5 7 L42 26" fill="none" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
emit(`${N8N_NODE_DIR}/nodes/TruthBear/truthbear.svg`, n8nIcon('#111827', '#f5f5f4'));
emit(`${N8N_NODE_DIR}/nodes/TruthBear/truthbear.dark.svg`, n8nIcon('#f5f5f4', '#111827'));

const OPS = [
  // ★rename —— 這個端點的查詢參數叫 `hash`,不是 `record_hash`(2026-08-20 對產線量到)。
  //   `record_hash` 是【MCP 工具面】的輸入名,MCP 伺服器會在打 REST 前把它換成 `hash`。
  //   這些產物直接打 REST,就得自己做這個轉換 —— 而它們沒做,
  //   所以每一次呼叫都是 `?record_hash=` → HTTP 400「missing ?hash=」。
  //   ⇒ verify 這個操作【從發布以來一次都沒有成功過】。
  //   使用者看到的參數名維持 `record_hash`(與 MCP 面一致),只有送出去的線上格式不同。
  { value: 'verifyCitation', name: 'Verify Citation', path: '/gauge/verify', args: ['record_hash'],
    rename: { record_hash: 'hash' }, action: 'Verify a record hash', paid: false },
  // ★fixed: summary=1 —— 這個節點宣告自己回的是「每條線幾個對象 + fresh/recent/stale 計數」,
  //   而 REST /gauge/coverage 不帶 summary=1 回的是 5.4 MB 的逐對象明細,跟宣告不符也塞不進代理。
  //   這個節點是 usableAsTool: true,所以它的輸出【會進模型 context】。⇒ 固定要 compact 形式。
  { value: 'findSignal', name: 'Find Signal', path: '/gauge/coverage', args: ['industry', 'signal_id', 'entity'],
    fixed: { summary: '1' }, action: 'Find coverage and freshness', paid: false },
  { value: 'getPriceQuote', name: 'Get Price Quote', path: '/gauge', args: ['signal_id', 'entity'],
    action: 'Get the live price quote for a record', paid: true },
];

// ★n8n 官方 lint(eslint-plugin-n8n-nodes-base)對【使用者看得到的字串】有硬性格式規則。
//   實跑一次抓到 16 個錯,全在生成物上 —— 所以修的是【生成器】,不是生成物(改生成物會被閘 A 打回)。
//   規則:描述首字大寫、角括號要編碼、顯示名與描述裡的 id 一律寫 ID、
//        required: false 是多餘屬性要拿掉。
//
// ★句號規則:我猜了兩次都錯(先猜「一律加」、再猜「選項要參數不要」),最後是【去讀規則原始碼】才對。
//   `node-param-description-excess-final-period` 的實作是:
//       const egLess = value.replace("e.g.", "");
//       if (egLess.split(". ").length === 1 && egLess.endsWith(".")) → 判為多餘句號
//   ⇒ 真正的判準是「把字面 `e.g.` 扣掉之後,還是不是單句」:單句不要句號,多句要句號。
//   ★而且它扣的是【小寫】的 `e.g.` —— 我原本的「首字大寫」把 `e.g.` 變成 `E.g.`,
//     害它扣不掉、於是被判成多句。那個錯是我自己製造的。
//   ⇒ 通則(今天第二次):**錯誤/規則的語意要以實作為準,不能從名稱推論。**
const n8nText = (s) => {
  let t = String(s).replace(/\s+/g, ' ').trim().slice(0, 200);
  t = t.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  t = t.replace(/\bid\b/g, 'ID').replace(/\bIds\b/g, 'IDs');
  if (t) t = t[0].toUpperCase() + t.slice(1);
  t = t.replace(/\.+$/, '');
  // 完全照規則的算法判斷單句/多句。
  const multiSentence = t.replace('e.g.', '').split('. ').length > 1;
  if (multiSentence && t) t += '.';
  return t;
};
const n8nOptionText = n8nText;   // 同一套規則,沒有例外 —— 分脈絡是我先前的誤解。
const n8nDisplayName = (arg) =>
  arg.split('_').map((s) => (s.toLowerCase() === 'id' ? 'ID' : s[0].toUpperCase() + s.slice(1))).join(' ');

const argProp = (op, arg) => {
  const t = tool(op.paid ? 'get_official_record' : (op.value === 'verifyCitation' ? 'verify_citation' : 'find_signal'));
  const p = ((t.inputSchema && t.inputSchema.properties) || {})[arg] || {};
  const req = ((t.inputSchema && t.inputSchema.required) || []).includes(arg);
  return '\t\t\t{\n'
    + `\t\t\t\tdisplayName: ${JSON.stringify(n8nDisplayName(arg))},\n`
    + `\t\t\t\tname: ${JSON.stringify(arg)},\n`
    + '\t\t\t\ttype: \'string\',\n'
    + '\t\t\t\tdefault: \'\',\n'
    // ★只有 true 才寫出來:required: false 會被官方 lint 判成多餘屬性。
    + (req ? '\t\t\t\trequired: true,\n' : '')
    + `\t\t\t\tdescription: ${JSON.stringify(n8nText(p.description || arg))},\n`
    + `\t\t\t\tdisplayOptions: { show: { operation: [${JSON.stringify(op.value)}] } },\n`
    + '\t\t\t},';
};

const nodeTs = [
  header('ts'),
  '',
  "import type {",
  '\tIExecuteFunctions,',
  '\tINodeExecutionData,',
  '\tINodeType,',
  '\tINodeTypeDescription,',
  '	IDataObject,',
  "} from 'n8n-workflow';",
  "import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';",
  '',
  '// The service base URL. It is a node parameter (not an environment variable) because verified',
  '// community nodes may not read the environment or the file system.',
  `const DEFAULT_BASE_URL = ${JSON.stringify(canonicalUrl)};`,
  `const PRICING_URL = ${JSON.stringify(canonicalUrl + service.pricingDiscoveryPath)};`,
  `const DISCLOSURE = ${JSON.stringify(disclosure)};`,
  '',
  'export class TruthBear implements INodeType {',
  '\tdescription: INodeTypeDescription = {',
  `\t\tdisplayName: ${JSON.stringify(V.displayName)},`,
  "\t\tname: 'truthBear',",
  "\t\ticon: { light: 'file:truthbear.svg', dark: 'file:truthbear.dark.svg' },",
  "\t\tgroup: ['input'],",
  '\t\tversion: 1,',
  `\t\tsubtitle: '={{$parameter["operation"]}}',`,
  `\t\tdescription: ${JSON.stringify(PITCH)},`,
  "\t\tdefaults: { name: 'Truth Bear' },",
  '\t\tinputs: [NodeConnectionTypes.Main],',
  '\t\toutputs: [NodeConnectionTypes.Main],',
  '\t\t// Officially recommended: "When in doubt, set it to true." This node has main input and',
  '\t\t// output and is not a trigger, so an AI Agent may call it as a tool.',
  '\t\tusableAsTool: true,',
  '\t\tproperties: [',
  '\t\t\t{',
  "\t\t\t\tdisplayName: 'Resource',",
  "\t\t\t\tname: 'resource',",
  "\t\t\t\ttype: 'options',",
  '\t\t\t\tnoDataExpression: true,',
  "\t\t\t\toptions: [{ name: 'Official Record', value: 'record' }],",
  "\t\t\t\tdefault: 'record',",
  '\t\t\t},',
  '\t\t\t{',
  "\t\t\t\tdisplayName: 'Operation',",
  "\t\t\t\tname: 'operation',",
  "\t\t\t\ttype: 'options',",
  '\t\t\t\tnoDataExpression: true,',
  "\t\t\t\tdisplayOptions: { show: { resource: ['record'] } },",
  '\t\t\t\toptions: [',
  ...OPS.map((o) => '\t\t\t\t\t{\n'
    + `\t\t\t\t\t\tname: ${JSON.stringify(o.name)},\n`
    + `\t\t\t\t\t\tvalue: ${JSON.stringify(o.value)},\n`
    + `\t\t\t\t\t\taction: ${JSON.stringify(o.action)},\n`
    + `\t\t\t\t\t\tdescription: ${JSON.stringify(n8nOptionText(
        o.paid
          ? 'ask the service what one record costs right now - this operation does not pay and cannot pay; '
            + 'it returns the live payment challenge and the guidance that comes with it, so you decide'
          : String(tool(o.value === 'verifyCitation' ? 'verify_citation' : 'find_signal').description)))},\n`
    + '\t\t\t\t\t},'),
  '\t\t\t\t],',
  `\t\t\t\tdefault: ${JSON.stringify(OPS[0].value)},`,
  '\t\t\t},',
  ...OPS.flatMap((op) => op.args.map((a) => argProp(op, a))),
  '\t\t\t{',
  "\t\t\t\tdisplayName: 'Service URL',",
  "\t\t\t\tname: 'baseUrl',",
  "\t\t\t\ttype: 'string',",
  '\t\t\t\tdefault: DEFAULT_BASE_URL,',
  "\t\t\t\tdescription: 'Override only if you are pointing at a mirror you control',",
  '\t\t\t},',
  '\t\t],',
  '\t};',
  '',
  '\tasync execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {',
  '\t\tconst items = this.getInputData();',
  '\t\tconst out: INodeExecutionData[] = [];',
  '',
  '\t\tfor (let i = 0; i < items.length; i++) {',
  '\t\t\tconst operation = this.getNodeParameter(\'operation\', i) as string;',
  '\t\t\tconst baseUrl = (this.getNodeParameter(\'baseUrl\', i, DEFAULT_BASE_URL) as string).replace(/\\/+$/, \'\');',
  '',
  '\t\t\tconst spec = OPERATIONS[operation];',
  '\t\t\tconst qs: Record<string, string> = {};',
  '\t\t\tfor (const arg of spec.args) {',
  '\t\t\t\tconst v = this.getNodeParameter(arg, i, \'\') as string;',
  '\t\t\t\t// The name a parameter has in the UI is not always the name the service expects on',
  '\t\t\t\t// the wire: Verify Citation takes `record_hash` (matching the service\'s MCP tool',
  '\t\t\t\t// surface) but the REST endpoint reads it as `hash`.',
  '\t\t\t\tif (v) qs[spec.rename?.[arg] ?? arg] = v;',
  '\t\t\t}',
  '\t\t\t// Query parameters this operation always sends, whatever the user filled in. Find Signal',
  '\t\t\t// uses it to ask for the compact form: the un-summarised coverage listing is about 5.4 MB,',
  '\t\t\t// which does not match what this operation says it returns and cannot fit in an agent.',
  '\t\t\tObject.assign(qs, spec.fixed ?? {});',
  '',
  '\t\t\ttry {',
  '\t\t\t\t// returnFullResponse + ignoreHttpStatusErrors on purpose: this service answers 402 with a',
  '\t\t\t\t// payment challenge and 422 with an honest "not charged" explanation. Both are information',
  '\t\t\t\t// the caller wants. Payment clients typically throw on 402 and discard that body, which is',
  '\t\t\t\t// exactly the gap this node closes.',
  '\t\t\t\tconst res = await this.helpers.httpRequest({',
  '\t\t\t\t\tmethod: \'GET\',',
  '\t\t\t\t\turl: baseUrl + spec.path,',
  '\t\t\t\t\tqs,',
  '\t\t\t\t\tjson: true,',
  '\t\t\t\t\treturnFullResponse: true,',
  '\t\t\t\t\tignoreHttpStatusErrors: true,',
  '\t\t\t\t});',
  '',
  '\t\t\t\tconst body = (res.body ?? {}) as IDataObject;',
  '\t\t\t\tconst json: IDataObject =',
  '\t\t\t\t\tres.statusCode === 402',
  '\t\t\t\t\t\t? {',
  '\t\t\t\t\t\t\t\tpaid: false,',
  '\t\t\t\t\t\t\t\taccepts: body.accepts ?? null,',
  '\t\t\t\t\t\t\t\t// The part a payment client would have thrown away: how high to set your',
  '\t\t\t\t\t\t\t\t// ceiling, a copy-pasteable example, and cheaper endpoints in budget.',
  '\t\t\t\t\t\t\t\tclient_hint: body.client_hint ?? null,',
  '\t\t\t\t\t\t\t\tpricing_url: PRICING_URL,',
  '\t\t\t\t\t\t\t\tdisclosure: DISCLOSURE,',
  '\t\t\t\t\t\t\t}',
  '\t\t\t\t\t\t: { statusCode: res.statusCode, ...body };',
  '',
  '\t\t\t\t// pairedItem keeps the link back to the input item (required by n8n review).',
  '\t\t\t\tout.push({ json, pairedItem: { item: i } });',
  '\t\t\t} catch (error) {',
  '\t\t\t\tif (this.continueOnFail()) {',
  '\t\t\t\t\tout.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });',
  '\t\t\t\t\tcontinue;',
  '\t\t\t\t}',
  '\t\t\t\tthrow new NodeApiError(this.getNode(), error as never, { itemIndex: i });',
  '\t\t\t}',
  '\t\t}',
  '',
  '\t\treturn [out];',
  '\t}',
  '}',
  '',
  'const OPERATIONS: Record<string, { path: string; args: string[]; fixed?: Record<string, string>; rename?: Record<string, string> }> = {',
  ...OPS.map((o) => `\t${o.value}: { path: ${JSON.stringify(o.path)}, args: ${JSON.stringify(o.args)}${o.fixed ? `, fixed: ${JSON.stringify(o.fixed)}` : ''}${o.rename ? `, rename: ${JSON.stringify(o.rename)}` : ''} },`),
  '};',
  '',
].join('\n');

emit(`${N8N_NODE_DIR}/nodes/TruthBear/TruthBear.node.ts`, nodeTs);

emit(`${N8N_NODE_DIR}/README.md`, header('md') + `
# ${N.packageName}

${PITCH}

## Operations

${OPS.map((o) => `- **${o.name}** — ${o.action}${o.paid ? ' *(returns a quote only; this node never pays)*' : ' *(free)*'}`).join('\n')}

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

${disclosure}

Current prices are always read live from the service — this package stores none.
See ${canonicalUrl}${service.pricingDiscoveryPath}.

## Install

Settings → Community nodes → Install → \`${N.packageName}\`

## Source

${sourceRepo} · License: ${license}
`);

emit(`${N8N_NODE_DIR}/LICENSE`, `MIT License

Copyright (c) 2026 Chin Fu Chang

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`);

// ── 3b) npm 套件的常數(生成進套件內)──────────────────────────
// 【為什麼生成到 packages/ 裡】npm 套件發布時只帶得走自己目錄下的檔,
//   所以常數必須實體存在於套件內。但它仍然是【生成物】,受閘 A 保護、
//   而閘 B 會禁止任何【手寫】檔案出現同樣的字面量。
emit('../packages/truthbear-ai-sdk/src/generated-constants.ts', header('ts') + `
export const BASE_URL = '${canonicalUrl}';
export const MCP_URL = '${MCP_URL}';
export const MCP_TRANSPORT = '${mcpTransport}';
export const MCP_PROTOCOL_VERSION = '${mcpProtocolVersion}';
export const PRICING_DISCOVERY_URL = '${canonicalUrl}${service.pricingDiscoveryPath}';
export const SOURCE_REPO = '${sourceRepo}';
export const TRUTH_SHA = '${TRUTH_SHA}';
export const DISCLOSURE = ${JSON.stringify(disclosure)};
export const FREE_TOOLS = ${JSON.stringify(service.freeTools)} as const;
export const PAID_TOOLS = ${JSON.stringify(service.paidTools)} as const;

/** Tool names + descriptions as published by the live server at generation time.
 *  ★ Descriptions are a convenience snapshot only — the authoritative list is tools/list at runtime. */
export const TOOL_SNAPSHOT = ${JSON.stringify(tools.map((t) => ({ name: t.name, description: t.description })), null, 2)} as const;
`);

// ── 3b2) truthbear-ai-sdk 的 package.json(改成生成物)────────────
// ★2026-08-20 事故:這份原本是【手寫的】,repository 還指著 mcp-gauge,
//   而 0.1.0 已經帶著那個錯的欄位發上 npm 了(版本不可變,只能出 0.1.1 修)。
//   n8n 那包沒事,因為它一開始就是生成的。
//   ⇒ 凡是「會被發布出去、且含網址」的檔,一律進生成器。手寫就會漂。
emit('../packages/truthbear-ai-sdk/package.json', JSON.stringify({
  name: V.packageName,
  version: '0.1.4',   // verify_citation 送錯參數名,從發布以來一次都沒驗證成功過
  description: 'Official-source records for AI agents: source URL, an offline-recomputable record_hash, freshness and a did:key signature. Free lookups need no key; the paid tool returns a live x402 payment challenge and never charges silently.',
  keywords: ['ai-sdk', 'vercel-ai-sdk', 'tools', 'mcp', 'x402', 'official-data', 'provenance', 'verification'],
  license,
  author: service.npmAuthor,
  repository: { type: 'git', url: `${distributionRepo}.git` },
  homepage: humanSite,
  bugs: { url: `${distributionRepo}/issues` },
  type: 'module',
  main: './dist/index.js',
  module: './dist/index.js',
  types: './dist/index.d.ts',
  exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
  files: ['dist', 'README.md', 'LICENSE'],
  sideEffects: false,
  engines: { node: '>=18' },
  scripts: { build: 'tsup', test: 'node --test test/*.test.mjs' },
  peerDependencies: { ai: '>=4', zod: '>=3.23' },
  devDependencies: { ai: '^7.0.70', tsup: '^8.5.1', typescript: '^5.9.3', zod: '^4.4.3' },
  publishConfig: { access: 'public' },
}, null, 2));

// ── 3c) npm 套件的 README(生成,因為它必須帶網址而手寫檔一律禁止帶)──
emit('../packages/truthbear-ai-sdk/README.md', header('md') + `
# truthbear-ai-sdk

${PITCH}

Tools for the [Vercel AI SDK](https://sdk.vercel.ai). No API key. No account.

## Install

\`\`\`bash
npm install truthbear-ai-sdk
\`\`\`

## Use

\`\`\`ts
import { generateText, isStepCount } from 'ai';
import { truthBearTools } from 'truthbear-ai-sdk';

const { text } = await generateText({
  model: 'openai/gpt-5-mini',
  prompt: 'Which Truth Bear signal lines cover US drought, and how fresh are they?',
  tools: truthBearTools(),
  stopWhen: isStepCount(3),
});
\`\`\`

The example above uses only the free tools, so it runs with no wallet.

## Tools

${tools.map((t) => {
  const paid = service.paidTools.includes(t.name);
  return `### \`${t.name}\` ${paid ? '(paid)' : '(free)'}\n\n${String(t.description).replace(/\n/g, ' ')}`;
}).join('\n\n')}

## Paying for a record

This package **has no wallet and never sees a private key**. It reads no environment
variable and cannot spend anything.

If you want \`get_official_record\` to actually settle, hand it your own
payment-capable \`fetch\` — the key stays entirely on your side:

\`\`\`ts
import { wrapFetchWithPayment } from 'x402-fetch';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount(process.env.MY_KEY as \`0x\${string}\`);
const tools = truthBearTools({ fetch: wrapFetchWithPayment(fetch, account) });
\`\`\`

Without that, the paid tool returns the live payment challenge as **data**
(network / asset / payTo / amount) and charges nothing.

> **Note on \`maxValue\`.** Payment clients ship a default per-call ceiling.
> If a record costs more than your client's default, the client stops before paying.
> Set the ceiling from the tier you actually call. The live prices are at
> ${canonicalUrl}${service.pricingDiscoveryPath}.

## Prices

**This package stores no prices.** They exist in exactly one place — the live 402
challenge — and are read at runtime. See ${canonicalUrl}${service.pricingDiscoveryPath}.

${disclosure}

## Also available over MCP

\`\`\`json
{ "url": "${MCP_URL}", "transport": "${mcpTransport}" }
\`\`\`

## Source

${sourceRepo} · License: ${license}
`);

// ── 3d) 發布 repo 的首頁 ────────────────────────────────────────
emit('../README.md', header('md') + `
# Truth Bear integrations

Distribution artifacts for [Truth Bear](${humanSite}) — one package per platform, all generated
from a single source of truth.

${PITCH}

## What is here

| Path | What it is |
|---|---|
| \`packages/${V.packageName}\` | Tools for the Vercel AI SDK (npm) |
| \`packages/${N.packageName}\` | Community node for n8n (npm) |
| \`generated/dify\` | Plugin for the Dify Marketplace |
| \`generated/vercel\` | The entry to add to the AI SDK tools registry |
| \`truth/\` | **The only hand-editable source of truth** |
| \`generated/\` | Everything produced from it — never edit by hand |
| \`scripts/\` | The generator and the gates |

## Two rules everything here obeys

**1. No artifact contains a price.**
Prices live in exactly one place: the live HTTP 402 challenge from the service, and every
artifact reads it at runtime. An artifact that contains no price cannot quote a stale one —
which is the only real fix for price drift, because syncing several copies only slows it down.

**2. No artifact ever touches a private key.**
None of these packages has a wallet, reads an environment variable, or can spend anything.
Where payment is possible at all the caller supplies their own payment-capable client, so the
key never leaves their side. Where it is not, the artifact returns the payment challenge as
data and charges nothing.

## The gates

| Gate | What it refuses |
|---|---|
| A | A generated file that no longer matches \`truth/\` |
| B | A price literal anywhere; a URL or on-chain address outside the source of truth |
| D | Anything that must not become public — publishing cannot be undone |

The generator is fail-closed as well: it refuses to emit YAML whose scalars would not parse.

## Regenerating

\`\`\`bash
node scripts/gen.mjs          # write generated/
node scripts/gen.mjs --check  # gate A
node scripts/lint-no-literals.mjs
node scripts/preflight-public.mjs
\`\`\`

## Connect without installing anything

Truth Bear speaks MCP over ${mcpTransport}:

\`\`\`json
{ "url": "${MCP_URL}", "transport": "${mcpTransport}" }
\`\`\`

${disclosure}

License: ${license}
`);

// ── 4) 共用安裝說明(給人類貨架用)────────────────────────────────
emit('INSTALL.md', header('md') + `
# Connect Truth Bear

Truth Bear speaks MCP over ${mcpTransport} (protocol ${mcpProtocolVersion}).

## Any MCP client

\`\`\`json
{ "url": "${MCP_URL}", "transport": "${mcpTransport}" }
\`\`\`

## Dify

Tools → MCP → add \`${MCP_URL}\`, or install the ${V.displayName} plugin from the Marketplace.

## n8n

Use the built-in **MCP Client Tool** node with \`${MCP_URL}\`, or install \`${N.packageName}\`.

## Vercel AI SDK

\`\`\`bash
npm install ${V.packageName}
\`\`\`

${disclosure}
`);

// ── 生成清單 ──────────────────────────────────────────────────
// ★為什麼需要它:判斷「這個檔是不是生成物」原本靠檔頭那行 DO-NOT-EDIT 註解,
//   但【JSON 不能有註解】—— 於是生成的 package.json 在閘 B 眼裡是手寫檔,
//   規則就對它誤報。2026-08-20 實際踩到了。
//   ⇒ 改成由生成器自己吐一份清單,閘 B 直接讀它,不用從內容猜。
{
  const manifest = {
    _comment: 'DO NOT EDIT - written by scripts/gen.mjs. Lists every generated artifact so the gates do not have to guess from file contents (JSON files cannot carry a DO-NOT-EDIT comment).',
    truthSha: TRUTH_SHA,
    files: [...out.keys()].map((r) => r.replace(/^\.\.\//, '')).sort(),
  };
  out.set('.manifest.json', JSON.stringify(manifest, null, 2) + '\n');
}

// ── 寫出 / 比對 ────────────────────────────────────────────────
let changed = 0;
for (const [rel, body] of out) {
  const p = join(GEN_DIR, rel);
  const prev = existsSync(p) ? readFileSync(p, 'utf8') : null;
  if (prev === body) continue;
  changed++;
  if (CHECK) {
    console.error(`✖ 生成物與 truth/ 不一致:generated/${rel}`);
  } else {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
    console.log(`✔ generated/${rel}`);
  }
}
if (CHECK) {
  if (changed) {
    console.error(`\n★閘 A 紅燈:${changed} 個生成物與 truth/ 對不上。`);
    console.error('  原因通常是有人【手改了 generated/】。改 truth/ 然後跑 node scripts/gen.mjs。');
    process.exit(1);
  }
  console.log(`✔ 閘 A:${out.size} 個生成物與 truth/ 一致(truth-sha ${TRUTH_SHA})`);
} else {
  console.log(`\n完成:${out.size} 個檔,${changed} 個有變動。truth-sha ${TRUTH_SHA}`);
}
