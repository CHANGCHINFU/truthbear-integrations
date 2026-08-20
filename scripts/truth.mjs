// 共用讀取層:所有腳本都只從這裡拿真相,不各自 readFile。
//
// 【為什麼】這整個目錄存在的理由是「同一個事實不要有第二份」。
//   如果每支腳本各自 JSON.parse 一次 truth/,那第一個分歧就會出現在這些腳本之間。
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const TRUTH_DIR = join(ROOT, 'truth');
export const GEN_DIR = join(ROOT, 'generated');

const readTruth = (f) => readFileSync(join(TRUTH_DIR, f), 'utf8');

export const service = JSON.parse(readTruth('service.json'));
export const toolsDoc = JSON.parse(readTruth('tools.json'));
export const tools = toolsDoc.tools;

// ★真相指紋:每個生成物的檔頭都會帶它,伺服器端也吐同一個值(見 verify-live)。
//   任何人拿到一份 artifact,一眼就知道它是哪一版真相生成的。
export const TRUTH_SHA = createHash('sha256')
  .update(readTruth('service.json'))
  .update(readTruth('tools.json'))
  .digest('hex')
  .slice(0, 16);

export const MCP_URL = service.canonicalUrl + service.mcpPath;

export function tool(name) {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`unknown tool in truth/tools.json: ${name}`);
  return t;
}

// 生成檔的統一檔頭。★沒有這一行的檔案不算生成物,閘 A 不會保護它。
export function header(kind, extra = '') {
  const c = ['yaml', 'sh', 'py', 'toml'].includes(kind) ? '#' : kind === 'md' ? '<!--' : '//';
  const end = kind === 'md' ? ' -->' : '';
  const L = (s) => `${c} ${s}${end}`;
  return [
    L('DO NOT EDIT — generated from truth/ by scripts/gen.mjs'),
    L(`truth-sha: ${TRUTH_SHA}`),
    L('Edit truth/service.json or truth/tools.json instead, then run: node scripts/gen.mjs'),
    extra ? L(extra) : null,
  ].filter(Boolean).join('\n') + '\n';
}
