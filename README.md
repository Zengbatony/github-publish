# GitHub 发布标准流程（github-publish）

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

一个给 **AI Agent 用**的 GitHub 发布标准。核心内容是一件事：**把发布动作分成三类，只有一类该自动化。**

起因很具体 —— 2026-11-08 晚上，为了改仓库的一个 topics 标签，我折腾了整整一小时：

```
改一个标签 → 要 token → 开 PAT 页面 → 撞上 sudo 邮箱验证 → 取验证码
→ 浏览器在对话轮次结束时被杀 → 验证码失效 → 重发邮件 → 用户的码被我作废
→ 再取码 → 浏览器又没了 → 死循环
```

而 `git push` 从头到尾只用了 **2 秒**。

这一小时买到的结论就是本仓库的全部价值。

---

## 核心：三层分工

| 层 | 动作 | 通道 | 该不该自动化 | 耗时 |
|---|---|---|---|---|
| **L1 代码** | `git push`、tag、force-with-lease | **SSH 22 端口** | ✅ 完全自动化 | 2 秒 |
| **L2 元数据** | 建仓库、description、topics、可见性、删库 | 网页 或 REST API | ⚠️ **默认交给用户点** | 10–30 秒 |
| **L3 受保护** | 建 PAT、OAuth 授权、删库 | 强制 sudo 邮箱 OTP | ❌ **禁止尝试** | 必然失败 |

### 为什么 L3 必然失败（不是技巧问题）

这不是「还没找到好办法」，而是结构性死锁：

> 由 CDP 拉起的 Chrome 是当前对话轮次所在进程的**子进程**，
> 轮次结束时会被 Job Object 一并回收。
> 而 OTP 验证码需要「这一轮发出、下一轮输入」。

**跨轮 = 浏览器已不存在 = 验证码必然失效。**

如果确实需要跨轮保活浏览器，纯 `spawn(detached) + unref()` **不够**，必须用长驻 Node 驱动模式
（Node 进程 spawn Chrome 作为子进程，Node 不退出则 Chrome 不被回收）。

### 为什么 L2 默认交给人

没有 token 时，L2 只能靠浏览器点页面；而页面会被 Chrome 自动翻译成中文，
导致所有英文选择器失效 —— 修这个的成本远高于让用户点 10 秒。

**判据很简单：让用户点的成本是 10 秒，自动化的成本通常是 1 小时。**

---

## 用法

```bash
# 1. 环境自检（6 组 11 项：SSH / 代理 / 环境代理干扰 / git / 敏感文件 / 版权 / 远端）
bash scripts/preflight.sh <owner>/<repo>

# 2. 版权门禁（9 项，不过不发）
node scripts/check-license.js [路径]

# 3. 用户在 github.com/new 建【空】仓库
#    ⚠️ README / .gitignore / license 三个勾都不要勾
#    勾了会在远端产生初始 commit，push 直接 rejected (fetch first)

# 4. 推送（内置清环境代理 + 远端一致性校验）
bash scripts/push.sh <owner>/<repo> main
```

### 为什么需要 `push.sh`

它做了两件最容易忘的事：

1. **清掉环境变量代理**
   很多机器（包括本机）有 `https_proxy=127.0.0.1:xxxxx` 这类内部代理，
   会让 git 报 `Failed to connect to github.com:443`。脚本用 `env -u` 一次性清干净。
2. **推送后校验**
   比对 `git rev-parse HEAD` 与 `origin/main`，不一致直接报错，不给你「以为推上去了」的错觉。

---

## 排障表

| 报错 | 原因 | 处理 |
|---|---|---|
| `Failed to connect to github.com:443` | 环境代理打架 | `env -u https_proxy -u http_proxy -u HTTPS_PROXY -u HTTP_PROXY -u ALL_PROXY git ...` |
| `Repository not found` | 仓库没建 / 名字错 | GitHub **没有** push-to-create，必须先建仓库 |
| `Permission denied (publickey)` | SSH key 未被读取 | 先 `ssh -T git@github.com` 单独验，别在 push 里猜 |
| `rejected ... fetch first` | 远端有初始 commit | 建仓时勾了 README；`git pull --rebase` 或删库重来 |
| `Permission request rejected by user` | 权限弹窗被拒 | **不得重试、不得换等价手段**，直接问用户 |
| 页面 title 空 / `body` 为空 | Chrome 没带代理 | `--proxy-server=http://127.0.0.1:10808` |

---

## 版权门禁

曾总的额外要求：**以后发布的每个 skill 都要有版权要求。**

MIT 的强制义务只有两条，全部集中在一句话里：

> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.

落地成两件事：

1. **保留版权声明** —— 任何副本、任何分发形式都要带 `Copyright (c) <年份> <作者>`
2. **保留许可声明** —— 含免责声明的正文原样保留，不可删改缩写

**最常见的三个错误**：

| 错误 | 为什么错 |
|---|---|
| `Copyright (c) 2026`（只有年份没姓名） | 声明不完整，无法确定权利人 |
| LICENSE 只写「本项目采用 MIT」 | 那不是许可正文，MIT 要求的是完整文本 |
| Apache-2.0 衍生项目漏了 `NOTICE` | Apache 明确要求的附加文件，最容易漏 |
| 用了 GPL/AGPL 代码却闭源商用 | 唯一会造成**实质法律损失**的一条 |

`check-license.js` 会把这 9 项全查一遍，CI 里挂上就不会漏。

---

## 文件结构

```
SKILL.md                       分层决策 + 4 步流程 + 环境事实 + 排障表 + 禁止清单
scripts/preflight.sh           环境自检，推之前跑，10 秒看清全部前置条件
scripts/push.sh                清环境代理 + push + 远端一致性校验
scripts/check-license.js       版权门禁，9 项检查
templates/LICENSE.mit-self     自研项目 LICENSE 模板
templates/LICENSE.mit-derived  衍生 MIT 模板（双署名，上游在前）
templates/NOTICE.apache        Apache-2.0 衍生必需 NOTICE
templates/CREDITS.snippet.md   README 致谢段模板
references/licensing.md        许可规范全文（4 种衍生情形 / 5 个误解 / 9 项清单）
references/repo-metadata.md    L2 元数据 CDP 细节（仅同轮次可用，含 4 个实测坑）
```

---

## 适用前提

本仓库的环境事实部分基于一台特定机器（Windows + Git Bash + 特定代理端口），
但**三层分工的判断标准是通用的**：

- `git push` 走 SSH，几乎总能用
- 元数据交给用户，几乎总是更划算
- 强制 OTP 的流程，跨轮几乎总是失败

换机器时只需改 `preflight.sh` 里的 `GITHUB_PROXY` 默认值。

## 许可

MIT，见 [LICENSE](LICENSE)。任何派生作品需保留上述版权声明。
