"""
Draws the Beer Rates icon (a beer glass with foam on stout brown) and writes every size the
website and the Android app need. Run from the repository root with Pillow installed:

    backend/.venv/Scripts/python.exe branding/build_icons.py

Writes frontend/public/{favicon.svg,icon-192.png,icon-512.png,icon-maskable-512.png,apple-touch-icon.png}
and, if frontend/android exists, the launcher icons in its res/mipmap-* folders.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "frontend" / "public"
ANDROID_RES = ROOT / "frontend" / "android" / "app" / "src" / "main" / "res"

STOUT = (43, 26, 11)
AMBER = (245, 158, 11)
GOLD = (248, 191, 42)
LIGHT = (253, 224, 143)
FOAM = (255, 248, 230)

# The same drawing as frontend/src/components/Logo.tsx, on a 64 × 64 grid.
SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#2b1a0b"/>
  <path d="M19 20h22l-2.6 32a3 3 0 0 1-3 2.8H24.6a3 3 0 0 1-3-2.8Z" fill="#f59e0b"/>
  <path d="M41 25h4.5a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H40" fill="none" stroke="#f8bf2a" stroke-width="3.5"/>
  <path d="M23 30v18M29 30v20M35 30v18" stroke="#fde08f" stroke-width="2" stroke-linecap="round" opacity=".6"/>
  <circle cx="22" cy="18" r="5" fill="#fff8e6"/>
  <circle cx="30" cy="15" r="6" fill="#fff8e6"/>
  <circle cx="38" cy="18" r="5" fill="#fff8e6"/>
  <rect x="18" y="17" width="24" height="5" rx="2.5" fill="#fff8e6"/>
</svg>
"""


def glass(size: int, *, background: bool = True, rounded: bool = True, scale: float = 1.0) -> Image.Image:
    """The icon at `size` px. `scale` < 1 shrinks the glass into the middle (safe zone of maskable icons)."""
    big = size * 4  # draw large, then shrink: smooth edges
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if background:
        radius = int(big * 14 / 64) if rounded else 0
        draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=radius, fill=STOUT)

    unit = big / 64 * scale
    offset = big * (1 - scale) / 2

    def p(x: float, y: float) -> tuple[float, float]:
        return (offset + x * unit, offset + y * unit)

    # Handle.
    draw.rounded_rectangle((*p(38.5, 24), *p(51.5, 44)), radius=int(5 * unit), outline=GOLD, width=max(1, int(3.5 * unit)))
    # Glass body (tapers towards the bottom).
    draw.polygon([p(19, 20), p(41, 20), p(38.4, 52.8), p(21.6, 52.8)], fill=AMBER)
    draw.rounded_rectangle((*p(21.6, 50), *p(38.4, 54.8)), radius=int(2.5 * unit), fill=AMBER)
    # Bubbles.
    for x, y1, y2 in ((23, 30, 48), (29, 30, 50), (35, 30, 48)):
        draw.line((*p(x, y1), *p(x, y2)), fill=LIGHT, width=max(1, int(2 * unit)))
    # Foam.
    for cx, cy, r in ((22, 18, 5), (30, 15, 6), (38, 18, 5)):
        draw.ellipse((*p(cx - r, cy - r), *p(cx + r, cy + r)), fill=FOAM)
    draw.rounded_rectangle((*p(18, 17), *p(42, 22)), radius=int(2.5 * unit), fill=FOAM)
    return image.resize((size, size), Image.Resampling.LANCZOS)


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)
    print("wrote", path.relative_to(ROOT))


def main() -> None:
    (PUBLIC / "favicon.svg").write_text(SVG, encoding="utf-8")
    save(glass(192), PUBLIC / "icon-192.png")
    save(glass(512), PUBLIC / "icon-512.png")
    # Maskable: full-bleed background, glass inside the 80 % safe zone.
    save(glass(512, rounded=False, scale=0.72), PUBLIC / "icon-maskable-512.png")
    save(glass(180, rounded=False), PUBLIC / "apple-touch-icon.png")

    if ANDROID_RES.is_dir():
        densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
        for name, factor in densities.items():
            folder = ANDROID_RES / f"mipmap-{name}"
            save(glass(int(48 * factor)), folder / "ic_launcher.png")
            round_icon = glass(int(48 * factor), rounded=False)
            mask = Image.new("L", round_icon.size, 0)
            ImageDraw.Draw(mask).ellipse((0, 0, *round_icon.size), fill=255)
            round_icon.putalpha(mask)
            save(round_icon, folder / "ic_launcher_round.png")
            # Adaptive icon foreground: 108 dp canvas, artwork in the middle 66 %.
            save(glass(int(108 * factor), background=False, scale=0.62), folder / "ic_launcher_foreground.png")
        values = ANDROID_RES / "values" / "ic_launcher_background.xml"
        values.parent.mkdir(parents=True, exist_ok=True)
        values.write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
            '    <color name="ic_launcher_background">#2B1A0B</color>\n</resources>\n',
            encoding="utf-8",
        )
        print("wrote", values.relative_to(ROOT))
        # Splash screens: the icon in the middle of stout brown.
        for folder in ANDROID_RES.glob("drawable*"):
            if (folder / "splash.png").exists():
                with Image.open(folder / "splash.png") as old:
                    width, height = old.size
                save(splash(width, height), folder / "splash.png")

    ios = ROOT / "frontend" / "ios" / "App" / "App" / "Assets.xcassets"
    if ios.is_dir():
        save(glass(1024, rounded=False).convert("RGB"), ios / "AppIcon.appiconset" / "AppIcon-512@2x.png")
        for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
            save(splash(2732, 2732), ios / "Splash.imageset" / name)


def splash(width: int, height: int) -> Image.Image:
    image = Image.new("RGB", (width, height), STOUT)
    icon = glass(int(min(width, height) * 0.28), background=False)
    image.paste(icon, ((width - icon.width) // 2, (height - icon.height) // 2), icon)
    return image


if __name__ == "__main__":
    main()
