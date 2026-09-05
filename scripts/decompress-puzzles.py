"""Распаковка lichess_db_puzzle.csv.zst в CSV.

Использование: python scripts/decompress-puzzles.py
"""
import sys
from pathlib import Path

import zstandard

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "lichess" / "lichess_db_puzzle.csv.zst"
DST = ROOT / "data" / "lichess" / "lichess_db_puzzle.csv"


def main() -> None:
    if not SRC.exists():
        sys.exit(f"Нет файла: {SRC}")
    if DST.exists():
        print(f"Уже распакован: {DST}")
        return
    dctx = zstandard.ZstdDecompressor()
    with SRC.open("rb") as src, DST.open("wb") as dst:
        dctx.copy_stream(src, dst)
    print(f"Готово: {DST} ({DST.stat().st_size / 1e6:.0f} MB)")


if __name__ == "__main__":
    main()
