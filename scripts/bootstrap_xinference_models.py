#!/usr/bin/env python3
"""
在 Xinference 就绪后，尝试自动拉起默认 LLM 与 Embedding（幂等）。
若内置模型名与当前 Xinference 版本不一致导致失败，请打开 http://<host>:9997 在 UI 中手动启动，
并令 Chatchat 的 DEFAULT_LLM_MODEL / DEFAULT_EMBEDDING_MODEL 与运行中的 model_uid 一致。
仅使用标准库，便于 slim 镜像运行。
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("XINFERENCE_ENDPOINT", "http://xinference:9997").rstrip("/")

LLM_NAME = os.environ.get("XF_LLM_MODEL_NAME", "qwen2-instruct")
LLM_SIZE = float(os.environ.get("XF_LLM_SIZE", "0.5"))
LLM_ENGINE = os.environ.get("XF_LLM_ENGINE", "Transformers")
LLM_QUANT = os.environ.get("XF_LLM_QUANT", "none")
EMBED_NAME = os.environ.get("XF_EMBED_MODEL_NAME", "bge-small-zh-v1.5")
# 空字符串 -> JSON null（CPU）
N_GPU_RAW = os.environ.get("XF_N_GPU", "").strip()
N_GPU: str | None = N_GPU_RAW if N_GPU_RAW else None


def http_json(method: str, url: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Cookie": "token=no_auth",
        },
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        raw = resp.read()
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def list_running_models() -> list:
    try:
        out = http_json("GET", f"{BASE}/v1/models")
    except urllib.error.URLError as e:
        print(f"[bootstrap] list models failed: {e}", file=sys.stderr)
        return []
    # OpenAI 风格: { data: [...] } 或 直接列表
    if isinstance(out, list):
        return out
    data = out.get("data") or out.get("models") or []
    return data if isinstance(data, list) else []


def model_running(models: list, model_type: str, name_substrings: list[str]) -> bool:
    for m in models:
        if not isinstance(m, dict):
            continue
        mt = str(m.get("model_type") or m.get("type") or "").lower()
        if model_type == "llm" and mt and "llm" not in mt and "language" not in mt:
            continue
        if model_type == "embedding" and mt and "embed" not in mt:
            continue
        uid = str(m.get("id") or m.get("model_uid") or m.get("name") or "")
        name = str(m.get("model_name") or m.get("name") or "")
        hay = (uid + " " + name).lower()
        for s in name_substrings:
            if s.lower() in hay:
                return True
    return False


def launch_llm() -> None:
    body = {
        "model_uid": None,
        "model_name": LLM_NAME,
        "model_type": "LLM",
        "model_engine": LLM_ENGINE,
        "model_size_in_billions": LLM_SIZE,
        "quantization": LLM_QUANT,
        "replica": 1,
        "n_gpu": N_GPU,
    }
    print(f"[bootstrap] launching LLM: {body}", file=sys.stderr)
    http_json("POST", f"{BASE}/v1/models", body)


def launch_embed() -> None:
    body = {
        "model_uid": EMBED_NAME.replace(".", "-").replace("_", "-")[:32],
        "model_name": EMBED_NAME,
        "model_type": "embedding",
        "replica": 1,
        "n_gpu": N_GPU,
    }
    print(f"[bootstrap] launching embedding: {body}", file=sys.stderr)
    http_json("POST", f"{BASE}/v1/models", body)


def main() -> int:
    for attempt in range(60):
        try:
            http_json("GET", f"{BASE}/v1/models")
            break
        except Exception as e:
            print(f"[bootstrap] waiting for xinference... ({e})", file=sys.stderr)
            time.sleep(2)
    else:
        print("[bootstrap] Xinference 未就绪，跳过自动拉模。", file=sys.stderr)
        return 0

    models = list_running_models()
    if not model_running(models, "llm", [LLM_NAME, "qwen", "glm", "chatglm"]):
        try:
            launch_llm()
        except Exception as e:
            print(
                f"[bootstrap] LLM 自动拉起失败（可在 UI 手动启动）: {e}",
                file=sys.stderr,
            )
    else:
        print("[bootstrap] 检测到已有 LLM 在运行，跳过。", file=sys.stderr)

    models = list_running_models()
    if not model_running(models, "embedding", [EMBED_NAME, "bge", "embed"]):
        try:
            launch_embed()
        except Exception as e:
            print(
                f"[bootstrap] Embedding 自动拉起失败（可在 UI 手动启动）: {e}",
                file=sys.stderr,
            )
    else:
        print("[bootstrap] 检测到已有 Embedding 在运行，跳过。", file=sys.stderr)

    print("[bootstrap] 完成。", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
