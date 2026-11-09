"""Generates the ProcessHub 360 icon set (a millstone mark). Run: npm run icons"""
import math
from PIL import Image, ImageDraw

GREEN, DARK, TURMERIC, CHALK = (20, 99, 79), (14, 74, 59), (201, 138, 20), (243, 245, 244)

def mark(size, bg=None, fg_only=False, mono=False):
    img = Image.new("RGBA", (size, size), bg or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = size / 2
    r = size * (0.30 if fg_only else 0.36)
    ring = (255, 255, 255, 255) if not mono else (0, 0, 0, 255)
    disc = TURMERIC + (255,) if not mono else (0, 0, 0, 255)
    d.ellipse([c - r, c - r, c + r, c + r], fill=ring)
    r2 = r * 0.82
    d.ellipse([c - r2, c - r2, c + r2, c + r2], fill=disc if not mono else (0, 0, 0, 0))
    # millstone grooves
    gl = (255, 255, 255, 255) if not mono else (0, 0, 0, 255)
    for i in range(8):
        a = math.radians(i * 45 + 12)
        d.line([c + math.cos(a) * r * 0.18, c + math.sin(a) * r * 0.18, c + math.cos(a) * r2 * 0.92, c + math.sin(a) * r2 * 0.92], fill=gl, width=max(2, int(size * 0.014)))
    hub = r * 0.16
    d.ellipse([c - hub, c - hub, c + hub, c + hub], fill=(GREEN + (255,)) if not mono else (0, 0, 0, 255))
    return img

mark(1024, bg=GREEN + (255,)).convert("RGB").save("assets/icon.png")
mark(1024, fg_only=True).save("assets/android-icon-foreground.png")
mark(1024, fg_only=True, mono=True).save("assets/android-icon-monochrome.png")
Image.new("RGBA", (1024, 1024), GREEN + (255,)).save("assets/android-icon-background.png")
mark(1024, bg=(0, 0, 0, 0), fg_only=False).save("assets/splash-icon.png")
mark(256, bg=GREEN + (255,)).convert("RGB").save("assets/favicon.png")
print("icons written")
