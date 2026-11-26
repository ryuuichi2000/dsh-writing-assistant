#!/usr/bin/env python3
"""dsh-writing 写作模块 CLI。

四件事：
  1. 把用户上传的语料整理成语料库，统计可观察的写作特征（corpus）。
  2. 校验语气档案的结构和证据（voice check）。
  3. 把 Markdown 成稿渲染成可预览、可选中改稿的单文件网页（render）。
  4. 把预览页发来的选区修改请求落成对 draft.md 的精确补丁，并留下可回退的记录（patch / revert / check）。

只依赖 Python 标准库。
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import html as html_lib
import json
import os
import re
import sys
import zipfile
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote
from xml.etree import ElementTree as ET

SKILL_ROOT = Path(__file__).resolve().parent.parent
ASSETS = SKILL_ROOT / "assets"
HOME_ENV = "DSH_WRITING_HOME"
DEFAULT_HOME = Path(os.environ.get(HOME_ENV) or (Path.home() / ".dsh-writing"))

CJK = r"\u4e00-\u9fff"
HEADING_LINE_RE = re.compile(r"^(#{1,6})\s+(.*)$")
LIST_RE = re.compile(r"^(\s{0,3})(?:([-*+])|(\d+)[.)])\s+(.*)$")
FENCE_RE = re.compile(r"^\s*(```|~~~)")
HR_RE = re.compile(r"^\s{0,3}([-*_])(?:\s*\1){2,}\s*$")
TABLE_RE = re.compile(r"^\s*\|.*\|\s*$")
QUOTE_RE = re.compile(r"^\s*>\s?")
PLACEHOLDER_RE = re.compile(r"〔待核[^〕]*〕|【待核[^】]*】|\[\s*待核[^\]]*\]|TODO|\?\?")
CITE_RE = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")
# 引用规范：正文写行内归属（根据《X》报道 / 据 Y 统计 / Z 数据显示），不挂编号
ATTR_RE = re.compile(
    r"(?:根据|据)\s*[^。！？\n]{0,36}?(?:报道|统计|数据|显示|披露|估算|公告|年报|招股书|官网|财报|白皮书)"
    r"|[\u4e00-\u9fa5A-Za-z0-9《》]{1,24}(?:数据显示|披露|公布的数据|的测算|的调研)"
)
NUMBER_RE = re.compile(
    r"\d+(?:\.\d+)?\s*(?:%|亿元|万元|亿美元|亿美元|亿|万|人次|份|张|杯|套|处|家|款)"
)

REQUIRED_SECTIONS = [
    ("画像", ("画像", "一句话")),
    ("节奏与结构", ("节奏", "结构")),
    ("人称与称呼", ("人称", "称呼")),
    ("常用词与不用的词", ("常用词", "词汇")),
    ("判断与语气", ("判断", "语气")),
    ("标点与中英混排", ("标点", "混排")),
    ("对话中学到的", ("对话中学到", "对话")),
    ("原文参照", ("原文", "参照", "样例")),
]

EMPTY_WORDS = [
    "赋能", "抓手", "闭环", "颠覆", "重塑", "引领", "里程碑", "深远影响", "深刻影响",
    "开启新篇章", "深度融合", "持续深化", "全面推进", "取得显著成效", "高质量发展",
    "新质生产力", "生态化", "全方位", "多维度", "底层逻辑", "组合拳",
]
VAGUE_ATTR = re.compile(r"专家(?:认为|表示|指出)|学者(?:认为|表示)|业内人士|分析人士|消息人士|有关方面|相关部门|据了解|据悉|研究表明|数据显示|报告显示")
ABSOLUTE = re.compile(r"必然|彻底|完全(?:取代|改变|解决)|唯一|无一例外|从来(?:没有|不)|100%|绝对")
TRANSLATIONESE = [
    r"对于[^，。；]{1,14}来说", r"基于此", r"围绕[^，。；]{1,14}展开", r"从某种意义上说",
    r"值得注意的是", r"与此同时", r"在这一?背景下", r"使得[^，。；]{1,14}得以",
    r"在[^，。；]{1,14}的背景下", r"就[^，。；]{1,14}而言", r"旨在", r"进一步地",
]
NGRAM_STOP = set("的了是在和与就都而及或也对把被让给从向于为以不没很更最太又还只才刚已将要会能可得地着过这那你我他她它们个些种样么什怎吗呢吧啊呀嘛其此该每各某些")


class UserError(Exception):
    """给用户看的错误：不打印堆栈。"""


# --------------------------------------------------------------------------- #
# 基础工具
# --------------------------------------------------------------------------- #

def home_path(explicit: str | None = None) -> Path:
    return Path(explicit).expanduser().resolve() if explicit else DEFAULT_HOME


def active_profile(home: Path) -> str:
    marker = home / "voice" / "active"
    if marker.exists():
        name = marker.read_text(encoding="utf-8").strip()
        if name:
            return name
    return "default"


def voice_root(home: Path, profile: str | None = None) -> Path:
    return home / "voice" / (profile or active_profile(home))


def read_text(path: Path) -> str:
    data = Path(path).read_bytes()
    for enc in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", "replace")


def write_text(path: Path, text: str) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    return path


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def today() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def read_json(path: Path, default=None):
    if not Path(path).exists():
        return default
    return json.loads(read_text(path))


def write_json(path: Path, data) -> Path:
    return write_text(path, json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def fail(message: str, code: int = 2):
    print(f"错误：{message}", file=sys.stderr)
    raise SystemExit(code)


# --------------------------------------------------------------------------- #
# 文本提取：md / txt / docx / html / rtf
# --------------------------------------------------------------------------- #

class _HTMLText(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "head"}
    BLOCK = {
        "p", "div", "br", "li", "tr", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6",
        "section", "article", "blockquote", "pre", "table", "ul", "ol", "figure", "figcaption",
    }

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skip += 1
        if tag in self.BLOCK:
            self.parts.append("\n")

    def handle_startendtag(self, tag, attrs):
        if tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self._skip:
            self._skip -= 1
        if tag in self.BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self.parts.append(data)


def html_text(text: str) -> str:
    parser = _HTMLText()
    parser.feed(text)
    text = "".join(parser.parts)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def docx_text(path: Path, *, markdown: bool = False) -> str:
    ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

    def read_part(archive, name):
        if archive.getinfo(name).file_size > 32 * 1024 * 1024:
            raise UserError("Word 正文过大，请拆分后再试")
        return ET.fromstring(archive.read(name))

    try:
        with zipfile.ZipFile(path) as zf:
            root = read_part(zf, "word/document.xml")
            styles = {}
            links = {}
            if markdown and "word/styles.xml" in zf.namelist():
                for style in read_part(zf, "word/styles.xml"):
                    name = style.find(ns + "name")
                    level = style.find(f"{ns}pPr/{ns}outlineLvl")
                    label = name.get(ns + "val", "") if name is not None else ""
                    styles[style.get(ns + "styleId", "")] = (label, level)
            rels_path = "word/_rels/document.xml.rels"
            if markdown and rels_path in zf.namelist():
                try:
                    for relation in read_part(zf, rels_path):
                        target = relation.get("Target", "")
                        if relation.get("TargetMode") == "External" and re.match(r"^https?://", target, re.I):
                            links[relation.get("Id", "")] = target
                except ET.ParseError:
                    pass  # The body is still readable if the optional link map is malformed.
    except (KeyError, zipfile.BadZipFile, ET.ParseError, RuntimeError) as exc:
        raise UserError("Word 文档无法解析，请在 Word 或 WPS 中另存为 .docx 后再试") from exc
    body = root.find(ns + "body")
    if body is None:
        raise UserError("Word 文档没有可读取的正文")

    def text_content(node):
        if node.tag == ns + "t":
            return node.text or ""
        if node.tag == ns + "tab":
            return "\t"
        if node.tag in (ns + "br", ns + "cr"):
            return "\n"
        text = "".join(map(text_content, node))
        if markdown and text and node.tag == ns + "hyperlink":
            link_id = node.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            url = links.get(link_id)
            if url:
                label = text.replace("[", "［").replace("]", "］").replace("\n", " ")
                return f"[{label}]({quote(url, safe=':/?#@!$&*+,;=%~')})"
        return text

    def paragraph_text(para):
        return text_content(para).strip()

    if not markdown:
        return "\n\n".join(filter(None, (paragraph_text(para) for para in body.iter(ns + "p"))))

    def heading_level(para, style_id, label, style_level):
        level = para.find(f"{ns}pPr/{ns}outlineLvl")
        if level is None:
            level = style_level
        if level is not None:
            value = level.get(ns + "val", "")
            if value in "012345" and len(value) == 1:
                return int(value) + 1
        for name in (label, style_id):
            match = re.fullmatch(r"(?:heading|标题)\s*([1-6])", name, re.I)
            if match:
                return int(match.group(1))
            if name.lower() in ("title", "标题"):
                return 1
        return 0

    blocks = []
    for node in body:
        if node.tag == ns + "p":
            text = paragraph_text(node)
            if text:
                style = node.find(f"{ns}pPr/{ns}pStyle")
                style_id = style.get(ns + "val", "") if style is not None else ""
                label, outline = styles.get(style_id, ("", None))
                level = heading_level(node, style_id, label, outline)
                style_kind = (label or style_id).lower().replace(" ", "")
                prefix = "#" * level + " " if level else ""
                if not prefix:
                    if style_kind.startswith("listnumber"):
                        prefix = "1. "
                    elif style_kind.startswith("listbullet") or node.find(f"{ns}pPr/{ns}numPr") is not None:
                        prefix = "- "
                blocks.append(prefix + text)
        elif node.tag == ns + "tbl":
            rows = [
                [" ".join(filter(None, map(paragraph_text, cell.iter(ns + "p")))).replace("\n", " ").replace("|", "｜")
                 for cell in row.findall(ns + "tc")]
                for row in node.findall(ns + "tr")
            ]
            if rows and any(rows):
                width = max(map(len, rows))
                rows.insert(1, ["---"] * width)
                blocks.append("\n".join("| " + " | ".join(row + [""] * (width - len(row))) + " |" for row in rows))
        elif node.tag in (ns + "sdt", ns + "customXml"):
            blocks.extend(filter(None, map(paragraph_text, node.iter(ns + "p"))))
    return "\n\n".join(blocks)


def rtf_text(text: str) -> str:
    text = re.sub(r"\\[a-zA-Z]+-?\d* ?", "", text)
    text = re.sub(
        r"\\'([0-9a-fA-F]{2})",
        lambda m: bytes([int(m.group(1), 16)]).decode("gb18030", "ignore"),
        text,
    )
    text = text.replace("{", "").replace("}", "")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_text(path: Path) -> str:
    path = Path(path)
    if not path.exists():
        raise UserError(f"找不到文件：{path}")
    ext = path.suffix.lower()
    if ext == ".docx":
        return docx_text(path)
    if ext == ".doc":
        raise UserError("旧版 .doc 请先在 Word/WPS 里另存为 .docx 或 .md")
    if ext == ".pdf":
        raise UserError("PDF 先转成 .docx / .md / .txt 再作为语料（PDF 取文本容易丢段落和标点）")
    if ext in {".html", ".htm"}:
        return html_text(read_text(path))
    if ext == ".rtf":
        return rtf_text(read_text(path))
    if ext in {".md", ".markdown", ".txt", ".text", ".csv", ".log", ".json", ""}:
        return read_text(path)
    raise UserError(f"不支持的文件类型：{ext or '无扩展名'}（支持 md / txt / docx / html / rtf）")


def clean_sample(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# --------------------------------------------------------------------------- #
# 统计
# --------------------------------------------------------------------------- #

def strip_markup(text: str) -> str:
    t = re.sub(r"```[\s\S]*?```", "", text)
    t = re.sub(r"`[^`\n]+`", "", t)
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", t)
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"^\s{0,3}#{1,6}\s+", "", t, flags=re.M)
    t = re.sub(r"^\s{0,3}>\s?", "", t, flags=re.M)
    t = re.sub(r"^\s{0,3}(?:[-*+]|\d+[.)])\s+", "", t, flags=re.M)
    t = re.sub(r"^\s*[-*_]{3,}\s*$", "", t, flags=re.M)
    t = re.sub(r"(\*\*|__|\*|_)", "", t)
    t = t.replace("|", " ")
    return t.strip()


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[。！？!?…])\s*", text) if s.strip()]


def basic_stats(text: str) -> dict:
    plain = strip_markup(text)
    chars = len(re.sub(r"\s", "", plain))
    sents = split_sentences(plain)
    lens = [len(re.sub(r"\s", "", s)) for s in sents]
    paras = [p for p in re.split(r"\n\s*\n", plain) if p.strip()]
    para_lens = [len(re.sub(r"\s", "", p)) for p in paras]
    latin = re.findall(r"[A-Za-z][A-Za-z0-9.+#-]*", plain)
    cjk = re.findall(f"[{CJK}]", plain)
    digits = re.findall(r"\d", plain)
    return {
        "chars": chars,
        "paragraphs": len(paras),
        "sentences": len(sents),
        "avg_sentence": round(sum(lens) / len(lens), 1) if lens else 0,
        "median_sentence": sorted(lens)[len(lens) // 2] if lens else 0,
        "max_sentence": max(lens) if lens else 0,
        "long_sentences": sum(1 for x in lens if x > 80),
        "short_sentences": sum(1 for x in lens if x < 15),
        "avg_paragraph": round(sum(para_lens) / len(para_lens), 1) if para_lens else 0,
        "long_dash": plain.count("——"),
        "ellipsis": plain.count("……"),
        "exclaim": plain.count("！"),
        "question": plain.count("？"),
        "colon": plain.count("："),
        "semicolon": plain.count("；"),
        "quotes_double": plain.count("“"),
        "quotes_corner": plain.count("「"),
        "first_person": len(re.findall(r"我们|我", plain)),
        "second_person": len(re.findall(r"您|你", plain)),
        "everyone": len(re.findall(r"大家", plain)),
        "latin_words": len(latin),
        "digits": len(digits),
        "cjk_chars": len(cjk),
        "latin_ratio": round(len(latin) / max(1, len(latin) + len(cjk)), 3),
        "cjk_latin_spaces": len(re.findall(f"[{CJK}]\\s+[A-Za-z]|[A-Za-z]\\s+[{CJK}]", plain)),
    }


def top_ngrams(text: str, n: int = 2, limit: int = 12) -> list[tuple[str, int]]:
    plain = re.sub(f"[^{CJK}]", " ", strip_markup(text))
    counts: dict[str, int] = {}
    for chunk in plain.split():
        for i in range(len(chunk) - n + 1):
            gram = chunk[i : i + n]
            if any(ch in NGRAM_STOP for ch in gram):
                continue
            counts[gram] = counts.get(gram, 0) + 1
    picked = [(g, c) for g, c in counts.items() if c >= 3]
    return sorted(picked, key=lambda x: (-x[1], x[0]))[:limit]


# --------------------------------------------------------------------------- #
# 语料库
# --------------------------------------------------------------------------- #

def corpus_index_path(root: Path) -> Path:
    return root / "index.json"


def load_index(root: Path) -> dict:
    return read_json(corpus_index_path(root), {"version": 1, "samples": []})


def rebuild_corpus_md(root: Path) -> Path:
    index = load_index(root)
    samples = index.get("samples", [])
    total = sum(s.get("chars", 0) for s in samples)
    lines = [
        f"# 语气语料（档案：{root.name}）",
        "",
        f"{len(samples)} 篇 · 约 {total} 字 · 更新 {today()}",
        "",
        "> 只在本机。提炼时只学写作习惯，不把语料里的经历、数据、立场、事实搬进新文章。",
        "",
    ]
    for i, sample in enumerate(samples, 1):
        body = read_text(root / sample["file"]).strip()
        stats = basic_stats(body)
        sample["stats"] = stats
        sample["chars"] = stats["chars"]
        lines += [
            f"## {i}. {sample['title']}（{sample.get('added', '')[:10]} · {sample.get('chars', 0)} 字 · {sample.get('origin', 'upload')}）",
            "",
            body,
            "",
        ]
    out = write_text(root / "corpus.md", "\n".join(lines))
    index["updated"] = now_iso()
    index["chars"] = total
    write_json(corpus_index_path(root), index)
    return out


def sample_title(text: str, fallback: str) -> str:
    for line in text.splitlines():
        match = HEADING_LINE_RE.match(line.strip())
        if match:
            return match.group(2).strip()[:80]
    first = next((line.strip() for line in text.splitlines() if line.strip()), "")
    return (first[:40] or fallback).strip()


def safe_name(text: str, limit: int = 40) -> str:
    name = re.sub(r"[\\/:*?\"<>|\s]+", "-", text).strip("-")
    return (name or "sample")[:limit]


def cmd_corpus_add(args) -> int:
    home = home_path(args.home)
    root = voice_root(home, args.profile)
    root.mkdir(parents=True, exist_ok=True)
    index = load_index(root)
    known = {s["hash"] for s in index.get("samples", [])}
    added, skipped = [], []
    for target in args.targets:
        if target == "-":
            body = sys.stdin.read()
            source = "stdin"
            title = args.title or "粘贴的语料"
        else:
            path = Path(target).expanduser()
            body = extract_text(path)
            source = str(path.resolve())
            title = args.title or sample_title(body, path.stem)
        body = clean_sample(body)
        if not body:
            skipped.append((target, "空文件"))
            continue
        digest = sha(body)
        if digest in known:
            skipped.append((target, "已收录（内容相同）"))
            continue
        known.add(digest)
        stats = basic_stats(body)
        sid = f"s-{len(index['samples']) + 1:03d}"
        fname = f"samples/{sid}-{safe_name(title)}.md"
        write_text(root / fname, body + "\n")
        index["samples"].append(
            {
                "id": sid,
                "title": title,
                "file": fname,
                "chars": stats["chars"],
                "stats": stats,
                "hash": digest,
                "added": now_iso(),
                "origin": args.origin,
                "source": source,
            }
        )
        added.append((sid, title, stats["chars"], source))
    write_json(corpus_index_path(root), index)
    if added:
        corpus = rebuild_corpus_md(root)
        print(f"已收录 {len(added)} 篇，语料库：{corpus}")
        for sid, title, chars, source in added:
            print(f"  {sid}  {title}（{chars} 字）← {source}")
    for target, reason in skipped:
        print(f"  跳过：{target}（{reason}）")
    if not added:
        print("没有新增语料。")
    return 0


def cmd_corpus_list(args) -> int:
    home = home_path(args.home)
    root = voice_root(home, args.profile)
    index = load_index(root)
    samples = index.get("samples", [])
    if not samples:
        print(f"语料库是空的：{root}")
        print("用 `writing.py corpus add <文件…>` 收录用户写过的文章。")
        return 0
    print(f"语料库：{root}")
    print(f"{'id':6}{'字数':>7}  标题")
    for sample in samples:
        print(f"{sample['id']:6}{sample.get('chars', 0):>7}  {sample['title']}")
    print(f"合计 {len(samples)} 篇，约 {index.get('chars', sum(s.get('chars', 0) for s in samples))} 字")
    return 0


def cmd_extract(args) -> int:
    path = Path(args.file).expanduser()
    text = clean_sample(docx_text(path, markdown=True) if args.markdown and path.suffix.lower() == ".docx" else extract_text(path))
    if args.out:
        print(write_text(Path(args.out).expanduser(), text + "\n"))
    else:
        print(text)
    return 0


def cmd_corpus_rebuild(args) -> int:
    home = home_path(args.home)
    print(rebuild_corpus_md(voice_root(home, args.profile)))
    return 0


# --------------------------------------------------------------------------- #
# 语气档案
# --------------------------------------------------------------------------- #

PROFILE_SKELETON = """# 语气档案 · {name}

