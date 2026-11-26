#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""公文成稿校验：章节、结构顺序、层级、格式红线、结尾、占位符、行文禁忌。

用法：
    python scripts/check_draft.py 通知 成稿.md
    python scripts/check_draft.py minutes 成稿.md --strict
    python scripts/check_draft.py 报告 成稿.md --facts
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from docgen.constants import STRUCTURAL_HEADINGS  # noqa: E402
from docgen.markdown import LEVEL1_RE, LEVEL2_RE, LEVEL3_RE, LEVEL4_RE, normalize_heading  # noqa: E402
from docgen.registry import load_doc_types, resolve_doc_type  # noqa: E402

HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$")
FENCE_RE = re.compile(r"^\s*(```|~~~)")
IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
OPTIONAL_TAG_RE = re.compile(r"[（(]\s*可选[^）)]*[）)]")

# 只收录结尾套语相对固定的文种；决议、通报、纪要等的结尾因事项而异，
# 不作硬性机检，避免把“会议号召”“现提出以下要求”等合法写法误报。
ENDING_PHRASES = {
    "letter": ["特此函达", "特此函商", "请予支持为盼", "特此函复"],
    "public-notice": ["特此通告"],
    "crisis-report": ["特此报告"],
}

DOC_NUMBER_WRONG_BRACKET_RE = re.compile(r"[\[【]\s*20\d{2}\s*[\]】]\s*第?\s*\d+\s*号")
DOC_NUMBER_WITH_DI_RE = re.compile(r"〔\s*20\d{2}\s*〕\s*第\s*\d+\s*号")
DOC_NUMBER_PADDED_RE = re.compile(r"〔\s*20\d{2}\s*〕\s*0\d+\s*号")
DATE_PADDED_RE = re.compile(r"20\d{2}年0[1-9]月|月0[1-9]日")
SUBJECT_TERM_RE = re.compile(r"主题词\s*[:：]")
PLACEHOLDER_RE = re.compile(r"[\[【][^\]】\n]{0,40}[\]】]|待核实|待补充|X{2,}|×{2,}")
REQUEST_WORDS_RE = re.compile(r"请批示|请批复|妥否|请批准|请予批准|请审定")
# 口语化：聊天腔、口语动词、第二人称劝阻
COLLOQUIAL_RE = re.compile(r"使劲|搞定|踩坑|翻车|拉胯|说白了|一句话说|千万别|不要等[^。；\n]{0,14}再|越[^。；\n]{1,6}越")
# 冒号式小标题：一、认清形势：…… 把解释塞进标题的写法
COLON_HEADING_RE = re.compile(r"^\s*(?:#{1,6}\s*)?[一二三四五六七八九十]+、[^。：\n]{2,16}：")

FACT_PATTERNS = [
    ("文号", re.compile(r"〔\s*20\d{2}\s*〕\s*第?\s*\d+\s*号")),
    ("日期", re.compile(r"20\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日")),
    ("百分比", re.compile(r"\d+(?:\.\d+)?\s*%")),
    ("金额", re.compile(r"\d+(?:\.\d+)?\s*(?:亿元|万元|元)")),
    ("数量", re.compile(r"\d+(?:\.\d+)?\s*(?:亿|万)\s*(?:件|人次|人|起|台|个|户|项|次|吨|公里)")),
]
PLACEHOLDER_SPAN_RE = re.compile(r"[\[【][^\]】\n]*[\]】]")

STRUCTURAL = set(STRUCTURAL_HEADINGS) | {"签署", "落实要求", "责任分工", "后续要求"}
ORDER = ["标题", "主送单位", "正文", "附件", "落款", "附注", "附图", "版记"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="校验公文成稿的章节、结构与格式。")
    parser.add_argument("doc_type", help="文种 id、中文名或别名，如 纪要 / minutes")
    parser.add_argument("file", type=pathlib.Path, help="待校验的 Markdown 文件")
    parser.add_argument("--strict", action="store_true", help="把警告按错误处理")
    parser.add_argument("--facts", action="store_true", help="列出非占位的具体值，供核对来源")
    return parser.parse_args()


