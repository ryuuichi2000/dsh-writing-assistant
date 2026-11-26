# -*- coding: utf-8 -*-
"""章节渲染：把 Markdown 章节按公文结构板块分派渲染为 WordprocessingML 段落。

注意：本模块的按标题分派规则与 docgen.pagination.estimate_section_height_twips
互为孪生分发器，任一侧新增分支时必须同步另一侧。
"""
from __future__ import annotations

import argparse

from docgen.constants import (
    END_MATTER_HEADINGS,
    LABELLED_HEADINGS,
    MARGIN_LEFT_TWIPS,
    MARGIN_RIGHT_TWIPS,
    MIN_SIGNING_UNIT_RIGHT_CHARS,
    PAGE_WIDTH_TWIPS,
    SIGNING_DATE_RIGHT_CHARS,
    STRUCTURAL_HEADINGS,
)
from docgen.images import image_paragraph_xml
from docgen.markdown import (
    is_date_line,
    is_pure_heading,
    normalize_annotation_text,
    normalize_heading,
    paragraph_kind,
    split_inline_heading,
    wrap_title_text,
)
from docgen.models import Block, ImageAsset, Section, TextRun
from docgen.oxml import page_break_xml, paragraph_xml
from docgen.settings import body_line_spacing_twips, title_line_spacing_twips


def _text_blocks(section: Section) -> list[str]:
    return [block.text for block in section.blocks if block.kind == "paragraph" and block.text]


def render_numbered_heading(text: str, kind: str, args: argparse.Namespace) -> str:
    if kind == "level1":
        font, size = args.heading_font, args.heading_size
    elif kind == "level2":
        font, size = args.subheading_font, args.heading_size
    else:
        # GB/T 9704-2012：三级、四级标题用 3 号仿宋体，不加粗。
        font, size = args.body_font, args.body_size
    return paragraph_xml(
        text,
        font_name=font,
        size_pt=size,
        first_line_chars=200,
        line=body_line_spacing_twips(args),
        keep_next=True,
    )


def render_body_paragraph(text: str, args: argparse.Namespace) -> list[str]:
    text = text.strip()
    if not text:
        return []

    lines = [line for line in text.split("\n") if line.strip()]
    kind = paragraph_kind(text)

    # 标题和正文被换行写在同一段里：拆成“标题段 + 正文段”。
    if kind and len(lines) > 1 and is_pure_heading(lines[0], kind):
        heading_line = lines[0].strip()
        body_text = "\n".join(lines[1:]).strip()
        parts = [render_numbered_heading(heading_line, kind, args)]
        if body_text:
            parts.append(
                paragraph_xml(
                    body_text,
                    font_name=args.body_font,
                    size_pt=args.body_size,
                    first_line_chars=args.body_first_line_chars,
                    line=body_line_spacing_twips(args),
                )
            )
        return parts

    # 行内标题（一、总体要求。…… / （一）重点任务。……）：标题短语黑体/楷体，正文仿宋，同段。
    inline = split_inline_heading(text)
    if inline is not None:
        level, heading_text, body_text = inline
        heading_font = args.heading_font if level == "level1" else args.subheading_font
        runs = [
            TextRun(text=heading_text, font_name=heading_font, size_pt=args.heading_size),
            TextRun(text=body_text, font_name=args.body_font, size_pt=args.body_size),
        ]
        return [
            paragraph_xml(
                "",
                font_name=args.body_font,
                size_pt=args.body_size,
                first_line_chars=args.body_first_line_chars,
                line=body_line_spacing_twips(args),
                runs=runs,
            )
        ]

    if kind and is_pure_heading(text, kind):
        return [render_numbered_heading(text, kind, args)]

    return [
        paragraph_xml(
            text,
            font_name=args.body_font,
            size_pt=args.body_size,
            first_line_chars=args.body_first_line_chars,
            line=body_line_spacing_twips(args),
        )
    ]