更新：{date} · 样本 0 篇 · 置信度 较低（样本少，先按这几条写，以后再补）

## 画像

（一句话：这个人写东西时最像什么）

## 节奏与结构

- （句子长短怎么交替，段落一般几句）｜例：「……」

## 人称与称呼

- （我／我们／你／大家，怎么称呼读者）｜例：「……」

## 常用词与不用的词

- 常用：（词，出现 N 次）｜例：「……」
- 不用：（从不出现的表达，例如套话）｜例：「从样本里没有出现」

## 判断与语气

- （直接下判断，还是留余地；怎么表达不确定）｜例：「……」

## 标点与中英混排

- （破折号、引号、顿号、中英空格、数字写法）｜例：「……」

## 对话中学到的

## 原文参照

> （摘一段最能代表语气的原文，不超过 150 字）

> （再摘一段）
"""


def cmd_voice_show(args) -> int:
    home = home_path(args.home)
    path = voice_root(home, args.profile) / "profile.md"
    if not path.exists():
        print(f"还没有语气档案：{path}")
        print("这不是错误：照常写。用户想更像自己时，先收录语料再建档。")
        return 0
    print(read_text(path))
    return 0


def cmd_voice_path(args) -> int:
    home = home_path(args.home)
    root = voice_root(home, args.profile)
    print(f"home:    {home}")
    print(f"profile: {root / 'profile.md'}")
    print(f"corpus:  {root / 'corpus.md'}")
    print(f"active:  {active_profile(home)}")
    return 0


def cmd_voice_use(args) -> int:
    home = home_path(args.home)
    name = args.name.strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]+", name):
        raise UserError("档案名只用字母、数字、下划线、连字符")
    (home / "voice").mkdir(parents=True, exist_ok=True)
    write_text(home / "voice" / "active", name + "\n")
    root = home / "voice" / name
    root.mkdir(parents=True, exist_ok=True)
    print(f"当前档案：{name}（{root}）")
    return 0


def cmd_voice_note(args) -> int:
    home = home_path(args.home)
    root = voice_root(home, args.profile)
    root.mkdir(parents=True, exist_ok=True)
    path = root / "profile.md"
    if path.exists():
        body = read_text(path)
    else:
        index = load_index(root)
        samples = index.get("samples", [])
        chars = sum(sample.get("chars", 0) for sample in samples)
        confidence = "较高" if len(samples) >= 10 and chars >= 8000 else "中等" if len(samples) >= 3 and chars >= 1500 else "较低"
        body = PROFILE_SKELETON.format(name=root.name, date=today())
        body = re.sub(r"^更新：.*$", f"更新：{today()} · 样本 {len(samples)} 篇 · 置信度 {confidence}", body, count=1, flags=re.M)
    line = f"- {today()}：{args.text.strip()}"
    if "## 对话中学到的" not in body:
        body = body.rstrip() + "\n\n## 对话中学到的\n"
    pattern = re.compile(r"(## 对话中学到的\n)((?:(?!\n## )[\s\S])*)")
    match = pattern.search(body)
    if not match:
        raise UserError("档案里找不到「## 对话中学到的」小节，先修好档案结构")
    section = match.group(2).rstrip()
    body = body[: match.start(2)] + (section + "\n" + line + "\n") + body[match.end(2) :]
    write_text(path, body)
    print(f"已记入：{path}")
    return 0


def parse_profile(text: str) -> dict:
    meta = {}
    head = text.split("\n## ", 1)[0]
    match = re.search(r"^更新：(.+)$", head, flags=re.M)
    if match:
        meta["updated"] = match.group(1).strip()
    match = re.search(r"样本\s*(\d+)\s*篇", head)
    if match:
        meta["samples"] = int(match.group(1))
    match = re.search(r"置信度\s*[：:]?\s*(较高|中等|较低)", head)
    if match:
        meta["confidence"] = match.group(1)
    sections = [m.group(1).strip() for m in re.finditer(r"^##\s+(.+)$", text, flags=re.M)]
    return {"meta": meta, "sections": sections}


def cmd_voice_check(args) -> int:
    home = home_path(args.home)
    path = Path(args.file).expanduser() if args.file else voice_root(home, args.profile) / "profile.md"
    if not path.exists():
        print(f"还没有语气档案：{path}")
        print("先收录语料（corpus add）再建档；没有档案时按中性语域写，不算错误。")
        return 0
    text = read_text(path)
    errors: list[str] = []
    warnings: list[str] = []
    info: list[str] = []

    if not text.lstrip().startswith("# "):
        errors.append("档案要以一级标题 `# 语气档案 · <名字>` 开头")
    parsed = parse_profile(text)
    sections = parsed["sections"]
    for label, aliases in REQUIRED_SECTIONS:
        if not any(any(alias in section for alias in aliases) for section in sections):
            errors.append(f"缺少小节：{label}")

    section_texts: dict[str, str] = {}
    for match in re.finditer(r"^##\s+(.+)$", text, flags=re.M):
        start = match.end()
        nxt = re.search(r"^##\s+", text[start:], flags=re.M)
        end = start + nxt.start() if nxt else len(text)
        section_texts[match.group(1).strip()] = text[start:end]

    feature_bullets = 0
    evidenced = 0
    for name, chunk in section_texts.items():
        if any(key in name for key in ("画像", "原文", "参照", "对话")):
            continue
        bullets = [line.strip() for line in chunk.splitlines() if line.strip().startswith("- ")]
        feature_bullets += len(bullets)
        for line in bullets:
            if any(mark in line for mark in ("例：", "原文：", "｜例", "（例")):
                evidenced += 1
            else:
                warnings.append(f"「{name}」里有一条特征没有例句：{line[:40]}")
        if not bullets:
            warnings.append(f"「{name}」是空的：至少写一条可观察特征")

    quotes = [line for line in text.splitlines() if line.strip().startswith("> ")]
    if len(quotes) < 2:
        warnings.append("「原文参照」不足两段摘录")

    declared = parsed["meta"].get("samples")
    actual = 0
    actual_chars = 0
    root = path.parent if args.file else voice_root(home, args.profile)
    if root.exists():
        index = load_index(root)
        actual = len(index.get("samples", []))
        actual_chars = sum(sample.get("chars", 0) for sample in index.get("samples", []))
    if declared is not None and actual and declared > actual:
        warnings.append(f"档案写「样本 {declared} 篇」，语料库实际只有 {actual} 篇")
    if actual >= 10 and actual_chars >= 8000:
        expected = "较高"
    elif actual >= 3 and actual_chars >= 1500:
        expected = "中等"
    else:
        expected = "较低"
    if parsed["meta"].get("confidence") and parsed["meta"]["confidence"] != expected:
        warnings.append(
            f"置信度写的是「{parsed['meta']['confidence']}」，按 {actual} 篇 / {actual_chars} 字应为「{expected}」"
        )

    if len(text) > 12000:
        warnings.append(f"档案 {len(text)} 字，偏长：只留能指导写作的条目，删掉复述语料的段落")
    if feature_bullets == 0:
        errors.append("没有任何特征条目")
    if feature_bullets and evidenced < feature_bullets:
        warnings.append(f"证据覆盖：{evidenced}/{feature_bullets} 条特征带例句")
    else:
        info.append(f"证据覆盖：{evidenced}/{feature_bullets} 条特征带例句")

    info.append(f"小节：{', '.join(sections) if sections else '无'}")
    info.append(f"语料：{actual} 篇；档案声明样本 {declared if declared is not None else '未写'}")
    for level, items in (("错误", errors), ("提醒", warnings), ("信息", info)):
        for item in items:
            print(f"[{level}] {item}")
    if errors:
        print(f"\n档案不合格：{len(errors)} 个错误，{len(warnings)} 个提醒。")
        return 1
    print(f"\n档案可用：{feature_bullets} 条特征，{len(warnings)} 个提醒。")
    return 0


def cmd_voice_stats(args) -> int:
    home = home_path(args.home)
    root = voice_root(home, args.profile)
    index = load_index(root)
    samples = index.get("samples", [])
    if not samples:
        print(f"语料库是空的：{root}")
        return 0
    agg = {k: 0 for k in (
        "chars", "sentences", "long_dash", "ellipsis", "exclaim", "question", "colon", "semicolon",
        "first_person", "second_person", "everyone", "latin_words", "cjk_chars", "cjk_latin_spaces",
        "long_sentences", "short_sentences", "quotes_double", "quotes_corner",
    )}
    weighted: dict[str, float] = {}
    all_text: list[str] = []
    for sample in samples:
        body = read_text(root / sample["file"])
        all_text.append(body)
        stats = sample.get("stats") or basic_stats(body)
        for key in agg:
            agg[key] += stats.get(key, 0)
        weight = max(1, stats.get("chars", 1))
        for key in ("avg_sentence", "avg_paragraph", "latin_ratio"):
            weighted[key] = weighted.get(key, 0) + stats.get(key, 0) * weight
    total_chars = max(1, agg["chars"])
    result = {
        "profile": root.name,
        "samples": len(samples),
        "chars": agg["chars"],
        "avg_sentence": round(weighted.get("avg_sentence", 0) / total_chars, 1),
        "avg_paragraph": round(weighted.get("avg_paragraph", 0) / total_chars, 1),
        "latin_ratio": round(weighted.get("latin_ratio", 0) / total_chars, 3),
        "punctuation": {
            "long_dash": agg["long_dash"],
            "ellipsis": agg["ellipsis"],
            "exclaim": agg["exclaim"],
            "question": agg["question"],
            "colon": agg["colon"],
            "semicolon": agg["semicolon"],
            "quotes_double": agg["quotes_double"],
            "quotes_corner": agg["quotes_corner"],
        },
        "person": {"我/我们": agg["first_person"], "你/您": agg["second_person"], "大家": agg["everyone"]},
        "latin": {"words": agg["latin_words"], "cjk_latin_spaces": agg["cjk_latin_spaces"]},
        "long_sentences": agg["long_sentences"],
        "short_sentences": agg["short_sentences"],
        "top_ngrams": [{"gram": g, "count": c} for g, c in top_ngrams("\n\n".join(all_text), 2, 12)],
    }
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    print(f"档案：{result['profile']} · {result['samples']} 篇 · 约 {result['chars']} 字")
    print(f"平均句长 {result['avg_sentence']} 字；平均段长 {result['avg_paragraph']} 字；英文词占比 {result['latin_ratio']}")
    print("标点：" + "，".join(f"{k} {v}" for k, v in result["punctuation"].items()))
    print("人称：" + "，".join(f"{k} {v}" for k, v in result["person"].items()))
    print(f"长句（>80 字）{result['long_sentences']}；短句（<15 字）{result['short_sentences']}")
    grams = result["top_ngrams"]
    if grams:
        print("高频二字词（仅提示，需回原文核对）：" + "、".join(f"{g['gram']}({g['count']})" for g in grams))
    return 0


# --------------------------------------------------------------------------- #
# 成稿项目
# --------------------------------------------------------------------------- #

TEMPLATES = {
    "brief.md": """# 任务卡：{title}

