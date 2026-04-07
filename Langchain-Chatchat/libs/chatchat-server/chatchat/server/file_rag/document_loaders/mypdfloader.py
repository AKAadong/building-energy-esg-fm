from typing import List

import math
import re
from collections import Counter

import cv2
import numpy as np
import tqdm
from langchain_community.document_loaders.unstructured import UnstructuredFileLoader
from PIL import Image

from chatchat.settings import Settings
from chatchat.server.file_rag.document_loaders.ocr import get_ocr


class RapidOCRPDFLoader(UnstructuredFileLoader):
    def _get_elements(self) -> List:
        def rotate_img(img, angle):
            """
            img   --image
            angle --rotation angle
            return--rotated img
            """

            h, w = img.shape[:2]
            rotate_center = (w / 2, h / 2)
            # 获取旋转矩阵
            # 参数1为旋转中心点;
            # 参数2为旋转角度,正值-逆时针旋转;负值-顺时针旋转
            # 参数3为各向同性的比例因子,1.0原图，2.0变成原来的2倍，0.5变成原来的0.5倍
            M = cv2.getRotationMatrix2D(rotate_center, angle, 1.0)
            # 计算图像新边界
            new_w = int(h * np.abs(M[0, 1]) + w * np.abs(M[0, 0]))
            new_h = int(h * np.abs(M[0, 0]) + w * np.abs(M[0, 1]))
            # 调整旋转矩阵以考虑平移
            M[0, 2] += (new_w - w) / 2
            M[1, 2] += (new_h - h) / 2

            rotated_img = cv2.warpAffine(img, M, (new_w, new_h))
            return rotated_img

        def _normalize_line(s: str) -> str:
            return re.sub(r"\s+", " ", (s or "").strip())

        def _is_page_number_line(s: str) -> bool:
            s = _normalize_line(s)
            if not s:
                return False
            # 纯数字页码 / 常见 “- 12 -” 样式
            return bool(re.fullmatch(r"-?\s*\d+\s*-?", s))

        def _cleanup_pdf_text_by_repetition(pages: List[str]) -> List[str]:
            """
            针对“书籍/文档 PDF”的常见噪声做轻量清洗：
            - 移除跨页重复的页眉/页脚行（只从页首/页尾移除，避免误伤正文）
            - 移除页首/页尾的纯数字页码
            """
            if not Settings.kb_settings.PDF_CLEANUP_ENABLE:
                return pages

            max_lines = max(int(Settings.kb_settings.PDF_HEADER_FOOTER_MAX_LINES), 0)
            if max_lines == 0 or len(pages) < 3:
                return pages

            norm_pages_lines = []
            for p in pages:
                lines = [x for x in (p or "").splitlines()]
                norm_pages_lines.append([_normalize_line(x) for x in lines if _normalize_line(x)])

            n_pages = len(norm_pages_lines)
            min_repeat = float(Settings.kb_settings.PDF_HEADER_FOOTER_MIN_REPEAT)
            min_repeat = min(max(min_repeat, 0.0), 1.0)
            threshold = max(2, math.ceil(n_pages * min_repeat))

            # 收集候选（页首/页尾若干行）
            candidates = []
            for lines in norm_pages_lines:
                head = lines[:max_lines]
                tail = lines[-max_lines:] if max_lines else []
                candidates.extend([x for x in head if 1 <= len(x) <= 80])
                candidates.extend([x for x in tail if 1 <= len(x) <= 80])

            repeated = {
                line
                for line, cnt in Counter(candidates).items()
                if cnt >= threshold and not _is_page_number_line(line)
            }

            cleaned_pages = []
            for raw, lines in zip(pages, norm_pages_lines):
                raw_lines = (raw or "").splitlines()
                # 只在页首/页尾剔除重复行与页码行
                start = 0
                end = len(raw_lines)

                def norm_at(i: int) -> str:
                    return _normalize_line(raw_lines[i]) if 0 <= i < len(raw_lines) else ""

                # trim head
                trimmed = 0
                while start < end and trimmed < max_lines:
                    n = norm_at(start)
                    if not n:
                        start += 1
                        continue
                    if n in repeated or _is_page_number_line(n):
                        start += 1
                        trimmed += 1
                        continue
                    break

                # trim tail
                trimmed = 0
                while end > start and trimmed < max_lines:
                    n = norm_at(end - 1)
                    if not n:
                        end -= 1
                        continue
                    if n in repeated or _is_page_number_line(n):
                        end -= 1
                        trimmed += 1
                        continue
                    break

                page_text = "\n".join(raw_lines[start:end]).strip()
                cleaned_pages.append(page_text)

            return cleaned_pages

        def pdf2text(filepath):
            import fitz  # pyMuPDF里面的fitz包，不要与pip install fitz混淆
            import numpy as np

            ocr = get_ocr()
            doc = fitz.open(filepath)
            page_texts: List[str] = []

            b_unit = tqdm.tqdm(
                total=doc.page_count, desc="RapidOCRPDFLoader context page index: 0"
            )
            for i, page in enumerate(doc):
                b_unit.set_description(
                    "RapidOCRPDFLoader context page index: {}".format(i)
                )
                b_unit.refresh()
                text = page.get_text("") or ""
                page_buf = [text]

                img_list = page.get_image_info(xrefs=True)
                for img in img_list:
                    if xref := img.get("xref"):
                        bbox = img["bbox"]
                        # 检查图片尺寸是否超过设定的阈值
                        if (bbox[2] - bbox[0]) / (page.rect.width) < Settings.kb_settings.PDF_OCR_THRESHOLD[
                            0
                        ] or (bbox[3] - bbox[1]) / (
                            page.rect.height
                        ) < Settings.kb_settings.PDF_OCR_THRESHOLD[1]:
                            continue
                        pix = fitz.Pixmap(doc, xref)
                        samples = pix.samples
                        if int(page.rotation) != 0:  # 如果Page有旋转角度，则旋转图片
                            img_array = np.frombuffer(
                                pix.samples, dtype=np.uint8
                            ).reshape(pix.height, pix.width, -1)
                            tmp_img = Image.fromarray(img_array)
                            ori_img = cv2.cvtColor(np.array(tmp_img), cv2.COLOR_RGB2BGR)
                            rot_img = rotate_img(img=ori_img, angle=360 - page.rotation)
                            img_array = cv2.cvtColor(rot_img, cv2.COLOR_RGB2BGR)
                        else:
                            img_array = np.frombuffer(
                                pix.samples, dtype=np.uint8
                            ).reshape(pix.height, pix.width, -1)

                        result, _ = ocr(img_array)
                        if result:
                            ocr_result = [line[1] for line in result]
                            page_buf.append("\n".join(ocr_result))

                # 更新进度
                b_unit.update(1)
                page_texts.append("\n".join(page_buf))

            page_texts = _cleanup_pdf_text_by_repetition(page_texts)
            # 用换页符分隔，方便后续 splitter/检索定位
            return ("\n\n\f\n\n").join([x for x in page_texts if x])

        text = pdf2text(self.file_path)
        from unstructured.partition.text import partition_text

        return partition_text(text=text, **self.unstructured_kwargs)


if __name__ == "__main__":
    loader = RapidOCRPDFLoader(file_path="/Users/tonysong/Desktop/test.pdf")
    docs = loader.load()
    print(docs)