def _render_structural_lines(
    section: Section,
    args: argparse.Namespace,
    *,
    font_name: str | None = None,
    size_pt: int | None = None,
    first_line_chars: int | None = 0,
    left_chars: int | None = None,
    align: str = "left",
    prefix: str | None = None,
    keep_next: bool = False,
) -> list[str]:
    parts = []
    texts = _text_blocks(section)
    for index, text in enumerate(texts):
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        for line_index, line in enumerate(lines):
            if prefix and not line.startswith(prefix):
                line = f"{prefix}{line}"
            parts.append(
                paragraph_xml(
                    line,
                    font_name=font_name or args.body_font,
                    size_pt=size_pt or args.body_size,
                    first_line_chars=first_line_chars,
                    left_chars=left_chars,
                    align=align,
                    line=body_line_spacing_twips(args),
                    keep_next=keep_next and (index < len(texts) - 1 or line_index < len(lines) - 1),
                )
            )
    return parts


def _signing_right_chars(unit: str, date: str, *, unsealed: bool) -> int:
    date_right = MIN_SIGNING_UNIT_RIGHT_CHARS if unsealed else SIGNING_DATE_RIGHT_CHARS
    if unsealed:
        # 不加盖印章：成文日期右空二字，发文机关署名首字比日期首字左移二字。
        right = date_right + (len(date) - len(unit) + 2) * 100
    else:
        # 加盖印章：日期右空四字，署名居中压在日期上方。
        right = date_right + round((len(date) - len(unit)) / 2) * 100
    return max(MIN_SIGNING_UNIT_RIGHT_CHARS, right)


