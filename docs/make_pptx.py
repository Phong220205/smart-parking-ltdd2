#!/usr/bin/env python3
"""
Sinh file .pptx tu file markdown slide.
Sua markdown -> chay lai script -> co file .pptx moi.

    python docs/make_pptx.py

Input : docs/Slide_ThuyetTrinh.md
Output: docs/Slide_ThuyetTrinh.pptx
"""
import re
import sys
from pathlib import Path

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "Slide_ThuyetTrinh.md"
OUT = ROOT / "docs" / "Slide_ThuyetTrinh.pptx"

ACCENT = RGBColor(0x09, 0x84, 0xE3)
DARK = RGBColor(0x2C, 0x3E, 0x50)
GREY = RGBColor(0x63, 0x6E, 0x72)


def parse_slides(text):
    """Chia markdown thanh cac slide. Tieu de bat dau bang '### Slide'."""
    slides = []
    cur = None
    for raw in text.splitlines():
        line = raw.rstrip()
        m = re.match(r"^###\s+(.*)$", line)
        if m:
            if cur:
                slides.append(cur)
            cur = {"title": m.group(1).strip(), "bullets": [], "table": [], "code": [], "in_code": False}
            continue
        if cur is None:
            continue
        if line.strip().startswith("```"):
            cur["in_code"] = not cur["in_code"]
            continue
        if cur["in_code"]:
            cur["code"].append(line)
            continue
        # dong trong -> ket thuc code block trong slide
        if line.strip().startswith("|") and line.strip().endswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                continue
            cur["table"].append(cells)
            continue
        if cur["table"]:
            cur["table"] = []  # chi giu bang cuoi cung
        m = re.match(r"^\s*[-*]\s+(.*)$", line)
        if m:
            cur["bullets"].append(m.group(1).strip())
            continue
        m = re.match(r"^\s*(\d+)\.\s+(.*)$", line)
        if m:
            cur["bullets"].append(m.group(2).strip())
            continue
        if line.strip().startswith("---"):
            continue
        if line.strip():
            cur["bullets"].append(line.strip())
    if cur:
        slides.append(cur)
    return slides


def build():
    if not SRC.exists():
        print(f"Khong tim thay {SRC}")
        sys.exit(1)

    slides = parse_slides(SRC.read_text(encoding="utf-8"))
    if not slides:
        print("Khong tim thay slide nao (can tieu de bat dau bang '### Slide')")
        sys.exit(1)

    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    # Slide bia
    s0 = prs.slides.add_slide(prs.slide_layouts[0])
    s0.shapes.title.text = "BÃI ĐỖ XE THÔNG MINH"
    s0.placeholders[1].text = "SMART PARKING — Đồ án Lập Trình Di Động 2\nESP32 + MQTT (Mosquitto) + React Native Expo\n\nMô phỏng 100% — không cần phần cứng\nNhóm: ...  |  Lớp: ...  |  GVHD: ..."

    for data in slides:
        sl = prs.slides.add_slide(prs.slide_layouts[1])
        sl.shapes.title.text = data["title"]
        title_tf = sl.shapes.title.text_frame
        for p in title_tf.paragraphs:
            for r in p.runs:
                r.font.size = Pt(30)
                r.font.bold = True
                r.font.color.rgb = DARK

        body = sl.placeholders[1]
        tf = body.text_frame
        tf.clear()
        tf.word_wrap = True

        bullets = data["bullets"]
        # neu co bang -> them bang vao noi dung
        for i, b in enumerate(bullets):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            text = re.sub(r"\*\*(.+?)\*\*", r"\1", b)
            text = re.sub(r"`(.+?)`", r"\1", text)
            p.text = text
            p.level = 0
            p.font.size = Pt(15)
            p.space_after = Pt(6)

        if data["table"]:
            rows = data["table"]
            ncol = len(rows[0])
            gt = sl.shapes.add_table(len(rows), ncol, Inches(0.7), Inches(4.0),
                                     Inches(11.9), Inches(0.4 * len(rows))).table
            for ri, row in enumerate(rows):
                for ci, val in enumerate(row):
                    cell = gt.cell(ri, ci)
                    cell.text = val
                    for p in cell.text_frame.paragraphs:
                        for r in p.runs:
                            r.font.size = Pt(11)
                            if ri == 0:
                                r.font.bold = True
                                r.font.color.rgb = ACCENT
        elif data["code"]:
            tb = sl.shapes.add_textbox(Inches(0.7), Inches(4.1), Inches(11.9), Inches(2.8))
            tf2 = tb.text_frame
            tf2.word_wrap = True
            for i, cl in enumerate(data["code"]):
                p = tf2.paragraphs[0] if i == 0 else tf2.add_paragraph()
                p.text = cl
                for r in p.runs:
                    r.font.name = "Consolas"
                    r.font.size = Pt(11)
                    r.font.color.rgb = GREY

    prs.save(OUT)
    print(f"Da tao {OUT} ({len(slides) + 1} slide)")


if __name__ == "__main__":
    build()
