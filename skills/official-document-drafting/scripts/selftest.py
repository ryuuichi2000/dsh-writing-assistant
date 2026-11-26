#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""技能自检：注册表、文种参考、模板导出、XML 结构与校验器冒烟测试。

用法：python scripts/selftest.py
不联网、不依赖第三方库；只在系统临时目录里生成测试文件。
"""
from __future__ import annotations

import binascii
import os
import pathlib
import re
import struct
import subprocess
import sys
import tempfile
import zipfile
import zlib
from xml.etree import ElementTree

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from docgen.markdown import parse_markdown  # noqa: E402
from docgen.registry import load_doc_types, load_font_profiles, load_layout_profiles  # noqa: E402

TEMPLATE_RE = re.compile(r"```markdown\n(.*?)\n```", re.S)
W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def fail(message: str) -> None:
    print(f"[FAIL] {message}")
    raise SystemExit(1)


def check_registry() -> None:
    doc_types = load_doc_types()
    names = {item.id for item in doc_types}
    if len(doc_types) != 8 or len(names) != 8:
        fail(f"文种数量应为 8，实际 {len(doc_types)} / 唯一 id {len(names)}")
    fonts = load_font_profiles()
    layouts = load_layout_profiles()
    for item in doc_types:
        if item.font_profile not in fonts:
            fail(f"{item.id} 引用了未定义字体方案 {item.font_profile}")
        if item.layout_profile not in layouts:
            fail(f"{item.id} 引用了未定义版式方案 {item.layout_profile}")
        ref = ROOT / item.reference
        if not ref.exists():
            fail(f"{item.id} 缺少文种参考 {item.reference}")
        text = ref.read_text(encoding="utf-8")
        if "## 模板" not in text or not TEMPLATE_RE.search(text):
            fail(f"{item.id} 参考缺少可解析的模板代码块")
    print(f"[OK] 注册表：{len(doc_types)} 个文种、{len(fonts)} 套字体、{len(layouts)} 套版式")


def check_markdown_parser() -> None:
    text = """---
name: test
---
# 标题

## 正文