- 题眼（这篇只回答哪一个问题）：
- 目标读者：
- 文体 / 发布场景：
- 篇幅：
- 交付：`draft.md` + `preview.html`
- 语气档案：{voice}
- 引用样式：行内归属（「根据《X》报道」「据 Y 统计」）+ 文末「## 参考资料」；正文不出现编号
- 不能碰的：事实、数字、人名、日期、引文；没有依据就标 `〔待核：…〕`

## 待确认（最多问 3 个，其余按假设写）

- [ ] 
- [ ] 

## 假设（用户没回答就按这里写，并在交付时说明）

- 
""",
    "sources.md": """# 来源台账

> 一条主张一行。原文摘录必须逐字；转述写「转述」；打不开或没有日期的写明。成稿里每个具体数字、引文、判断都要能回到这里。

| # | 主张（成稿里怎么说） | 来源（发布者 · 标题） | 日期 | 原文摘录 / 转述 | 链接 | 可信度 | 用在哪节 |
|---|---|---|---|---|---|---|---|
| 1 |  |  |  |  |  | 一手 / 权威 / 二手 |  |
""",
    "outline.md": """# 大纲：{title}

主线（一句话）：

读者读完要带走的一个判断：

## 1. 小节标题 ｜ 功能（交代/判断/论据/案例/转折/收束）｜ 约 N 字

