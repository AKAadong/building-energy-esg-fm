import os
from pathlib import Path

from open_chatcaht.api.chat.chat_client import ChatClient
from open_chatcaht.api.knowledge_base.knowledge_base_client import KbClient


def main():
    # IMPORTANT:
    # chatchat API 默认端口是 7861；SDK 默认 CHATCHAT_API_BASE 是 8000
    os.environ.setdefault("CHATCHAT_API_BASE", "http://127.0.0.1:7861")
    base_url = os.environ["CHATCHAT_API_BASE"]
    print(f"CHATCHAT_API_BASE={base_url}")

    kb = KbClient()
    chat = ChatClient()

    kb_name = "sikong_data"

    # 1) 创建知识库（若已存在可忽略失败/自行处理）
    try:
        resp = kb.create_kb(
            knowledge_base_name=kb_name,
            kb_info="司空大数据知识库",
            vector_store_type="faiss",
            embed_model="bge-large-zh-v1.5",
        )
        print("create_kb:", resp)
    except Exception as e:
        print("create_kb skipped:", e)

    # 2) 上传 PDF 入库并向量化
    pdf_path = Path(__file__).parent / "sample.pdf"
    if pdf_path.exists():
        up = kb.upload_kb_docs(
            files=[pdf_path],
            knowledge_base_name=kb_name,
            override=False,
            to_vector_store=True,
            chunk_size=900,
            chunk_overlap=180,
            zh_title_enhance=True,
        )
        print("upload_kb_docs:", up)
    else:
        print(f"skip upload: {pdf_path} not found (put a PDF here to test).")

    # 3) 先检索（非流式）
    docs = kb.search_kb_docs(
        knowledge_base_name=kb_name,
        query="司空大数据的核心指标口径是什么？",
        top_k=5,
        score_threshold=1.0,
    )
    print(f"search_kb_docs: {len(docs)} hits")
    if docs:
        print("first_hit:", {k: docs[0].get(k) for k in ["id", "page_content", "metadata"] if k in docs[0]})

    # 4) 知识库对话（流式 SSE，SDK 返回 generator）
    gen = chat.kb_chat(
        query="请基于知识库解释“主题域”的定义，并给一个业务例子。",
        mode="local_kb",
        kb_name=kb_name,
        top_k=5,
        score_threshold=1.0,
        stream=True,
        model="qwen2.5-7b-instruct",
        temperature=0.2,
        max_tokens=1024,
    )
    for chunk in gen:
        print(chunk)


if __name__ == "__main__":
    main()

