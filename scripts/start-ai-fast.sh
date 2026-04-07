#!/usr/bin/env bash
# 优先启动你机器上已有的 Chatchat + Xinference 容器（最快）；否则回退到 infra 一键 compose
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

have_cc=false
have_xf=false
docker inspect docker-chatchat-1 >/dev/null 2>&1 && have_cc=true
docker inspect docker-xinference-1 >/dev/null 2>&1 && have_xf=true

if [[ "$have_cc" == true ]] && [[ "$have_xf" == true ]]; then
  docker start docker-chatchat-1 docker-xinference-1
  echo ""
  echo "=== 已启动现有容器（最快）==="
  echo "  Chatchat WebUI:  http://127.0.0.1:8501"
  echo "  Chatchat API:    http://127.0.0.1:7861/docs"
  echo "  Xinference UI:   http://127.0.0.1:9997"
  echo ""
  exit 0
fi

echo "未检测到 docker-chatchat-1 + docker-xinference-1，改用 compose 一键启动..."
exec "$ROOT/scripts/one-click-deploy.sh"
