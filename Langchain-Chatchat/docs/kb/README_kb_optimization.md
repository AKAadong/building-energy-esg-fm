# 知识库（司空大数据）导入与评测指南

本文档目标：把你的“司空大数据”资料快速、可重复地导入知识库，并用一套最小评测闭环（检索召回@k）来指导参数调优。

## 1. 推荐的知识库拆分方式

建议按“业务域/数据域”拆分多个知识库，而不是把所有内容塞进一个库：

- `sikong_core`: 核心概念、指标口径、术语表
- `sikong_policy`: 规范/制度/流程（经常被引用、改版频率中等）
- `sikong_manuals`: 操作手册/产品说明（长 PDF 为主）
- `sikong_faq`: 高质量 FAQ / 工单沉淀（适合后续 SFT）

拆分的好处：
- 检索空间变小 → 命中更准、更省 token
- 调参更容易（不同库可用不同 chunking/top_k/threshold）
- 访问控制与更新更清晰

## 2. 批量导入（文件夹 → 知识库）

仓库提供脚本：`tools/kb/bulk_import.py`，通过 API 批量上传并向量化。

### 2.1 前置条件

- chatchat API 正常运行（默认 `http://127.0.0.1:7861`）
- Xinference 已启动并加载 embedding 模型（用于向量化）

### 2.2 使用示例

```bash
export CHATCHAT_API_BASE="http://127.0.0.1:7861"

python tools/kb/bulk_import.py \
  --kb sikong_manuals \
  --path /data/sikong/pdfs \
  --pattern "*.pdf" \
  --chunk-size 900 \
  --chunk-overlap 180 \
  --zh-title-enhance true
```

## 3. 最小评测闭环（检索召回@k）

### 3.1 评测数据格式（jsonl）

示例：`tools/kb/eval_dataset.example.jsonl`

每行一个样本：

```json
{"kb_name":"sikong_core","question":"指标A的口径是什么？","must_contain":["口径","指标A"],"top_k":5}
```

说明：
- `must_contain`：用于判断是否“召回命中”的关键片段（你可以用更稳定的短语）\n
- `top_k`：允许对不同问题设置不同 top_k（缺省会用脚本参数）\n

### 3.2 运行评测

```bash
export CHATCHAT_API_BASE="http://127.0.0.1:7861"

python tools/kb/eval_retrieval.py \
  --dataset tools/kb/eval_dataset.example.jsonl \
  --default-top-k 5 \
  --score-threshold 1.0
```

输出将给出：
- overall hit-rate（命中率）
- 按 kb_name 分组的命中率

## 4. 调参建议（先从这几个旋钮开始）

- `chunk_size / chunk_overlap`：书籍 PDF 通常建议更大（例如 800~1200），overlap 150~250。
- `VECTOR_SEARCH_TOP_K`：先从 5 开始，召回不足再增大。
- `SCORE_THRESHOLD`：先不要卡得太严，等召回稳定再逐步收紧。
- `PDF_CLEANUP_*`：遇到目录/页眉页脚噪声重的 PDF，保持开启能明显减少“无效 chunk”。\n

