#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""页眉/页脚图片库命令行：list / add / remove。

用法：
    python scripts/image_library.py list
    python scripts/image_library.py add ./logo.png --name 单位页眉
    python scripts/image_library.py remove 单位页眉
"""
from __future__ import annotations

import argparse
import pathlib
import sys

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from docgen.image_library import add_image, format_images, remove_image  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="管理公文导出用的页眉/页脚图片。")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="列出已保存的图片")
    add = sub.add_parser("add", help="导入一张图片并保存")
    add.add_argument("path", type=pathlib.Path, help="图片文件路径")
    add.add_argument("--name", help="保存名称，默认取文件名")
    remove = sub.add_parser("remove", help="删除已保存的图片")
    remove.add_argument("name", help="保存名称")
    args = parser.parse_args()

    try:
        if args.command == "list":
            print(format_images())
        elif args.command == "add":
            entry = add_image(args.path, args.name)
            print(f"[OK] 已保存图片“{entry['name']}”（{entry['width_px']}×{entry['height_px']}px）")
            print("用法：--header-image " + entry["name"] + " 或 --footer-image " + entry["name"])
        elif args.command == "remove":
            remove_image(args.name)
            print(f"[OK] 已删除图片“{args.name}”")
    except ValueError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