**加粗**的[链接](https://example.com)。
- 列表项
<!-- 注释 -->
### 三级标题
"""
    blocks = parse_markdown(text)
    texts = "\n".join(block.text for block in blocks)
    if "**" in texts or "链接(" in texts or "- 列表项" in texts or "注释" in texts:
        fail(f"Markdown 清洗不完整：{texts!r}")
    print("[OK] Markdown 清洗：frontmatter/注释/加粗/链接/列表标记")


def check_export() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = pathlib.Path(tmp)
        for item in load_doc_types():
            ref = (ROOT / item.reference).read_text(encoding="utf-8")
            match = TEMPLATE_RE.search(ref)
            if not match:
                fail(f"{item.id} 模板解析失败")
            md = tmp_path / f"{item.id}.md"
            md.write_text(match.group(1) + "\n", encoding="utf-8")
            out = tmp_path / f"{item.id}.docx"
            proc = subprocess.run(
                [sys.executable, str(SCRIPT_DIR / "generate_docx.py"), str(md), "--doc-type", item.id, "-o", str(out)],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            if proc.returncode != 0:
                fail(f"{item.id} 导出失败：{proc.stderr[-500:]}")
            with zipfile.ZipFile(out) as archive:
                for part in ("word/document.xml", "word/styles.xml", "word/settings.xml"):
                    ElementTree.fromstring(archive.read(part))
                document = archive.read("word/document.xml").decode("utf-8")
                if "（可选）" in document:
                    fail(f"{item.id} 导出结果残留“（可选）”")
            check = subprocess.run(
                [sys.executable, str(SCRIPT_DIR / "check_draft.py"), item.id, str(md)],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            if check.returncode != 0:
                fail(f"{item.id} 模板未通过校验：{check.stdout[-500:]}")
        print(f"[OK] 8 个文种模板：导出 + XML 解析 + 成稿校验")


def _write_test_png(path: pathlib.Path, width: int = 120, height: int = 40) -> None:
    """写一张纯色 PNG，供页眉/页脚测试，不依赖 Pillow。"""
    raw = b"".join(b"\x00" + bytes((30, 80, 160)) * width for _ in range(height))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(
            ">I", binascii.crc32(tag + data) & 0xFFFFFFFF
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def check_header_footer() -> None:
    """页眉/页脚图片：自动入库、part 关系、首页/奇偶页组合。"""
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = pathlib.Path(tmp)
        image = tmp_path / "logo.png"
        _write_test_png(image)
        lib = tmp_path / "library"
        env = os.environ.copy()
        env["OFFICIAL_DOC_IMAGE_DIR"] = str(lib)

        ref = (ROOT / "references" / "doc-types" / "crisis-report.md").read_text(encoding="utf-8")
        template = TEMPLATE_RE.search(ref).group(1)
        md = tmp_path / "crisis.md"
        md.write_text(template + "\n", encoding="utf-8")

        cases = {
            "with_pages": [],
            "no_pages": ["--hide-page-number"],
        }
        for name, extra in cases.items():
            out = tmp_path / f"{name}.docx"
            proc = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_DIR / "generate_docx.py"),
                    str(md),
                    "--doc-type",
                    "危机处置报告",
                    "--header-image",
                    str(image),
                    "--footer-image",
                    str(image),
                    "-o",
                    str(out),
                    *extra,
                ],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=env,
            )
            if proc.returncode != 0:
                fail(f"页眉页脚导出失败（{name}）：{proc.stderr[-500:]}")
            if not (lib / "index.json").exists():
                fail("页眉/页脚图片未自动保存到图库")
            with zipfile.ZipFile(out) as archive:
                names = set(archive.namelist())
                document = archive.read("word/document.xml").decode("utf-8")
                header = archive.read("word/header1.xml").decode("utf-8")
                footer = archive.read("word/footer1.xml").decode("utf-8")
                if "word/header1.xml" not in names or "word/footer1.xml" not in names:
                    fail(f"页眉/页脚 part 缺失（{name}）")
                if "<w:drawing>" not in header or "<w:drawing>" not in footer:
                    fail(f"页眉/页脚图片未写入（{name}）")
                if "headerReference" not in document or "footerReference" not in document:
                    fail(f"document.xml 缺少页眉/页脚引用（{name}）")
                if name == "with_pages":
                    for part in ("word/header2.xml", "word/header3.xml", "word/footer2.xml", "word/footer3.xml"):
                        if part not in names:
                            fail(f"奇偶页/首页 part 缺失：{part}")
                else:
                    if "word/footer3.xml" in names:
                        fail("--hide-page-number 不应生成首页页码页脚")
        print("[OK] 页眉/页脚图片：自动入库 + 首页/奇偶页 + 图片关系")


def check_page_numbers() -> None:
    """逐个导出，核对首页/奇偶页真正引用的页脚与 PAGE 域。"""
    from itertools import product
    import posixpath
    rel_ns = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
    with tempfile.TemporaryDirectory() as tmp:
        folder = pathlib.Path(tmp)
        source, output = folder / "draft.md", folder / "draft.docx"
        source.write_text("# 纪要\n\n## 正文\n\n记录事项。\n\n## 版记\n\n印发。", encoding="utf-8")
        command = [sys.executable, str(SCRIPT_DIR / "generate_docx.py"), str(source), "-o", str(output)]
        for style, position, first in product(("number", "page", "chinese", "dash"), ("left", "center", "right", "outside"), (True, False)):
            subprocess.run(command + ["--page-number-style", style, "--page-number-position", position]
                           + ([] if first else ["--hide-first-page-number"]), check=True, capture_output=True)
            with zipfile.ZipFile(output) as z:
                document = ElementTree.fromstring(z.read("word/document.xml"))
                sections = document.findall(".//" + W_NS + "sectPr")
                assert len(sections) == 2
                for section in sections:
                    fmt = section.find(W_NS + "pgNumType")
                    assert fmt.get(W_NS + "fmt") == ("chineseCounting" if style == "chinese" else "decimal")
                    assert fmt.get(W_NS + "start") is None
                links = {r.get("Id"): r.get("Target") for r in ElementTree.fromstring(z.read("word/_rels/document.xml.rels"))}
                refs = sections[0].findall(W_NS + "footerReference")
                assert len(refs) == 3
                for ref in refs:
                    kind = ref.get(W_NS + "type")
                    footer = ElementTree.fromstring(z.read(posixpath.join("word", links[ref.get(rel_ns + "id")])))
                    field = footer.find(".//" + W_NS + "fldSimple")
                    if kind == "first" and not first:
                        assert field is None
                        continue
                    assert field is not None and field.get(W_NS + "instr").strip() == "PAGE"
                    text = "".join(n.text or "" for n in footer.iter(W_NS + "t"))
                    assert text == {"number":"1", "page":"第1页", "chinese":"第一页", "dash":"— 1 —"}[style]
                    expected = ("left" if kind == "even" else "right") if position == "outside" else position
                    assert footer.find(".//" + W_NS + "jc").get(W_NS + "val") == expected
        subprocess.run(command + ["--hide-page-number"], check=True, capture_output=True)
        with zipfile.ZipFile(output) as z:
            assert b"footerReference" not in z.read("word/document.xml")
    print("[OK] 32 种页码组合及关闭页码，覆盖分节续号")


def main() -> int:
    check_registry()
    check_markdown_parser()
    check_export()
    check_header_footer()
    check_page_numbers()
    print("[OK] selftest 全部通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


