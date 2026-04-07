#!/usr/bin/env python3
"""
根据 Xinference GET /v1/models 中**已在跑**的模型，自动写入 Chatchat 的 model_settings.yaml：
  DEFAULT_LLM_MODEL、DEFAULT_EMBEDDING_MODEL

优先使用环境变量（若该模型确实在列表中）：
  XF_LLM_MODEL_NAME / DEFAULT_LLM_MODEL
  XF_EMBED_MODEL_NAME / DEFAULT_EMBEDDING_MODEL

关闭自动同步：AUTO_SYNC_MODELS=0
仅标准库，可在任意有 Python3 的环境执行。
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request

CHATCHAT_ROOT = os.environ.get("CHATCHAT_ROOT", "/root/chatchat_data")
MODEL_SETTINGS = os.path.join(CHATCHAT_ROOT, "model_settings.yaml")

# OpenAI 兼容根，如 http://xinference:9997/v1
XINFERENCE_OPENAI = os.environ.get("XINFERENCE_OPENAI", "http://127.0.0.1:9997/v1").rstrip("/")
MODELS_URL = XINFERENCE_OPENAI + "/models"

PREF_LLM = (
    os.environ.get("XF_LLM_MODEL_NAME")
    or os.environ.get("DEFAULT_LLM_MODEL")
    or ""
).strip()
PREF_EMB = (
    os.environ.get("XF_EMBED_MODEL_NAME")
    or os.environ.get("DEFAULT_EMBEDDING_MODEL")
    or ""
).strip()


def http_get_json(url: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={"Accept": "application/json"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw) if raw else {}


def list_model_entries(payload: dict | list) -> list[dict]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    data = payload.get("data") or payload.get("models") or []
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    return []


def classify(entries: list[dict]) -> tuple[list[str], list[str]]:
    llms: list[str] = []
    embeds: list[str] = []
    for m in entries:
        mid = str(m.get("id") or m.get("model_uid") or m.get("name") or "").strip()
        if not mid:
            continue
        mt = str(m.get("model_type") or m.get("type") or "").lower()
        if "embed" in mt:
            embeds.append(mid)
            continue
        if "llm" in mt or "language" in mt or "chat" in mt:
            llms.append(mid)
            continue
        low = mid.lower()
        if any(
            k in low
            for k in (
                "embed",
                "bge",
                "bce-embedding",
                "text-embedding",
                "e5-",
                "m3",
                "embedding",
            )
        ):
            embeds.append(mid)
        else:
            llms.append(mid)
    return llms, embeds


def pick(preferred: str, pool: list[str], kind: str) -> str | None:
    if not pool:
        return None
    if preferred and preferred in pool:
        return preferred
    return pool[0]


def patch_yaml(path: str, llm: str, emb: str) -> None:
    with open(path, encoding="utf-8") as f:
        text = f.read()
    for key, val in (("DEFAULT_LLM_MODEL", llm), ("DEFAULT_EMBEDDING_MODEL", emb)):

        def _sub(m: re.Match) -> str:
            return f"{m.group(1)}{val}"

        new_text, n = re.subn(
            r"^(" + re.escape(key) + r":\s*)(.+)$",
            _sub,
            text,
            count=1,
            flags=re.MULTILINE,
        )
        if n:
            text = new_text
        else:
            print(f"[sync] warning: 未找到键 {key}，跳过", file=sys.stderr)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def main() -> int:
    if os.environ.get("AUTO_SYNC_MODELS", "1").strip() == "0":
        print("[sync] AUTO_SYNC_MODELS=0，跳过。", file=sys.stderr)
        return 0
    if not os.path.isfile(MODEL_SETTINGS):
        print(f"[sync] 无 {MODEL_SETTINGS}，跳过。", file=sys.stderr)
        return 0
    try:
        payload = http_get_json(MODELS_URL)
    except (urllib.error.URLError, OSError, json.JSONDecodeError) as e:
        print(f"[sync] 无法拉取 {MODELS_URL}: {e}", file=sys.stderr)
        return 0
    entries = list_model_entries(payload)
    llms, embeds = classify(entries)
    llm = pick(PREF_LLM, llms, "LLM")
    emb = pick(PREF_EMB, embeds, "embedding")
    if not llm or not emb:
        print(
            f"[sync] 运行中模型不足（LLM={llms!r}, embedding={embeds!r}），不修改 yaml。",
            file=sys.stderr,
        )
        return 0
    patch_yaml(MODEL_SETTINGS, llm, emb)
    print(
        f"[sync] 已写入 {MODEL_SETTINGS}: DEFAULT_LLM_MODEL={llm}, DEFAULT_EMBEDDING_MODEL={emb}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
