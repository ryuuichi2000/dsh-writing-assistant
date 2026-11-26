#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""研究型写作 / 深度研究 Markdown → Word .docx。

面向公众号式文章的阅读版式：A4、标题黑体二号居中、小节黑体、
正文宋体小四 1.5 倍行距、列表悬挂缩进、表格带表头、文末参考资料小一号。
只依赖 python-docx（DSH 自带运行时已包含，抽 .docx 材料也用它）。

用法：
    python scripts/export_article.py 成稿.md -o 成稿.docx
"""
from __future__ import annotations

import argparse
import datetime as _dt
import pathlib
import re
import sys

try:
    from docx import Document
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Cm, Pt, RGBColor
except Exception as exc:  # pragma: no cover - 环境缺依赖时给人话
    print(f"缺少 python-docx：{exc}", file=sys.stderr)
    raise SystemExit(3)

BODY_FONT = "宋体"
HEAD_FONT = "黑体"
MONO_FONT = "Consolas"
BODY_PT = 12
REF_PT = 10.5
INK = RGBColor(0x24, 0x23, 0x1E)
MUTED = RGBColor(0x68, 0x66, 0x5D)

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$")
_TABLE_SEP_RE = re.compile(r"^\s*\|?[\s:|-]+\|?\s*$")
_BULLET_RE = re.compile(r"^(\s*)[-*+]\s+(.*)$")
_ORDERED_RE = re.compile(r"^(\s*)(\d+)[.)]\s+(.*)$")
_QUOTE_RE = re.compile(r"^\s*>\s?(.*)$")
_FENCE_RE = re.compile(r"^\s*(```|~~~)")
_IMAGE_RE = re.compile(r"^!\[(.*?)\]\(\s*(.*?)\s*\)\s*$")
_HR_RE = re.compile(r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$")
_COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
_REF_HEADINGS = {"参考资料", "参考文献", "参考来源"}
_CJK_EDGE_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]")


def join_wrapped(lines: list[str]) -> str:
    """把 Markdown 里为一句话折的行接回去：中文之间不加空格，西文之间加一个。"""
    out = ""
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if not out:
            out = line
        elif _CJK_EDGE_RE.search(out[-1]) and _CJK_EDGE_RE.search(line[0]):
            out += line
        else:
            out += " " + line
    return out

_INLINE_RE = re.compile(
    r"(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))"
)


def plain_heading(text: str) -> str:
    return re.sub(r"\s*[（(]\s*可选[^）)]*[）)]\s*$", "", strip_inline(text)).strip()


def strip_inline(text: str) -> str:
    text = _COMMENT_RE.sub("", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"__(.+?)__", r"\1", text)
    text = re.sub(r"(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", text)
    return text.strip()


def set_run_font(run, *, font=BODY_FONT, size=BODY_PT, bold=False, italic=False, color=INK):
    run.font.name = font
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = color
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    rfonts.set(qn("w:eastAsia"), font)


def add_inline(paragraph, text: str, *, size=BODY_PT, base_font=BODY_FONT, keep_url=False, color=INK):
    """把一段 Markdown 行内标记写进段落：粗体、斜体、行内代码、链接。"""
    text = text.replace("\u00a0", " ")
    pos = 0
    for match in _INLINE_RE.finditer(text):
        if match.start() > pos:
            run = paragraph.add_run(text[pos : match.start()])
            set_run_font(run, font=base_font, size=size, color=color)
        token = match.group(0)
        if token.startswith("**"):
            run = paragraph.add_run(token[2:-2])
            set_run_font(run, font=base_font, size=size, bold=True, color=color)
        elif token.startswith("__"):
            run = paragraph.add_run(token[2:-2])
            set_run_font(run, font=base_font, size=size, bold=True, color=color)
        elif token.startswith("`"):
            run = paragraph.add_run(token[1:-1])
            set_run_font(run, font=MONO_FONT, size=size - 1, color=color)
        elif token.startswith("["):
            m = re.match(r"\[([^\]]+)\]\(([^)]+)\)", token)
            label, url = (m.group(1), m.group(2)) if m else (token, "")
            if keep_url and url:
                run = paragraph.add_run(f"{label}（{url}）")
            else:
                run = paragraph.add_run(label)
            set_run_font(run, font=base_font, size=size, color=color)
        else:
            run = paragraph.add_run(token[1:-1] if len(token) > 2 else token)
            set_run_font(run, font=base_font, size=size, italic=True, color=color)
        pos = match.end()
    if pos < len(text):
        run = paragraph.add_run(text[pos:])
        set_run_font(run, font=base_font, size=size, color=color)


def format_body(paragraph, *, indent=True, after=6, line=1.5, size=BODY_PT, color=INK, align=None):
    pf = paragraph.paragraph_format
    pf.line_spacing = line
    pf.space_before = Pt(0)
    pf.space_after = Pt(after)
    pf.first_line_indent = Pt(size * 2) if indent else Pt(0)
    if align is not None:
        paragraph.alignment = align


def add_heading(doc, text: str, level: int):
    p = doc.add_paragraph()
    size = {1: 22, 2: 16, 3: 14}.get(level, 12)
    run = p.add_run(text)
    set_run_font(run, font=HEAD_FONT, size=size, bold=True, color=INK)
    pf = p.paragraph_format
    pf.line_spacing = 1.3
    pf.space_before = Pt(20 if level <= 2 else 14)
    pf.space_after = Pt(8 if level <= 2 else 6)
    pf.keep_with_next = True
    pf.first_line_indent = Pt(0)
    return p


def wrap_title(text: str, max_chars: int = 19) -> list[str]:
    """长标题按标点/空格折成大致等长的两三行，避免最后一行只剩一个字。"""
    text = text.strip()
    if len(text) <= max_chars:
        return [text]
    total = max(1, (len(text) + max_chars - 1) // max_chars)
    per = (len(text) + total - 1) // total
    lines: list[str] = []
    rest = text
    while len(rest) > max_chars:
        target = per
        best = None
        # 只在目标位置附近找断点：宁可切在 target，也不要为了一个逗号把首行切得太短
        for delta in range(1, 4):
            for pos in (target - delta, target + delta):
                if 0 < pos < len(rest) and rest[pos - 1] in "，。：；、！？ 　":
                    dist = abs(pos - target)
                    if best is None or dist < best[0] or (dist == best[0] and pos > best[1]):
                        best = (dist, pos)
        cut = best[1] if best else target
        lines.append(rest[:cut].strip())
        rest = rest[cut:].strip()
    if rest:
        lines.append(rest)
    return [line for line in lines if line]


def add_title(doc, text: str):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    lines = wrap_title(text)
    for index, line in enumerate(lines):
        if index:
            p.add_run().add_break()
        run = p.add_run(line)
        set_run_font(run, font=HEAD_FONT, size=22, bold=True, color=INK)
    pf = p.paragraph_format
    pf.line_spacing = 1.35
    pf.space_before = Pt(0)
    pf.space_after = Pt(22)
    return p


def add_list_item(doc, text: str, marker: str, *, refs=False, indent_cm=0.74, base_indent_cm=0.0):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.left_indent = Cm(base_indent_cm + indent_cm)
    pf.first_line_indent = Cm(-indent_cm)
    pf.line_spacing = 1.5 if not refs else 1.3
    pf.space_before = Pt(0)
    pf.space_after = Pt(3 if not refs else 2)
    prefix = p.add_run(marker + " ")
    set_run_font(prefix, font=BODY_FONT, size=REF_PT if refs else BODY_PT, color=INK)
    add_inline(p, text, size=REF_PT if refs else BODY_PT, keep_url=refs)


def add_quote(doc, text: str):
    p = doc.add_paragraph()
    # 先放边框，再设段落属性：pPr 的子元素顺序要符合 OOXML，Word 才不报修复
    pPr = p._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    left = OxmlElement("w:left")
    left.set(qn("w:val"), "single")
    left.set(qn("w:sz"), "12")
    left.set(qn("w:space"), "12")
    left.set(qn("w:color"), "C9C4B7")
    borders.append(left)
    pPr.append(borders)
    pf = p.paragraph_format
    pf.left_indent = Cm(0.74)
    pf.right_indent = Cm(0.74)
    pf.first_line_indent = Pt(0)
    pf.line_spacing = 1.4
    pf.space_before = Pt(4)
    pf.space_after = Pt(8)
    add_inline(p, text, color=MUTED)


def shade_cell(cell, fill="F2F0EA"):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    tcPr.append(shd)


def mark_header_row(row):
    trPr = row._tr.get_or_add_trPr()
    tblHeader = OxmlElement("w:tblHeader")
    tblHeader.set(qn("w:val"), "true")
    trPr.append(tblHeader)


def split_table_row(line: str) -> list[str]:
    body = line.strip().strip("|")
    return [cell.strip() for cell in body.split("|")]


def add_table(doc, rows: list[list[str]]):
    if not rows:
        return
    cols = max(len(r) for r in rows)
    table = doc.add_table(rows=0, cols=cols)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    for row_index, cells in enumerate(rows):
        row = table.add_row()
        if row_index == 0:
            mark_header_row(row)
        for col in range(cols):
            cell = row.cells[col]
            text = cells[col] if col < len(cells) else ""
            p = cell.paragraphs[0]
            p.paragraph_format.line_spacing = 1.25
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.first_line_indent = Pt(0)
            add_inline(p, text, size=10.5, color=INK)
            for run in p.runs:
                run.font.bold = row_index == 0
            if row_index == 0:
                shade_cell(cell)
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(0)
    spacer.paragraph_format.space_before = Pt(0)
    spacer.paragraph_format.line_spacing = 0.6


def add_code(doc, lines: list[str]):
    for line in lines:
        p = doc.add_paragraph()
        pf = p.paragraph_format
        pf.left_indent = Cm(0.74)
        pf.first_line_indent = Pt(0)
        pf.line_spacing = 1.2
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)
        run = p.add_run(line.replace("\t", "    "))
        set_run_font(run, font=MONO_FONT, size=9.5, color=MUTED)


def add_image_placeholder(doc, alt: str):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.first_line_indent = Pt(0)
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(6)
    run = p.add_run(f"［图片：{alt or '未命名'}］")
    set_run_font(run, size=10.5, color=MUTED)


def add_page_number_footer(section):
    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    for element in (begin, instr, end):
        run = p.add_run()
        set_run_font(run, size=9, color=MUTED)
        run._r.append(element)


def setup_document(doc: Document, title: str):
    normal = doc.styles["Normal"]
    normal.font.name = BODY_FONT
    normal.font.size = Pt(BODY_PT)
    normal.element.get_or_add_rPr()
    rfonts = normal.element.rPr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        normal.element.rPr.append(rfonts)
    rfonts.set(qn("w:eastAsia"), BODY_FONT)

    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.54)
    section.bottom_margin = Cm(2.54)
    section.left_margin = Cm(3.0)
    section.right_margin = Cm(3.0)
    section.header_distance = Cm(1.5)
    section.footer_distance = Cm(1.5)
    add_page_number_footer(section)

    props = doc.core_properties
    props.title = title
    props.author = ""
    props.last_modified_by = ""
    props.subject = ""
    props.comments = "由写作助手导出"


def parse_blocks(text: str):
    """把 Markdown 拆成可渲染的块：标题、段落、列表、表格、引用、代码、图片。"""
    text = text.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            text = text[end + 4 :]
    text = _COMMENT_RE.sub("", text)
    lines = text.split("\n")
    blocks = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip() or _HR_RE.match(line) and not line.lstrip().startswith("|"):
            i += 1
            continue
        if _FENCE_RE.match(line):
            fence = _FENCE_RE.match(line).group(1)
            code = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith(fence):
                code.append(lines[i])
                i += 1
            i += 1
            blocks.append(("code", code))
            continue
        m = _HEADING_RE.match(line)
        if m:
            blocks.append(("heading", len(m.group(1)), strip_inline(m.group(2))))
            i += 1
            continue
        m = _IMAGE_RE.match(line.strip())
        if m:
            blocks.append(("image", m.group(1)))
            i += 1
            continue
        if line.lstrip().startswith("|"):
            rows = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                if not _TABLE_SEP_RE.match(lines[i]):
                    rows.append(split_table_row(lines[i]))
                i += 1
            blocks.append(("table", rows))
            continue
        m = _BULLET_RE.match(line)
        if m:
            items = []
            while i < len(lines):
                mm = _BULLET_RE.match(lines[i])
                if not mm:
                    break
                items.append((len(mm.group(1).replace("\t", "  ")) // 2, mm.group(2)))
                i += 1
            blocks.append(("bullets", items))
            continue
        m = _ORDERED_RE.match(line)
        if m:
            items = []
            while i < len(lines):
                mm = _ORDERED_RE.match(lines[i])
                if not mm:
                    break
                items.append((len(mm.group(1).replace("\t", "  ")) // 2, mm.group(2), mm.group(3)))
                i += 1
            blocks.append(("ordered", items))
            continue
        m = _QUOTE_RE.match(line)
        if m:
            quotes = []
            while i < len(lines):
                mm = _QUOTE_RE.match(lines[i])
                if not mm:
                    break
                quotes.append(mm.group(1))
                i += 1
            blocks.append(("quote", " ".join(quotes)))
            continue
        # 普通段落：连续的普通行合并；中文折行不加空格，西文折行加一个空格
        para = [line.strip()]
        i += 1
        while i < len(lines):
            nxt = lines[i]
            if not nxt.strip():
                break
            if (
                _HEADING_RE.match(nxt)
                or _FENCE_RE.match(nxt)
                or _BULLET_RE.match(nxt)
                or _ORDERED_RE.match(nxt)
                or _QUOTE_RE.match(nxt)
                or nxt.lstrip().startswith("|")
                or _IMAGE_RE.match(nxt.strip())
                or _HR_RE.match(nxt)
            ):
                break
            para.append(nxt.strip())
            i += 1
        blocks.append(("paragraph", join_wrapped(para)))
    return blocks


def render(doc: Document, blocks) -> dict:
    counts = {"paragraph": 0, "heading": 0, "table": 0, "list": 0, "refs": 0}
    title_done = False
    refs = False
    for block in blocks:
        kind = block[0]
        if kind == "heading":
            level, text = block[1], block[2]
            if level == 1 and not title_done:
                add_title(doc, text)
                title_done = True
                continue
            add_heading(doc, text, level)
            counts["heading"] += 1
            if text in _REF_HEADINGS:
                refs = True
            continue
        if kind == "paragraph":
            text = block[1]
            p = doc.add_paragraph()
            if refs:
                format_body(p, indent=False, after=4, line=1.3, size=REF_PT)
                add_inline(p, text, size=REF_PT, keep_url=True)
                counts["refs"] += 1
            else:
                format_body(p)
                add_inline(p, text)
                counts["paragraph"] += 1
            continue
        if kind == "bullets":
            for indent, text in block[1]:
                add_list_item(doc, text, "•", refs=refs, base_indent_cm=indent * 0.6)
            counts["list"] += len(block[1])
            if refs:
                counts["refs"] += len(block[1])
            continue
        if kind == "ordered":
            for indent, number, text in block[1]:
                add_list_item(doc, text, f"{number}.", refs=refs, base_indent_cm=indent * 0.6)
            counts["list"] += len(block[1])
            if refs:
                counts["refs"] += len(block[1])
            continue
        if kind == "table":
            add_table(doc, block[1])
            counts["table"] += 1
            continue
        if kind == "quote":
            add_quote(doc, block[1])
            continue
        if kind == "code":
            add_code(doc, block[1])
            continue
        if kind == "image":
            add_image_placeholder(doc, block[1])
            continue
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="文章 Markdown → Word")
    parser.add_argument("input", type=pathlib.Path)
    parser.add_argument("-o", "--output", type=pathlib.Path)
    parser.add_argument("--fallback-title", default="")
    args = parser.parse_args()

    src = args.input
    if not src.exists():
        print(f"找不到成稿：{src}", file=sys.stderr)
        return 1
    out = args.output or src.with_suffix(".docx")
    out.parent.mkdir(parents=True, exist_ok=True)

    text = src.read_text(encoding="utf-8")
    blocks = parse_blocks(text)
    title = ""
    for block in blocks:
        if block[0] == "heading" and block[1] == 1:
            title = block[2]
            break
    doc = Document()
    setup_document(doc, title or args.fallback_title or src.stem)
    if not title and args.fallback_title:
        add_title(doc, args.fallback_title)
    counts = render(doc, blocks)
    doc.save(str(out))
    print(
        f"导出成功：{counts['paragraph']} 段正文 · {counts['heading']} 个小节 · "
        f"{counts['table']} 张表 · {counts['list']} 条列表 · {counts['refs']} 条参考资料 → {out.name}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
