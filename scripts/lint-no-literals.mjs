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
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);
const TEXT = /\.(mjs|js|cjs|ts|tsx|json|md|ya?ml|txt|py|toml)$/i;

// ★這支腳本自己與 truth.mjs 會提到這些字串(在註解與規則裡),所以豁免。豁免要寫理由。
const EXEMPT = new Map([
  ['scripts/lint-no-literals.mjs', '本檔是規則本身,必須寫得出要禁的字樣'],
  ['scripts/truth.mjs', '唯一允許組出網址的地方(從 truth/ 讀,不是字面量)'],
  ['truth/service.json', '真相源本身'],
  ['truth/tools.json', '真相源本身'],
]);

const hosts = [service.canonicalUrl, ...(service.legacyUrls || [])]
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
  const isGenerated = body.includes(GEN_MARK);
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
