# -*- coding: utf-8 -*-
"""One-off: extract word/document.xml text from docx."""
import re
import sys
import zipfile
from pathlib import Path


def docx_to_text(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    text = re.sub(r"<w:p[^>]*>", "\n", xml)
    text = re.sub(r"<w:tab/>", "\t", text)
    text = re.sub(r"<[^>]+>", "", text)
    for ent, ch in (("&lt;", "<"), ("&gt;", ">"), ("&amp;", "&")):
        text = text.replace(ent, ch)
    return text


def main() -> None:
    out_dir = Path(__file__).resolve().parent.parent / "docs"
    out_dir.mkdir(parents=True, exist_ok=True)
    for i, p in enumerate(sys.argv[1:], 1):
        path = Path(p)
        stem = path.stem.replace(" ", "_")[:80]
        out = out_dir / f"_docx_extract_{i}_{stem}.txt"
        out.write_text(docx_to_text(path), encoding="utf-8")
        print(out)


if __name__ == "__main__":
    main()
