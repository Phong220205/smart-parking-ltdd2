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
IMG_DIR = ROOT / "docs" / "anh"

ACCENT = RGBColor(0x09, 0x84, 0xE3)
DARK = RGBColor(0x2C, 0x3E, 0x50)
GREY = RGBColor(0x63, 0x6E, 0x72)

IMG_MAX_W = Inches(6.0)   # be rong toi da cua anh
IMG_MAX_H = Inches(4.2)   # chieu cao toi da


def resolve_img(md_path):
    """Tim file anh theo duong dan trong markdown. Tra ve Path hoac None."""
    p = Path(md_path)
    cand = [
        IMG_DIR / p.name,
        ROOT / p,
        IMG_DIR.parent / p,
        p,
    ]
    if p.parts and p.parts[0] == "docs":
        cand.append(IMG_DIR / Path(*p.parts[1:]))
    if p.parts and p.parts[0] == "anh":
        cand.append(ROOT / p)
    for c in cand:
        try:
            if c.exists() and c.is_file():
                return c
        except OSError:
            continue
    return None


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
            cur = {"title": m.group(1).strip(), "bullets": [], "table": [], "code": [], "images": [], "in_code": False}
            continue
        if cur is None:
            continue
        if line.strip().startswith("```"):
            cur["in_code"] = not cur["in_code"]
            continue
        if cur["in_code"]:
            cur["code"].append(line)
            continue
        # anh: ![mo ta](duong/dan.png)
        mimg = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)\s*$", line.strip())
        if mimg:
            cur["images"].append((mimg.group(2), mimg.group(1)))
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

        # --- quyet dinh bo cuc: co anh hay khong ---
        imgs = []
        for md_path, alt in data.get("images", []):
            resolved = resolve_img(md_path)
            if resolved is None:
                print(f"  [!] Khong tim thay anh (slide '{data['title']}'): {md_path}")
            else:
                imgs.append((resolved, alt))
        n_img = len(imgs)

        body = sl.placeholders[1]
        tf = body.text_frame
        tf.clear()
        tf.word_wrap = True

        # Neu co anh -> phai text o ben trai, anh o ben phai
        if n_img:
            body.left = Inches(0.5)
            body.top = Inches(1.5)
            body.width = Inches(6.2)
            body.height = Inches(5.4)
        else:
            body.left = Inches(0.7)
            body.top = Inches(1.6)
            body.width = Inches(11.9)
            body.height = Inches(5.3)

        bullets = data["bullets"]
        # neu co bang -> them bang vao noi dung
        font_pt = Pt(13) if n_img else Pt(15)
        for i, b in enumerate(bullets):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            text = re.sub(r"\*\*(.+?)\*\*", r"\1", b)
            text = re.sub(r"`(.+?)`", r"\1", text)
            p.text = text
            p.level = 0
            p.font.size = font_pt
            p.space_after = Pt(6)

        if data["table"]:
            rows = data["table"]
            ncol = len(rows[0])
            if n_img:
                gt = sl.shapes.add_table(len(rows), ncol, Inches(0.5), Inches(4.4),
                                         Inches(6.2), Inches(0.35 * len(rows))).table
            else:
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
            if n_img:
                tb = sl.shapes.add_textbox(Inches(0.5), Inches(4.6), Inches(6.2), Inches(2.3))
            else:
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

        # --- chen anh vao slide ---
        if imgs:
            from PIL import Image
            area_x = Inches(7.0) if n_img else Inches(0.7)
            area_w = Inches(5.9) if n_img else Inches(11.9)
            area_y = Inches(1.6)
            # chua cho caption (0.35") + du phong
            area_h = Inches(5.3) - Inches(0.45)
            n = len(imgs)
            # chia chieu doc cho nhieu anh, moi anh chua them caption 0.35"
            cap_h = Inches(0.35)
            slot_h = (area_h - cap_h * n - Inches(0.15) * (n - 1)) / n
            for k, (img_file, alt) in enumerate(imgs):
                try:
                    with Image.open(img_file) as im:
                        iw, ih = im.size
                except Exception:
                    iw, ih = 1600, 900
                # quy ve kich thuoc slot, giu ti le
                scale = min(area_w / iw, slot_h / ih)
                w = int(iw * scale)
                h = int(ih * scale)
                left = int(area_x + (area_w - w) / 2)
                top = int(area_y + k * (slot_h + cap_h + Inches(0.15)))
                sl.shapes.add_picture(str(img_file), left, top, width=w, height=h)
                # caption ngay duoi anh (area_x/slot_h da la EMU - khong boc them Inches)
                cap = sl.shapes.add_textbox(area_x, top + h, area_w, cap_h)
                ctf = cap.text_frame
                ctf.word_wrap = True
                cp = ctf.paragraphs[0]
                cp.text = f"Hình {k + 1}: {alt}"
                cp.alignment = PP_ALIGN.CENTER
                for r in cp.runs:
                    r.font.size = Pt(9)
                    r.font.italic = True
                    r.font.color.rgb = GREY

    prs.save(OUT)
    print(f"Da tao {OUT} ({len(slides) + 1} slide)")


if __name__ == "__main__":
    build()
