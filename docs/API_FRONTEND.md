# 前端对接说明（REST API）

本文档供正式前端与智能体联调使用：约定基址、跨域、**全部 HTTP 接口**、请求/响应字段与示例。实现以运行中的 **OpenAPI** 为准，可拉取 `openapi.json` 生成 TypeScript 类型或客户端。

---

## 1. 快速开始

| 项 | 值 |
|----|-----|
| 默认 API 前缀 | **`/api`** |
| 开发典型基址 | `http://127.0.0.1:8765` |
| 探活 | `GET /health` → `{"status":"ok"}` |
| 接口发现 | `GET /api` 或 `GET /api/` |
| 机器可读契约 | `GET /openapi.json` |
| 交互调试 | `GET /docs`（Swagger UI）、`GET /redoc` |

**鉴权**：当前版本**无** Token / Cookie 要求；所有列出的业务接口均可直接调用（生产环境请按队伍安全策略加固）。

**CORS**：后端已配置常见开发源（如 `http://127.0.0.1:3000`）。若前端运行在不同端口/域名，需在后端设置环境变量 **`CORS_ORIGINS`**（逗号分隔完整 origin）。

**内容类型**

- `GET`：参数使用 **QueryString**。
- `POST`：请求体为 **`application/json`**（除非特别说明）。

**时间格式**（Query）：字符串 **`YYYY-MM-DD HH:MM:SS`**（与数据一致即可被 pandas 解析）。

---

## 2. 错误与 HTTP 状态

| 情况 | 行为 |
|------|------|
| 2xx | 成功；`GET /api/stats/export/csv` 返回 `text/csv` 流 |
| 404 | JSON：`detail`、`path`、`hint`（提示使用 `/api` 前缀等） |
| 422 | FastAPI 校验失败：`detail` 为字段级错误列表 |
| 502 | 若经 Node 代理且后端未启动，可能返回代理层 JSON `error` / `backend` / `hint` |

前端建议统一封装 `fetch`：根据 `response.ok` 判断，非 JSON 响应（如 CSV）单独分支。

---

## 3. 接口总览

以下为 **`API_PREFIX=/api`** 时的路径；若改了前缀，将下表路径中的 `/api` 替换即可。

### 3.1 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/` | 返回 `docs`、`api` 前缀提示 |
| GET | `/api` | 接口发现 + `examples` |
| GET | `/docs` | Swagger UI |
| GET | `/openapi.json` | OpenAPI 3 Schema |

> 测试联调页：启动 `frontend_test` 后访问 `http://127.0.0.1:3000`（默认代理到后端）。

---

### 3.1.1 数据层（演示/联调）` /api/admin`

