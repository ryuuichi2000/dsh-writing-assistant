#!/usr/bin/env python3
"""dsh-writing 自检：语料、档案、渲染、选区补丁、回退、成稿检查。

    python scripts/selftest.py
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "writing.py"
PY = sys.executable

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, str(HERE))
import writing  # noqa: E402


def run(home: Path, *args, expect: int = 0, stdin: str | None = None) -> subprocess.CompletedProcess:
    command = [PY, str(SCRIPT), "--home", str(home), *[str(arg) for arg in args]]
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", input=stdin)
    if result.returncode != expect:
        print(result.stdout)
        print(result.stderr)
        raise AssertionError(f"命令返回 {result.returncode}，期望 {expect}：{' '.join(command[1:])}")
    return result


def ok(message: str) -> None:
    print(f"[OK] {message}")


def make_docx(path: Path) -> None:
    xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>这是一段从 docx 里取出来的文字，用来确认段落提取没有丢。</w:t></w:r></w:p>
    <w:p><w:r><w:t>第二段：短句。再短一点。</w:t></w:r></w:p>
  </w:body>
</w:document>
"""
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("word/document.xml", xml)


SAMPLE = """# 我为什么又开始写长文

最近半年，我把写东西的地方从聊天框搬回了本地。原因不复杂：聊天框里写出来的句子，读起来不像我。

先说一个具体的。上周改一篇旧稿，我把开头三句删了。删完发现，剩下的第一句才是原来想说的。这类事在聊天框里很难发生，因为那里默认你要一次说完。

我写东西有几个改不掉的习惯。破折号少用，能拆句就拆句。数字后面喜欢跟一句解释，不然总觉得虚。结尾一般落在一个具体动作上，不喊口号。

这不是方法论。它只是我个人的一点偏好。别人未必适用，我也还在改。
"""

PROFILE = """# 语气档案 · 测试

更新：2026-11-17 · 样本 1 篇 · 置信度 较低

## 画像

写自己的经验，先给具体场景，再给判断，不喊口号。

## 节奏与结构

- 句子偏短，一段三到五句，常在一段里先叙述再收一句判断｜例：「先说一个具体的。上周改一篇旧稿，我把开头三句删了。」

## 人称与称呼

- 第一人称单数为主，不用「我们」替读者表态｜例：「我写东西有几个改不掉的习惯。」

## 常用词与不用的词

- 常用「具体」「改」「落地」｜例：「先说一个具体的。」
- 不用「赋能」「闭环」｜例：「样本里没有出现」

## 判断与语气

- 判断前先给限定，常用「未必」「大概」｜例：「别人未必适用，我也还在改。」

## 标点与中英混排

- 少用破折号，能拆句就拆；中文标点，数字与中文之间不加空格｜例：「破折号少用，能拆句就拆句。」

## 对话中学到的

- 2026-11-17：用户说「别用『值得注意的是』」，之后不用。

## 原文参照

> 我写东西有几个改不掉的习惯。破折号少用，能拆句就拆句。数字后面喜欢跟一句解释。

> 这不是方法论。它只是我个人的一点偏好。
"""

DRAFT = """# 测试文章：写作模块自检

根据《材料一》报道，开头先给一个场景，不急着下结论。

## 一、发生了什么

这是第二段，准备被选区改写。据材料二统计，数字是 42%，保持出处不变。

## 二、这意味着什么

判断要留余地：这个变化可能只影响初稿环节。

## 参考资料

1. [材料一：场景说明](https://example.com/a)
2. 材料二：数据说明，2026 年 10 月，https://example.com/b
"""

# 编号没有参考资料小节：必须被拦
NO_LIST = DRAFT.replace("根据《材料一》报道，", "开头[1]，").replace("据材料二统计，", "引用[2]，")
NO_LIST = NO_LIST.split("## 参考资料")[0].rstrip() + "\n"