- 要点：
- 证据：#1 #2
- 待补：

## 2. 

- 要点：
- 证据：
- 待补：
""",
    "draft.md": """# {title}

（正文从这里开始。一节一个功能，先事实后判断；每个具体数字或引文都在同一句里写出处，如「根据《X》报道」。正文不出现 [1] 这类编号。）

## 参考资料

1. 
""",
}


def cmd_init(args) -> int:
    project = Path(args.dir).expanduser().resolve()
    title = args.title or project.name
    if project.exists():
        existing = [p for p in project.iterdir() if p.name not in (".DS_Store",)]
        if existing and not args.force:
            raise UserError(f"目录不是空的：{project}（要覆盖加 --force）")
    project.mkdir(parents=True, exist_ok=True)
    (project / "research").mkdir(exist_ok=True)
    voice = args.voice or active_profile(home_path(args.home))
    for name, template in TEMPLATES.items():
        target = project / name
        if target.exists() and not args.force:
            continue
        write_text(target, template.format(title=title, voice=voice))
    meta_path = project / "meta.json"
    meta = read_json(meta_path, {})
    meta.update(
        {
            "version": 1,
            "slug": project.name,
            "title": title,
            "mode": args.mode,
            "voice": voice,
            "status": "brief",
            "created": meta.get("created", now_iso()),
            "updated": now_iso(),
        }
    )
    write_json(meta_path, meta)
    if not (project / "revisions.jsonl").exists():
        write_text(project / "revisions.jsonl", "")
    print(f"已建项目：{project}")
    print("下一步：填 brief.md 与 sources.md → 写 outline.md → 写 draft.md → render")
    return 0


def project_meta(project: Path) -> dict:
    return read_json(project / "meta.json", {}) or {}


def save_project_meta(project: Path, meta: dict) -> None:
    meta["updated"] = now_iso()
    write_json(project / "meta.json", meta)


# --------------------------------------------------------------------------- #
# Markdown 块解析（渲染与补丁共用同一套切块规则）
# --------------------------------------------------------------------------- #

def parse_blocks(text: str) -> list[dict]:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            text = text[end + 4 :]
    lines = text.split("\n")
    blocks: list[dict] = []
    section = ""
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        start = i
        if FENCE_RE.match(line):
            i += 1
            while i < len(lines) and not FENCE_RE.match(lines[i]):
                i += 1
            i += 1
            kind = "code"
        elif HEADING_LINE_RE.match(line):
            kind = "heading"
            section = HEADING_LINE_RE.match(line).group(2).strip()
            i += 1
        elif HR_RE.match(line):
            kind = "hr"
            i += 1
        elif TABLE_RE.match(line):
            while i < len(lines) and TABLE_RE.match(lines[i]):
                i += 1
            kind = "table"
        elif QUOTE_RE.match(line):
            while i < len(lines) and QUOTE_RE.match(lines[i]):
                i += 1
            kind = "quote"
        elif LIST_RE.match(line):
            while i < len(lines):
                current = lines[i]
                if LIST_RE.match(current):
                    i += 1
                elif current.strip() == "" and i + 1 < len(lines) and (LIST_RE.match(lines[i + 1]) or lines[i + 1].startswith("  ")):
                    i += 1
                elif re.match(r"^\s{2,}\S", current):
                    i += 1
                else:
                    break
            kind = "list"
        else:
            while i < len(lines) and lines[i].strip():
                if (HEADING_LINE_RE.match(lines[i]) or FENCE_RE.match(lines[i]) or TABLE_RE.match(lines[i])
                        or QUOTE_RE.match(lines[i]) or LIST_RE.match(lines[i]) or HR_RE.match(lines[i])):
                    break
                i += 1
            kind = "para"
        raw = "\n".join(lines[start:i]).rstrip()
        if not raw.strip():
            continue
        idx = len(blocks) + 1
        blocks.append({"id": f"b-{idx:03d}", "type": kind, "raw": raw, "section": section, "hash": sha(raw)})
    return blocks


def is_sources_section(name: str) -> bool:
    return any(key in name for key in ("来源", "参考", "References", "参考文献"))


# --------------------------------------------------------------------------- #
# HTML 渲染
# --------------------------------------------------------------------------- #

def inline_html(text: str) -> str:
    codes: list[str] = []

    def stash(match):
        codes.append(match.group(1))
        return f"\x00{len(codes) - 1}\x00"

    text = re.sub(r"`([^`]+)`", stash, text)
    text = html_lib.escape(text, quote=False)
    text = re.sub(
        r"\[([^\]]+)\]\(([^)\s]+)\)",
        lambda m: f'<a href="{html_lib.escape(m.group(2), quote=True)}" rel="noreferrer noopener">{m.group(1)}</a>',
        text,
    )
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<em>\1</em>", text)
    text = CITE_RE.sub(
        lambda m: '<sup class="cite">[' + ", ".join(part.strip() for part in m.group(1).split(",")) + "]</sup>",
        text,
    )
    text = re.sub(r"\[\^([^\]]+)\]", r'<sup class="fn">\1</sup>', text)
    for index, code in enumerate(codes):
        text = text.replace(f"\x00{index}\x00", f"<code>{html_lib.escape(code)}</code>")
    return text


def join_soft_lines(lines: list[str]) -> str:
    text = " ".join(line.strip() for line in lines)
    text = re.sub(f"(?<=[{CJK}])\\s+(?=[{CJK}])", "", text)
    return text


def table_html(raw: str) -> str:
    rows = [row for row in raw.strip().split("\n") if "|" in row]
    cells = [[cell.strip() for cell in row.strip().strip("|").split("|")] for row in rows]
    if len(cells) >= 2 and all(re.fullmatch(r":?-{2,}:?", cell.replace(" ", "")) for cell in cells[1]):
        header, body = cells[0], cells[2:]
    else:
        header, body = None, cells
    out = ["<table>"]
    if header:
        out.append("<thead><tr>" + "".join(f"<th>{inline_html(cell)}</th>" for cell in header) + "</tr></thead>")
    out.append("<tbody>")
    for row in body:
        out.append("<tr>" + "".join(f"<td>{inline_html(cell)}</td>" for cell in row) + "</tr>")
    out.append("</tbody></table>")
    return "".join(out)


def block_html(block: dict, ref_counter: list[int]) -> str:
    attrs = (
        f'data-bid="{block["id"]}" data-hash="{block["hash"]}" data-type="{block["type"]}"'
        f' data-section="{html_lib.escape(block.get("section", ""), quote=True)}"'
    )
    raw = block["raw"]
    kind = block["type"]
    if kind == "heading":
        match = HEADING_LINE_RE.match(raw)
        level = min(6, len(match.group(1)))
        text = match.group(2).strip()
        hid = re.sub(r"[^\w\u4e00-\u9fff-]+", "-", text).strip("-") or block["id"]
        return f'<h{level} {attrs} id="{html_lib.escape(hid, quote=True)}">{inline_html(text)}</h{level}>'
    if kind == "para":
        return f"<p {attrs}>{inline_html(join_soft_lines(raw.split(chr(10))))}</p>"
    if kind == "list":
        ordered = False
        items: list[str] = []
        for line in raw.split("\n"):
            match = LIST_RE.match(line)
            if match:
                if match.group(3):
                    ordered = True
                items.append(match.group(4).strip())
            elif line.strip() and items:
                items[-1] += " " + line.strip()
        tag = "ol" if ordered else "ul"
        out = [f"<{tag} {attrs}>"]
        for item in items:
            ref = ""
            if is_sources_section(block.get("section", "")):
                ref_counter[0] += 1
                ref = f' id="ref-{ref_counter[0]}"'
            out.append(f"<li{ref}>{inline_html(item)}</li>")
        out.append(f"</{tag}>")
        return "".join(out)
    if kind == "quote":
        content = "\n".join(QUOTE_RE.sub("", line) for line in raw.split("\n"))
        paras = [para.strip() for para in content.split("\n\n") if para.strip()]
        return f"<blockquote {attrs}>" + "".join(
            f"<p>{inline_html(join_soft_lines(para.split(chr(10))))}</p>" for para in paras
        ) + "</blockquote>"
    if kind == "code":
        body = re.sub(r"^\s*(```|~~~).*\n?", "", raw)
        body = re.sub(r"\n?\s*(```|~~~)\s*$", "", body)
        return f"<pre {attrs}><code>{html_lib.escape(body)}</code></pre>"
    if kind == "table":
        return f'<div {attrs} class="table-wrap">{table_html(raw)}</div>'
    if kind == "hr":
        return f"<hr {attrs}>"
    return f"<p {attrs}>{inline_html(raw)}</p>"


def render_html(project: Path, meta: dict, draft: str, blocks: list[dict]) -> str:
    css = read_text(ASSETS / "preview.css")
    js = read_text(ASSETS / "preview.js")
    ref_counter = [0]
    body = "\n".join(block_html(block, ref_counter) for block in blocks)
    first_heading = next((b for b in blocks if b["type"] == "heading" and b["raw"].startswith("# ")), None)
    title = meta.get("title") or (HEADING_LINE_RE.match(first_heading["raw"]).group(2).strip() if first_heading else project.name)
    sources = ref_counter[0]
    body_chars = sum(
        len(re.sub(r"\s", "", strip_markup(block["raw"])))
        for block in blocks
        if not is_sources_section(block.get("section", ""))
    )
    doc = {
        "project": {
            "path": str(project),
            "slug": project.name,
            "title": title,
            "voice": meta.get("voice", ""),
            "draftHash": sha(draft),
        },
        "blocks": [
            {"id": b["id"], "hash": b["hash"], "raw": b["raw"], "type": b["type"], "section": b.get("section", "")}
            for b in blocks
        ],
    }
    payload = json.dumps(doc, ensure_ascii=False).replace("</", "<\\/")
    updated = datetime.now().strftime("%Y-%m-%d %H:%M")
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html_lib.escape(title)} · 预览</title>
<style>
{css}
</style>
</head>
<body>
<div class="topbar">
  <span class="dot"></span>
  <span>写作模块 · 预览</span>
  <span class="sep"></span>
  <span>{body_chars} 字</span>
  <span class="sep"></span>
  <span>{sources} 条来源</span>
  <span class="sep"></span>
  <span>改于 {updated}</span>
  <span class="hint">选中正文任意一段 → 点浮出的按钮 → 修改请求会复制到剪贴板，回到对话粘贴</span>
</div>
<main class="page">
  <div class="doc-meta">
    <span>{html_lib.escape(meta.get('voice') or '未指定语气档案')}</span>
    <span>{meta.get('mode', '')}</span>
    <span>{len(blocks)} 个段落块</span>
  </div>
  <article class="prose">
{body}
  </article>
  <footer class="doc-foot">
    <span>dsh-writing</span>
    <span>修改记录：{len(load_revisions(project))} 条</span>
    <span>源文件：draft.md</span>
  </footer>
</main>
<script>window.__WRITING_DOC__ = {payload};</script>
<script>
{js}
</script>
</body>
</html>
"""


