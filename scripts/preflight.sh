#!/usr/bin/env bash
# GitHub 发布环境自检 —— 推之前跑一次，10 秒看清全部前置条件
# usage: bash preflight.sh [owner/repo]
set -u

OWNER_REPO="${1:-}"
PROXY="${GITHUB_PROXY:-http://127.0.0.1:10808}"
PASS=0; FAIL=0; WARN=0

ok()   { printf "  \033[32mOK\033[0m   %s\n" "$1"; PASS=$((PASS+1)); }
bad()  { printf "  \033[31mFAIL\033[0m %s\n" "$1"; FAIL=$((FAIL+1)); }
warn() { printf "  \033[33mWARN\033[0m %s\n" "$1"; WARN=$((WARN+1)); }

echo "=== 1. SSH 通道（git push 唯一依赖） ==="
SSH_OUT=$(timeout 20 ssh -T -o StrictHostKeyChecking=no -o ConnectTimeout=10 git@github.com 2>&1)
if echo "$SSH_OUT" | grep -q "successfully authenticated"; then
  ok "SSH 通：$(echo "$SSH_OUT" | head -1)"
else
  bad "SSH 不通 → $SSH_OUT"
  echo "       处理：先单独修 SSH，别在 push 里猜；修不好转 references/repo-metadata.md"
fi

echo
echo "=== 2. 网络分层 ==="
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 12 https://github.com 2>/dev/null || echo "000")
if [ "$CODE" = "000" ]; then warn "github.com:443 直连超时（预期内，本机被墙；不影响 SSH push）"
else ok "github.com:443 直连 $CODE"; fi

CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 12 https://api.github.com 2>/dev/null || echo "000")
if [ "$CODE" = "200" ]; then ok "api.github.com 直连可达（验证仓库状态用它）"
else bad "api.github.com 不可达 → $CODE"; fi

CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -x "$PROXY" https://api.github.com 2>/dev/null || echo "000")
if [ "$CODE" = "200" ]; then ok "代理 $PROXY 可用"
else warn "代理 $PROXY 不通（$CODE）→ 需要网页时手动指定可用端口"; fi

echo
echo "=== 3. 环境变量代理（push 前必须清） ==="
ENV_PROXY=$(env | grep -iE "^(https?_proxy|all_proxy)=" | head -3)
if [ -n "$ENV_PROXY" ]; then
  warn "存在环境代理，push 前必须清掉，否则报 Failed to connect to github.com:443"
  echo "$ENV_PROXY" | sed 's/^/       /'
  echo "       scripts/push.sh 已内置清理，不用手动处理"
else
  ok "无环境代理干扰"
fi

echo
echo "=== 4. 本地 git 状态 ==="
if git rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH=$(git branch --show-current 2>/dev/null)
  [ -n "$BRANCH" ] && ok "当前分支：$BRANCH" || warn "未在分支上（HEAD detached？）"
  [ "$BRANCH" = "main" ] || warn "分支不是 main → git branch -M main"

  UNCOMMITTED=$(git status --porcelain | wc -l | tr -d ' ')
  if [ "$UNCOMMITTED" = "0" ]; then ok "工作区干净"
  else warn "有 $UNCOMMITTED 个未提交改动 → git add -A 并人工过一遍"; fi

  REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
  if echo "$REMOTE" | grep -q "^git@github.com:"; then ok "remote 走 SSH：$REMOTE"
  elif [ -z "$REMOTE" ]; then bad "未配置 origin → git remote add origin git@github.com:<owner>/<repo>.git"
  else bad "remote 不是 SSH：$REMOTE → 改回 git@github.com:<owner>/<repo>.git"; fi

  # 隐私检查
  LEAK=$(git ls-files 2>/dev/null | grep -iE "\.env$|\.env\.|credentials|id_rsa|\.pem$|secret|token\.json" | head -5)
  if [ -n "$LEAK" ]; then bad "疑似敏感文件被跟踪："; echo "$LEAK" | sed 's/^/       /'
  else ok "未发现密钥类文件被跟踪"; fi
else
  bad "当前目录不是 git 仓库 → git init"
fi

echo
echo "=== 5. 版权门禁 ==="
if [ -f LICENSE ]; then
  if grep -qiE "^Copyright \(c\) [0-9]{4} .+" LICENSE; then ok "LICENSE 有完整版权行（含著作权人姓名）"
  elif grep -qiE "^Copyright \(c\) [0-9]{4}\s*$" LICENSE; then bad "版权行只有年份、没有姓名 → 见 references/licensing.md"
  else bad "LICENSE 版权行格式不符"; fi
else
  bad "缺 LICENSE → 自研用 templates/LICENSE.mit-self，衍生用 LICENSE.mit-derived"
fi

echo
echo "=== 6. 远端仓库状态 ==="
if [ -n "$OWNER_REPO" ]; then
  J=$(curl -s --max-time 20 "https://api.github.com/repos/$OWNER_REPO" 2>/dev/null)
  if echo "$J" | grep -q '"full_name"'; then
    ok "仓库已存在：$OWNER_REPO"
    echo "$J" | python -c "
import sys,json
d=json.load(sys.stdin)
print('       可见性:', 'private' if d.get('private') else 'public')
print('       默认分支:', d.get('default_branch'))
print('       简介:', d.get('description') or '(空)')
print('       topics:', ', '.join(d.get('topics') or []) or '(空)')
" 2>/dev/null
  else
    bad "仓库不存在或不可见：$OWNER_REPO"
    echo "       → GitHub 没有 push-to-create，必须先让用户在 github.com/new 建空仓库"
  fi
else
  echo "  (未传 owner/repo，跳过)"
fi

echo
echo "─────────────────────────────────"
printf "通过 %d / 失败 %d / 警告 %d\n" "$PASS" "$FAIL" "$WARN"
if [ "$FAIL" -gt 0 ]; then
  echo "有 FAIL 项，先修再 push。"
  exit 1
fi
echo "前置条件就绪。下一步：检查工作区内容 → commit → bash scripts/push.sh <owner>/<repo>"
exit 0
