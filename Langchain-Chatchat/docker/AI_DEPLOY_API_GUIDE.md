# AI Deployment and API Guide

This file is copied into the Docker image to provide a quick, self-contained runbook.

## 1) Local Deployment (Docker Compose)

From repository root:

```bash
docker compose -f docker/docker-compose.yaml up -d
```

Services:

- Xinference UI: `http://127.0.0.1:9997`
- Chatchat WebUI: `http://127.0.0.1:8501`
- Chatchat API docs: `http://127.0.0.1:7861/docs`

## 2) Required Running Models

Before RAG chat, ensure at least:

- One LLM model is `running` in Xinference (example: `llm-qwen2-05b`)
- One embedding model is `running` in Xinference (example: `emb-bge-small-zh-v15`)

## 3) Knowledge Base Workflow

1. Create a KB in WebUI (`知识库管理`)
2. Upload files (PDF/JSONL/etc.)
3. Build/rebuild vector store with selected embedding model
4. Use `RAG 对话` with the same KB

## 4) API Quick Calls

### List KBs

```bash
curl -sS http://127.0.0.1:7861/knowledge_base/list_knowledge_bases
```

### Search docs in KB

```bash
curl -sS http://127.0.0.1:7861/knowledge_base/search_docs \
  -H "Content-Type: application/json" \
  -d '{"knowledge_base_name":"sikong_data","query":"example","top_k":3,"score_threshold":2.0}'
```

### OpenAI-compatible chat over KB

```bash
curl -sS http://127.0.0.1:7861/knowledge_base/local_kb/sikong_data/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"llm-qwen2-05b","stream":false,"messages":[{"role":"user","content":"example question"}]}'
```

## 5) Detailed Project Docs

- API docs: `docs/api/README_api.md`
- KB optimization docs: `docs/kb/README_kb_optimization.md`
- SFT docs: `tools/sft/README_sft_qwen25.md`

## 6) One-click stack (repo parent: `infra/`)

From the `infra` directory (contains `Langchain-Chatchat` and `docker-compose.ai.yml`):

```bash
cp .env.example .env
./scripts/one-click-deploy.sh
```

This brings up Xinference (port 9997), runs a one-shot job to launch default LLM + embedding when possible, and builds/starts Chatchat from `./Langchain-Chatchat` (includes custom RAG prompt key `building_fm_esg` for building FM / ESG scenarios). Optional MySQL:

```bash
docker compose -f docker-compose.ai.yml --env-file .env --profile mysql up -d
```

Sample knowledge Markdown for RAG lives under `deploy/knowledge-base/building-esg/`. After first start, copy into the Chatchat data volume is attempted; you still need to create a knowledge base in the WebUI and ingest/rebuild vectors. In KB chat, choose prompt template `building_fm_esg` when available.

**Auto-sync Chatchat default models from Xinference** (`AUTO_SYNC_MODELS=1` in `.env`, default on): on each Chatchat container start, `scripts/sync_chatchat_models_from_xinference.py` calls `GET /v1/models` and writes `DEFAULT_LLM_MODEL` / `DEFAULT_EMBEDDING_MODEL` in `model_settings.yaml` to match **currently running** models (preferring `XF_LLM_MODEL_NAME` / `XF_EMBED_MODEL_NAME` when present). Existing knowledge bases still store their own `embed_model`; align or rebuild vectors in the WebUI if you changed embedding models.

## 7) Business scenarios (需求文档对应) & demo UI

Mapped RAG `prompt_name` keys in `deploy/chatchat_config/prompt_settings.yaml` (mount into `CHATCHAT_ROOT/prompt_settings.yaml`):

| Module | Role | `prompt_name` |
|--------|------|-----------------|
| 智能运营优化 | Vision occupancy + energy + FM knowledge → actionable savings | `smart_ops` (legacy umbrella: `building_fm_esg`) |
| FM 设施管理 | Alarms / faults + ops KB → diagnosis & steps | `fm_maintenance` |
| ESG 评价 | Metrics & compliance KB → improvements & interpretation | `esg_compliance` |
| 系统问答 | Generic KB Q&A (“如何提升…”, “故障怎么处理…”) | `system_qa` |

**Test frontend** (calls `POST /knowledge_base/local_kb/{kb}/chat/completions` with `prompt_name`):

```bash
# From repo root (infra/). Serves http://127.0.0.1:8765/ and proxies /api → Chatchat (default 7861).
python3 scripts/serve-building-ai-demo.py
```

Static files: `web/building-ai-demo/index.html`. If the API has `OPEN_CROSS_DOMAIN: false`, use this proxy or set `OPEN_CROSS_DOMAIN: true` in `basic_settings.yaml` and restart Chatchat.

After updating prompts on the host, sync into a running container if needed:

`docker cp deploy/chatchat_config/prompt_settings.yaml docker-chatchat-1:/root/chatchat_data/prompt_settings.yaml` then restart the container.

