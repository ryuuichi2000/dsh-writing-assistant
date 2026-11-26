# -*- coding: utf-8 -*-
"""组装 word/document.xml：标题与章节渲染、版记定位、分页与页面设置。"""
from __future__ import annotations

import argparse

from docgen.constants import (
    END_MATTER_HEADINGS,
    PAGE_HEIGHT_TWIPS,
    PAGE_NUMBER_FOOTER_TWIPS,
    PAGE_WIDTH_TWIPS,
    R_NS,
    W_NS,
)
from docgen.markdown import extract_title_and_sections, normalize_heading, wrap_title_text
from docgen.models import Block, ImageAsset
from docgen.oxml import paragraph_xml
from docgen.pagination import estimate_paragraph_twips, estimate_section_height_twips
from docgen.sections import render_generic, render_section_content
from docgen.settings import title_line_spacing_twips


def _section_props(
    args: argparse.Namespace,
    *,
    footer: bool,
    header: bool,
    title_pg: bool,
    v_align: str | None = None,
) -> str:
    parts = ["<w:sectPr>"]
    if header:
        parts.append('<w:headerReference w:type="default" r:id="rId6"/>')
        if title_pg:
            parts.append('<w:headerReference w:type="even" r:id="rId7"/>')
            parts.append('<w:headerReference w:type="first" r:id="rId9"/>')
    if footer:
        parts.append('<w:footerReference w:type="default" r:id="rId4"/>')
        if title_pg:
            parts.append('<w:footerReference w:type="even" r:id="rId5"/>')
            parts.append('<w:footerReference w:type="first" r:id="rId8"/>')
    parts.append(f'<w:pgSz w:w="{PAGE_WIDTH_TWIPS}" w:h="{PAGE_HEIGHT_TWIPS}"/>')
    parts.append(
        f'<w:pgMar w:top="{args.margin_top_twips}" w:right="{args.margin_right_twips}" '
        f'w:bottom="{args.margin_bottom_twips}" w:left="{args.margin_left_twips}" '
        f'w:header="851" w:footer="{PAGE_NUMBER_FOOTER_TWIPS}" w:gutter="0"/>'
    )
    if args.show_page_number:
        fmt = "chineseCounting" if args.page_number_style == "chinese" else "decimal"
        parts.append(f'<w:pgNumType w:fmt="{fmt}"/>')
    if v_align:
        parts.append(f'<w:vAlign w:val="{v_align}"/>')
    if title_pg:
        parts.append("<w:titlePg/>")
    parts.append("</w:sectPr>")
    return "".join(parts)


def build_document_xml(
    blocks: list[Block],
    args: argparse.Namespace,
    *,
    image_assets: dict[str, ImageAsset] | None = None,
) -> str:
    top_title, sections = extract_title_and_sections(blocks)
    body_parts: list[str] = []
    consumed_twips = 0
    drawing_id_counter = [1]
    header_feature = bool(getattr(args, "header_image_path", None))
    footer_feature = bool(args.show_page_number or getattr(args, "footer_image_path", None))

    if sections:
        section_headings = {normalize_heading(section.heading) for section in sections}
        if "标题" not in section_headings and top_title:
            title_text = wrap_title_text(
                top_title, max_chars=args.title_max_chars, enabled=args.title_wrap == "auto"
            )
            body_parts.append(
                paragraph_xml(
                    title_text,
                    font_name=args.title_font,
                    size_pt=args.title_size,
                    align="center",
                    first_line=0,
                    line=title_line_spacing_twips(args),
                    after=args.title_after_twips,
                )
            )
            consumed_twips += estimate_paragraph_twips(
                title_text,
                line_twips=title_line_spacing_twips(args),
                after=args.title_after_twips,
                max_chars=args.title_max_chars,
            )

        end_matter_sections = [
            section for section in sections if normalize_heading(section.heading) in END_MATTER_HEADINGS
        ]
        normal_sections = [
            section for section in sections if normalize_heading(section.heading) not in END_MATTER_HEADINGS
        ]

        for section in normal_sections:
            body_parts.extend(
                render_section_content(
                    section,
                    args=args,
                    image_assets=image_assets,
                    drawing_id_counter=drawing_id_counter,
                )
            )
            consumed_twips += estimate_section_height_twips(
                section, args=args, image_assets=image_assets
            )

        if end_matter_sections:
            # 版记单独成节、纵向贴底：用分节符起新页，末节 vAlign=bottom，
            # 不靠段前距估算，避免把落款挤到下一页或版记被拆散。
            if consumed_twips > 0:
                body_parts.append(
                    "<w:p><w:pPr>"
                    + _section_props(args, footer=footer_feature, header=header_feature, title_pg=args.show_page_number)
                    + "</w:pPr></w:p>"
                )
            for section in end_matter_sections:
                body_parts.extend(
                    render_section_content(
                        section,
                        args=args,
                        image_assets=image_assets,
                        drawing_id_counter=drawing_id_counter,
                        first_paragraph_before_override=0,
                        prepend_page_break=False,
                    )
                )
            final_section = _section_props(args, footer=False, header=False, title_pg=False, v_align="bottom")
        else:
            final_section = _section_props(args, footer=footer_feature, header=header_feature, title_pg=args.show_page_number)
    else:
        body_parts.extend(render_generic(blocks, args, image_assets=image_assets))
        final_section = _section_props(args, footer=footer_feature, header=header_feature, title_pg=args.show_page_number)

    body_parts.append(final_section)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:document xmlns:w="{W_NS}" xmlns:r="{R_NS}" '
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        f"<w:body>{''.join(body_parts)}</w:body>"
        "</w:document>"
    )


