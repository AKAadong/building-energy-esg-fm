# API 使用说明（本地部署 / 对外问答接口）

**完整接口清单与路径表**见：`docs/API_REFERENCE_zh.md`。

本文档面向 **Langchain-Chatchat API Server**（默认端口 `7861`），包含：

- OpenAPI/Swagger 文档入口
- OpenAI 兼容接口（`/v1/...`）
- Chatchat 统一对话接口（`/chat/chat/completions`）
- 知识库管理、PDF 上传入库、检索、知识库对话接口
- Python SDK 最小调用示例（复用本仓库 `libs/python-sdk`）

## 1. OpenAPI 文档

- **Swagger UI**：`http://127.0.0.1:7861/docs`
- **OpenAPI JSON**：`http://127.0.0.1:7861/openapi.json`

API 进程启动入口对应代码：`libs/chatchat-server/chatchat/server/api_server/server_app.py`。

## 2. 统一对话接口（推荐）

### 2.1 OpenAI 兼容的统一 chat 接口

接口：`POST /chat/chat/completions`

- 参数与 `openai.chat.completions.create` 基本一致
- 支持通过 `extra_body` / `model_extra` 传入扩展参数（如 `conversation_id`、`metadata` 等）

示例（curl）：

```bash
curl -sS http://127.0.0.1:7861/chat/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5-7b-instruct",
    "stream": false,
    "messages": [
      {"role": "system", "content": "你是一个严谨的领域助手。"},
      {"role": "user", "content": "用三点总结一下司空大数据知识库的适用范围。"}
    ],
    "temperature": 0.2,
    "max_tokens": 1024,
    "conversation_id": "demo_conv_001"
  }'
```

说明：
- 具体实现路由：`libs/chatchat-server/chatchat/server/api_server/chat_routes.py`
- 真实调用链：路由 → `chatchat/server/chat/chat.py::chat`

## 3. 知识库 API（上传 PDF 入库 / 检索 / 知识库对话）

知识库相关路由前缀：`/knowledge_base`，主要在：
- 路由聚合：`libs/chatchat-server/chatchat/server/api_server/kb_routes.py`
- 文件上传与向量化：`libs/chatchat-server/chatchat/server/knowledge_base/kb_doc_api.py`

### 3.1 获取知识库列表

`GET /knowledge_base/list_knowledge_bases`

### 3.2 创建知识库

`POST /knowledge_base/create_knowledge_base`

示例：

```bash
curl -sS http://127.0.0.1:7861/knowledge_base/create_knowledge_base \
  -H "Content-Type: application/json" \
  -d '{"knowledge_base_name":"sikong_data","kb_info":"司空大数据知识库","vector_store_type":"faiss","embed_model":"bge-large-zh-v1.5"}'
```

### 3.3 上传 PDF（或其它文件）到知识库并向量化

`POST /knowledge_base/upload_docs`（multipart/form-data）

关键字段（常用）：
- `knowledge_base_name`: 知识库名称
- `files`: 上传文件（可多个）
- `to_vector_store`: 是否进行向量化（建议 true）
- `override`: 是否覆盖同名文件
- `chunk_size` / `chunk_overlap`: 分段参数（可覆盖默认配置）

示例（上传单个 PDF）：

```bash
curl -sS http://127.0.0.1:7861/knowledge_base/upload_docs \
  -F "knowledge_base_name=sikong_data" \
  -F "to_vector_store=true" \
  -F "override=false" \
  -F "chunk_size=900" \
  -F "chunk_overlap=180" \
  -F "files=@/path/to/book.pdf"
```

### 3.4 知识库检索（向量检索）

`POST /knowledge_base/search_docs`

```bash
curl -sS http://127.0.0.1:7861/knowledge_base/search_docs \
  -H "Content-Type: application/json" \
  -d '{"knowledge_base_name":"sikong_data","query":"司空大数据的指标口径是什么？","top_k":5,"score_threshold":1.0}'
```

### 3.5 知识库对话（OpenAI 兼容）

接口：`POST /knowledge_base/{mode}/{param}/chat/completions`

其中：
- `mode` 取值：`local_kb` / `temp_kb` / `search_engine`
- `param`：当 `mode=local_kb` 时为 `kb_name`；当 `mode=temp_kb` 时为 `knowledge_id`

示例（对话式从知识库回答）：

```bash
curl -sS http://127.0.0.1:7861/knowledge_base/local_kb/sikong_data/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5-7b-instruct",
    "stream": false,
    "messages": [
      {"role": "user", "content": "请基于知识库解释“主题域”的定义，并给出一个业务例子。"}
    ],
    "temperature": 0.2,
    "max_tokens": 1024,
    "top_k": 5,
    "score_threshold": 1.0
  }'
```

## 4. Python SDK 最小示例（推荐）

本仓库提供 Python SDK：`libs/python-sdk`（包名 `open_langchain_chatchat`，import 路径为 `open_chatcaht`）。

注意：SDK 默认 `CHATCHAT_API_BASE` 是 `http://127.0.0.1:8000`，而本项目 API 默认端口是 **7861**。

建议先设置环境变量：

```bash
export CHATCHAT_API_BASE="http://127.0.0.1:7861"
```

安装（在仓库根目录）：

```bash
python -m pip install -e libs/python-sdk
```

调用示例见：`examples/python/chatchat_api_quickstart.py`。

