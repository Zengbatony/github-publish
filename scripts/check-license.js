#!/usr/bin/env node
/**
 * 发布前版权合规检查
 *
 * 检查项（对应 docs/licensing.md 第五节清单）：
 *   1. 根目录存在 LICENSE 文件
 *   2. LICENSE 含可识别的许可证类型声明
 *   3. LICENSE 含版权声明行
 *   4. 许可正文完整（含免责声明），不是摘要
 *   5. package.json 的 license 字段与 LICENSE 一致
 *   6. 衍生项目：LICENSE 里有多条 Copyright（上游 + 自己）
 *   7. 衍生项目：LICENSE 里有上游仓库 URL
 *   8. Apache-2.0 衍生：NOTICE 文件存在
 *   9. 模板文件里的占位符不会被误当成真实许可
 *
 * 用法:
 *   node scripts/check-license.js           人类可读
 *   node scripts/check-license.js --json    机器可读
 *   node scripts/check-license.js --root .  指定仓库根目录
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const rootIdx = argv.indexOf('--root');
// 目标目录解析优先级：--root <dir> > 首个位置参数 > 当前工作目录
// （早期版本固定用 __dirname/..，导致只能检查自己所在仓库，无法给任意项目做门禁）
const positional = argv.find((a, i) => !a.startsWith('-') && argv[i - 1] !== '--root');
const ROOT = rootIdx >= 0
  ? path.resolve(argv[rootIdx + 1])
  : (positional ? path.resolve(positional) : process.cwd());

const LICENSE_CANDIDATES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING'];

// SPDX 标识 → 判定特征
const SIGNATURES = {
  MIT: { label: 'MIT', must: [/MIT License/i], warranty: /WITHOUT WARRANTY OF ANY KIND/i },
  ISC: { label: 'ISC', must: [/ISC License/i], warranty: /WITHOUT WARRANTY OF ANY KIND|DISCLAIMED/i },
  'Apache-2.0': { label: 'Apache-2.0', must: [/Apache License/i, /Version 2\.0/i], warranty: /WITHOUT WARRANTIES OR CONDITIONS/i },
  'GPL-3.0': { label: 'GPL-3.0', must: [/GNU GENERAL PUBLIC LICENSE/i, /Version 3/i], warranty: /NO WARRANTY/i },
  'BSD-3-Clause': { label: 'BSD-3-Clause', must: [/BSD 3-Clause/i, /Redistribution and use/i], warranty: /DISCLAIMED/i },
};

const results = [];
const add = (ok, name, detail) => results.push({ ok, name, detail });

function read(p) {
  try { return fs.readFileSync(p, 'utf-8'); } catch (e) { return null; }
}

// ---------- 1. LICENSE 存在 ----------
let licensePath = null;
for (const c of LICENSE_CANDIDATES) {
  const p = path.join(ROOT, c);
  if (fs.existsSync(p)) { licensePath = p; break; }
}
add(!!licensePath, 'LICENSE 文件存在', licensePath ? path.basename(licensePath) : '根目录未找到 LICENSE / LICENSE.md / LICENSE.txt / COPYING');

const license = licensePath ? read(licensePath) : '';
let matched = [];   // 作用域提到外层，供衍生项目判定复用
if (license) {
  // ---------- 2. 许可证类型可识别 ----------
  matched = Object.entries(SIGNATURES).filter(([, s]) => s.must.every(r => r.test(license)));
  add(matched.length > 0, '许可证类型可识别',
    matched.length ? matched.map(([k]) => k).join(' / ') : '未能识别为 MIT/ISC/Apache-2.0/GPL-3.0/BSD-3-Clause');

  // ---------- 3. 版权声明行 ----------
  const copyLines = license.match(/Copyright\s*(?:\(c\)|©)?\s*\d{4}[^\n]*/gi) || [];
  add(copyLines.length > 0, '含版权声明行', copyLines.length ? copyLines.map(s => s.trim()).join(' | ') : '未找到 Copyright <年份> 行');

  // 版权行缺作者（只有年份）—— 上游常见不严谨写法，属于警告
  const noOwner = copyLines.filter(l => !/[A-Za-z\u4e00-\u9fa5]{3,}/.test(l.replace(/Copyright\s*(?:\(c\)|©)?\s*\d{4}/i, '')));
  if (copyLines.length) {
    add(noOwner.length === 0, '版权声明含著作权人姓名',
      noOwner.length ? `以下行只有年份没有姓名：${noOwner.join(' | ')}` : '全部含姓名');
  }

  // ---------- 4. 免责声明完整 ----------
  const sig = matched[0] ? SIGNATURES[matched[0][0]] : null;
  if (sig) {
    const warOk = sig.warranty.test(license);
    const lenOk = license.length > 400;
    add(warOk && lenOk, '许可正文完整（非摘要）',
      warOk && lenOk ? `${license.length} 字符` : `免责声明${warOk ? '有' : '缺失'}，长度 ${license.length}`);
  }
}

