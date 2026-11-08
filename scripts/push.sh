#!/usr/bin/env bash
# GitHub 安全推送 —— 清环境代理 + push + 远端一致性校验
# usage: bash push.sh <owner/repo> [branch]
#   例: bash push.sh Zengbatony/xianyu-ebike-shopping main
set -u

TARGET="${1:-}"
BRANCH="${2:-main}"

if [ -z "$TARGET" ]; then
  echo "用法: bash push.sh <owner/repo> [branch]"
  echo "例:   bash push.sh Zengbatony/my-skill main"
  exit 1
fi

git rev-parse --git-dir >/dev/null 2>&1 || { echo "❌ 当前目录不是 git 仓库"; exit 1; }

# ---------- 1. remote 归位到 SSH ----------
EXPECT="git@github.com:${TARGET}.git"
CUR=$(git remote get-url origin 2>/dev/null || echo "")
if [ "$CUR" != "$EXPECT" ]; then
  echo "→ 修正 origin: ${CUR:-(空)} → $EXPECT"
  git remote remove origin 2>/dev/null || true
  git remote add origin "$EXPECT"
else
  echo "→ origin 已是 $EXPECT"
fi

# ---------- 2. 分支 ----------
CURB=$(git branch --show-current 2>/dev/null)
if [ "$CURB" != "$BRANCH" ]; then
  echo "→ 重命名分支: ${CURB:-?} → $BRANCH"
  git branch -M "$BRANCH" 2>/dev/null || true
fi

# ---------- 3. 未提交内容拦一道 ----------
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ 工作区有未提交改动："
  git status --short | head -10 | sed 's/^/     /'
  echo "   先 git add -A && git commit，push 只推已提交内容。"
  exit 1
fi

# ---------- 4. 推送（清环境代理，这是最常见的失败原因） ----------
echo "→ 推送 $BRANCH 到 $TARGET ..."
env -u https_proxy -u http_proxy -u HTTPS_PROXY -u HTTP_PROXY -u ALL_PROXY -u all_proxy \
  git push -u origin "$BRANCH" 2>&1 | tail -8
PIPESTATUS_0=${PIPESTATUS[0]}

if [ "$PIPESTATUS_0" != "0" ]; then
  echo
  echo "❌ 推送失败。按报错对号："
  echo "   Failed to connect to github.com:443 → 环境代理没清干净"
  echo "   Repository not found               → 仓库还没建，GitHub 无 push-to-create"
  echo "   Permission denied (publickey)      → 先 ssh -T git@github.com 单独验"
  echo "   rejected ... fetch first           → 远端有初始 commit（建仓时勾了 README）"
  exit 1
fi

# ---------- 5. 一致性校验 ----------
env -u https_proxy -u http_proxy -u HTTPS_PROXY -u HTTP_PROXY -u ALL_PROXY \
  git fetch origin "$BRANCH" --quiet 2>/dev/null

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")

echo
if [ "$LOCAL" = "$REMOTE" ]; then
  echo "✅ 本地与远端一致：${LOCAL:0:7}"
  echo "   仓库地址：https://github.com/${TARGET}"
  echo
  echo "→ 建议再做一次匿名 API 复核（最可信）："
  echo "   curl -s https://api.github.com/repos/${TARGET} | python -c \"import sys,json;d=json.load(sys.stdin);print(d['full_name'],d['private'],d['default_branch'])\""
  exit 0
else
  echo "⚠️  校验不一致：本地 ${LOCAL:0:7} / 远端 ${REMOTE:0:7}"
  echo "   可能是并发推送或 fetch 未完成，重跑本脚本确认。"
  exit 1
fi
