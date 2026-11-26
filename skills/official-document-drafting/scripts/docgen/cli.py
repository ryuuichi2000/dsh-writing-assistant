# -*- coding: utf-8 -*-
"""命令行入口：解析参数并驱动 Markdown → .docx 导出全流程。"""
from __future__ import annotations

import argparse
import pathlib
import sys
import traceback

from docgen.document import build_document_xml
from docgen.image_library import format_images, resolve_image_entry
from docgen.images import build_furniture_asset, build_image_assets
from docgen.markdown import extract_title_and_sections, normalize_heading, parse_markdown
from docgen.package import resolve_output_path, write_docx_package
from docgen.registry import resolve_doc_type
from docgen.settings import (
    finalize_export_settings,
    format_font_catalog,
    format_layout_catalog,
    render_font_plan,
    render_layout_plan,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="将中文公文 Markdown 成稿导出为 .docx。")
    parser.add_argument("input", nargs="?", type=pathlib.Path, help="输入 Markdown 文件")
    parser.add_argument("-o", "--output", type=pathlib.Path, help="输出 docx 文件，默认与输入同名")
    font_source = parser.add_mutually_exclusive_group()
    font_source.add_argument("--doc-type", help="按文种自动应用字体与版式（中文名或英文 id）")
    font_source.add_argument("--font-profile", help="字体方案 id（official-standard/internal-readable/speech-readable）")
    parser.add_argument("--layout-profile", help="版式方案 id")
    parser.add_argument(
        "--font-preset",
        choices=["system-cn", "source-han", "noto-cjk", "fandol"],
        help="字体预设，仅补齐未被文种方案或手工参数覆盖的槽位",
    )
    parser.add_argument("--list-font-profiles", action="store_true", help="列出字体方案并退出")
    parser.add_argument("--list-layout-profiles", action="store_true", help="列出可选版式方案并退出")
    parser.add_argument("--show-font-plan", action="store_true", help="打印解析后的字体方案并退出")
    parser.add_argument("--show-layout-plan", action="store_true", help="打印解析后的版式方案并退出")
    parser.add_argument("--title-font")
    parser.add_argument("--heading-font")
    parser.add_argument("--subheading-font")
    parser.add_argument("--body-font")
    parser.add_argument("--header-font")
    parser.add_argument("--title-size", type=int)
    parser.add_argument("--heading-size", type=int)
    parser.add_argument("--body-size", type=int)
    parser.add_argument("--header-size", type=int)
    parser.add_argument("--line-spacing-pt", type=float, help="正文固定行距（pt）的快捷覆盖")
    parser.add_argument("--body-line-spacing-twips", type=int)
    parser.add_argument("--title-line-spacing-twips", type=int)
    parser.add_argument("--title-after-twips", type=int)
    parser.add_argument("--recipient-after-twips", type=int)
    parser.add_argument("--signing-before-twips", type=int)
    parser.add_argument("--body-first-line-chars", type=int, help="首行缩进，单位百分之一字符，默认 200")
    parser.add_argument("--margin-top-twips", type=int)
    parser.add_argument("--margin-bottom-twips", type=int)
    parser.add_argument("--margin-left-twips", type=int)
    parser.add_argument("--margin-right-twips", type=int)
    parser.set_defaults(show_page_number=True)
    parser.add_argument("--page-number-style", choices=("number", "page", "chinese", "dash"), default="number")
    parser.add_argument("--page-number-position", choices=("left", "center", "right", "outside"), default="center")
    parser.add_argument("--hide-first-page-number", action="store_true", help="首页仍计数，隐藏首页页码")
    parser.add_argument("--show-page-number", dest="show_page_number", action="store_true", help="显示页码（默认）")
    parser.add_argument("--hide-page-number", dest="show_page_number", action="store_false", help="不显示页码")
    parser.add_argument(
        "--unsealed",
        action="store_true",
        help="不加盖印章版：日期右空 2 字、署名与日期错位 2 字（默认按盖章版右空 4 字）",
    )
    parser.add_argument("--title-wrap", choices=["auto", "off"], default="auto", help="长标题是否自动断行")
    parser.add_argument("--title-max-chars", type=int, help="标题每行目标字数，默认按版式方案")
    parser.add_argument(
        "--header-image",
        help="页眉图片：已保存的图片名，或本地图片路径（路径会自动保存进图库）",
    )
    parser.add_argument(
        "--footer-image",
        help="页脚图片：已保存的图片名，或本地图片路径（路径会自动保存进图库）",
    )
    parser.add_argument("--header-image-width-mm", type=float, default=35.0, help="页眉图片宽度（mm），默认 35")
    parser.add_argument("--footer-image-width-mm", type=float, default=30.0, help="页脚图片宽度（mm），默认 30")
    parser.add_argument("--header-image-max-height-mm", type=float, default=20.0, help="页眉图片最大高度（mm），默认 20")
    parser.add_argument("--footer-image-max-height-mm", type=float, default=15.0, help="页脚图片最大高度（mm），默认 15")
    parser.add_argument(
        "--header-image-align", choices=["left", "center", "right"], default="center", help="页眉图片对齐，默认居中"
    )
    parser.add_argument(
        "--footer-image-align", choices=["left", "center", "right"], default="center", help="页脚图片对齐，默认居中"
    )
    parser.add_argument("--list-images", action="store_true", help="列出图库里已保存的页眉/页脚图片并退出")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.list_font_profiles:
        print(format_font_catalog())
        return 0
    if args.list_layout_profiles:
        print(format_layout_catalog())
        return 0
    if args.list_images:
        print(format_images())
        return 0

    stage = "解析字体与版式方案"
    output_path: pathlib.Path | None = None
    try:
        selected_font, selected_layout = finalize_export_settings(args)
        if args.show_font_plan:
            print(render_font_plan(args, selected_font))
            print()
            print(render_layout_plan(args, selected_layout))
            return 0
        if args.show_layout_plan:
            print(render_layout_plan(args, selected_layout))
            return 0

        args.header_image_path = None
        args.footer_image_path = None
        if args.header_image:
            args.header_image_path, header_entry = resolve_image_entry(args.header_image)
            print(f"[INFO] 页眉图片：{header_entry['name']}（已保存，可复用）")
        if args.footer_image:
            args.footer_image_path, footer_entry = resolve_image_entry(args.footer_image)
            print(f"[INFO] 页脚图片：{footer_entry['name']}（已保存，可复用）")

        if args.input is None:
            print("[ERROR] 缺少输入 Markdown 文件。", file=sys.stderr)
            return 2
        if args.layout_profile and args.doc_type:
            print("[WARN] --doc-type 已绑定版式方案，--layout-profile 被忽略。", file=sys.stderr)

        stage = "读取输入 Markdown"
        markdown = args.input.read_text(encoding="utf-8")
        stage = "解析 Markdown 结构"
        blocks = parse_markdown(markdown)
        if not blocks:
            print("[ERROR] 输入文件为空或没有可渲染内容。", file=sys.stderr)
            return 1

        stage = "构建 docx 内容"
        image_assets = build_image_assets(blocks, args.input, show_page_number=args.show_page_number)
        header_asset = None
        footer_asset = None
        if args.header_image_path is not None:
            header_asset = build_furniture_asset(
                args.header_image_path,
                width_mm=args.header_image_width_mm,
                max_height_mm=args.header_image_max_height_mm,
                target_name=f"header-image{args.header_image_path.suffix.lower()}",
            )
        if args.footer_image_path is not None:
            footer_asset = build_furniture_asset(
                args.footer_image_path,
                width_mm=args.footer_image_width_mm,
                max_height_mm=args.footer_image_max_height_mm,
                target_name=f"footer-image{args.footer_image_path.suffix.lower()}",
            )
        document_xml = build_document_xml(blocks, args, image_assets=image_assets)
        top_title, sections = extract_title_and_sections(blocks)
        title = top_title
        if sections:
            title = next(
                (
                    block.text
                    for section in sections
                    if normalize_heading(section.heading) == "标题"
                    for block in section.blocks
                    if block.kind == "paragraph" and block.text
                ),
                top_title,
            )
        title = title or "公文稿件"

        stage = "写出 docx 文件"
        output_path = resolve_output_path(args.input, args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        write_docx_package(
            output_path,
            args=args,
            title=title,
            document_xml=document_xml,
            image_assets=image_assets,
            header_asset=header_asset,
            footer_asset=footer_asset,
        )
    except ValueError as exc:
        # 参数/文种/图片路径等可预期错误：给一句能直接照做的提示，不抛堆栈。
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 2
    except (OSError, KeyError) as exc:
        traceback.print_exc()
        involved = f"输入 {args.input}" if args.input is not None else "（未提供输入文件）"
        if output_path is not None:
            involved += f"，输出 {output_path}"
        print(f"[ERROR] 导出 docx 失败（阶段：{stage}；{involved}）：{exc}", file=sys.stderr)
        return 1

    print(f"[OK] 已生成 {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