def cmd_render(args) -> int:
    project = Path(args.project).expanduser().resolve()
    draft_path = project / "draft.md"
    if not draft_path.exists():
        raise UserError(f"找不到 {draft_path}")
    draft = read_text(draft_path)
    blocks = parse_blocks(draft)
    if not blocks:
        raise UserError("draft.md 里没有内容")
    meta = project_meta(project)
    html = render_html(project, meta, draft, blocks)
    out = project / "preview.html"
    write_text(out, html)
    meta["renderedAt"] = now_iso()
    meta["blocks"] = len(blocks)
    save_project_meta(project, meta)
    print(f"已渲染：{out}")
    print(f"  {len(blocks)} 个段落块 · {out.stat().st_size // 1024} KB · 打开后选中正文即可发修改请求")
    return 0


# --------------------------------------------------------------------------- #
# 选区补丁
# --------------------------------------------------------------------------- #

class PatchError(UserError):
    pass


def find_block(blocks: list[dict], block_id: str, expect: str | None, before: str | None) -> dict:
    if not expect and before is None:
        raise PatchError(f"{block_id} 少了 expect 或 before，无法确认是不是同一块")
    by_id = next((b for b in blocks if b["id"] == block_id), None)
    if by_id and (not expect or by_id["hash"] == expect or (before is not None and by_id["raw"] == before)):
        return by_id
    candidates = []
    if expect:
        candidates = [b for b in blocks if b["hash"] == expect]
    if not candidates and before is not None:
        candidates = [b for b in blocks if b["raw"] == before]
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        raise PatchError(f"{block_id} 匹配到多个相同内容的块，无法安全定位；请重新渲染预览后再改")
    near = difflib.get_close_matches(before or "", [b["raw"] for b in blocks], n=2, cutoff=0.5)
    hint = f"；最接近的现有块：{near[0][:60]}…" if near else ""
    raise PatchError(f"{block_id} 的内容已经变了（可能手动改过 draft.md）：重新 render 后再从预览选中{hint}")