> 说明：为比赛演示补充的“数据就绪与刷新”能力。生产环境建议加鉴权并限制权限。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/status` | 展示能耗/元数据/字典/KB/司空/LLM 路径与就绪状态、行数等 |
| GET | `/api/admin/dataset/import-status` | 当前生效 CSV 路径及是否使用 `data/imported/` 上传文件 |
| POST | `/api/admin/dataset/upload-energy` | `multipart/form-data` 上传能耗 CSV（`building_id`,`monitor_time` 及至少一类指标列） |
| POST | `/api/admin/dataset/upload-metadata` | 上传元数据 CSV（需 `building_id`） |
| POST | `/api/admin/dataset/upload-dictionary` | 上传数据字典 CSV |
| POST | `/api/admin/reload` | 清缓存并重新加载 CSV/司空（更新数据后生效） |
| POST | `/api/admin/kb/reindex` | 重建知识库索引（可能较慢） |

### 3.2 能耗 ` /api/energy`

#### `GET /api/energy/buildings`

建筑列表（来自 metadata CSV）。

**响应（示例结构）**

```json
{
  "items": [
    {
      "building_id": "Bobcat_education_Alissa",
      "...": "元数据列因 CSV 而异"
    }
  ]
}
```

#### `GET /api/energy/records`

小时级能耗明细。

| Query 参数 | 类型 | 必填 | 说明 |
|------------|------|------|------|
| building_id | string | 否 | 过滤单栋 |
| time_from | string | 否 | 起始时刻（含） |
| time_to | string | 否 | 结束时刻（含） |
| limit | int | 否 | 默认 500，最大 10000 |

**响应**

```json
{
  "count": 20,
  "items": [
    {
      "building_id": "...",
      "monitor_time": "2016-01-02 17:00:00",
      "electricity_kwh": "...",
      "...": "列与 CSV 一致"
    }
  ]
}
```

---

### 3.3 统计 ` /api/stats`

#### `GET /api/stats/period`

时段内汇总与均值（可选建筑与时间范围）。

| Query | 说明 |
|-------|------|
| building_id | 可选 |
| time_from / time_to | 可选 |

**响应要点**：`rows`、`buildings`、`time_range.min/max`、`sums`、`means`（数值列为能耗/气象等字段名）。

#### `GET /api/stats/anomalies`

用电 **z-score** 异常检测（演示）。

| Query | 说明 |
|-------|------|
| building_id | 可选 |
| time_from / time_to | 可选 |
| z_threshold | 默认 `3.0`，范围约 0.5～10 |

**响应要点**：`total_hours`、`anomaly_hours`、`ratio`、`z_threshold`、`samples`（最多约 50 条异常小时）。

#### `GET /api/stats/cop-proxy`

冷冻水冷量与市电小时比值等 **COP 相关演示**（非设备铭牌 COP）。

**响应要点**：`valid_hours`、`mean_chilled_over_elec`、`median_chilled_over_elec`、`note` / `description`。

#### `GET /api/stats/timeseries`

图表用序列（折线/柱状）。

| Query | 必填 | 说明 |
|--------|------|------|
| building_id | **是** | |
| metric | 否 | 默认 `electricity_kwh`；允许值见下 |
| time_from / time_to | 否 | |
| limit | 否 | 默认 2000，最大 10000 |

**metric 允许值**：`electricity_kwh`、`solar_kwh`、`chilledwater_kwh_eq`、`hotwater_kwh`、`water_m3`、`air_temperature_c`、`relative_humidity_pct`。

**响应（成功）**

```json
{
  "building_id": "Bobcat_education_Alissa",
  "metric": "electricity_kwh",
  "unit_hint": "kWh",
  "chart_hint": { "x_axis": "monitor_time", "y_axis": "electricity_kwh", "type": "line" },
  "labels": ["01-02 17:00", "..."],
  "values": [12.3, null],
  "rows": 500
}
```

**ECharts**：`xAxis.data = labels`，`series[0].data = values`（`null` 可断开或过滤）。

**错误**：非法 `metric` 时返回 JSON 含 `error` 字段说明允许列表。

#### `GET /api/stats/metrics-catalog`

指标中心（前后端统一字段语义）：

- `metric`：字段名
- `label`：中文名
- `unit`：单位
- `agg_default`：默认聚合（sum/mean）
- `chart`：推荐图表（line/bar）

#### `GET /api/stats/benchmark/scoreboard`

建筑对标排行榜（演示级综合分，0~100）。

| Query | 说明 |
|-------|------|
| time_from / time_to | 可选；时间范围 |
| top_n | 可选；默认 20，范围 3~200 |

**评分构成（当前版本）**

- 总电耗 `total_electricity_kwh`（越低越优，权重 0.45）
- 夜间基荷占比 `night_base_ratio`（越低越优，权重 0.35）
- 峰谷比 `peak_valley_ratio`（越低越优，权重 0.20）

**响应要点**：`items[]`（含 rank/score 与分项指标）、`chart.labels/scores`（可直接画柱状图）。

#### `GET /api/stats/export/csv`

导出时段内**小时级明细** CSV（`Content-Disposition` 附件）。

| Query | 说明 |
|-------|------|
| building_id | 可选；不传则导出全部建筑（筛选前） |
| time_from / time_to | 可选；时间范围过滤 |

文件名形如 `energy_export_<building_id|all>.csv`。

前端：可用 `window.open` 或 `fetch` blob 下载。

---

### 3.4 元数据 ` /api/meta`

#### `GET /api/meta/data-dictionary`

数据字典 CSV 转 JSON。

**响应**

```json
{
  "items": [ { "...": "列名依 CSV" } ]
}
```

---

### 3.5 知识库 ` /api/kb`

#### `GET /api/kb/status`

索引是否就绪、索引文件路径。

#### `GET /api/kb/search`

PDF 全文检索（FTS5）。

| Query | 必填 |
|-------|------|
| q | 是 |
| limit | 否，默认 15，最大 50 |

**响应要点**：`ready`、`query`、`count`、`results[]`（含 `source_path`、`chunk_id`、`snippet`）。

#### `POST /api/kb/rag-demo`

仅 PDF 侧：**检索 + 模板拼接**，非 LLM。

**Body**

```json
{
  "query": "供暖通风",
  "top_k": 5
}
```

**响应要点**：`query`、`answer`、`citations`。

---

### 3.6 司空语料 ` /api/sikong`

#### `GET /api/sikong/status`

`ready`、`rows`、`jsonl_path`。

#### `GET /api/sikong/search`

关键词检索（空格分词计分）。

| Query | 必填 |
|-------|------|
| q | 是 |
| limit | 否，默认 20，最大 100 |

**响应要点**：`results[]` 含 `input`、`output`。

#### `POST /api/sikong/rag-demo`

司空侧模板拼装回答。

**Body**

```json
{
  "query": "热工",
  "top_k": 5
}
```

---

### 3.7 助手 ` /api/assistant`

#### `GET /api/assistant/llm-status`

返回是否已配置 `LLM_API_BASE` 及当前 `model` 名称（供前端展示）。

#### `POST /api/assistant/rag-answer`（智慧运维：RAG + 可选 LLM）

合并 **规范 PDF + 司空语料 + 数据字典关键词检索**；若问题命中运维类关键词，注入 **时段能耗汇总与异常检测摘要**（演示数据集）。若环境变量配置了 **OpenAI 兼容接口**（`LLM_API_BASE`），默认由轻量 LLM 基于上述上下文生成回答（`mode: rag_llm`）；未配置或调用失败时回退为检索拼装（`mode: rag_only`）。前端 **「智能问答」** 页面调用本接口。

**Body**

```json
{
  "query": "空气源热泵能效限定值",
  "kb_limit": 8,
  "sikong_limit": 5,
  "use_llm": null,
  "building_id": null
}
```

| 字段 | 说明 |
|------|------|
| use_llm | `null` 自动（已配置 LLM 则生成）；`false` 仅检索拼装；`true` 强制请求 LLM |
| building_id | 可选，筛选运维数据摘要时的建筑 |

**响应要点**

| 字段 | 说明 |
|------|------|
| query | 原问题 |
| mode | `rag_only` 或 `rag_llm` |
| description | 模式说明 |
| answer | 主回答文本 |
| baseline_answer | 在 `rag_llm` 时附带检索拼装底稿，便于对照 |
| citations | 含 `pdf` / `sikong` / `data_dictionary` |
| retrieval | `pdf`、`sikong`、`data_dictionary`、`ops_data` |
| llm | `used`、`model`、`error` |

#### `POST /api/assistant/knowledge-merge`

仅返回**原始检索结果**，便于自研拼装或对接 LLM。

**Body**

```json
{
  "query": "空调节能",
  "kb_pdf_limit": 8,
  "sikong_limit": 5
}
```

**响应要点**：`sources.pdf_kb`、`sources.sikong_qa`（含 `items`）；`hint` 说明用途。

---

### 3.8 运维工单 ` /api/incidents`

用于“异常发现 -> 派单处理 -> 关闭”的轻量闭环演示。

#### `GET /api/incidents`

| Query | 必填 | 说明 |
|-------|------|------|
| status | 否 | `open` / `in_progress` / `resolved` / `closed` |
| limit | 否 | 默认 100，最大 500 |

#### `GET /api/incidents/summary`

返回 `by_status`（各状态条数）、`pending`（`open` + `in_progress`）、`total`。用于概览 KPI，无需拉全表。

#### `POST /api/incidents`

```json
{
  "title": "夜间基荷偏高（教学楼）",
  "building_id": "Bobcat_education_Alissa",
  "severity": "medium",
  "status": "open",
  "detail": "凌晨 0-5 点负荷偏高，建议核查新风机组与照明策略。"
}
```

#### `PATCH /api/incidents/{incident_id}`

可更新 `title`、`severity`、`status`、`detail`。

---

### 3.9 MCP 清单 ` /api/mcp`

#### `GET /api/mcp/tools`

返回 `tools[]`：名称、描述、HTTP `method`、`path`、参数 schema，供映射 MCP 或智能体工具。

---

### 3.10 V2.0 强化接口 ` /api/v2`

#### `POST /api/v2/vision/analyze`

请求体示例：

```json
{ "filename": "meeting_room.jpg" }
```

返回演示级视觉识别结构（房间类型、人数密度、设备状态等）。

#### `POST /api/v2/vision/upload`

`multipart/form-data`，字段名 `file`；单文件最大 50MB。

| Query | 说明 |
|-------|------|
| `mode` | 可选；`world`（默认）或 `yolo12` |
| `prompt` | 可选；英文逗号分隔类别，覆盖内置室内类别表 |
| `conf` | 可选；`0.02`–`0.95`，置信度阈值；不传则默认约 `0.12`，服务端还会在零检测时自动降阈值、精简类别与提高 `imgsz` 重试 |
| `iou` | 可选；`0.2`–`0.95`，NMS IoU；默认约 `0.42`（环境变量 `YOLO_WORLD_IOU` 可覆盖） |
| `imgsz` | 可选；`640`–`2048`，推理边长；默认 `1280`（环境变量 `YOLO_WORLD_IMGSZ` 可覆盖） |

- 安装 `ultralytics`（见 `backend/requirements-v2-vision.txt`）后，`yolo` 字段含检测框、计数等；未安装时 `yolo.available=false` 并带 `hint`。
- **YOLO-World** 还依赖 OpenAI **CLIP**（`import clip`）；若报错 `No module named 'clip'`，按 `requirements-v2-vision.txt` 内注释安装。
- 成功时 `yolo` 可能含：`pipeline`（`yolo_world` 或 `yolo12`）、`boxes`、`detections`、`count`、`image_size`、`classes_used`（world 模式）、`conf_used`、`iou_used`、`imgsz_used`、`max_det_used`、`augment_used`、`weights_path`、`inference_attempts`（重试记录）、`note`；顶层另有演示用 `room_type`、`people_count` 等（与文件名启发相关，非纯视觉模型输出）。
- **`asset_health`**（演示）：在 `yolo` 结果上做的**电器向**启发式评估，**不是**真实破损/裂纹检测。字段概要：
  - `available`：`yolo.available` 为真且流程正常时为 `true`；否则 `false` 并带 `hint`。
  - `disclaimer`：能力边界说明（单帧 RGB、框尺度与置信度等）。
  - `items[]`：匹配到常见电器英文标签的检出框列表，每项含 `label`、`category_zh`、`integrity_score`（完好分）、`damage_index` / `damage_level`、`estimated_remaining_life_years`、`replace_recommendation`、`electricity_risk_note`、`evidence_hints` 等。
  - `summary`：`electric_appliance_detections`、`needs_attention`、`electric_anomaly_overview`（与市电曲线交叉核对的文字提示）。

**fetch 示例**

```ts
const fd = new FormData();
fd.append("file", file);
const qs = new URLSearchParams();
// qs.set("prompt", "person,chair,desk");
// qs.set("mode", "yolo12");
// qs.set("conf", "0.05");
// qs.set("imgsz", "1600");
// qs.set("iou", "0.4");
const r = await fetch(`${API_BASE}/api/v2/vision/upload?${qs}`, {
  method: "POST",
  body: fd,
  cache: "no-store",
});
```

#### `GET /api/v2/twin/scene`

返回数字孪生场景映射数据（楼层/房间状态 + 颜色图例）。

#### `GET /api/v2/ops/indicators`

返回运营核心指标（EWI / SU / DH，演示近似计算）。

#### `GET /api/v2/ops/suggestions`

基于指标自动生成运营优化建议清单（含优先级）。

#### `GET /api/v2/forecast/energy`

Query：`building_id`（可选）、`horizon_hours`（默认 24）。

- 优先 **Prophet**：训练样本不少于约 48 点时启用；`yhat` **非负裁剪**；样本不少于约 **336** 点时开启**周季节**；`changepoint_prior_scale` 与 `seasonality_mode`（小均值用加性、较大均值用乘性）按数据自适应。
- 回退 **`naive_moving_average`**：基于尾部滑动均值、标准差约束的日周期振荡与**阻尼趋势**（对比近窗与前一窗均值），避免简单正弦系数抖动。

#### `GET /api/v2/reports/{kind}`

- `kind`: `operations` 或 `esg`
- Query: `file_format=word|pdf`，`building_id`（可选）
- `word`：真实 `.docx`（依赖 `python-docx`）；`pdf`：ReportLab 生成（优先注册系统中文字体，失败时可能降级）

---

## 4. 前端集成示例（fetch）

### 4.1 基址配置

```ts
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8765";
const p = (path: string) => `${API_BASE.replace(/\/$/, "")}${path}`;
```

### 4.2 GET 示例

```ts
const r = await fetch(p("/api/stats/timeseries?building_id=Bobcat_education_Alissa&metric=electricity_kwh&limit=500"));
const data = await r.json();
if (!r.ok) throw new Error(JSON.stringify(data));
```

### 4.3 POST JSON 示例

```ts
const r = await fetch(p("/api/assistant/rag-answer"), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "建筑节能规范", kb_limit: 8, sikong_limit: 5 }),
});
const data = await r.json();
```

### 4.4 与开发服务器同源代理

若前端 dev server 将 `/api` 代理到后端，则浏览器请求 **`/api/...`** 且 **`API_BASE` 置空** 即可，避免 CORS。

---

## 5. 与赛题能力的对应关系（便于写说明书）

| 赛题能力 | 主要接口 |
|----------|----------|
| 能耗查询 | `GET /api/energy/records` |
| 统计（时段/COP/异常） | `/api/stats/period`、`cop-proxy`、`anomalies` |
| 可视化 | `GET /api/stats/timeseries` |
| 报表 | `GET /api/stats/export/csv` |
| 领域关键词检索（调试/管理） | `GET /api/kb/search`、`GET /api/sikong/search` |
| 领域智能问答（PDF+司空+字典+运维摘要，可选 LLM） | `POST /api/assistant/rag-answer`、`GET /api/assistant/llm-status` |
| MCP 映射 | `GET /api/mcp/tools` |
| V2 视觉 / 孪生 / 报告 | `POST /api/v2/vision/upload`、`GET /api/v2/twin/scene`、`GET /api/v2/reports/{kind}`（kind=operations 或 esg）等 |

---

## 6. 变更追踪

接口以 **`/openapi.json`** 与仓库内 FastAPI 路由为准；升级时请 diff OpenAPI。

- **近期**：`POST /api/v2/vision/upload` 支持 Query `conf`；响应含 `yolo`（`conf_used`、`inference_attempts` 等）及演示字段 `asset_health`（电器完好度/更换建议/用电风险提示，启发式）；实现上每次 `set_classes` 后重建 predictor（见 [TECHNICAL.md](./TECHNICAL.md) §3.6）。
- **近期**：知识页改为「智能问答」对话 UI；司空检索对中文问句增加整句匹配与二字滑窗词，以提升自然语言召回。

更多架构说明见 [TECHNICAL.md](./TECHNICAL.md)。