class Draft:
    def __init__(self, text: str):
        self.text = text
        self.lines = text.splitlines()
        self.fenced: set[int] = set()
        in_fence = False
        for index, line in enumerate(self.lines):
            if FENCE_RE.match(line):
                in_fence = not in_fence
                self.fenced.add(index)
            elif in_fence:
                self.fenced.add(index)
        self.headings: list[tuple[int, str, int]] = []
        for index, line in enumerate(self.lines):
            if index in self.fenced:
                continue
            match = HEADING_RE.match(line.strip())
            if match:
                self.headings.append((len(match.group(1)), normalize_heading(match.group(2)), index))

    def h2(self) -> list[tuple[str, int]]:
        return [(text, line) for level, text, line in self.headings if level == 2]

    def h1(self) -> list[tuple[str, int]]:
        return [(text, line) for level, text, line in self.headings if level == 1]

    def has_heading(self, name: str) -> bool:
        return any(text == name for _, text, _ in self.headings)

    def section_range(self, name: str) -> tuple[int, int] | None:
        for index, (level, text, line) in enumerate(self.headings):
            if level == 2 and text == name:
                end = len(self.lines)
                for next_level, _, next_line in self.headings[index + 1 :]:
                    if next_level <= 2:
                        end = next_line
                        break
                return line, end
        return None

    def section_lines(self, name: str) -> list[str]:
        span = self.section_range(name)
        if span is None:
            return []
        start, end = span
        return [
            line
            for index, line in enumerate(self.lines[start + 1 : end], start=start + 1)
            if index not in self.fenced and line.strip()
        ]

    def title(self) -> str:
        titles = self.h1()
        if titles:
            return titles[0][0]
        span = self.section_range("标题")
        if span:
            lines = self.section_lines("标题")
            return lines[0].strip() if lines else ""
        return ""


