import os
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    """加载 backend/.env。使用 override=True，避免系统/IDE 里空变量的 LLM_API_KEY 挡住 .env。"""
    try:
        from dotenv import load_dotenv

        load_dotenv(_BACKEND / ".env", override=True, encoding="utf-8-sig")
    except Exception:
        pass


_load_dotenv()


def _env_str(*keys: str) -> str:
    """依次读取环境变量，去空白；支持去掉首尾引号。"""
    for k in keys:
        v = os.environ.get(k)
        if v is None:
            continue
        v = v.strip()
        if len(v) >= 2 and ((v[0] == v[-1] == '"') or (v[0] == v[-1] == "'")):
            v = v[1:-1].strip()
        if v:
            return v
    return ""


_REPO = _BACKEND.parent
# 仓库根目录的上级（通常为「BDG数据集」工作区，与 building_energy_system 并列放 bdg_cleaned_output、sft_merged）
_WORKSPACE = _REPO.parent


def _path_file(env_key: str, *candidates: Path) -> Path:
    v = os.environ.get(env_key)
    if v:
        return Path(v)
    for p in candidates:
        if p.is_file():
            return p
    return candidates[0]


def _path_dir(env_key: str, *candidates: Path) -> Path:
    v = os.environ.get(env_key)
    if v:
        return Path(v)
    for p in candidates:
        if p.is_dir():
            return p
    return candidates[0]


class Settings:
    energy_csv: Path = _path_file(
        "ENERGY_CSV",
        _WORKSPACE / "bdg_cleaned_output" / "building_energy_hourly.csv",
        _REPO / "bdg_cleaned_output" / "building_energy_hourly.csv",
    )
    metadata_csv: Path = _path_file(
        "METADATA_CSV",
        _WORKSPACE / "bdg_cleaned_output" / "metadata_subset.csv",
        _REPO / "bdg_cleaned_output" / "metadata_subset.csv",
    )
    data_dictionary_csv: Path = _path_file(
        "DATA_DICTIONARY_CSV",
        _WORKSPACE / "bdg_cleaned_output" / "data_dictionary.csv",
        _REPO / "bdg_cleaned_output" / "data_dictionary.csv",
    )
    # 规范 PDF 目录：优先项目内 kb_documents，其次工作区根下同名或旧目录名
    kb_root: Path = _path_dir(
        "KB_ROOT",
        _REPO / "kb_documents",
        _WORKSPACE / "kb_documents",
        _WORKSPACE / "知识库所需文档",
        _REPO / "知识库所需文档",
    )
    kb_index_db: Path = _path_file("KB_INDEX_DB", _BACKEND / "data" / "kb_index.sqlite")
    # 司空合并语料 jsonl（merge_sikong_sft.py 生成）
    sikong_jsonl: Path = _path_file(
        "SIKONG_JSONL",
        _WORKSPACE / "sft_merged" / "sikong_sft_all.jsonl",
        _REPO / "sft_merged" / "sikong_sft_all.jsonl",
    )

    api_prefix: str = os.environ.get("API_PREFIX", "/api")
    cors_origins: list[str] = os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")

    # OpenAI 兼容接口（Ollama: http://127.0.0.1:11434/v1 ；硅基/通义等填各自 base）
    @property
    def llm_api_base(self) -> str | None:
        v = os.environ.get("LLM_API_BASE", "").strip()
        return v or None

    @property
    def llm_api_key(self) -> str:
        # 百炼控制台常用名 DASHSCOPE_API_KEY，与 LLM_API_KEY 等价
        return _env_str("LLM_API_KEY", "DASHSCOPE_API_KEY")

    @property
    def llm_model(self) -> str:
        v = os.environ.get("LLM_MODEL", "gpt-4o-mini").strip()
        return v or "gpt-4o-mini"

    @property
    def llm_timeout_sec(self) -> float:
        try:
            return float(os.environ.get("LLM_TIMEOUT_SEC", "90"))
        except ValueError:
            return 90.0

    # Langchain-Chatchat 远程服务：HTTP API 根地址，如 http://192.168.1.10:7861
    @property
    def chatchat_base_url(self) -> str | None:
        v = os.environ.get("CHATCHAT_BASE_URL", "").strip()
        return v or None

    @property
    def chatchat_timeout_sec(self) -> float:
        try:
            return float(os.environ.get("CHATCHAT_TIMEOUT_SEC", "180"))
        except ValueError:
            return 180.0


settings = Settings()
