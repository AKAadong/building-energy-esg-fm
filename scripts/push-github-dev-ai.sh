#!/usr/bin/env bash
# 将本仓库推送到 GitHub：AKAadong/building-energy-esg-fm 的 dev-ai 分支
# 使用前请安装 gh 或配置好 git 凭据（HTTPS Personal Access Token / SSH）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REMOTE_URL="${REMOTE_URL:-https://github.com/AKAadong/building-energy-esg-fm.git}"
BRANCH="${BRANCH:-dev-ai}"

if [[ ! -d .git ]]; then
  git init -b main
fi

# Langchain-Chatchat 若自带 .git，父仓库无法纳入其文件，需先移走嵌套仓库元数据（已备份到 .git.bak）
if [[ -e Langchain-Chatchat/.git ]]; then
  echo ">>> 发现 Langchain-Chatchat/.git，将备份为 Langchain-Chatchat/.git.bak 以便作为单仓库提交"
  mv Langchain-Chatchat/.git "Langchain-Chatchat/.git.bak.$(date +%Y%m%d%H%M%S)"
fi

git add -A
git status
echo ""
read -r -p "确认提交并推送分支 ${BRANCH} 到 origin? [y/N] " ok || true
if [[ "${ok:-}" != "y" && "${ok:-}" != "Y" ]]; then
  echo "已取消。"
  exit 1
fi

git commit -m "infra: building energy ESG/FM stack, Chatchat demo, deploy scripts" || true

if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "$REMOTE_URL"
else
  git remote set-url origin "$REMOTE_URL"
fi

git checkout -B "$BRANCH"
git push -u origin "$BRANCH"

echo ">>> 完成。若远程已有 dev-ai 且历史不一致，可能需要: git pull origin $BRANCH --rebase 后再 push"
