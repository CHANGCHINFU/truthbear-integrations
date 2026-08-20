// 送件前檢查:我們【公開出去的聯絡位址】收不收得到信。
//
// 【這道檢查是為哪一次事故開的】2026-08-20 送 n8n Creator Portal:
//   n8n 用 npm package.json 的 author.email 驗證所有權,寄了一次性令牌到
//   `noreply@truthbear.co` —— 而那條網域【根本沒有 MX 紀錄】,信直接退。
//   令牌永遠不會到,「重新發送」按幾次都一樣,送件就卡在那裡。
//
// ★真正的教訓不是「不要用 noreply」,而是:
//   **一旦某個位址被外部拿來當【身分驗證管道】,它就必須真的收得到信。**
//   而「這個位址會不會被拿去驗證」不是我們能決定的 —— 對方決定。
//   ⇒ 凡是【公開寫進交付物】的位址,一律要能收信。
//
// 為什麼不放進 CI 的閘:這支要查 DNS,把它接進發布流程等於讓一次 DNS 抖動
// 就擋掉發版。它的定位是【送件前的人工檢查】,寫在
// docs/SOP-對外發布與送件檢查表.md,由人在送件前跑一次。
//
// 用法:
//   node scripts/check-contact-email.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ROOT } from './truth.mjs';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SKIP = new Set(['node_modules', '.git', 'dist', 'coverage', '__pycache__']);
// lock 檔裡是【第三方套件作者】的位址,不是我們公開的聯絡方式,也不歸我們管。
const SKIP_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);
const TEXT = /\.(mjs|js|cjs|ts|tsx|json|md|ya?ml|txt|py|toml)$/i;
// 只掃【會被公開發出去】的東西。scripts/ 與 truth/ 不會進 npm tarball 或送件包。
const PUBLIC_DIRS = ['generated', 'packages'];

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (TEXT.test(e) && !SKIP_FILES.has(e)) yield p;
  }
}

const found = new Map();   // address -> [位置]
let scanned = 0;
for (const d of PUBLIC_DIRS) {
  for (const p of walk(join(ROOT, d))) {
    scanned++;
    const rel = relative(ROOT, p).split(sep).join('/');
    for (const m of readFileSync(p, 'utf8').match(EMAIL) || []) {
      const a = m.toLowerCase();
      if (!found.has(a)) found.set(a, []);
      if (found.get(a).length < 5) found.get(a).push(rel);
    }
  }
}

// ★母體下限:掃到的檔案太少代表 walk 壞了或目錄被搬走 —— 那會給出假綠。
const MIN_FILES = 20;
if (scanned < MIN_FILES) {
  console.error(`✖ 母體異常:只掃到 ${scanned} 個公開檔(下限 ${MIN_FILES})。判準沒錯,是母體被抽掉了。`);
  process.exitCode = 1;
  throw new Error('母體異常');
}

if (!found.size) {
  console.log(`✔ ${scanned} 個公開檔裡沒有任何 email 位址,無須檢查`);
} else {

/** 查一個網域有沒有 MX。沒有 MX 就收不到信。用 DNS-over-HTTPS,不依賴本機解析器行為。 */
async function hasMx(domain) {
  const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`, {
    headers: { accept: 'application/dns-json' },
  });
  if (!r.ok) throw new Error(`DNS 查詢失敗 HTTP ${r.status}`);
  const j = await r.json();
  return (j.Answer || []).some((a) => a.type === 15);
}

let bad = 0;
for (const [addr, where] of [...found].sort()) {
  const domain = addr.split('@')[1];
  let ok;
  try {
    ok = await hasMx(domain);
  } catch (err) {
    // 查不到 ≠ 是壞的。查詢本身失敗要說是查詢失敗,不可以往「否認」那一側倒。
    console.error(`? ${addr}  —— DNS 查詢失敗(${err.message}),【未判定】,請重跑`);
    bad++;
    continue;
  }
  if (ok) {
    console.log(`✔ ${addr}  收得到信(${domain} 有 MX)`);
  } else {
    bad++;
    console.error(`✖ ${addr}  ${domain} 【沒有 MX】⇒ 寄到這裡的信會退信`);
    console.error(`    出現在:${where.join(', ')}${found.get(addr).length >= 5 ? ' …' : ''}`);
    console.error('    為什麼這是問題:註冊表／市集會拿這個位址寄【所有權驗證令牌】,');
    console.error('    收不到就等於送不了件。修法二選一:');
    console.error('      ① 讓這個位址真的收得到信(DNS 在 Cloudflare 就開 Email Routing,免費)');
    console.error('      ② 換成一個收得到信、而且可以公開的位址\n');
  }
}

if (bad) {
  console.error(`✖ ${bad} 個公開位址收不到信(掃 ${scanned} 檔)`);
  // ★不用 process.exit:fetch 的連線還開著時強制結束,Windows 上會讓 Node 崩掉,
  //   結束碼變成 127 —— 一個會謊報自己結束碼的守門等於壞的。設 exitCode 讓它自然收尾。
  process.exitCode = 1;
} else {
  console.log(`✔ ${found.size} 個公開位址全部收得到信(掃 ${scanned} 檔)`);
}
}