def check_required(draft: Draft, required: list[str]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    infos: list[str] = []
    missing: list[str] = []
    for name in required:
        if name == "标题":
            if not draft.title():
                missing.append(name)
        elif name == "正文":
            if draft.has_heading("正文"):
                continue
            # 没有显式“正文”章节时，只要有非结构性的二级章节或正文段落，即视为有正文。
            body_h2 = [text for text, _ in draft.h2() if text not in STRUCTURAL]
            if not body_h2 and not any(
                line.strip() and not line.strip().startswith("#") for line in draft.lines
            ):
                missing.append(name)
        elif name == "会议信息":
            # 兼容“会议信息”合并块与“会议基本信息 + 出席/参加/记录”分列两种写法。
            if not (draft.has_heading("会议信息") or draft.has_heading("会议基本信息")):
                missing.append(name)
        elif not draft.has_heading(name):
            missing.append(name)
    if missing:
        errors.append(f"缺少必备章节：{'、'.join(missing)}")
    return errors, infos


def check_order(draft: Draft) -> list[str]:
    warnings: list[str] = []
    positions: dict[str, int] = {}
    for text, line in draft.h2():
        if text in ORDER and text not in positions:
            positions[text] = line
        if text == "附件说明" and "附件" not in positions:
            positions["附件"] = line
    known = [(name, positions[name]) for name in ORDER if name in positions]
    sorted_known = sorted(known, key=lambda item: item[1])
    if [name for name, _ in known] != [name for name, _ in sorted_known]:
        warnings.append(
            "结构板块顺序疑似不对：应依次为 标题 → 主送单位 → 正文 → 附件说明 → 落款 → 附注 → 附图 → 版记，"
            f"当前顺序为 {' → '.join(name for name, _ in sorted_known)}。"
        )
    if "附件" in positions and "落款" in positions and positions["附件"] > positions["落款"]:
        warnings.append("附件说明出现在落款之后：应置于正文之后、落款之前。")
    if "附注" in positions and "落款" in positions and positions["附注"] < positions["落款"]:
        warnings.append("附注出现在落款之前：应置于成文日期下一行。")
    return warnings


def check_heading_levels(draft: Draft) -> list[str]:
    warnings: list[str] = []
    levels: list[int] = []
    in_attachment = False
    for index, line in enumerate(draft.lines):
        if index in draft.fenced:
            continue
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            raw = re.sub(r"^#+\s*", "", stripped)
            in_attachment = normalize_heading(raw).startswith("附件")
            if not in_attachment:
                # 二级标题本身可能就是“一、重点任务”，先把它计入层级，避免后面的
                # “（一）”被误判为跳级。
                for level, pattern in ((1, LEVEL1_RE), (2, LEVEL2_RE), (3, LEVEL3_RE), (4, LEVEL4_RE)):
                    if pattern.match(raw):
                        levels.append(level)
                        break
            continue
        if in_attachment:
            continue
        for level, pattern in ((1, LEVEL1_RE), (2, LEVEL2_RE), (3, LEVEL3_RE), (4, LEVEL4_RE)):
            if pattern.match(stripped):
                if level > 1 and levels and (level - 1) not in levels:
                    warnings.append(f"第 {index + 1} 行疑似跳级：`{stripped[:30]}`（前面没有第 {level - 1} 级标题）")
                levels.append(level)
                break
    return warnings


def check_redlines(draft: Draft) -> list[str]:
    warnings: list[str] = []
    text = draft.text
    if DOC_NUMBER_WRONG_BRACKET_RE.search(text):
        warnings.append("发文字号年份应使用六角括号〔〕，不用 [] 或【】。")
    if DOC_NUMBER_WITH_DI_RE.search(text):
        warnings.append("发文字号顺序号不加“第”字（写〔2026〕5号）。")
    if DOC_NUMBER_PADDED_RE.search(text):
        warnings.append("发文字号顺序号不补零（写〔2026〕5号，不写〔2026〕05号）。")
    if DATE_PADDED_RE.search(text):
        warnings.append("成文日期月、日不补前导零（写6月1日，不写06月01日）。")
    if SUBJECT_TERM_RE.search(text):
        warnings.append("2012 版公文格式已取消“主题词”，不应再编排。")
    title = draft.title()
    if title.endswith("。"):
        warnings.append("标题末尾不加句号。")
    if OPTIONAL_TAG_RE.search(text):
        warnings.append("成稿中残留“（可选）”等编辑提示，应从标题和正文中删除。")
    return warnings


def check_ending(draft: Draft, doc_type_id: str) -> list[str]:
    phrases = ENDING_PHRASES.get(doc_type_id)
    if not phrases:
        return []
    if any(phrase in draft.text for phrase in phrases):
        return []
    return [f"未检测到该文种常见结尾用语（如“{phrases[0]}”），请确认结尾是否规范。"]


def check_placeholders(draft: Draft) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    infos: list[str] = []
    found = []
    for index, line in enumerate(draft.lines):
        if index in draft.fenced or IMAGE_RE.search(line):
            continue
        found.extend(PLACEHOLDER_RE.findall(line))
    if found:
        samples = "、".join(sorted(set(found))[:8])
        infos.append(
            f"保留 {len(found)} 处占位符/待核实标记（{samples}）；如为待补信息可保留，定稿前应替换。"
        )
    return errors, infos


def check_row_rules(draft: Draft, doc_type_id: str) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    body_start = draft.section_range("正文")
    if doc_type_id == "crisis-report":
        scope = "\n".join(draft.lines[body_start[0] : body_start[1]]) if body_start else draft.text
        # 报告类材料不以请批语收尾；这里只查正文末段，避免引用历史请示原话被误报。
        if REQUEST_WORDS_RE.search(scope[-400:]):
            errors.append("危机处置报告结尾出现请批语（请批示/请批复/妥否/请批准），报告不得夹带请示事项。")
        # 分节名不固定：事件情况/事件总体情况、处置经过/具体经过都算
        for names in (("事件情况", "事件总体情况"), ("处置经过", "具体经过"), ("整改情况",)):
            if not any(n in scope for n in names):
                errors.append(f"危机处置报告缺少“{names[0]}”部分（应有：事件情况、处置经过、整改情况）。")
    if doc_type_id == "letter" and not draft.has_heading("主送单位"):
        warnings.append("缺少“主送单位”章节：函应有明确的主送机关。")
    if draft.has_heading("附件"):
        content = [line for line in draft.section_lines("附件") if not line.startswith("#")]
        if content and not any(line.strip().startswith("附件") for line in content):
            warnings.append("“附件”章节未以“附件：”开头，附件说明格式可能不规范。")
    return errors, warnings


def check_language(draft: Draft, doc_type_id: str) -> tuple[list[str], list[str]]:
    """语体检查：口语化与冒号式小标题。讲话稿允许极少量口语，其余文种零口语。"""
    warnings: list[str] = []
    infos: list[str] = []
    body = draft.section_range("正文")
    start, end = body if body else (0, len(draft.lines))
    hits: list[str] = []
    for index in range(start, end):
        line = draft.lines[index]
        if index in draft.fenced:
            continue
        for match in COLLOQUIAL_RE.finditer(line):
            hits.append(f"第 {index + 1} 行“{match.group()}”")
        if COLON_HEADING_RE.match(line):
            warnings.append(
                f"第 {index + 1} 行小标题用冒号引出解释（{line.strip()[:16]}…），改为动宾并列句。"
            )
    if hits:
        detail = "；".join(hits[:5])
        if doc_type_id == "speech":
            if len(hits) > 3:
                warnings.append(f"口语色彩偏多（{len(hits)} 处，建议压到三处以内，只用在开场、引述或比喻）：{detail}")
            else:
                infos.append(f"口语化表达 {len(hits)} 处（讲话稿允许，建议只留开场、引述或比喻里的那几处）：{detail}")
        else:
            warnings.append(f"正式文种不用口语：{detail}。改成书面表达。")
    return warnings, infos


def audit_facts(draft: Draft) -> list[str]:
    findings: list[str] = []
    skip_sections = {"落款", "附注", "版记"}
    skip_ranges = [r for name in skip_sections if (r := draft.section_range(name))]
    for index, raw_line in enumerate(draft.lines):
        if index in draft.fenced:
            continue
        if any(start <= index < end for start, end in skip_ranges):
            continue
        line = PLACEHOLDER_SPAN_RE.sub("", raw_line)
        for label, pattern in FACT_PATTERNS:
            for match in pattern.finditer(line):
                findings.append(f"第 {index + 1} 行 {label}：{match.group().strip()}")
    return findings


def main() -> int:
    args = parse_args()
    try:
        doc_type = resolve_doc_type(args.doc_type)
    except ValueError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 2
    if not args.file.exists():
        print(f"[ERROR] 文件不存在：{args.file}", file=sys.stderr)
        return 2
    draft = Draft(args.file.read_text(encoding="utf-8"))

    errors, infos = check_required(draft, list(doc_type.required_sections))
    warnings: list[str] = []
    warnings.extend(check_order(draft))
    warnings.extend(check_heading_levels(draft))
    warnings.extend(check_redlines(draft))
    warnings.extend(check_ending(draft, doc_type.id))
    row_errors, row_warnings = check_row_rules(draft, doc_type.id)
    errors.extend(row_errors)
    warnings.extend(row_warnings)
    lang_warnings, lang_infos = check_language(draft, doc_type.id)
    warnings.extend(lang_warnings)
    infos.extend(lang_infos)
    extra_errors, extra_infos = check_placeholders(draft)
    errors.extend(extra_errors)
    infos.extend(extra_infos)

    if errors:
        print(f"[ERROR] {args.file.name}（{doc_type.name}）校验未通过：")
        for item in errors:
            print(f"- {item}")
    else:
        print(f"[OK] {args.file.name}（{doc_type.name}）章节完整、结构可读。")
    if warnings:
        print("[WARN] 需要人工确认：")
        for item in warnings:
            print(f"- {item}")
    if infos:
        print("[INFO]")
        for item in infos:
            print(f"- {item}")
    if args.facts:
        facts = audit_facts(draft)
        if facts:
            print("[AUDIT] 以下具体值请逐项确认来源，否则改占位或标“待核实”：")
            for item in facts:
                print(f"- {item}")
        else:
            print("[AUDIT] 未发现非占位的具体值。")

    if errors:
        return 1
    if warnings and args.strict:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
