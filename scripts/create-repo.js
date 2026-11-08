#!/usr/bin/env node
/**
 * 用已登录的 Chrome 建一个新仓库（L2）。
 *
 * 2026-11-08 实测：从启动 Chrome 到仓库就绪共 6 秒，一次成功。
 * 三个关键参数缺一不可，去掉任何一个都会退回「反复试选择器」的状态：
 *   1) --disable-features=Translate,TranslateUI  防页面被翻译成中文（英文选择器失效）
 *   2) 原生 setter + input/change 事件             React 受控组件只认这个
 *   3) el.click() 而非真实鼠标事件                 窗口未激活时鼠标事件无效
 *
 * 用法:
 *   node create-repo.js <owner>/<repo> ["描述"] [--private]
 *   node create-repo.js --profile <chrome档案目录> <owner>/<repo> ["描述"]
 *
 * 前置: Chrome 已登录目标账号；若需代理，设 GITHUB_PROXY 环境变量（默认读下面常量）
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const isPrivate = argv.includes('--private');
const pIdx = argv.indexOf('--profile');
const PROFILE = pIdx >= 0 ? argv[pIdx + 1] : (process.env.GH_PROFILE || '');
const positional = argv.filter((a, i) => !a.startsWith('-') && argv[i - 1] !== '--profile');
const TARGET = positional[0];
const DESC = positional[1] || '';

const PORT = Number(process.env.GH_CDP_PORT || 9333);
const PROXY = process.env.GITHUB_PROXY || 'http://127.0.0.1:10808';

if (!TARGET || !/^[^/]+\/[^/]+$/.test(TARGET)) {
  console.log('用法: node create-repo.js <owner>/<repo> ["描述"] [--private] [--profile <档案目录>]');
  process.exit(1);
}
const [OWNER, REPO] = TARGET.split('/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function findChrome() {
  const local = process.env.LOCALAPPDATA || '';
  const cands = process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe',
       'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
       path.join(local, 'Google/Chrome/Application/chrome.exe')]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return cands.find(p => p && fs.existsSync(p));
}

async function cdpAlive() {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); return r.ok ? await r.json() : null; }
  catch { return null; }
}

(async () => {
  let v = await cdpAlive();
  if (!v) {
    const chrome = findChrome();
    if (!chrome) { console.log('❌ 未找到 Chrome，可用 GH_CDP_PORT 指向已在跑的实例'); process.exit(1); }
    if (!PROFILE) { console.log('❌ 缺少档案目录：用 --profile <dir> 或环境变量 GH_PROFILE 指定已登录的 Chrome 档案'); process.exit(1); }
    const args = [
      `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, `--proxy-server=${PROXY}`,
      '--lang=en-US', '--disable-features=Translate,TranslateUI',
      '--no-first-run', '--no-default-browser-check', 'about:blank',
    ];
    console.log('启动 Chrome:', chrome);
    spawn(chrome, args, { stdio: 'ignore' }).unref();
    for (let i = 0; i < 40; i++) {
      await sleep(1000);
      v = await cdpAlive();
      if (v) { console.log(`CDP 就绪（${i + 1}s）`); break; }
    }
  } else {
    console.log('复用已运行实例');
  }
  if (!v) { console.log('❌ CDP 未就绪'); process.exit(1); }

  const puppeteer = require('puppeteer-core');
  const b = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const p = await b.newPage();
  p.on('dialog', async d => { try { await d.accept(); } catch {} });

  await p.goto('https://github.com/new', { waitUntil: 'domcontentloaded', timeout: 60000 });

  let ready = false;
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    const st = await p.evaluate(() => ({
      title: document.title,
      hasName: !!document.querySelector('#repository-name-input, input[name="repository[name]"]'),
      needLogin: /Sign in to GitHub/i.test(document.body ? document.body.innerText : ''),
    })).catch(() => null);
    if (!st) continue;
    if (st.needLogin) { console.log('❌ 未登录 GitHub，请先在浏览器里登录'); await p.close(); b.disconnect(); process.exit(1); }
    if (st.hasName) { ready = true; console.log(`表单就绪（${i + 1}s）`); break; }
  }
  if (!ready) { console.log('❌ 表单未出现（检查是否带了代理）'); await p.close(); b.disconnect(); process.exit(1); }

  const filled = await p.evaluate((name, desc, priv) => {
    const setVal = (el, val) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const nameEl = document.querySelector('#repository-name-input, input[name="repository[name]"]');
    if (!nameEl) return { ok: false, why: 'no name input' };
    nameEl.focus();
    setVal(nameEl, name);

    const body = document.body.innerText;
    const taken = /already exists|Name has already been taken/i.test(body);

    // 私有仓库：切可见性（不勾，走选择器；失败不阻塞）
    if (priv) {
      const anchor = document.querySelector('#visibility-anchor-button');
      if (anchor) {
        anchor.click();
        const item = [...document.querySelectorAll('[role=menuitemradio]')].find(x => /^Private/i.test((x.innerText || '').trim()));
        if (item) item.click();
      }
    }
    // 确保 README/gitignore/license 三个初始化勾选都是「不添加」
    return { ok: true, taken, publicLabel: (document.querySelector('#visibility-anchor-button') || {}).innerText || '' };
  }, REPO, DESC, isPrivate);

  console.log('填写:', JSON.stringify(filled));
  if (!filled.ok || filled.taken) { console.log('❌ 仓库名不可用或输入失败'); await p.close(); b.disconnect(); process.exit(1); }
  if (DESC) console.log('⚠️ /new 页的描述框选择器不稳定，描述建议建完后到 About 面板填');

  await sleep(1500);

  const clicked = await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(x => /Create repository/i.test((x.innerText || '').trim()));
    if (!btn) return { ok: false };
    btn.scrollIntoView();
    btn.click();
    return { ok: true, disabled: btn.disabled };
  });
  if (!clicked.ok) { console.log('❌ 找不到提交按钮'); await p.close(); b.disconnect(); process.exit(1); }
  console.log('已点击 Create repository');

  let done = null;
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    const u = await p.evaluate(() => location.href).catch(() => '');
    if (u && new RegExp(`/${OWNER}/${REPO}`, 'i').test(u)) { done = u; break; }
  }

  await p.close();
  b.disconnect();

  if (done) {
    console.log(`✅ 建仓成功: https://github.com/${OWNER}/${REPO}`);
    console.log(`下一步: git remote add origin git@github.com:${TARGET}.git && env -u https_proxy -u http_proxy git push -u origin main`);
    process.exit(0);
  } else {
    console.log('⚠️ 未检测到跳转，请到网页确认；可能被风控或名称冲突');
    process.exit(2);
  }
})();
