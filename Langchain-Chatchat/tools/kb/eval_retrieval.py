import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from open_chatcaht.api.knowledge_base.knowledge_base_client import KbClient


@dataclass
class EvalItem:
    kb_name: str
    question: str
    must_contain: List[str]
    top_k: Optional[int] = None


def load_jsonl(path: Path) -> List[EvalItem]:
    items: List[EvalItem] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            items.append(
                EvalItem(
                    kb_name=obj["kb_name"],
                    question=obj["question"],
                    must_contain=list(obj.get("must_contain", [])),
                    top_k=obj.get("top_k"),
                )
            )
    return items


def is_hit(docs: List[Dict], must_contain: List[str]) -> bool:
    if not must_contain:
        return bool(docs)
    hay = "\n".join([(d.get("page_content") or "") for d in docs])
    return all(s in hay for s in must_contain)


def main():
    parser = argparse.ArgumentParser(description="Evaluate retrieval hit-rate@k via /knowledge_base/search_docs.")
    parser.add_argument("--dataset", required=True, help="jsonl dataset path")
    parser.add_argument("--default-top-k", type=int, default=5)
    parser.add_argument("--score-threshold", type=float, default=1.0)
    args = parser.parse_args()

    os.environ.setdefault("CHATCHAT_API_BASE", "http://127.0.0.1:7861")
    print(f"CHATCHAT_API_BASE={os.environ['CHATCHAT_API_BASE']}")

    kb = KbClient()
    items = load_jsonl(Path(args.dataset))
    if not items:
        print("empty dataset")
        return

    total = 0
    hit = 0
    by_kb: Dict[str, Tuple[int, int]] = {}

    for it in items:
        top_k = it.top_k or args.default_top_k
        docs = kb.search_kb_docs(
            knowledge_base_name=it.kb_name,
            query=it.question,
            top_k=top_k,
            score_threshold=args.score_threshold,
        )
        ok = is_hit(docs, it.must_contain)

        total += 1
        hit += 1 if ok else 0

        kb_total, kb_hit = by_kb.get(it.kb_name, (0, 0))
        by_kb[it.kb_name] = (kb_total + 1, kb_hit + (1 if ok else 0))

        print(
            json.dumps(
                {
                    "kb_name": it.kb_name,
                    "hit": ok,
                    "top_k": top_k,
                    "question": it.question,
                },
                ensure_ascii=False,
            )
        )

    print("\n=== Summary ===")
    print(f"overall_hit_rate={hit}/{total} ({hit/total:.3f})")
    for kb_name, (kb_total, kb_hit) in sorted(by_kb.items(), key=lambda x: x[0]):
        print(f"{kb_name}_hit_rate={kb_hit}/{kb_total} ({kb_hit/kb_total:.3f})")


if __name__ == "__main__":
    main()

