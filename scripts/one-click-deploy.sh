#!/usr/bin/env bash
# 一键拉起 Xinference + 自动拉模 + Langchain-Chatchat（建筑能源 ESG / FM 场景）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/.env" ]]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "已创建 $ROOT/.env ，可按需编辑模型名与端口。"
fi

chmod +x "$ROOT/scripts/chatchat-entrypoint.sh" 2>/dev/null || true
chmod +x "$ROOT/scripts/start-ai-fast.sh" 2>/dev/null || true

# 默认只 up，不 build（秒级启动）；需要重新构建镜像时：BUILD=1 ./scripts/one-click-deploy.sh
UP_ARGS=(-d)
if [[ "${BUILD:-0}" == "1" ]]; then
  UP_ARGS+=(--build)
fi
docker compose -f "$ROOT/docker-compose.ai.yml" --env-file "$ROOT/.env" up "${UP_ARGS[@]}"

# shellcheck source=/dev/null
set -a
# shellcheck disable=SC1090
source "$ROOT/.env"
set +a

echo ""
echo "=== 服务入口（本机）==="
echo "  Xinference UI:   http://127.0.0.1:${XINFERENCE_PORT:-9997}"
echo "  Chatchat API:    http://127.0.0.1:${CHATCHAT_API_PORT:-7861}/docs"
echo "  Chatchat WebUI:  http://127.0.0.1:${CHATCHAT_UI_PORT:-8501}"
echo ""
echo "知识库样例已挂载到容器内 /opt/building-esg-kb ，首次启动会复制到数据卷。"
echo "请在 WebUI 中新建知识库并「从文件夹入库」，或对 building_esg_fm 执行向量库重建。"
echo "RAG 可选用提示词模板: building_fm_esg（建筑 FM/ESG 优化建议）。"
echo ""
echo "可选：同时启动 MySQL — docker compose -f docker-compose.ai.yml --env-file .env --profile mysql up -d"
echo ""
echo "日常最快启动（若已有 docker-chatchat-1 / docker-xinference-1）： ./scripts/start-ai-fast.sh"
