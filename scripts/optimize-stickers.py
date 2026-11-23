from pathlib import Path
import shutil

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1] / "doro_bq"
OUTPUT = ROOT / "optimized"
RASTER_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"}
VECTOR_EXTENSIONS = {".svg"}
MAX_EDGE = 320
WEBP_QUALITY = 82


def optimize_raster(source: Path, target: Path) -> None:
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGBA")
        longest_edge = max(image.size)
        if longest_edge > MAX_EDGE:
            scale = MAX_EDGE / longest_edge
            image = image.resize(
                (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
                Image.Resampling.LANCZOS,
            )
        image.save(target, "WEBP", quality=WEBP_QUALITY, method=6)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    sources = sorted(
        source
        for source in ROOT.iterdir()
        if source.is_file() and source.suffix.lower() in RASTER_EXTENSIONS | VECTOR_EXTENSIONS
    )
    expected_outputs = set()

    for source in sources:
        if source.suffix.lower() in VECTOR_EXTENSIONS:
            target = OUTPUT / source.name
            if not target.exists() or target.stat().st_mtime_ns < source.stat().st_mtime_ns:
                shutil.copyfile(source, target)
        else:
            target = OUTPUT / f"{source.stem}.webp"
            if not target.exists() or target.stat().st_mtime_ns < source.stat().st_mtime_ns:
                optimize_raster(source, target)
        expected_outputs.add(target.name)

    for stale in OUTPUT.iterdir():
        if stale.is_file() and stale.name not in expected_outputs:
            stale.unlink()

    print(f"Optimized {len(sources)} sticker image(s) into {OUTPUT}")


if __name__ == "__main__":
    main()
