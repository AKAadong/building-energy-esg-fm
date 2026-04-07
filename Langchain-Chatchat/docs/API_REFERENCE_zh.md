# Langchain-Chatchat HTTP 接口参考

本文档描述 **Chatchat API Server** 对外暴露的主要 HTTP 接口。默认服务端口为 **`7861`**（若在 `model_settings` / 启动参数中修改，请以实际为准）。

---

## 1. 基础约定

| 项目 | 说明 |
|------|------|
| Base URL | `http://<主机>:7861`（本机示例：`http://127.0.0.1:7861`） |
| 协议 | HTTP/HTTPS |
| 数据格式 | JSON（文件上传接口为 `multipart/form-data`） |
| 鉴权 | 默认部署多为**无独立 API Key**；若你在反向代理或网关层加了认证，需在请求头中按该层要求携带 |

**推荐**：对接前先在浏览器打开 **Swagger** 查看实时 Schema 与在线调试：

| 资源 | 路径 |
|------|------|
| Swagger UI | `GET /docs` |
| OpenAPI JSON | `GET /openapi.json` |

实现入口（便于二次开发定位）：`libs/chatchat-server/chatchat/server/api_server/server_app.py`。

---

## 2. 对话类接口

### 2.1 统一 Chat（OpenAI 风格，推荐）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/chat/chat/completions` | 与 OpenAI `chat.completions.create` 参数风格一致；可通过扩展字段传 `conversation_id`、`tools` 等 |

**请求体**：JSON，字段与 OpenAI Chat Completions 对齐，例如：

- `model`：模型名（需在 Chatchat 已配置的模型平台中存在）
- `messages`：`[{ "role": "user"|"assistant"|"system", "content": "..." }]`
- `stream`：是否流式
- `temperature`、`max_tokens` 等

**curl 示例**：

```bash
curl -sS "http://127.0.0.1:7861/chat/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "你的模型名",
    "stream": false,
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

### 2.2 知识库对话 / 文件对话（非 OpenAI 路径）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/chat/kb_chat` | 知识库对话（参数见 Swagger） |
| POST | `/chat/file_chat` | 基于临时文件的对话 |

### 2.3 反馈

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/chat/feedback` | 对话评分等反馈 |

---

## 3. OpenAI 兼容聚合接口（/v1）

用于把 **已配置的多个模型平台** 以 OpenAI API 形式对外暴露（内部再转发到 Xinference / OpenAI 兼容服务等）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/v1/models` | 聚合各平台模型列表 |
| POST | `/v1/chat/completions` | Chat Completions |
| POST | `/v1/completions` | Completions |
| POST | `/v1/embeddings` | Embeddings |
| POST | `/v1/images/generations` | 文生图（视平台能力） |
| POST | `/v1/images/variations` | 图变体 |
| POST | `/v1/images/edit` | 图编辑 |
| POST~ | `/v1/audio/*` | 部分接口可能标记为暂不支持，以 `/docs` 为准 |
| POST/GET/DELETE | `/v1/files` … | 文件相关（见 OpenAPI） |

**说明**：`/v1/chat/completions` 会按请求中的 `model` 名，在 `MODEL_PLATFORMS` 中解析对应平台并转发。

---

## 4. 知识库管理（/knowledge_base）

前缀：`/knowledge_base`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/knowledge_base/list_knowledge_bases` | 知识库列表 |
| POST | `/knowledge_base/create_knowledge_base` | 创建知识库 |
| POST | `/knowledge_base/delete_knowledge_base` | 删除知识库 |
| GET | `/knowledge_base/list_files` | 某知识库内文件列表 |
| POST | `/knowledge_base/upload_docs` | 上传文件并可向量化（multipart） |
| POST | `/knowledge_base/delete_docs` | 删除知识库内文件 |
| POST | `/knowledge_base/update_info` | 更新知识库说明 |
| POST | `/knowledge_base/update_docs` | 更新已有文件 |
| GET | `/knowledge_base/download_doc` | 下载知识库文件 |
| POST | `/knowledge_base/search_docs` | 向量检索 |
| POST | `/knowledge_base/recreate_vector_store` | 重建向量库（可能流式返回进度） |
| POST | `/knowledge_base/upload_temp_docs` | 上传临时文件（用于文件对话） |
| POST | `/knowledge_base/search_temp_docs` | 检索临时知识 |

### 4.1 知识库对话（OpenAI 兼容路径）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/knowledge_base/{mode}/{param}/chat/completions` | `mode`：`local_kb` \| `temp_kb` \| `search_engine`；`local_kb` 时 `param` 为知识库名 |

**示例**（本地知识库名为 `sikong_data`）：

```bash
curl -sS "http://127.0.0.1:7861/knowledge_base/local_kb/sikong_data/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "你的模型名",
    "stream": false,
    "messages": [{"role": "user", "content": "根据知识库简要回答：……"}],
    "top_k": 5,
    "score_threshold": 1.0
  }'
```

### 4.2 摘要相关（子路由）

前缀：`/knowledge_base/kb_summary_api`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/knowledge_base/kb_summary_api/summary_file_to_vector_store` | 按文件摘要入向量库 |
| POST | `/knowledge_base/kb_summary_api/summary_doc_ids_to_vector_store` | 按 doc_ids 摘要 |
| POST | `/knowledge_base/kb_summary_api/recreate_summary_vector_store` | 重建摘要向量库 |

---

## 5. 工具与其它

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/tools` | 工具列表 |
| POST | `/tools/call` | 调用工具 |
| POST | `/server/get_prompt_template` | 获取提示模板等（见 Swagger） |

---

## 6. 上传文件到知识库（常用字段）

`POST /knowledge_base/upload_docs`（`multipart/form-data`）常见字段：

| 字段 | 说明 |
|------|------|
| `knowledge_base_name` | 知识库名称 |
| `files` | 一个或多个文件 |
| `to_vector_store` | 是否写入向量库（建议 `true`） |
| `override` | 是否覆盖同名文件 |
| `chunk_size` / `chunk_overlap` | 分段参数（可选） |

---

## 7. Python 调用说明

仓库提供 SDK：`libs/python-sdk`（import 名常为 `open_chatcaht`）。

- 设置基址（**默认 SDK 可能是 8000，本项目一般为 7861**）：

```bash
export CHATCHAT_API_BASE="http://127.0.0.1:7861"
```

- 安装：`python -m pip install -e libs/python-sdk`
- 示例脚本：`examples/python/chatchat_api_quickstart.py`

---

## 8. 调试建议

1. 优先使用 **`/docs`** 查看请求体必填项与枚举值。  
2. 若返回 4xx/5xx，查看 API 进程日志与 **模型名是否在平台配置中存在**。  
3. 知识库相关错误常见原因：Embedding 未启动、向量库未重建、**`score_threshold` / `top_k`** 与数据不匹配。

---

## 9. 与本文档同步的简略版

更短的使用说明见：`docs/api/README_api.md`。

---

*文档随 Langchain-Chatchat 版本演进，以运行实例的 `/openapi.json` 为准。*