def cmd_patch(args) -> int:
    project = Path(args.project).expanduser().resolve()
    draft_path = project / "draft.md"
    draft = read_text(draft_path)
    blocks = parse_blocks(draft)
    edits_doc = read_json(Path(args.edits).expanduser())
    edits = edits_doc.get("edits") or []
    if not edits:
        raise UserError("edits.json 里没有 edits")

    replaced: dict[str, str] = {}
    log_edits = []
    warnings: list[str] = []
    expected_draft = (edits_doc.get("project") or {}).get("draftHash")
    if expected_draft and expected_draft != sha(draft):
        warnings.append("预览之后 draft.md 又被改过；下面按块内容定位，改完重新 render 再继续")

    for edit in edits:
        block_id = edit.get("blockId") or ""
        if not block_id:
            raise UserError("每个 edit 都要有 blockId")
        target = find_block(blocks, block_id, edit.get("expect"), edit.get("before"))
        if target["id"] in replaced:
            raise UserError(f"{target['id']} 在一次提交里被改了两次")
        old = target["raw"]
        new = edit.get("replaceRaw")
        if new is None:
            raise UserError(f"{target['id']} 缺 replaceRaw（整块删掉就传空字符串）")
        new = new.replace("\r\n", "\n").strip()
        ratio = difflib.SequenceMatcher(None, old, new).ratio()
        if not new:
            warnings.append(f"{target['id']} 被整块删掉，确认是有意删除")
        elif len(new) < len(old) * 0.35:
            warnings.append(f"{target['id']} 改后只剩原文 {len(new) / max(1, len(old)):.0%}，确认不是误删")
        if new and len(new) > len(old) * 3:
            warnings.append(f"{target['id']} 改后是原文 {len(new) / max(1, len(old)):.1f} 倍，确认不是误扩")
        replaced[target["id"]] = new
        log_edits.append(
            {
                "blockId": target["id"],
                "type": target["type"],
                "before": old,
                "after": new,
                "ratio": round(ratio, 3),
            }
        )

    if args.dry_run:
        for entry in log_edits:
            print(f"--- {entry['blockId']} ({entry['ratio']:.0%} 相似)")
            diff = difflib.unified_diff(entry["before"].split("\n"), entry["after"].split("\n"), "before", "after", lineterm="")
            print("\n".join(diff) or "（无变化）")
        for warning in warnings:
            print(f"[提醒] {warning}")
        return 0

    new_blocks = []
    for block in blocks:
        if block["id"] in replaced:
            raw = replaced[block["id"]]
            if not raw:
                continue
            new_blocks.append({**block, "raw": raw, "hash": sha(raw)})
        else:
            new_blocks.append(block)
    new_draft = "\n\n".join(block["raw"] for block in new_blocks).rstrip() + "\n"
    write_text(draft_path, new_draft)

    rev_id = f"r-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    revision = {
        "id": rev_id,
        "time": now_iso(),
        "action": edits_doc.get("action", "edit"),
        "instruction": edits_doc.get("instruction", ""),
        "selection": edits_doc.get("selection", {}),
        "source": edits_doc.get("source", "preview"),
        "edits": log_edits,
        "draftBefore": draft,
        "draftHashBefore": sha(draft),
        "draftHashAfter": sha(new_draft),
    }
    with (project / "revisions.jsonl").open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(revision, ensure_ascii=False) + "\n")

    meta = project_meta(project)
    meta["revisions"] = meta.get("revisions", 0) + 1
    meta["status"] = "revised"
    save_project_meta(project, meta)
    print(f"已应用 {len(log_edits)} 处修改（{rev_id}）：{draft_path}")
    for entry in log_edits:
        print(f"  {entry['blockId']}  {entry['ratio']:.0%} 相似 · {len(entry['before'])} → {len(entry['after'])} 字")
    for warning in warnings:
        print(f"[提醒] {warning}")
    print("下一步：render 重新出预览。")
    return 0


