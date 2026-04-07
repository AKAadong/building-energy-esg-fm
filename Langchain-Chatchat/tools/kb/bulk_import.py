import argparse
import os
from pathlib import Path
from typing import Iterable, List

from open_chatcaht.api.knowledge_base.knowledge_base_client import KbClient


def iter_files(root: Path, pattern: str) -> Iterable[Path]:
    yield from root.rglob(pattern)


def chunked(xs: List[Path], n: int) -> Iterable[List[Path]]:
    for i in range(0, len(xs), n):
        yield xs[i : i + n]


def main():
    parser = argparse.ArgumentParser(description="Bulk import files to Chatchat knowledge base via API.")
    parser.add_argument("--kb", required=True, help="knowledge base name, e.g. sikong_manuals")
    parser.add_argument("--kb-info", default="导入的数据知识库", help="knowledge base description")
    parser.add_argument("--path", required=True, help="folder path to import")
    parser.add_argument("--pattern", default="*.pdf", help="glob pattern, e.g. *.pdf / *.md")
    parser.add_argument("--embed-model", default="bge-large-zh-v1.5", help="embedding model name")
    parser.add_argument("--vs-type", default="faiss", help="vector store type, e.g. faiss/milvus/pg")
    parser.add_argument("--chunk-size", type=int, default=900)
    parser.add_argument("--chunk-overlap", type=int, default=180)
    parser.add_argument("--zh-title-enhance", default="true", choices=["true", "false"])
    parser.add_argument("--override", default="false", choices=["true", "false"])
    parser.add_argument("--batch", type=int, default=1, help="upload batch size (files per request)")

    args = parser.parse_args()

    os.environ.setdefault("CHATCHAT_API_BASE", "http://127.0.0.1:7861")
    base_url = os.environ["CHATCHAT_API_BASE"]
    print(f"CHATCHAT_API_BASE={base_url}")

    kb = KbClient()

    try:
        kb.create_kb(
            knowledge_base_name=args.kb,
            kb_info=args.kb_info,
            vector_store_type=args.vs_type,
            embed_model=args.embed_model,
        )
    except Exception as e:
        print("create_kb skipped:", e)

    root = Path(args.path)
    files = sorted([p for p in iter_files(root, args.pattern) if p.is_file()])
    print(f"found_files={len(files)}")

    if not files:
        return

    zh_title_enhance = args.zh_title_enhance.lower() == "true"
    override = args.override.lower() == "true"

    for batch_files in chunked(files, max(1, args.batch)):
        resp = kb.upload_kb_docs(
            files=batch_files,
            knowledge_base_name=args.kb,
            override=override,
            to_vector_store=True,
            chunk_size=args.chunk_size,
            chunk_overlap=args.chunk_overlap,
            zh_title_enhance=zh_title_enhance,
        )
        print(resp)


if __name__ == "__main__":
    main()

