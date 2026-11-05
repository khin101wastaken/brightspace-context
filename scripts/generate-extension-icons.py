"""Render the simple document-stack mark to checked-in PNG icons. Dev-only Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
scale = 4
image = Image.new("RGBA", (128 * scale, 128 * scale))
draw = ImageDraw.Draw(image)
for bounds, radius, color in [
    ((4, 4, 124, 124), 28, "#6543a3"),
    ((27, 22, 85, 98), 9, "#bca5de"),
    ((41, 32, 99, 108), 9, "#ffffff"),
]:
    draw.rounded_rectangle(tuple(v * scale for v in bounds), radius * scale, color)
for y, end in [(51, 85), (65, 85), (79, 74)]:
    draw.line((54 * scale, y * scale, end * scale, y * scale), fill="#9874c3", width=6 * scale)
    for x in (54, end):
        draw.ellipse(((x - 3) * scale, (y - 3) * scale, (x + 3) * scale, (y + 3) * scale), fill="#9874c3")
destination = root / "extension" / "icons"
destination.mkdir(exist_ok=True)
for size in (16, 32, 48, 128):
    if size == 128:
        # CWS uses a 96px mark centered in a 128px transparent store icon.
        icon = Image.new("RGBA", (128, 128))
        mark = image.crop(image.getbbox()).resize((96, 96), Image.Resampling.LANCZOS)
        icon.alpha_composite(mark, (16, 16))
    else:
        icon = image.resize((size, size), Image.Resampling.LANCZOS)
    icon.save(destination / f"icon-{size}.png", optimize=True)
print(f"Generated 4 icons in {destination}")
