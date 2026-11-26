# -*- coding: utf-8 -*-
"""Markdown 解析与文本启发式：分块、清洗、标题断行、行内标题识别。"""
from __future__ import annotations

import re
from typing import Iterable

from docgen.models import Block, Section

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$")
_IMAGE_RE = re.compile(r"^!\[(.*?)\]\(\s*(.*?)\s*\)\s*$")
_COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
_HR_RE = re.compile(r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$")
_BLOCKQUOTE_RE = re.compile(r"^\s*>\s?")
_LIST_RE = re.compile(r"^\s*(?:[-*+·])\s+")
_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_BOLD_RE = re.compile(r"(\*\*|__)(.*?)\1")
_ITALIC_RE = re.compile(r"(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)")
_CODE_RE = re.compile(r"`([^`]+)`")

# 一级/二级标题常见的“标签词”。行内标题只有短语像板块标签时才加黑体/楷体，
# 否则整段按正文处理，避免把“一、本通知自发布之日起施行”这类条款整句变黑体。
SECTION_LABEL_WORDS = (
    "要求", "任务", "措施", "安排", "目标", "原则", "背景", "依据", "情况", "问题",
    "建议", "意见", "分工", "保障", "步骤", "重点", "内容", "程序", "范围", "标准",
    "时限", "责任", "组织", "实施", "监督", "附则", "说明", "总结", "成效", "做法",
    "打算", "总体", "基本", "主要", "工作", "事项", "议程", "部署", "思路", "举措",
    "方法", "路径", "机制", "制度", "政策", "形势", "意义", "认识", "领导", "队伍",
    "作风", "纪律", "考核", "督查", "宣传", "培训", "资金", "项目", "平台", "数据",
    "安全", "质量", "效率", "方向", "格局", "基础", "举措", "原则", "要求",
)

LEVEL1_RE = re.compile(r"^[一二三四五六七八九十百千]+、")
LEVEL2_RE = re.compile(r"^（[一二三四五六七八九十百千]+）")
LEVEL3_RE = re.compile(r"^\d+[\.．]")
LEVEL4_RE = re.compile(r"^（\d+）")
INLINE_LEVEL1_RE = re.compile(
    r"^([一二三四五六七八九十百千]+、)([^。！？；\n]{1,24}[。：])([\s\S]+)$"
)
INLINE_LEVEL2_RE = re.compile(
    r"^（([一二三四五六七八九十百千]+)）([^。！？；\n]{1,24}[。：])([\s\S]+)$"
)


def _strip_frontmatter(text: str) -> str:
    stripped = text.lstrip("\ufeff")
    if stripped.startswith("---\n"):
        end = stripped.find("\n---", 4)
        if end != -1:
            return stripped[end + 4 :]
    return stripped


def clean_inline(text: str) -> str:
    """清掉 Markdown 行内标记，保留可读正文。"""
    text = _COMMENT_RE.sub("", text)
    text = _BOLD_RE.sub(r"\2", text)
    text = _ITALIC_RE.sub(r"\1", text)
    text = _CODE_RE.sub(r"\1", text)
    text = _LINK_RE.sub(r"\1", text)
    return text.strip()


def normalize_heading(text: str) -> str:
    """去掉标题末尾的“（可选）”等编辑提示，避免打印进成稿。"""
    text = clean_inline(text)
    text = re.sub(r"[（(]\s*可选[^）)]*[）)]\s*$", "", text)
    text = re.sub(r"[（(]\s*可删[^）)]*[）)]\s*$", "", text)
    return text.strip()


def parse_markdown(text: str) -> list[Block]:
    text = _strip_frontmatter(text)
    text = _COMMENT_RE.sub("", text)
    blocks: list[Block] = []
    paragraph_lines: list[str] = []

    def flush_paragraph() -> None:
        if not paragraph_lines:
            return
        raw = "\n".join(paragraph_lines).strip()
        if raw:
            cleaned = "\n".join(clean_inline(line) for line in raw.split("\n")).strip()
            if cleaned:
                blocks.append(Block(kind="paragraph", text=cleaned))
        paragraph_lines.clear()

    for raw_line in text.splitlines():
        if _HR_RE.match(raw_line):
            flush_paragraph()
            continue
        heading_match = _HEADING_RE.match(raw_line.strip())
        if heading_match:
            flush_paragraph()
            blocks.append(
                Block(
                    kind="heading",
                    level=len(heading_match.group(1)),
                    text=normalize_heading(heading_match.group(2)),
                )
            )
            continue

        line = _BLOCKQUOTE_RE.sub("", raw_line)
        image_match = _IMAGE_RE.match(line.strip())
        if image_match:
            flush_paragraph()
            src = image_match.group(2).strip()
            # 支持 ![alt](<路径 含空格.png>) 与 ![alt](path "title") 两种写法。
            if src.startswith("<") and src.endswith(">"):
                src = src[1:-1]
            else:
                src = re.sub(r"\s+[\"'].*$", "", src).strip()
            blocks.append(Block(kind="image", text=clean_inline(image_match.group(1)), src=src))
            continue

        if not line.strip():
            flush_paragraph()
            continue

        # 无序列表在公文里就是普通行或分点，去掉项目符号，避免“- ”原样进 Word。
        if _LIST_RE.match(line):
            flush_paragraph()
            blocks.append(Block(kind="paragraph", text=clean_inline(_LIST_RE.sub("", line, count=1))))
            continue

        paragraph_lines.append(line)

    flush_paragraph()
    return blocks


def extract_title_and_sections(blocks: list[Block]) -> tuple[str | None, list[Section]]:
    top_title: str | None = None
    sections: list[Section] = []
    current: Section | None = None
    for block in blocks:
        if block.kind == "heading" and block.level == 1 and top_title is None:
            top_title = block.text
            continue
        if block.kind == "heading" and block.level == 2:
            current = Section(heading=block.text, blocks=[])
            sections.append(current)
            continue
        if current is not None:
            current.blocks.append(block)
    return top_title, sections


def heading_label_like(phrase: str) -> bool:
    """判断序号后的短语是否像标题（而不是条款正文）。"""
    phrase = phrase.strip().rstrip("。：:；;，,")
    if not phrase:
        return False
    if len(phrase) <= 8:
        return True
    if any(mark in phrase for mark in ("[", "【", "＿")):
        return True
    return any(word in phrase for word in SECTION_LABEL_WORDS)


def split_inline_heading(text: str) -> tuple[str, str, str] | None:
    """拆出行内标题，返回 (level1|level2, 标题短语, 正文)。

    标题短语仍与正文排在同一自然段，只改变字体；返回 None 表示整段按正文处理。
    """
    stripped = text.strip()
    for level, pattern in (("level1", INLINE_LEVEL1_RE), ("level2", INLINE_LEVEL2_RE)):
        match = pattern.match(stripped)
        if not match:
            continue
        if level == "level1":
            marker = match.group(1)
            phrase = match.group(2)
        else:
            marker = "（" + match.group(1) + "）"
            phrase = match.group(2)
        body = match.group(3)
        if not body.strip():
            return None
        if heading_label_like(phrase.rstrip("。：:")):
            return level, marker + phrase, body.lstrip()
        return None
    return None


def paragraph_kind(text: str) -> str | None:
    first_line = text.split("\n", 1)[0].strip()
    if LEVEL1_RE.match(first_line):
        return "level1"
    if LEVEL2_RE.match(first_line):
        return "level2"
    if LEVEL3_RE.match(first_line):
        return "level3"
    if LEVEL4_RE.match(first_line):
        return "level4"
    return None


def is_pure_heading(text: str, kind: str) -> bool:
    """判断一个带序号段落是否只是标题（没有实质正文）。"""
    stripped = text.strip()
    if "\n" in stripped:
        return False
    if kind == "level1":
        phrase = LEVEL1_RE.sub("", stripped).rstrip("。：:；;")
    elif kind == "level2":
        phrase = LEVEL2_RE.sub("", stripped).rstrip("。：:；;")
    else:
        return True
    if len(phrase) <= 8:
        return True
    return (
        "[" in phrase
        or "【" in phrase
        or any(word in phrase for word in SECTION_LABEL_WORDS)
    )


_BRACKET_PAIRS = (("[", "]"), ("【", "】"), ("（", "）"), ("《", "》"), ("“", "”"))

# 标题回行时尽量不拆开的高频双字词。
COMMON_WORDS = {
    "传播", "整理", "素材", "通知", "关于", "开展", "情况", "工作", "建设", "管理",
    "安全", "生产", "会议", "研究", "报告", "请示", "批复", "意见", "决定", "方案",
    "总结", "计划", "实施", "推进", "落实", "服务", "发展", "改革", "创新", "企业",
    "项目", "政策", "制度", "机制", "队伍", "人才", "资金", "监管", "检查", "考核",
    "评估", "应急", "处置", "风险", "隐患", "治理", "保护", "利用", "开发", "运营",
    "宣传", "培训", "教育", "科技", "信息", "数据", "平台", "系统", "网络", "媒体",
    "公众", "社会", "政府", "部门", "单位", "地区", "区域", "城市", "农村", "基层",
    "群众", "领导", "干部", "党员", "组织", "纪律", "作风", "法治", "法律", "法规",
    "标准", "规范", "质量", "效率", "水平", "能力", "体系", "结构", "布局", "规划",
    "统筹", "协调", "配合", "支持", "保障", "监督", "环境", "生态", "文化", "旅游",
    "产业", "市场", "消费", "投资", "贸易", "金融", "财政", "税收", "就业", "收入",
    "医疗", "卫生", "健康", "养老", "住房", "交通", "能源", "资源", "粮食", "农业",
    "乡村", "振兴", "脱贫", "帮扶", "合作", "交流", "开放", "稳定", "防控", "疫情",
    "灾害", "事故", "救援", "重建", "恢复", "秩序", "供应", "储备", "调度", "运行",
    "维护", "改造", "升级", "转型", "智能", "数字", "绿色", "低碳", "节能", "减排",
    "污染", "防治", "修复", "补偿", "交易", "专项", "行动", "攻坚", "部署", "任务",
    "目标", "责任", "时限", "要求", "措施", "办法", "步骤", "阶段", "重点", "难点",
    "问题", "建议", "安排", "意见", "清理", "整治", "排查", "整改", "执法", "审批",
}


def _bracket_spans(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    for open_char, close_char in _BRACKET_PAIRS:
        start = 0
        while True:
            left = text.find(open_char, start)
            if left < 0:
                break
            right = text.find(close_char, left + 1)
            if right < 0:
                break
            spans.append((left, right + 1))
            start = right + 1
    return spans


def _inside_spans(pos: int, spans: list[tuple[int, int]]) -> bool:
    return any(start < pos < end for start, end in spans)


def wrap_title_text(text: str, max_chars: int, enabled: bool) -> str:
    stripped = text.strip()
    if not enabled or "\n" in stripped or len(stripped) <= max_chars:
        return stripped
    bracket_spans = _bracket_spans(stripped)
    line_count = (len(stripped) + max_chars - 1) // max_chars
    min_segment = 4 if len(stripped) >= 8 else 2
    boundaries: list[int] = []
    consumed = 0
    remaining_chars = len(stripped)
    remaining_lines = line_count
    previous_segment_len: int | None = None

    for _ in range(line_count - 1):
        target_len = (remaining_chars + remaining_lines - 1) // remaining_lines
        target = consumed + target_len
        min_pos = consumed + min_segment
        max_pos = len(stripped) - (remaining_lines - 1) * min_segment
        if max_pos < min_pos:
            min_pos = consumed + 2
            max_pos = len(stripped) - (remaining_lines - 1) * 2

        best_pos: int | None = None
        best_score = float("inf")
        for pos in range(max(min_pos, target - 4), min(max_pos, target + 4) + 1):
            segment_len = pos - consumed
            if segment_len < target_len:
                continue
            if previous_segment_len is not None and segment_len > previous_segment_len:
                continue
            if _inside_spans(pos, bracket_spans):
                continue
            prev_char = stripped[pos - 1]
            next_char = stripped[pos]
            score = abs(pos - target) * 10
            if prev_char in "，、：；":
                score -= 12
            if prev_char in "（《【“":
                score += 40
            if next_char in "，。！？、：；）》】”":
                score += 40
            if next_char in "的了和与及并或等":
                score += 8
            if stripped[pos - 1 : pos + 1] in COMMON_WORDS:
                score += 50
            if best_score > score:
                best_score = score
                best_pos = pos

        if best_pos is None:
            for pos in range(max(min_pos, target), max_pos + 1):
                segment_len = pos - consumed
                if previous_segment_len is not None and segment_len > previous_segment_len:
                    continue
                if _inside_spans(pos, bracket_spans):
                    continue
                best_pos = pos
                break

        if best_pos is None:
            candidates = [
                pos
                for pos in range(min_pos, max_pos + 1)
                if not _inside_spans(pos, bracket_spans)
                and (previous_segment_len is None or pos - consumed <= previous_segment_len)
            ]
            best_pos = min(candidates, key=lambda pos: abs(pos - target)) if candidates else max(
                min_pos, min(max_pos, consumed + (previous_segment_len or target_len))
            )

        boundaries.append(best_pos)
        previous_segment_len = best_pos - consumed
        consumed = best_pos
        remaining_chars = len(stripped) - consumed
        remaining_lines -= 1

    segments = []
    start = 0
    for boundary in boundaries:
        segments.append(stripped[start:boundary])
        start = boundary
    segments.append(stripped[start:])
    return "\n".join(segment for segment in segments if segment)


def is_date_line(text: str) -> bool:
    normalized = text.strip()
    if normalized in {"[日期]", "【日期】", "[成文日期]", "××××年××月××日", "XXXX年XX月XX日"}:
        return True
    return bool(re.fullmatch(r"\d{4}年\d{1,2}月\d{1,2}日", normalized))


def normalize_annotation_text(text: str) -> str:
    stripped = text.strip()
    if not stripped:
        return stripped
    if stripped.startswith("（") and stripped.endswith("）"):
        return stripped
    return f"（{stripped}）"


def collect_image_sources(blocks: Iterable[Block]) -> list[str]:
    seen: set[str] = set()
    sources: list[str] = []
    for block in blocks:
        if block.kind == "image" and block.src and block.src not in seen:
            seen.add(block.src)
            sources.append(block.src)
    return sources