def render_section_content(
    section: Section,
    *,
    args: argparse.Namespace,
    image_assets: dict[str, ImageAsset] | None = None,
    drawing_id_counter: list[int] | None = None,
    first_paragraph_before_override: int = 0,
    prepend_page_break: bool = False,
) -> list[str]:
    xml_parts: list[str] = []
    heading = normalize_heading(section.heading)

    if heading == "标题":
        for block in _text_blocks(section):
            xml_parts.append(
                paragraph_xml(
                    wrap_title_text(block, max_chars=args.title_max_chars, enabled=args.title_wrap == "auto"),
                    font_name=args.title_font,
                    size_pt=args.title_size,
                    align="center",
                    first_line=0,
                    line=title_line_spacing_twips(args),
                    line_rule="exact",
                    before=0,
                    after=args.title_after_twips,
                )
            )
        return xml_parts

    if heading in {"版头"}:
        for block in _text_blocks(section):
            xml_parts.append(
                paragraph_xml(
                    block,
                    font_name=args.header_font,
                    size_pt=args.header_size,
                    color="C00000",
                    align="center",
                    line=body_line_spacing_twips(args),
                    after=args.header_after_twips,
                )
            )
        return xml_parts

    if heading == "份号":
        return _render_structural_lines(section, args, first_line_chars=0)

    if heading in {"密级", "紧急程度"}:
        return _render_structural_lines(
            section, args, font_name=args.heading_font, first_line_chars=0
        )

    if heading == "签发人":
        return _render_structural_lines(
            section,
            args,
            font_name=args.subheading_font,
            align="right",
            first_line_chars=0,
            left_chars=0,
        )

    if heading == "发文字号":
        for block in _text_blocks(section):
            has_tab = "\t" in block
            xml_parts.append(
                paragraph_xml(
                    block,
                    font_name=args.body_font,
                    size_pt=args.body_size,
                    align="left" if has_tab else "center",
                    right_tab_stop=(
                        PAGE_WIDTH_TWIPS - MARGIN_LEFT_TWIPS - MARGIN_RIGHT_TWIPS if has_tab else None
                    ),
                    first_line=0,
                    line=body_line_spacing_twips(args),
                    after=args.doc_number_after_twips,
                    bottom_border_color="FF0000",
                )
            )
        return xml_parts

    if heading == "题注":
        return _render_structural_lines(section, args, first_line_chars=0, align="center")

    if heading == "主送单位":
        return _render_structural_lines(section, args, first_line_chars=0, align="left")

    if heading in {"报送对象", "称谓", "报送范围", "会议信息", "会议基本信息"}:
        return _render_structural_lines(section, args, first_line_chars=0, align="left")

    if heading in LABELLED_HEADINGS:
        return _render_structural_lines(
            section, args, first_line_chars=0, align="left", prefix=f"{heading}："
        )

    if heading in {"附件", "附件说明"}:
        return _render_structural_lines(
            section, args, first_line_chars=0, left_chars=200, align="left"
        )

    if heading in {"附图", "附表", "附录"} or (
        heading.startswith("附件") and heading not in {"附件", "附件说明"}
    ):
        if prepend_page_break or first_paragraph_before_override == 0:
            xml_parts.append(page_break_xml())
        if drawing_id_counter is None:
            drawing_id_counter = [10_000]
        for block in section.blocks:
            if block.kind == "paragraph" and block.text:
                text = block.text
                is_caption = text.startswith(("图", "表", "附件", "附图", "附表")) and len(text) <= 40
                xml_parts.append(
                    paragraph_xml(
                        text,
                        font_name=args.body_font,
                        size_pt=args.body_size,
                        first_line_chars=0 if is_caption else 200,
                        align="center" if is_caption else "left",
                        line=body_line_spacing_twips(args),
                    )
                )
            elif block.kind == "image" and block.src and image_assets and block.src in image_assets:
                xml_parts.append(
                    image_paragraph_xml(
                        image_assets[block.src],
                        alt_text=block.text,
                        drawing_id=drawing_id_counter[0],
                    )
                )
                drawing_id_counter[0] += 1
        return xml_parts

    if heading in {"落款", "签署"}:
        lines = [
            line.strip()
            for block in _text_blocks(section)
            for line in block.split("\n")
            if line.strip()
        ]
        if not lines:
            return xml_parts
        unsealed = getattr(args, "unsealed", False)
        date_right = MIN_SIGNING_UNIT_RIGHT_CHARS if unsealed else SIGNING_DATE_RIGHT_CHARS

        if len(lines) == 1:
            line = lines[0]
            xml_parts.append(
                paragraph_xml(
                    line,
                    font_name=args.body_font,
                    size_pt=args.body_size,
                    align="right",
                    right_chars=date_right if is_date_line(line) else MIN_SIGNING_UNIT_RIGHT_CHARS,
                    line=body_line_spacing_twips(args),
                    before=args.signing_before_twips,
                    keep_lines=True,
                )
            )
            return xml_parts

        signing_date = lines[-1]
        units = lines[:-1]
        for index, unit in enumerate(units):
            xml_parts.append(
                paragraph_xml(
                    unit,
                    font_name=args.body_font,
                    size_pt=args.body_size,
                    align="right",
                    right_chars=_signing_right_chars(unit, signing_date, unsealed=unsealed),
                    line=body_line_spacing_twips(args),
                    before=args.signing_before_twips if index == 0 else 0,
                    keep_next=True,
                    keep_lines=True,
                )
            )
        xml_parts.append(
            paragraph_xml(
                signing_date,
                font_name=args.body_font,
                size_pt=args.body_size,
                align="right",
                right_chars=date_right,
                line=body_line_spacing_twips(args),
                keep_next=False,
                keep_lines=True,
            )
        )
        return xml_parts

    if heading == "附注":
        for block in _text_blocks(section):
            xml_parts.append(
                paragraph_xml(
                    normalize_annotation_text(block),
                    font_name=args.body_font,
                    size_pt=args.body_size,
                    first_line=0,
                    left_chars=200,
                    align="left",
                    line=body_line_spacing_twips(args),
                )
            )
        return xml_parts

    if heading in END_MATTER_HEADINGS:
        if prepend_page_break:
            xml_parts.append(page_break_xml())
        lines = [
            line.strip()
            for block in _text_blocks(section)
            for line in block.split("\n")
            if line.strip()
        ]
        # 用一条“高行距空段”把版记顶到版心底部。部分编辑器会忽略页首段落的段前距，
        # 空段更稳定；高度按当前版心剩余空间计算。
        if first_paragraph_before_override > 0:
            xml_parts.append(
                paragraph_xml(
                    "",
                    line=first_paragraph_before_override,
                    line_rule="exact",
                    first_line=0,
                    left_chars=0,
                    align="left",
                )
            )
        for index, line_text in enumerate(lines):
            xml_parts.append(
                paragraph_xml(
                    line_text,
                    font_name=args.body_font,
                    size_pt=14,
                    first_line=0,
                    left_chars=100,
                    align="left",
                    line=body_line_spacing_twips(args),
                    before=0,
                    keep_lines=True,
                    keep_next=index < len(lines) - 1,
                    top_border_color="000000" if index == 0 else None,
                )
            )
        return xml_parts

    # 非结构板块（真正的正文标题或普通章节）：打印标题，再渲染内容。
    if heading and heading not in STRUCTURAL_HEADINGS:
        heading_kind = paragraph_kind(heading)
        if heading_kind:
            xml_parts.append(render_numbered_heading(heading, heading_kind, args))
        else:
            xml_parts.append(
                paragraph_xml(
                    heading,
                    font_name=args.heading_font,
                    size_pt=args.heading_size,
                    first_line_chars=200,
                    line=body_line_spacing_twips(args),
                    keep_next=True,
                )
            )

    for block in section.blocks:
        if block.kind == "paragraph" and block.text:
            xml_parts.extend(render_body_paragraph(block.text, args))
        elif block.kind == "image" and block.src and image_assets and block.src in image_assets:
            if drawing_id_counter is None:
                drawing_id_counter = [1]
            xml_parts.append(
                image_paragraph_xml(
                    image_assets[block.src],
                    alt_text=block.text,
                    drawing_id=drawing_id_counter[0],
                )
            )
            drawing_id_counter[0] += 1
        elif block.kind == "heading":
            block_kind = paragraph_kind(block.text)
            if block_kind:
                xml_parts.append(render_numbered_heading(block.text, block_kind, args))
            else:
                xml_parts.append(
                    paragraph_xml(
                        block.text,
                        font_name=args.subheading_font if block.level >= 3 else args.heading_font,
                        size_pt=args.heading_size,
                        first_line_chars=200,
                        line=body_line_spacing_twips(args),
                        keep_next=True,
                    )
                )
    return xml_parts


