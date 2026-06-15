from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math
import subprocess


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
BUILD = ROOT / "build"
ICONSET = BUILD / "icon.iconset"


def lerp(a, b, t):
    return int(a + (b - a) * t)


def gradient(size):
    start = (10, 111, 91)
    mid = (18, 162, 119)
    end = (98, 211, 155)
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            t = (x * 0.42 + y * 0.58) / size
            if t < 0.55:
                local = t / 0.55
                color = tuple(lerp(start[i], mid[i], local) for i in range(3))
            else:
                local = (t - 0.55) / 0.45
                color = tuple(lerp(mid[i], end[i], local) for i in range(3))
            pixels[x, y] = (*color, 255)
    return image


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size, size), radius=radius, fill=255)
    return mask


def draw_logo(size=1024):
    scale = size / 1024
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    rect = tuple(int(v * scale) for v in (112, 104, 912, 904))
    rect_w = rect[2] - rect[0]
    base = gradient(rect_w)
    mask = rounded_mask(rect_w, int(184 * scale))

    shadow = Image.new("RGBA", (rect_w, rect_w), (0, 0, 0, 0))
    shadow.putalpha(mask)
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(28 * scale)))
    shadow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_layer.alpha_composite(shadow, (rect[0], rect[1] + int(28 * scale)))
    tinted_shadow = Image.new("RGBA", (size, size), (6, 61, 52, 70))
    canvas.alpha_composite(Image.composite(tinted_shadow, Image.new("RGBA", (size, size), (0, 0, 0, 0)), shadow_layer.split()[-1]))

    icon = Image.new("RGBA", (rect_w, rect_w), (0, 0, 0, 0))
    icon.alpha_composite(base)
    icon.putalpha(mask)
    canvas.alpha_composite(icon, rect[:2])

    draw = ImageDraw.Draw(canvas, "RGBA")

    page_fill = (255, 255, 255, 242)
    green = (10, 111, 91, 185)
    left_page = [(294, 590), (342, 566), (418, 566), (500, 590), (500, 749), (418, 710), (342, 710), (294, 749)]
    right_page = [(524, 590), (606, 566), (682, 566), (730, 590), (730, 749), (682, 710), (606, 710), (524, 749)]
    draw.polygon([(int(x * scale), int(y * scale)) for x, y in left_page], fill=page_fill)
    draw.polygon([(int(x * scale), int(y * scale)) for x, y in right_page], fill=page_fill)
    draw.line([(int(500 * scale), int(590 * scale)), (int(500 * scale), int(749 * scale))], fill=green, width=max(1, int(24 * scale)))
    draw.line(
        [(int(342 * scale), int(632 * scale)), (int(402 * scale), int(616 * scale)), (int(472 * scale), int(636 * scale))],
        fill=(10, 111, 91, 118),
        width=max(1, int(22 * scale)),
        joint="curve",
    )
    draw.line(
        [(int(552 * scale), int(636 * scale)), (int(622 * scale), int(616 * scale)), (int(682 * scale), int(632 * scale))],
        fill=(10, 111, 91, 118),
        width=max(1, int(22 * scale)),
        joint="curve",
    )

    white = (255, 255, 255, 255)
    draw.ellipse(tuple(int(v * scale) for v in (454, 326, 570, 442)), fill=white)
    arc_specs = [
        ((378, 281, 456, 436), 116, 244, 38, 255),
        ((568, 281, 646, 436), -64, 64, 38, 255),
        ((278, 207, 436, 481), 116, 244, 34, 198),
        ((588, 207, 746, 481), -64, 64, 34, 198),
    ]
    for box, start, end, width, alpha in arc_specs:
        draw.arc(tuple(int(v * scale) for v in box), start=start, end=end, fill=(255, 255, 255, alpha), width=max(1, int(width * scale)))

    return canvas


def save_icons():
    ASSETS.mkdir(exist_ok=True)
    BUILD.mkdir(exist_ok=True)
    ICONSET.mkdir(exist_ok=True)

    master = draw_logo(1024)
    master.save(ASSETS / "app-logo-1024.png")

    sizes = [
        ("icon_16x16.png", 16),
        ("icon_16x16@2x.png", 32),
        ("icon_32x32.png", 32),
        ("icon_32x32@2x.png", 64),
        ("icon_128x128.png", 128),
        ("icon_128x128@2x.png", 256),
        ("icon_256x256.png", 256),
        ("icon_256x256@2x.png", 512),
        ("icon_512x512.png", 512),
        ("icon_512x512@2x.png", 1024),
    ]
    for filename, pixel_size in sizes:
        master.resize((pixel_size, pixel_size), Image.Resampling.LANCZOS).save(ICONSET / filename)

    subprocess.run(["iconutil", "-c", "icns", str(ICONSET), "-o", str(BUILD / "icon.icns")], check=True)


if __name__ == "__main__":
    save_icons()