// ---------- 5. package.json license 一致 ----------
const pkgPath = path.join(ROOT, 'package.json');
let pkgLic = null;
if (fs.existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    pkgLic = pkg.license || null;
    const declared = (matched && matched[0]) ? matched[0][0] : null;
    if (pkgLic) {
      add(!declared || pkgLic === declared, 'package.json license 字段一致',
        pkgLic === declared || !declared ? `"${pkgLic}"` : `package.json 写 "${pkgLic}"，LICENSE 判定为 "${declared}"`);
    } else {
      add(false, 'package.json 声明 license 字段', '缺少 license 字段');
    }
  } catch (e) {
    add(false, 'package.json 可解析', e.message.slice(0, 80));
  }
}

// ---------- 6~7. 衍生项目判定 ----------
const readmePath = ['README.md', 'README.en.md', 'README.MD']
  .map(f => path.join(ROOT, f)).find(p => fs.existsSync(p));
const readme = readmePath ? read(readmePath) : '';

// 判定"衍生"的证据：README / LICENSE / package.json 里出现上游链接或 fork 字样
const upMatch = (license + '\n' + readme).match(/upstream[:：]?\s*(https?:\/\/\S+)/i)
  || (license + '\n' + readme).match(/based on\s+\[?([^\s\]]+)/i)
  || readme.match(/https?:\/\/github\.com\/([^\/\s\)]+)\/([^\/\s\)]+)/);

if (upMatch) {
  const copyCount = (license.match(/Copyright\s*(?:\(c\)|©)\s*\d{4}/gi) || []).length;
  add(copyCount >= 2, '衍生项目：保留上游 + 自有双署名',
    copyCount >= 2 ? `${copyCount} 条版权声明` : `只有 ${copyCount} 条，衍生项目应 ≥2 条`);

  const hasUrl = /https?:\/\/(github\.com|gitlab\.com|gitee\.com)\/\S+/.test(license);
  add(hasUrl, '衍生项目：LICENSE 内含上游仓库 URL',
    hasUrl ? '已包含' : 'LICENSE 里没有可追溯的上游 URL');

  // 8. Apache 上游需要 NOTICE
  const isApache = matched && matched[0] && matched[0][0] === 'Apache-2.0';
  if (isApache) {
    const noticeOk = fs.existsSync(path.join(ROOT, 'NOTICE'));
    add(noticeOk, 'Apache-2.0 衍生：NOTICE 文件', noticeOk ? '已存在' : '缺失 NOTICE（Apache-2.0 强制要求）');
  }
}

// ---------- 9. 模板占位符不外泄 ----------
const tplDir = path.join(ROOT, 'templates');
if (fs.existsSync(tplDir) && license) {
  const leaked = /<YEAR>|<YOUR NAME>|<UPSTREAM/i.test(license);
  add(!leaked, '正式 LICENSE 未残留模板占位符', leaked ? 'LICENSE 里还有 <YEAR>/<YOUR NAME> 占位符' : '干净');
}

// ---------- 输出 ----------
const failed = results.filter(r => !r.ok);

if (asJson) {
  console.log(JSON.stringify({ root: ROOT, pass: failed.length === 0, total: results.length, failed: failed.length, results }, null, 2));
} else {
  console.log('版权合规检查 · ' + ROOT + '\n');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name}`);
    if (r.detail) console.log(`     ${r.detail}`);
  }
  console.log('\n' + (failed.length === 0
    ? `全部通过（${results.length} 项）`
    : `${failed.length} 项未通过 / 共 ${results.length} 项`));
}

process.exit(failed.length === 0 ? 0 : 1);