def render_generic(
    blocks: list[Block],
    args: argparse.Namespace,
    *,
    image_assets: dict[str, ImageAsset] | None = None,
) -> list[str]:
    """没有二级结构章节时的兜底渲染。"""
    xml_parts: list[str] = []
    drawing_id_counter = [1]
    for block in blocks:
        if block.kind == "heading" and block.level == 1:
            xml_parts.append(
                paragraph_xml(
                    wrap_title_text(
                        block.text,
                        max_chars=args.title_max_chars,
                        enabled=args.title_wrap == "auto",
                    ),
                    font_name=args.title_font,
                    size_pt=args.title_size,
                    align="center",
                    line=title_line_spacing_twips(args),
                    after=args.title_after_twips,
                )
            )
        elif block.kind == "heading":
            block_kind = paragraph_kind(block.text)
            if block_kind:
                xml_parts.append(render_numbered_heading(block.text, block_kind, args))
            else:
                xml_parts.append(
                    paragraph_xml(
                        block.text,
                        font_name=args.subheading_font if block.level >= 3 else args.heading_font,
                        size_pt=args.heading_size,
                        first_line_chars=200,
                        line=body_line_spacing_twips(args),
                        keep_next=True,
                    )
                )
        elif block.kind == "image" and block.src and image_assets and block.src in image_assets:
            xml_parts.append(
                image_paragraph_xml(
                    image_assets[block.src],
                    alt_text=block.text,
                    drawing_id=drawing_id_counter[0],
                )
            )
            drawing_id_counter[0] += 1
        elif block.kind == "paragraph" and block.text:
            xml_parts.extend(render_body_paragraph(block.text, args))
    return xml_parts
