// 閘 B:字面量 lint。
//
// 【這道閘是為哪一次事故開的】「網址在 123 個檔裡出現 300 次」「79 項價格錯」——
//   同一個事實被複製到 N 個地方,同步機制只能降低漂移速度,消不掉。
//   ⇒ 這道閘直接禁止複製。
//
// 兩條規則:
//   ①【價格字面量:任何地方都不准】—— 連生成物也不准。價格只活在伺服器的 402 挑戰裡。
//      artifact 裡沒有價格 ⇒ artifact 不可能報錯價。
//   ②【網址／鏈上位址:只准出現在 truth/ 與【標記為生成物】的檔案裡】。
//      判斷方式不是看路徑,是看檔案有沒有 gen.mjs 蓋的 DO-NOT-EDIT 標記 ——
//      這樣「有人手寫一個檔放進 generated/」也擋得住。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { service, ROOT } from './truth.mjs';

const GEN_MARK = 'DO NOT EDIT — generated from truth/';

// ★判斷「這個檔是不是生成物」不能只看檔頭那行註解 —— 【JSON 不能有註解】,
//   所以生成的 package.json 在這道閘眼裡曾經是手寫檔,規則就對它誤報(2026-08-20 踩到)。
//   ⇒ 改成讀生成器自己吐的清單。清單由 gen.mjs 產出,所以不會有第二份真相。
const generatedSet = (() => {
  try {
    const m = JSON.parse(readFileSync(join(ROOT, 'generated', '.manifest.json'), 'utf8'));
    return new Set(m.files || []);
  } catch {
    // 清單讀不到就【不放行任何東西】—— 寧可誤報也不要因為缺清單而靜默放過。
    return new Set();
  }
})();
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);
const TEXT = /\.(mjs|js|cjs|ts|tsx|json|md|ya?ml|txt|py|toml)$/i;

// ★這支腳本自己與 truth.mjs 會提到這些字串(在註解與規則裡),所以豁免。豁免要寫理由。
const EXEMPT = new Map([
  ['scripts/lint-no-literals.mjs', '本檔是規則本身,必須寫得出要禁的字樣'],
  ['scripts/truth.mjs', '唯一允許組出網址的地方(從 truth/ 讀,不是字面量)'],
  ['truth/service.json', '真相源本身'],
  ['truth/tools.json', '真相源本身'],
]);

// ★2026-08-20 補:原本只守服務網址,【repo 網址沒進來】——
//   而 truthbear-ai-sdk 的手寫 package.json 的 repository 就指錯了 repo(指到 mcp-gauge),
//   帶著那個錯發上 npm 0.1.0(版本不可變,只能出 0.1.1 修)。
//   n8n 那包沒事,因為它一開始就是生成的。
//   ⇒ repo 網址跟服務網址一樣是【會漂的事實】,一併納入守備。
const hosts = [service.canonicalUrl, ...(service.legacyUrls || [])]
  .map((u) => u.replace(/^https?:\/\//, ''));
const repoPaths = [service.sourceRepo, service.distributionRepo]
  .filter(Boolean)
  .map((u) => u.replace(/^https?:\/\//, ''));
const addrs = [service.chainFacts.payTo, service.chainFacts.asset];

const RULES = [
  {
    id: 'price',
    everywhere: true,
    re: /\$\s?\d|\bmaxAmountRequired\s*[:=]\s*['"]?\d/,
    why: '價格字面量。價格只能在 runtime 從 402 挑戰讀,不得寫進任何 artifact。',
  },
  {
    id: 'repo-url',
    everywhere: false,
    re: new RegExp(repoPaths.map((h) => h.replace(/[./]/g, '\\$&')).join('|')),
    why: 'repo 網址字面量。要用就 import 生成的常數,或改 truth/service.json 重新生成。',
  },
  {
    id: 'host',
    everywhere: false,
    re: new RegExp(hosts.map((h) => h.replace(/\./g, '\\.')).join('|')),
    why: '網址字面量。要用就 import generated-constants,或改 truth/service.json 重新生成。',
  },
  {
    id: 'chain-address',
    everywhere: false,
    re: new RegExp(addrs.join('|'), 'i'),
    why: '鏈上位址字面量。payTo/asset 要從 live 402 挑戰讀,不得寫死。',
  },
];

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (TEXT.test(e)) yield p;
  }
}

const violations = [];
let scanned = 0;

for (const p of walk(ROOT)) {
  const rel = relative(ROOT, p).split(sep).join('/');
  if (EXEMPT.has(rel)) continue;
  const body = readFileSync(p, 'utf8');
  // 兩種認法都算:①檔頭有 DO-NOT-EDIT 標記 ②在生成器吐的清單上(給 JSON 這種不能帶註解的檔)
  const isGenerated = body.includes(GEN_MARK) || generatedSet.has(rel);
  scanned++;
  for (const r of RULES) {
    if (!r.everywhere && isGenerated) continue;   // 生成物可以帶網址,但不能帶價格
    const lines = body.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (r.re.test(line)) violations.push({ rel, line: i + 1, id: r.id, why: r.why, text: line.trim().slice(0, 120) });
    });
  }
}

// ★母體下限:掃到的檔案數若異常少,代表 walk 壞了或目錄被搬走 —— 那會給出假綠。
const MIN_FILES = 8;
if (scanned < MIN_FILES) {
  console.error(`✖ 閘 B 母體異常:只掃到 ${scanned} 個檔(下限 ${MIN_FILES})。判準沒錯,是母體被抽掉了。`);
  process.exit(1);
}

if (violations.length) {
  console.error(`✖ 閘 B 紅燈:${violations.length} 處字面量違規(掃 ${scanned} 檔)\n`);
  for (const v of violations) {
    console.error(`  ${v.rel}:${v.line}  [${v.id}]`);
    console.error(`    ${v.text}`);
    console.error(`    → ${v.why}\n`);
  }
  process.exit(1);
}
console.log(`✔ 閘 B:${scanned} 個檔,0 處字面量違規`);
