"""Sinh icon.png + splash.png + favicon.png cho app Smart Parking (SDK 58)."""
from PIL import Image, ImageDraw, ImageFont

BLUE = (9, 132, 227)
WHITE = (255, 255, 255)
DARK = (44, 62, 80)


def font(size):
    for name in (
        "segoeuib.ttf",
        "arialbd.ttf",
        "arial.ttf",
    ):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def parking_glyph(size, bg, fg):
    img = Image.new("RGB", (size, size), bg)
    d = ImageDraw.Draw(img)
    pad = int(size * 0.12)
    box = [pad, pad, size - pad, size - pad]
    d.rounded_rectangle(box, radius=int(size * 0.16), fill=fg)

    # chu P lau xe
    f = font(int(size * 0.42))
    tx, ty = size / 2, size / 2 - int(size * 0.03)
    bbox = d.textbbox((0, 0), "P", font=f)
    d.text((tx - (bbox[2] - bbox[0]) / 2 - bbox[0], ty - (bbox[3] - bbox[1]) / 2 - bbox[1]),
           "P", font=f, fill=bg)
    return img


def make_icon(path, size=1024):
    img = parking_glyph(size, BLUE, WHITE)
    d = ImageDraw.Draw(img)
    f = font(int(size * 0.12))
    label = "SMART PARKING"
    bbox = d.textbbox((0, 0), label, font=f)
    d.text(((size - (bbox[2] - bbox[0])) / 2 - bbox[0], size * 0.80),
           label, font=f, fill=WHITE)
    img.save(path)
    print("icon:", path, img.size)


def make_splash(path, w=1284, h=2778):
    img = Image.new("RGB", (w, h), BLUE)
    d = ImageDraw.Draw(img)
    glyph = parking_glyph(int(w * 0.34), BLUE, WHITE)
    img.paste(glyph, ((w - glyph.width) // 2, int(h * 0.30)))
    f = font(int(w * 0.075))
    label = "SMART PARKING"
    bbox = d.textbbox((0, 0), label, font=f)
    d.text(((w - (bbox[2] - bbox[0])) / 2 - bbox[0], int(h * 0.30) + glyph.height + int(h * 0.03)),
           label, font=f, fill=WHITE)
    f2 = font(int(w * 0.042))
    sub = "Bai do xe thong minh - LTDD2"
    bbox2 = d.textbbox((0, 0), sub, font=f2)
    d.text(((w - (bbox2[2] - bbox2[0])) / 2 - bbox2[0], int(h * 0.30) + glyph.height + int(h * 0.10)),
           sub, font=f2, fill=(255, 255, 255))
    img.save(path)
    print("splash:", path, img.size)


def make_favicon(path, size=64):
    parking_glyph(size, BLUE, WHITE).save(path)
    print("favicon:", path)


if __name__ == "__main__":
    import os
    os.makedirs("assets", exist_ok=True)
    make_icon("assets/icon.png")
    make_splash("assets/splash.png")
    make_favicon("assets/favicon.png")
    make_icon("assets/adaptive-icon.png")