def load_revisions(project: Path) -> list[dict]:
    path = project / "revisions.jsonl"
    if not path.exists():
        return []
    out = []
    for line in read_text(path).splitlines():
        line = line.strip()
        if line:
            out.append(json.loads(line))
    return out


def cmd_revert(args) -> int:
    project = Path(args.project).expanduser().resolve()
    revisions = load_revisions(project)
    if not revisions:
        raise UserError("没有修改记录")
    if args.rev:
        target = next((r for r in revisions if r["id"] == args.rev), None)
        if not target:
            raise UserError(f"找不到记录 {args.rev}")
        if target is not revisions[-1]:
            raise UserError("只能撤回最近一次修改：更早的记录会影响后续改动，请手动处理")
    else:
        target = revisions[-1]
    draft = read_text(project / "draft.md")
    if sha(draft) != target.get("draftHashAfter"):
        raise UserError("当前 draft.md 在这次修改之后又变过，不能安全撤回；先确认最新状态，或手动改回去")
    before = target.get("draftBefore")
    if before is None:
        raise UserError("这条修改记录没有快照（档案版本较旧），只能手动撤回")
    write_text(project / "draft.md", before)
    revision = {
        "id": f"r-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "time": now_iso(),
        "action": "revert",
        "reverted": target["id"],
        "draftBefore": draft,
        "draftHashBefore": sha(draft),
        "draftHashAfter": sha(before),
    }
    with (project / "revisions.jsonl").open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(revision, ensure_ascii=False) + "\n")
    meta = project_meta(project)
    meta["revisions"] = meta.get("revisions", 0) + 1
    save_project_meta(project, meta)
    print(f"已撤回 {target['id']}：{project / 'draft.md'}")
    print("下一步：render 重新出预览。")
    return 0


# --------------------------------------------------------------------------- #
# 成稿自检
# --------------------------------------------------------------------------- #

