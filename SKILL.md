---
name: github-publish
version: 1.0.0
display_name: "GitHub 发布标准流程"
description_zh: "把本地项目/skill 发布到 GitHub 的标准流程与铁律。含环境自检、SSH 推送、版权门禁、元数据处理的边界划分与排障表。核心是「哪些该自动化、哪些绝对不要自动化」。"
description_en: "Standard workflow and hard rules for publishing local projects/skills to GitHub: preflight checks, SSH push, license compliance gate, and clear boundaries on what NOT to automate."
---

# GitHub 发布标准流程

## When to Use

- 要把本地项目、Skill、工具库发布到 GitHub（新建仓库或更新已有仓库）
- 要修改仓库元数据（description / topics / 可见性）
- 发布前需要确认版权合规

## 一句话铁律

> **代码用 SSH 推（2 秒）。元数据让你点（10 秒）。版权必过门禁。别为元数据折腾 token。**

2026-11-08 为改一个 topics 标签折腾 1 小时（PAT → sudo 邮箱 OTP → 浏览器跨轮被杀 → 死循环），
而 `git push` 从头到尾只用 2 秒。**这个教训是本 skill 存在的唯一理由。**

---

## 能力分层（先判层，再动手）

发布动作分成三层，只有第一层应该自动化：

| 层 | 动作 | 通道 | 自动化 | 耗时 |
|---|---|---|---|---|
| **L1 代码** | `git push` 分支、tag、force-with-lease | **SSH 22 端口** | ✅ 完全自动化 | 2 秒 |
| **L2 元数据** | 建仓库、改 description、打 topics、改可见性、删库 | 网页（需会话）或 REST API（需 token） | ⚠️ **默认交给用户点** | 10–30 秒 |
| **L3 受保护操作** | 建 PAT、OAuth 授权、删库 | 强制 sudo 邮箱 OTP | ❌ **禁止尝试** | 必然失败 |

**L2 为什么默认交给用户**：没有 token 就只能开浏览器点页面，而
**CDP 拉起的 Chrome 在每个 turn 结束时被 Job Object 回收** → 任何跨轮的操作必然中断。
L3 更是死锁：OTP 5–15 分钟过期，而浏览器活不过一个 turn。

L2 只有在**用户当场不在、且整个流程能在同一 turn 内跑完**时才尝试，
详见 `references/repo-metadata.md`（含实测失败的 4 个具体坑）。

---

## 标准流程（4 步）

### Step 0：环境自检（10 秒，必须先跑）

```bash
bash scripts/preflight.sh
```

检查项：SSH 身份、github.com 直连/代理、api.github.com 可达、git 工作区状态、是否有待推送提交。
**任何一项红，先修再往下走**，不要在 push 失败后再回头查。

### Step 1：版权门禁（不过不发）

```bash
node scripts/check-license.js .          # 9 项检查
```

自研项目拿 `templates/LICENSE.mit-self`；衍生项目拿 `templates/LICENSE.mit-derived`（双署名，上游在前）。
完整规范见 `references/licensing.md`。

**必过三项**（其余可豁免）：
1. `LICENSE` 存在，且是完整正文（不是摘要）
2. 版权行带**年份 + 著作权人姓名**（`Copyright (c) 2026 xxx`，只写年份不合格）
3. 衍生项目：上游署名在前、本项目在后，且上游 URL 可追溯

### Step 2：本地收口

```bash
git init -q                                   # 若尚未初始化
git config user.name  "<GitHub 用户名>"
git config user.email "<用户名>@users.noreply.github.com"   # 隐私邮箱，不暴露真实邮箱
git add -A && git status --short              # 人工过一遍，确认没有 .env / 密钥 / 数据文件
git commit -m "<type>: <subject>"
git branch -M main
git remote add origin git@github.com:<owner>/<repo>.git
```

`.gitignore` 至少要有：`node_modules/`、`data/`、`.env`、`*.log`、临时 profile 目录。

### Step 3：建仓库（两条路，先判断用户在不在场）

**路 A：用户在（默认，30 秒）** —— 把下面这段直接发给他：

> 打开 https://github.com/new
> - Repository name：`<repo>`
> - Description：`<一句话简介>`
> - 选 **Public**
> - **下面三个勾全部不要勾**（README / .gitignore / license 都不加，保持空仓库）
> - 点 Create repository
>
> 建好跟我说一声。

**路 B：用户不在场（可自动化，实测 6 秒）**

```bash
node scripts/create-repo.js <owner>/<repo> "一句话简介" \
  --profile <已登录的 Chrome 档案目录>
# 私有仓库加 --private；代理用 GITHUB_PROXY 环境变量覆盖
```

该脚本已内置三个关键修复（禁翻译 / 原生 setter / `el.click()`），
缺任何一个都会退回「反复试选择器」的状态。前提是那个 Chrome 档案**已经登录 GitHub**。

