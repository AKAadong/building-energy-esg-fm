# Qwen2.5-7B-Instruct 领域问答 SFT（LoRA/QLoRA）指南

目标：用你的领域问答数据对 `Qwen2.5-7B-Instruct` 做 **SFT 微调**（推荐 QLoRA），并把产物用于本项目（Xinference + chatchat）。

## 1. 训练产物与部署策略

推荐两步走：

1) 训练得到 **LoRA adapter**（小文件，方便迭代）\n
2) 需要部署时，把 adapter **merge** 到 base 模型权重，得到一个“可直接推理”的目录（便于被 Xinference 加载）\n

本目录提供：
- `train_qlora_sft.py`: QLoRA SFT 训练脚本
- `merge_lora.py`: merge adapter 脚本（输出可部署目录）
- `dataset.example.jsonl`: 数据格式示例
- `requirements.txt`: 建议的训练环境依赖

## 2. 数据格式（jsonl）

每行一个样本，推荐用 OpenAI messages 格式：

```json
{"messages":[{"role":"system","content":"你是司空大数据领域助手。"},{"role":"user","content":"指标A的口径是什么？"},{"role":"assistant","content":"..."}]}
```

最低要求：
- 最后一条必须是 `assistant`
- 至少包含一条 `user`

## 3. 安装训练依赖（建议独立 venv）

```bash
python -m venv .venv-sft
source .venv-sft/bin/activate
python -m pip install -U pip
python -m pip install -r tools/sft/requirements.txt
```

## 4. QLoRA SFT 训练

```bash
export BASE_MODEL="Qwen/Qwen2.5-7B-Instruct"
export TRAIN_FILE="tools/sft/dataset.example.jsonl"
export OUT_DIR="outputs/qwen25-7b-sikong-qlora"

python tools/sft/train_qlora_sft.py \
  --base-model "$BASE_MODEL" \
  --train-file "$TRAIN_FILE" \
  --output-dir "$OUT_DIR" \
  --max-seq-len 2048 \
  --per-device-train-batch-size 1 \
  --gradient-accumulation-steps 8 \
  --learning-rate 2e-4 \
  --num-train-epochs 1
```

提示：
- 显存紧张时优先增大 `gradient_accumulation_steps`，不要硬加 batch size。\n
- 若数据量大，建议使用 `--max-steps` 或更小学习率 + 多 epoch。\n

## 5. 合并 LoRA（生成可部署模型目录）

```bash
export BASE_MODEL="Qwen/Qwen2.5-7B-Instruct"
export LORA_DIR="outputs/qwen25-7b-sikong-qlora"
export MERGED_DIR="outputs/qwen25-7b-sikong-merged"

python tools/sft/merge_lora.py \
  --base-model "$BASE_MODEL" \
  --lora-dir "$LORA_DIR" \
  --output-dir "$MERGED_DIR"
```

合并后目录一般可被 Xinference 以“本地模型路径”方式加载（按你的 Xinference 管理方式设置本地路径即可）。

## 6. 在 chatchat 中使用微调后的模型

在 `CHATCHAT_ROOT/model_settings.yaml` 中把默认模型切到你的模型名（示例）：

```yaml
DEFAULT_LLM_MODEL: qwen25-7b-sikong
```

并确保对应模型平台（Xinference/OpenAI-compatible）的 `api_base_url` 与 `model` 名称配置正确。

## 7. Xinference 加载建议（最小可行）

Xinference 作为推理侧运行后，chatchat 通过 OpenAI-compatible 的方式调用它。

- **base 模型**：可直接在 Xinference UI/API 中启动 `Qwen2.5-7B-Instruct`
- **微调模型**：推荐使用 “merge 后的本地目录”（`tools/sft/merge_lora.py` 输出）作为模型路径加载

项目说明与部署背景见上游仓库：[`chatchat-space/Langchain-Chatchat`](https://github.com/chatchat-space/Langchain-Chatchat)。