def check_draft(project: Path) -> tuple[list[tuple[str, str]], list[str]]:
    draft = read_text(project / "draft.md")
    blocks = parse_blocks(draft)
    issues: list[tuple[str, str]] = []
    info: list[str] = []

    body_blocks = [b for b in blocks if not is_sources_section(b.get("section", "")) and b["type"] != "code"]
    sources_blocks = [b for b in blocks if is_sources_section(b.get("section", ""))]
    plain = strip_markup("\n\n".join(b["raw"] for b in body_blocks))

    refs: list[int] = []
    for block in body_blocks:
        for match in CITE_RE.finditer(block["raw"]):
            refs.extend(int(part.strip()) for part in match.group(1).split(","))

    entries: dict[int, str] = {}
    for block in sources_blocks:
        for line in block["raw"].split("\n"):
            match = re.match(r"^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$", line)
            if not match:
                continue
            number = match.group(1)
            rest = (match.group(2) or "").strip()
            bracket = re.match(r"^\[(\d+)\]\s*", rest)
            if bracket:
                number = bracket.group(1)
                rest = rest[bracket.end():].strip()
            else:
                inline = re.match(r"^(\d+)[.、)]\s+", rest)
                if inline and not number:
                    number = inline.group(1)
                    rest = rest[inline.end():].strip()
            if number and rest:
                entries[int(number)] = rest
    if refs:
        if not sources_blocks:
            issues.append(("ERROR", "正文有引用编号，但没有「## 参考资料」（或「## 来源」）小节"))
        missing = sorted({number for number in refs if number not in entries})
        if missing:
            issues.append(("ERROR", f"正文引用了 {missing}，但文末「参考资料」里没有对应条目"))
    if entries:
        if refs:
            unused = sorted(set(entries) - set(refs))
            if unused:
                issues.append(("INFO", f"文末有 {unused} 条来源没有在正文引用"))
        no_url = [number for number, text in entries.items() if not re.search(r"https?://|《|（\d{4}", text)]
        if no_url:
            issues.append(("WARN", f"来源 {no_url} 没有链接、书名号或年份，无法核对"))

    # 引用规范：行内归属为主；深度研究型也允许「文中编号 + 文末参考资料」，但编号必须对得上条目。
    # 编号没有条目由上面的 refs/entries 检查负责，这里只兜「有编号却完全没有参考资料小节」。
    if body_blocks and not sources_blocks:
        issues.append(("ERROR", "文末没有「## 参考资料」（或「## 来源」）小节：正文里用到的来源要在这里列出来"))
    numbers = NUMBER_RE.findall(plain)
    if numbers and not refs and not ATTR_RE.search(plain):
        issues.append(
            ("WARN", f"正文有 {len(numbers)} 处具体数字，但既没有行内出处短语（根据…报道 / 据…统计），也没有引用编号")
        )

    placeholders = PLACEHOLDER_RE.findall(draft)
    if placeholders:
        issues.append(("WARN", f"还有 {len(placeholders)} 处待核占位符：定稿前替换或向用户确认"))

    for block in body_blocks:
        text = block["raw"]
        if VAGUE_ATTR.search(text) and "http" not in text and "《" not in text:
            issues.append(("WARN", f"疑似无署名归因：「{text[:48]}…」"))
        if ABSOLUTE.search(text):
            issues.append(("WARN", f"绝对判断，核对范围与证据：「{text[:48]}…」"))

    empty_hits = [word for word in EMPTY_WORDS if word in plain]
    if empty_hits:
        issues.append(("INFO", f"空泛大词：{'、'.join(empty_hits)}（有具体机制时不算问题）"))
    translationese = []
    for pattern in TRANSLATIONESE:
        for match in re.finditer(pattern, plain):
            translationese.append(match.group(0)[:16])
            break
    if translationese:
        issues.append(("INFO", f"翻译腔连接词：{'、'.join(translationese[:5])}（确实表达条件/同时发生时可保留）"))

    dashes = plain.count("——")
    if dashes > max(2, len(plain) // 800):
        issues.append(("WARN", f"长破折号 {dashes} 处，偏密；除非语气档案里本人就爱用"))
    colons = plain.count("：")
    if colons > max(4, len(plain) // 300):
        issues.append(("INFO", f"冒号 {colons} 处，偏密，检查是否在靠冒号铺陈"))
    if "“" in plain and "「" in plain:
        issues.append(("WARN", "引号混用：“ ” 和 「 」 同时出现，全篇统一一种"))

    long_sents = [s for s in split_sentences(plain) if len(re.sub(r"\s", "", s)) > 90]
    if long_sents:
        issues.append(("INFO", f"{len(long_sents)} 句超过 90 字，最难读的一句：「{long_sents[0][:60]}…」"))

    seen: dict[str, str] = {}
    repeats = 0
    for sentence in split_sentences(plain):
        key = re.sub(r"[\s，。！？、；：,.!?]", "", sentence)
        if len(key) < 12:
            continue
        if key in seen:
            repeats += 1
            if repeats <= 3:
                issues.append(("WARN", f"重复句：「{sentence[:50]}…」"))
        seen[key] = sentence
    if repeats > 3:
        issues.append(("WARN", f"另有 {repeats - 3} 处重复句未逐条列出"))

    if len(plain) < 200:
        issues.append(("WARN", f"正文只有 {len(plain)} 字，先确认这是不是完整成稿"))

    attributions = len(ATTR_RE.findall(plain))
    info.append(
        f"正文 {len(plain)} 字，{len(body_blocks)} 块，行内出处 {attributions} 处，参考资料 {len(entries)} 条"
    )
    return issues, info


def cmd_check(args) -> int:
    project = Path(args.project).expanduser().resolve()
    if not (project / "draft.md").exists():
        raise UserError(f"找不到 {project / 'draft.md'}")
    issues, info = check_draft(project)
    for level, message in issues:
        print(f"[{level}] {message}")
    for message in info:
        print(f"[信息] {message}")
    errors = sum(1 for level, _ in issues if level == "ERROR")
    warnings = sum(1 for level, _ in issues if level == "WARN")
    if errors:
        print(f"\n有 {errors} 个错误、{warnings} 个提醒，修完再交付。")
        return 1
    print(f"\n通过：0 个错误，{warnings} 个提醒。")
    return 0


def cmd_status(args) -> int:
    project = Path(args.project).expanduser().resolve()
    meta = project_meta(project)
    revisions = load_revisions(project)
    draft_path = project / "draft.md"
    word_count = 0
    if draft_path.exists():
        blocks = parse_blocks(read_text(draft_path))
        word_count = sum(
            len(re.sub(r"\s", "", strip_markup(block["raw"])))
            for block in blocks
            if not is_sources_section(block.get("section", ""))
        )
    print(f"项目：{project}")
    print(f"标题：{meta.get('title', project.name)}")
    print(f"状态：{meta.get('status', 'unknown')} · 模式：{meta.get('mode', '')} · 语气档案：{meta.get('voice', '')}")
    print(f"正文：{word_count} 字 · 修改：{len(revisions)} 条 · 预览：{'有' if (project / 'preview.html').exists() else '无'}")
    if revisions:
        last = revisions[-1]
        print(f"最后一次：{last['id']} {last.get('action', '')} · {len(last.get('edits', []))} 处")
    issues = check_draft(project)[0] if draft_path.exists() else []
    errors = [message for level, message in issues if level == "ERROR"]
    warnings = [message for level, message in issues if level == "WARN"]
    print(f"自检：{len(errors)} 错误 / {len(warnings)} 提醒")
    for message in errors:
        print(f"  ERROR {message}")
    return 0


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="writing.py", description="dsh-writing 写作模块 CLI")
    parser.add_argument("--home", help=f"数据目录（默认 {DEFAULT_HOME}）")
    sub = parser.add_subparsers(dest="command", required=True)

    def add_home(target):
        target.add_argument("--home", default=argparse.SUPPRESS, help="数据目录")

    p_init = sub.add_parser("init", help="建一个成稿项目")
    p_init.add_argument("dir")
    p_init.add_argument("--title")
    p_init.add_argument("--mode", default="materials", choices=["materials", "prompt", "draft"])
    p_init.add_argument("--voice")
    p_init.add_argument("--force", action="store_true")
    add_home(p_init)

    p_corpus = sub.add_parser("corpus", help="语料库")
    corpus_sub = p_corpus.add_subparsers(dest="corpus_command", required=True)
    p_add = corpus_sub.add_parser("add", help="收录语料文件")
    p_add.add_argument("targets", nargs="+", help="文件路径；`-` 表示从标准输入读")
    p_add.add_argument("--profile")
    p_add.add_argument("--title")
    p_add.add_argument("--origin", default="upload", choices=["upload", "chat", "article"])
    add_home(p_add)
    p_list = corpus_sub.add_parser("list", help="列出语料")
    p_list.add_argument("--profile")
    add_home(p_list)
    p_rebuild = corpus_sub.add_parser("rebuild", help="重写 corpus.md")
    p_rebuild.add_argument("--profile")
    add_home(p_rebuild)

    p_voice = sub.add_parser("voice", help="语气档案")
    voice_sub = p_voice.add_subparsers(dest="voice_command", required=True)
    p_vshow = voice_sub.add_parser("show", help="打印档案")
    p_vshow.add_argument("--profile")
    add_home(p_vshow)
    p_vpath = voice_sub.add_parser("path", help="打印档案与语料路径")
    p_vpath.add_argument("--profile")
    add_home(p_vpath)
    p_vstats = voice_sub.add_parser("stats", help="统计语料特征")
    p_vstats.add_argument("--profile")
    p_vstats.add_argument("--json", action="store_true")
    add_home(p_vstats)
    p_vcheck = voice_sub.add_parser("check", help="检查档案结构和证据")
    p_vcheck.add_argument("file", nargs="?")
    p_vcheck.add_argument("--profile")
    add_home(p_vcheck)
    p_vnote = voice_sub.add_parser("note", help="记一条对话里学到的修正")
    p_vnote.add_argument("text")
    p_vnote.add_argument("--profile")
    add_home(p_vnote)
    p_vuse = voice_sub.add_parser("use", help="切换当前档案")
    p_vuse.add_argument("name")
    add_home(p_vuse)

    p_render = sub.add_parser("render", help="渲染 preview.html")
    p_render.add_argument("project")
    add_home(p_render)

    p_extract = sub.add_parser("extract", help="把 docx/md/html/txt 抽成纯文本")
    p_extract.add_argument("file")
    p_extract.add_argument("--out", help="写到文件，默认打印到标准输出")
    p_extract.add_argument("--markdown", action="store_true", help="保留 Word 标题、列表和表格结构")
    add_home(p_extract)

    p_patch = sub.add_parser("patch", help="应用选区修改请求")
    p_patch.add_argument("project")
    p_patch.add_argument("--edits", required=True)
    p_patch.add_argument("--dry-run", action="store_true")
    add_home(p_patch)

    p_revert = sub.add_parser("revert", help="撤回最近一次修改")
    p_revert.add_argument("project")
    p_revert.add_argument("--rev")
    add_home(p_revert)

    p_check = sub.add_parser("check", help="成稿自检")
    p_check.add_argument("project")
    add_home(p_check)

    p_status = sub.add_parser("status", help="项目状态")
    p_status.add_argument("project")
    add_home(p_status)

    return parser


def main(argv=None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
    parser = build_parser()
    args = parser.parse_args(argv)
    dispatch = {
        "init": cmd_init,
        "render": cmd_render,
        "extract": cmd_extract,
        "patch": cmd_patch,
        "revert": cmd_revert,
        "check": cmd_check,
        "status": cmd_status,
    }
    try:
        if args.command == "corpus":
            return {"add": cmd_corpus_add, "list": cmd_corpus_list, "rebuild": cmd_corpus_rebuild}[args.corpus_command](args)
        if args.command == "voice":
            return {
                "show": cmd_voice_show,
                "path": cmd_voice_path,
                "stats": cmd_voice_stats,
                "check": cmd_voice_check,
                "note": cmd_voice_note,
                "use": cmd_voice_use,
            }[args.voice_command](args)
        return dispatch[args.command](args)
    except UserError as exc:
        fail(str(exc))
    except BrokenPipeError:
        return 0


if __name__ == "__main__":
    sys.exit(main())