**为什么路 A 仍是默认**：路 B 依赖「档案已登录 + 代理可用 + 整个流程在同一轮次内跑完」，
任一条不满足就会失败；而让用户点 30 秒永远成立。

**三个勾必须空**：勾了会在远端产生初始 commit，后续 `git push` 直接 `rejected (fetch first)`，
还要 `--allow-unrelated-histories` 合并，纯属自找麻烦。

### Step 4：推送并验证

```bash
bash scripts/push.sh <owner>/<repo> main
```

脚本内部做两件容易被忘的事：
1. `env -u https_proxy -u http_proxy -u HTTPS_PROXY -u HTTP_PROXY -u ALL_PROXY`
   —— 本机环境有 `https_proxy=127.0.0.1:49428`（WorkBuddy 内部代理），**不清会报 `Failed to connect to github.com:443`**
2. push 后比对 `git rev-parse HEAD` 与 `origin/main`，不一致直接报错

推完再验一次（匿名 API，最可信）：

```bash
curl -s --max-time 20 "https://api.github.com/repos/<owner>/<repo>" \
  | python -c "import sys,json;d=json.load(sys.stdin);print(d['full_name'],d['private'],d['default_branch'])"
```

---

## 环境事实（本机，2026-11-08 实测）

| 项 | 状态 |
|---|---|
| SSH `git@github.com` | ✅ 通（22 端口），身份 `Hi Zengbatony!` |
| `github.com:443` 直连 | ❌ 超时（GFW） |
| 代理 `http://127.0.0.1:10808` | ✅ 可用（curl `-x` 测 API 正常） |
| 环境变量 `https_proxy` | ⚠️ `127.0.0.1:49428` 是 WorkBuddy 内部代理，**会打架，push 前必清** |
| `api.github.com` / `codeload.github.com` | ✅ 直连可达 |
| `gh` CLI | ❌ 未安装 |
| PAT / `~/.git-credentials` | ❌ 无 |

**结论：本机 git 发布完全够用，缺的只有「建仓库」这一步需要网页。**

---

## 排障表

| 报错 | 原因 | 处理 |
|---|---|---|
| `Failed to connect to github.com:443` | 环境代理打架 | `env -u https_proxy -u http_proxy -u HTTPS_PROXY -u HTTP_PROXY -u ALL_PROXY git ...` |
| `Repository not found` | 仓库还没建 / 名字错 | GitHub **没有** push-to-create，先建仓库 |
| `Permission denied (publickey)` | SSH key 未被读取 | 先 `ssh -T git@github.com` 单独验，别在 push 里猜 |
| `rejected ... fetch first` | 远端有初始 commit | 用户建仓时勾了 README；`git pull --rebase` 或删库重来 |
| `Permission request rejected by user` | 权限弹窗被拒 | **不得重试、不得换等价手段**，直接问用户 |
| 页面 title 空 / bodyLen=0 | Chrome 没带代理 | `--proxy-server=http://127.0.0.1:10808` |

---

## 绝对不要做的事

1. ❌ **为建仓库 / 改 topics / 改简介去申请 PAT。** PAT 页强制 sudo 邮箱 OTP，浏览器跨 turn 被杀 → 必然死循环。
2. ❌ **用户在场时，为改一个元数据项启动浏览器。** 让他点 10 秒，比自动化 1 小时强。
   （用户不在场时见 `references/repo-metadata.md`，有验证过的配方，约 2 分钟，但要接受可能拿不全。）
3. ❌ **跨 turn 等待验证码 / OTP。** 上一轮发出的码，这一轮浏览器已经没了。
4. ❌ **在已解决的问题上二次开发。** 发布前先查：这事以前跑通过吗？跑通过就直接复用。
5. ❌ **把 token 写进 git config / 代码库。** 只在命令行临时用，用完撤销。
6. ❌ **建仓时勾 README / gitignore / license。** 会造成不必要的合并。
7. ❌ **同一个元数据项试第四次。** 拿下 5 个 topics 和拿下 7 个，对仓库价值的差别远小于继续试错的成本 —— 停手、如实汇报。

---

## 文件

```
SKILL.md                       本文件：分层决策 + 标准流程
scripts/preflight.sh           环境自检（SSH / 代理 / API / git / 敏感文件 / 版权）
scripts/push.sh                清代理 + push + 远端一致性校验
scripts/create-repo.js         用户不在场时建仓库（内置三个关键修复，实测 6 秒）
scripts/check-license.js       版权门禁，9 项检查
templates/LICENSE.mit-self     自研项目 LICENSE
templates/LICENSE.mit-derived  衍生 MIT LICENSE（双署名）
templates/NOTICE.apache        Apache-2.0 衍生 NOTICE
templates/CREDITS.snippet.md   README 致谢段
references/licensing.md        许可规范全文（四种衍生情形 / 5 个误解 / 9 项清单）
references/repo-metadata.md    L2 元数据自动化配方（含 5 个坑：翻译劫持选择器、
                               Enter 命中自动补全、描述框是 input 不是 textarea 等）
```
