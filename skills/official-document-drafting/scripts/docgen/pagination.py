# -*- coding: utf-8 -*-
"""影子渲染器：不产出 XML，只估算各章节高度，用于图片分页与版记定位。

注意：估算分支必须与 docgen.sections.render_section_content 的分派保持一致。
"""
from __future__ import annotations

import argparse
import math

from docgen.constants import (
    CHARS_PER_LINE,
    END_MATTER_HEADINGS,
    LABELLED_HEADINGS,
    PRINTABLE_HEIGHT_TWIPS,
    STRUCTURAL_HEADINGS,
)
from docgen.images import estimate_image_twips
from docgen.markdown import normalize_heading, wrap_title_text
from docgen.models import ImageAsset, Section
from docgen.settings import body_line_spacing_twips, title_line_spacing_twips


def estimate_text_lines(text: str, max_chars: int = CHARS_PER_LINE) -> int:
    total = 0
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        total += max(1, math.ceil(len(stripped) / max_chars))
    return max(1, total)


def estimate_paragraph_twips(
    text: str,
    *,
    line_twips: int,
    before: int = 0,
    after: int = 0,
    max_chars: int = CHARS_PER_LINE,
) -> int:
    return before + after + estimate_text_lines(text, max_chars=max_chars) * line_twips


def section_contains_image(section: Section) -> bool:
    return any(block.kind == "image" for block in section.blocks)


def _paragraphs(section: Section) -> list[str]:
    return [block.text for block in section.blocks if block.kind == "paragraph" and block.text]


def estimate_section_height_twips(
    section: Section,
    *,
    args: argparse.Namespace,
    image_assets: dict[str, ImageAsset] | None = None,
) -> int:
    heading = normalize_heading(section.heading)
    line = body_line_spacing_twips(args)

    if heading == "标题":
        return sum(
            estimate_paragraph_twips(
                wrap_title_text(text, max_chars=args.title_max_chars, enabled=args.title_wrap == "auto"),
                line_twips=title_line_spacing_twips(args),
                after=args.title_after_twips,
                max_chars=args.title_max_chars,
            )
            for text in _paragraphs(section)
        )

    if heading == "版头":
        return sum(
            estimate_paragraph_twips(text, line_twips=line, after=args.header_after_twips)
            for text in _paragraphs(section)
        )

    if heading == "发文字号":
        return sum(
            estimate_paragraph_twips(text, line_twips=line, after=args.doc_number_after_twips)
            for text in _paragraphs(section)
        )

    if heading in END_MATTER_HEADINGS:
        return sum(estimate_paragraph_twips(text, line_twips=line) for text in _paragraphs(section))

    if heading == "附注":
        return sum(estimate_paragraph_twips(text, line_twips=line) for text in _paragraphs(section))

    if heading in {"落款", "签署"}:
        lines = [
            part.strip()
            for text in _paragraphs(section)
            for part in text.split("\n")
            if part.strip()
        ]
        return sum(
            estimate_paragraph_twips(
                line_text,
                line_twips=line,
                before=args.signing_before_twips if index == 0 else 0,
            )
            for index, line_text in enumerate(lines)
        )

    if heading in {"附图", "附录"}:
        total = 0
        for block in section.blocks:
            if block.kind == "paragraph" and block.text:
                total += estimate_paragraph_twips(block.text, line_twips=line)
            elif block.kind == "image" and block.src and image_assets and block.src in image_assets:
                total += estimate_image_twips(image_assets[block.src], args)
        return total

    if heading in STRUCTURAL_HEADINGS or heading in LABELLED_HEADINGS:
        return sum(estimate_paragraph_twips(text, line_twips=line) for text in _paragraphs(section))

    total = 0
    if heading:
        total += estimate_paragraph_twips(heading, line_twips=line)

    for block in section.blocks:
        if block.kind == "paragraph" and block.text:
            total += estimate_paragraph_twips(block.text, line_twips=line)
        elif block.kind == "image" and block.src and image_assets and block.src in image_assets:
            total += estimate_image_twips(image_assets[block.src], args)
        elif block.kind == "heading":
            total += estimate_paragraph_twips(block.text, line_twips=line)
    return total


def compute_end_matter_position(consumed_twips: int, end_matter_twips: int) -> tuple[bool, int]:
    if end_matter_twips <= 0:
        return False, 0
    if end_matter_twips >= PRINTABLE_HEIGHT_TWIPS:
        return (consumed_twips % PRINTABLE_HEIGHT_TWIPS) != 0, 0

    remaining_twips = PRINTABLE_HEIGHT_TWIPS - (consumed_twips % PRINTABLE_HEIGHT_TWIPS)
    if end_matter_twips <= remaining_twips:
        return False, remaining_twips - end_matter_twips
    return True, PRINTABLE_HEIGHT_TWIPS - end_matter_twips
