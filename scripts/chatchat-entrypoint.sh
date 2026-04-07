#!/bin/sh
# Chatchat 容器入口：等待 Xinference、首次初始化配置、修正 Docker 网络下的 API 地址
set -e

cd /root/Langchain-Chatchat/libs/chatchat-server/chatchat
export PYTHONPATH=/root/Langchain-Chatchat/libs/chatchat-server
export CHATCHAT_ROOT="${CHATCHAT_ROOT:-/root/chatchat_data}"

XINFERENCE_OPENAI="${XINFERENCE_OPENAI:-http://xinference:9997/v1}"
BASE="${XINFERENCE_OPENAI%/v1}"

# 等待 Xinference OpenAI 兼容接口可用
i=0
while [ "$i" -lt 90 ]; do
  if python -c "import urllib.request; urllib.request.urlopen('${BASE}/v1/models')" 2>/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 2
done

if [ ! -f "$CHATCHAT_ROOT/model_settings.yaml" ]; then
  python cli.py init -x "$XINFERENCE_OPENAI" \
    -l "${DEFAULT_LLM_MODEL:-qwen2-instruct}" \
    -e "${DEFAULT_EMBEDDING_MODEL:-bge-small-zh-v1.5}" || true
fi

# 将 127.0.0.1 替换为 compose 服务名，避免容器内指向自身
if [ -f "$CHATCHAT_ROOT/model_settings.yaml" ]; then
  sed -i 's|http://127.0.0.1:9997|http://xinference:9997|g' "$CHATCHAT_ROOT/model_settings.yaml" || true
fi

# 根据 Xinference /v1/models 里**当前已在跑**的 LLM / Embedding 自动写入 DEFAULT_*（可 AUTO_SYNC_MODELS=0 关闭）
if [ -f /scripts/sync_chatchat_models_from_xinference.py ]; then
  python /scripts/sync_chatchat_models_from_xinference.py || true
fi

# 可选：将建筑 ESG/FM 知识库样例复制到数据卷（仅当目标目录可写且为空时）
KB_TARGET="$CHATCHAT_ROOT/data/knowledge_base/building_esg_fm"
if [ -d /opt/building-esg-kb ] && [ ! -d "$KB_TARGET" ]; then
  mkdir -p "$CHATCHAT_ROOT/data/knowledge_base" 2>/dev/null || true
  cp -a /opt/building-esg-kb "$KB_TARGET" 2>/dev/null || true
fi

exec python cli.py start -a
