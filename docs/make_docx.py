#!/usr/bin/env python3
"""
Sinh file .docx tu file markdown bao cao.
Dung biến moi trong file markdown -> chay lai script -> co file .docx moi.

    python docs/make_docx.py

Input : docs/BaoCao_LTDD2_BaiDoXe.md
Output: docs/BaoCao_LTDD2_BaiDoXe.docx
"""
import re
import sys
from pathlib import Path

from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "BaoCao_LTDD2_BaiDoXe.md"
OUT = ROOT / "docs" / "BaoCao_LTDD2_BaiDoXe.docx"
IMG_DIR = ROOT / "docs" / "anh"

ACCENT = RGBColor(0x09, 0x84, 0xE3)
MAX_IMG_W = Inches(6.0)  # bề rộng tối đa cho ảnh (khung giấy A4 + margin 0.9")
MAX_IMG_H = Inches(4.8)  # chiều cao tối đa (để caption + chữ không bị đẩy sang trang sau)


def add_table(doc, rows):
    if len(rows) < 2:
        return
    ncol = len(rows[0])
    table = doc.add_table(rows=0, cols=ncol)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, row in enumerate(rows):
        cells = table.add_row().cells
        for j, val in enumerate(row):
            cells[j].text = val
            for p in cells[j].paragraphs:
                for r in p.runs:
                    r.font.size = Pt(10)
                    if i == 0:
                        r.bold = True
    doc.add_paragraph()


def add_image(doc, md_path, alt):
    """
    Chup anh tu markdown vao docx.

    Duong dan trong markdown:
      - tuong doi voi file markdown  :  anh/wokwi-oled.png
      - tuong doi voi thu muc docs/   :  docs/anh/wokwi-oled.png
      - tuong doi voi thu muc repo   :  anh/wokwi-oled.png
    """
    md_path = Path(md_path)
    cand = [
        md_path.parent / md_path,
        IMG_DIR / md_path.name,
        ROOT / md_path,
        IMG_DIR.parent / md_path,
    ]
    # thu gia dien ban : docs/anh/foo.png -> anh/foo.png
    p = md_path
    if p.parts and p.parts[0] == "docs":
        cand.append(IMG_DIR / Path(*p.parts[1:]))
    if p.parts and p.parts[0] == "anh":
        cand.append(ROOT / p)

    img_path = None
    for c in cand:
        try:
            if c.exists() and c.is_file():
                img_path = c
                break
        except OSError:
            continue

    if img_path is None:
        print(f"  [!] Khong tim thay anh: {md_path}")
        # ghi chu thay vi bo qua im lang
        p = doc.add_paragraph()
        r = p.add_run(f"[Thiếu ảnh: {md_path}]")
        r.italic = True
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(0xAA, 0x00, 0x00)
        return False

    # Chon kich thuoc: gioi han ca bo rong va cao, giu ti le
    try:
        from PIL import Image
        with Image.open(img_path) as im:
            iw, ih = im.size
    except Exception:
        iw, ih = 1600, 900
    scale = min(MAX_IMG_W / iw, MAX_IMG_H / ih)
    w = int(iw * scale)
    h = int(ih * scale)

    doc.add_picture(str(img_path), width=w, height=h)
    # canh giua anh
    last = doc.paragraphs[-1]
    last.alignment = WD_ALIGN_PARAGRAPH.CENTER
    last.paragraph_format.space_before = Pt(6)
    last.paragraph_format.space_after = Pt(2)

    # caption
    cap = doc.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = cap.add_run(alt.strip())
    r.italic = True
    r.font.size = Pt(10)
    r.font.color.rgb = RGBColor(0x55, 0x55, 0x55)
    cap.paragraph_format.space_after = Pt(10)
    return True


def build():
    if not SRC.exists():
        print(f"Khong tim thay {SRC}")
        sys.exit(1)

    lines = SRC.read_text(encoding="utf-8").splitlines()

    doc = Document()
    normal = doc.styles["Normal"]
    normal.font.name = "Times New Roman"
    normal.font.size = Pt(13)
    for s in doc.sections:
        s.left_margin = s.right_margin = Inches(0.9)

    i = 0
    in_code = False
    code_buf = []
    table_buf = []

    def flush_table():
        nonlocal table_buf
        if table_buf:
            add_table(doc, table_buf)
            table_buf = []

    while i < len(lines):
        line = lines[i].rstrip()

        # code block
        if line.strip().startswith("```"):
            if in_code:
                for cl in code_buf:
                    p = doc.add_paragraph()
                    p.paragraph_format.left_indent = Inches(0.35)
                    run = p.add_run(cl)
                    run.font.name = "Consolas"
                    run.font.size = Pt(9)
                code_buf = []
            in_code = not in_code
            i += 1
            continue
        if in_code:
            code_buf.append(line)
            i += 1
            continue

        # bang markdown
        if line.strip().startswith("|") and line.strip().endswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                i += 1
                continue
            table_buf.append(cells)
            i += 1
            continue
        flush_table()

        # anh: ![mo ta](duong/dan.png)
        m = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)\s*$", line.strip())
        if m:
            add_image(doc, m.group(2), m.group(1))
            i += 1
            continue

        # tieu de
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            level, text = len(m.group(1)), m.group(2).strip()
            if level == 1:
                doc.add_heading(text, 0)
            elif level == 2:
                doc.add_heading(text, 1)
            else:
                doc.add_heading(text, 2)
            i += 1
            continue

        # danh sach
        m = re.match(r"^\s*[-*]\s+(.*)$", line)
        if m:
            doc.add_paragraph(m.group(1).strip(), style="List Bullet")
            i += 1
            continue
        m = re.match(r"^\s*(\d+)\.\s+(.*)$", line)
        if m:
            doc.add_paragraph(m.group(2).strip(), style="List Number")
            i += 1
            continue

        # dong trang
        if not line.strip():
            i += 1
            continue

        # dong thuong (bo ky tu markdown inline)
        text = re.sub(r"\*\*(.+?)\*\*", r"\1", line)
        text = re.sub(r"`(.+?)`", r"\1", text)
        text = re.sub(r"\[(.+?)\]\((.+?)\)", r"\1 (\2)", text)
        p = doc.add_paragraph(text)
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        i += 1

    flush_table()
    doc.save(OUT)
    print(f"Da tao {OUT}")


if __name__ == "__main__":
    build()
