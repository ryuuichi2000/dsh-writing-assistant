#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""公文 Markdown → Word .docx 导出入口（只依赖 Python 标准库，3.11+）。

用法：
    python scripts/generate_docx.py 成稿.md --doc-type 通知
    python scripts/generate_docx.py 成稿.md -o 成稿.docx --font-profile official-standard
"""
from __future__ import annotations

import pathlib
import sys

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from docgen.cli import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
