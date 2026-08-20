// 閘 D:對外發布前的最後一道 —— 這些檔案即將變成【公開且撤不回來】的東西。
//
// 【為什麼要有這支】npm 的版本不可變、GitHub 的 commit 進了歷史就撈得到。
//   閘 A 管「生成物與 truth 一致」、閘 B 管「價格/網址字面量」,但兩者都不問
//   「這份東西可不可以給全世界看」。這支只問那一件事。
//
// 掃描分兩層,規則不同 —— 見下面 PUBLIC_DIRS / TOOLING_DIRS 那段說明。
//
// 用法:node scripts/preflight-public.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ROOT } from './truth.mjs';

// 【兩層母體,規則不同】2026-08-20 老闆裁決:發布 repo 也要包含 truth/ 與 scripts/,
//   這樣 CI 才跑得動閘 A/B/D,而且防漂移機制可以被外部檢視。
//   ⇒ 但這兩層的規則不一樣:
//     · 產品面(generated/、packages/、.github/):【全部規則】——它是買家與審查者實際會讀的東西,
//       語言契約要求對外一律英文。
//     · 內部工具(truth/、scripts/):【只驗機密】——它是開發者工具,碼註解用中文符合語言契約
//       (「中文只給開發者」),但機密無論在哪一層都不准外洩。
const PUBLIC_DIRS = ['generated', 'packages', '.github'];
const TOOLING_DIRS = ['truth', 'scripts'];
const SECRET_RULE_IDS = new Set([
  'private-key', 'mnemonic', 'credential-literal', 'cdp-key', 'npm-token', 'gh-token', 'unexpected-email',
]);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);
const SKIP_FILES = new Set(['package-lock.json']);
const TEXT = /\.(md|ts|tsx|js|cjs|mjs|json|ya?ml|py|toml|svg|txt)$|LICENSE$/;

// 刻意允許出現在公開面的 email —— 每一個都要是「我方主動對外公布」的地址。
const ALLOWED_EMAILS = [
  'noreply@truthbear.co',   // npm/n8n 的 author 欄位需要一個 email;這個地址只寄不收(已在文件揭露)
];
const ANY_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const hasUnexpectedEmail = (line) =>
  (line.match(ANY_EMAIL) || []).some((e) => !ALLOWED_EMAILS.includes(e.toLowerCase()));

const RULES = [
  { id: 'private-key', why: '看起來像私鑰或簽章金鑰', re: /0x[a-fA-F0-9]{64}\b/ },
  { id: 'mnemonic', why: '助記詞/種子字樣', re: /\bmnemonic\b|\bseed\s*phrase\b/i },
  { id: 'credential-literal', why: '像是寫死的憑證值', re: /(api[_-]?key|secret|token|password)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i },
  { id: 'cdp-key', why: 'CDP 金鑰識別字樣', re: /CDP_API_KEY|organizations\/[0-9a-f-]{36}/ },
  { id: 'npm-token', why: 'npm token', re: /npm_[A-Za-z0-9]{30,}/ },
  { id: 'gh-token', why: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{30,}/ },
  // ★這條原本是「比對老闆的私人信箱」—— 那個寫法本身就是洩漏:規則檔一旦公開,
  //   那個字串就跟著公開了(閘 D 第一次跑就抓到自己)。
  //   ⇒ 改成反向設計:公開面出現【任何】email 都要報,除非在下面這張刻意允許的清單上。
  //     這樣規則裡就不必寫下任何私人資料,也不會漏掉沒被想到的那個地址。
  { id: 'unexpected-email', why: '公開面出現未經允許的 email(私人信箱不該外流)', check: hasUnexpectedEmail },
  // ★語言契約:對外機器面一律英文。中文只留在碼註解與開發者對話(那些檔不在公開母體裡)。
  { id: 'cjk', why: '★對外面出現中文(語言契約:對外一律英文)', re: /[一-鿿]/ },
  { id: 'internal-path', why: '內部路徑外洩', re: /TUEAR_BEAR_BOT|[A-Z]:[\\/]+(?:專案|Users\\user)/ },
  { id: 'placeholder', why: '未替換的樣板佔位符', re: /<\.\.\.>|TODO:|FIXME:|XXX:/ },
];

// ★明確豁免(不是遺漏,是決定)。改這張表要寫理由 —— 這是本專案處理例外的一貫作法:
//   規則保持嚴格,例外逐條記名並附理由;放寬規則等於把下一次真違規也放行。
const EXEMPT = [
  {
    file: 'scripts/preflight-public.mjs',
    rule: 'mnemonic',
    why: '本檔是規則本體,必須寫得出要禁的字樣;這個字本身不是機密。',
  },
  {
    file: 'scripts/preflight-public.mjs',
    rule: 'cdp-key',
    why: '同上。CDP_API_KEY 是【環境變數名】不是金鑰值。',
  },
  {
    file: 'packages/truthbear-ai-sdk/test/contract.test.mjs',
    rule: 'mnemonic',
    why: '這一行是【在檢查有沒有助記詞】的守門規則本身,不是洩漏。拿掉它反而少一道保護。',
  },
];
const isExempt = (rel, id) => EXEMPT.some((e) => e.file === rel && e.rule === id);

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (TEXT.test(e) && !SKIP_FILES.has(e)) yield p;
  }
}

const findings = [];
let scanned = 0;
// ★根目錄的檔也要掃 —— repo 首頁 README 是【最公開的那一個】,
//   而第一版的母體只含子目錄,正好把它漏掉了。
const rootFiles = readdirSync(ROOT)
  .filter((f) => TEXT.test(f) && !SKIP_FILES.has(f))
  .map((f) => join(ROOT, f))
  .filter((p) => statSync(p).isFile());

const layers = [
  ...PUBLIC_DIRS.map((d) => [d, RULES]),
  ...TOOLING_DIRS.map((d) => [d, RULES.filter((r) => SECRET_RULE_IDS.has(r.id))]),
];
for (const [base, rules] of [...layers, ['__root__', RULES]]) {
  for (const p of (base === '__root__' ? rootFiles : walk(join(ROOT, base)))) {
    const rel = relative(ROOT, p).split(sep).join('/');
    const body = readFileSync(p, 'utf8');
    scanned++;
    for (const r of rules) {
      if (isExempt(rel, r.id)) continue;
      const lines = body.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const hit = r.check ? r.check(lines[i]) : r.re.test(lines[i]);
        if (hit) {
          findings.push({ rel, line: i + 1, id: r.id, why: r.why, text: lines[i].trim().slice(0, 110) });
          break;   // 每個檔每條規則只報一次,避免刷屏
        }
      }
    }
  }
}

// ★母體下限:公開面若掃不到幾個檔,代表目錄被搬走或 walk 壞了 —— 那會給出最危險的一種假綠。
const MIN_FILES = 20;
if (scanned < MIN_FILES) {
  console.error(`✖ 閘 D 母體異常:只掃到 ${scanned} 個公開檔(下限 ${MIN_FILES})。判準沒錯,是母體被抽掉了。`);
  process.exit(1);
}

if (findings.length) {
  console.error(`✖ 閘 D 紅燈:${findings.length} 項不該公開的內容(掃 ${scanned} 檔)\n`);
  for (const f of findings) {
    console.error(`  ${f.rel}:${f.line}  [${f.id}]`);
    console.error(`    ${f.text}`);
    console.error(`    → ${f.why}\n`);
  }
  console.error('★這些東西一旦推上公開 repo 或發到 npm 就【撤不回來】。修掉再發。');
  process.exit(1);
}
console.log(`✔ 閘 D:${scanned} 個即將公開的檔,0 項不該公開的內容`);