# 编号有参考资料，但缺条目：必须被拦
MISSING_ENTRY = DRAFT.replace("根据《材料一》报道，", "开头[1]，").replace("据材料二统计，", "引用[9]，")


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="dsh-writing-") as tmp:
        base = Path(tmp)
        home = base / "home"
        home.mkdir()

        # 1. 语料：md + docx，重复收录要跳过
        article = base / "article.md"
        article.write_text(SAMPLE, encoding="utf-8", newline="\n")
        docx = base / "note.docx"
        make_docx(docx)
        result = run(home, "corpus", "add", article, docx)
        assert "已收录 2 篇" in result.stdout, result.stdout
        index = json.loads((home / "voice" / "default" / "index.json").read_text(encoding="utf-8"))
        assert len(index["samples"]) == 2
        docx_sample = next(s for s in index["samples"] if s["title"].startswith("这是一段"))
        assert "第二段" in (home / "voice" / "default" / docx_sample["file"]).read_text(encoding="utf-8")
        result = run(home, "corpus", "add", article)
        assert "跳过" in result.stdout
        result = run(home, "extract", docx)
        assert "第二段" in result.stdout
        ok("语料收录：md/docx 提取、统计、去重；单独抽取文本")

        # 2. 语料统计
        result = run(home, "voice", "stats", "--json")
        stats = json.loads(result.stdout)
        assert stats["samples"] == 2 and stats["chars"] > 100
        assert stats["punctuation"]["ellipsis"] >= 0
        ok("语料统计：句长、标点、人称、高频词")

        # 3. 档案校验：合格与不合格
        profile_dir = home / "voice" / "default"
        profile = profile_dir / "profile.md"
        profile.write_text(PROFILE, encoding="utf-8", newline="\n")
        result = run(home, "voice", "check")
        assert "档案可用" in result.stdout, result.stdout
        broken = PROFILE.replace("## 人称与称呼", "## 谁在说话")
        profile.write_text(broken, encoding="utf-8", newline="\n")
        result = run(home, "voice", "check", expect=1)
        assert "缺少小节" in result.stdout
        profile.write_text(PROFILE, encoding="utf-8", newline="\n")
        ok("档案校验：结构、证据覆盖、置信度")

        # 4. 建项目 + 渲染
        project = base / "work" / "demo"
        run(home, "init", project, "--title", "测试文章")
        (project / "draft.md").write_text(DRAFT, encoding="utf-8", newline="\n")
        result = run(home, "render", project)
        preview = (project / "preview.html").read_text(encoding="utf-8")
        assert "data-bid=" in preview and "__WRITING_DOC__" in preview and "sel-tools" in preview
        assert "根据《材料一》报道" in preview
        assert "参考资料" in preview
        ok("渲染：预览页、行内归属、参考资料、选区脚本")

        # 5. 选区补丁：按块 + 哈希定位
        blocks = writing.parse_blocks(DRAFT)
        target = next(block for block in blocks if "第二段" in block["raw"])
        edits = {
            "type": "writing:edit-request",
            "action": "rewrite",
            "instruction": "只改选中的第二段",
            "project": {"draftHash": writing.sha(DRAFT)},
            "selection": {"text": "这是第二段", "blocks": [{"id": target["id"]}]},
            "edits": [
                {
                    "blockId": target["id"],
                    "expect": target["hash"],
                    "before": target["raw"],
                    "replaceRaw": "这一段被选区的修改请求改写了，仍然保留来源编号[2]。",
                }
            ],
        }
        edits_path = base / "edits.json"
        edits_path.write_text(json.dumps(edits, ensure_ascii=False), encoding="utf-8", newline="\n")
        run(home, "patch", project, "--edits", edits_path, "--dry-run")
        assert "这是第二段" in (project / "draft.md").read_text(encoding="utf-8")
        run(home, "patch", project, "--edits", edits_path)
        patched = (project / "draft.md").read_text(encoding="utf-8")
        assert "被选区的修改请求改写了" in patched
        assert "开头先给一个场景" in patched
        revisions = writing.load_revisions(project)
        assert len(revisions) == 1 and revisions[0]["draftBefore"] == DRAFT
        ok("选区补丁：只改目标块，其它块原样，留下快照")

        # 6. 旧补丁再提交要报错，不静默改错块
        result = run(home, "patch", project, "--edits", edits_path, expect=2)
        assert "已经变了" in (result.stdout + result.stderr)
        ok("定位保护：块内容变化后拒绝应用")

        # 7. 渲染后再撤回
        run(home, "render", project)
        run(home, "revert", project)
        restored = (project / "draft.md").read_text(encoding="utf-8")
        assert restored == DRAFT
        ok("撤回：恢复上一版正文")

        # 8. 成稿检查：编号要有参考资料且对得上；行内归属直接通过
        (project / "draft.md").write_text(NO_LIST, encoding="utf-8", newline="\n")
        result = run(home, "check", project, expect=1)
        assert "参考资料" in result.stdout
        (project / "draft.md").write_text(MISSING_ENTRY, encoding="utf-8", newline="\n")
        result = run(home, "check", project, expect=1)
        assert "没有对应条目" in result.stdout
        (project / "draft.md").write_text(DRAFT, encoding="utf-8", newline="\n")
        result = run(home, "check", project)
        assert "通过" in result.stdout
        ok("成稿检查：编号缺参考资料 / 编号缺条目被拦，行内归属通过")

        # 9. 状态
        result = run(home, "status", project)
        assert "正文：" in result.stdout
        ok("状态：字数、修改数、自检摘要")

    print("\nselftest 全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
