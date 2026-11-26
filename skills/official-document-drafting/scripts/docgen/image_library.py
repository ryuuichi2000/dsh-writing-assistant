# -*- coding: utf-8 -*-
"""页眉/页脚图片库：导入、自动保存、按名称复用。

默认存放目录：`<skill>/assets/user-images/`；插件运行时用环境变量 `OFFICIAL_DOC_IMAGE_DIR` 指向 `$DSH_HOME/writing-assistant/doc-images`。
图片按内容哈希命名，`index.json` 记录用户给的名字、原文件名、尺寸和添加时间。
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import shutil

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_DIR = ROOT / "assets" / "user-images"
LIB_DIR = pathlib.Path(os.environ.get("OFFICIAL_DOC_IMAGE_DIR", str(DEFAULT_DIR)))
INDEX_PATH = LIB_DIR / "index.json"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg"}


def _ensure_dir() -> None:
    LIB_DIR.mkdir(parents=True, exist_ok=True)


def _load_index() -> list[dict]:
    if not INDEX_PATH.exists():
        return []
    try:
        data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    return [item for item in data if isinstance(item, dict) and item.get("file")]


def _save_index(items: list[dict]) -> None:
    _ensure_dir()
    tmp = INDEX_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, INDEX_PATH)


def _clean_name(name: str) -> str:
    cleaned = re.sub(r"[\\/:*?\"<>|\r\n\t]+", "_", name).strip().strip(".")
    return cleaned or "未命名图片"


def _sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_size(path: pathlib.Path) -> tuple[int, int]:
    try:
        from docgen.images import read_image_dimensions

        return read_image_dimensions(path)
    except Exception:
        return 0, 0


def list_images() -> list[dict]:
    items = _load_index()
    alive = [item for item in items if (LIB_DIR / item["file"]).exists()]
    if len(alive) != len(items):
        _save_index(alive)
    return alive


def _find_by_name(items: list[dict], name: str) -> dict | None:
    target = _clean_name(name).lower()
    for item in items:
        if _clean_name(item.get("name", "")).lower() == target:
            return item
    # 允许不带扩展名的引用，如 --header-image 单位页眉
    for item in items:
        stem = pathlib.Path(item.get("name", "")).stem.lower()
        if stem and stem == pathlib.Path(target).stem.lower():
            return item
    return None


def add_image(path: str | pathlib.Path, name: str | None = None) -> dict:
    """把图片复制进图库并返回条目；同一内容重复导入时复用原条目。"""
    source = pathlib.Path(path).expanduser().resolve()
    if not source.exists():
        raise ValueError(f"图片不存在：{path}")
    if not source.is_file():
        raise ValueError(f"不是图片文件：{path}")
    suffix = source.suffix.lower()
    if suffix not in IMAGE_SUFFIXES:
        raise ValueError(f"仅支持 png/jpg/jpeg：{source.name}")

    items = list_images()
    digest = _sha256(source)
    for item in items:
        if item.get("sha256") == digest:
            return item

    display_name = _clean_name(name or source.stem)
    existing = _find_by_name(items, display_name)
    if existing is not None:
        # 同名换图：覆盖条目，旧文件若不再被引用则删除。
        old_file = existing.get("file")
        items = [item for item in items if item is not existing]
        if old_file and not any(item.get("file") == old_file for item in items):
            (LIB_DIR / old_file).unlink(missing_ok=True)

    _ensure_dir()
    target_name = f"{digest[:10]}{suffix}"
    target = LIB_DIR / target_name
    if not target.exists():
        shutil.copyfile(source, target)
    width, height = _read_size(target)
    entry = {
        "name": display_name,
        "file": target_name,
        "original_name": source.name,
        "sha256": digest,
        "width_px": width,
        "height_px": height,
        "added_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    items.append(entry)
    _save_index(items)
    return entry


def resolve_image_entry(ref: str | pathlib.Path) -> tuple[pathlib.Path, dict]:
    """解析图片引用，返回 (图库文件路径, 条目)。"""
    text = str(ref).strip().strip('"').strip("'")
    if not text:
        raise ValueError("图片引用为空")

    # 看起来像本地路径：存在就自动入库；不存在但明显是路径时直接报错。
    looks_like_path = any(sep in text for sep in ("/", "\\")) or pathlib.Path(text).suffix.lower() in IMAGE_SUFFIXES
    if looks_like_path:
        candidate = pathlib.Path(text).expanduser()
        if candidate.exists():
            entry = add_image(candidate)
            return LIB_DIR / entry["file"], entry
        if any(sep in text for sep in ("/", "\\")):
            raise ValueError(f"图片不存在：{text}")

    entry = _find_by_name(list_images(), text)
    if entry is None:
        names = "、".join(item.get("name", "") for item in list_images()) or "（图库为空）"
        raise ValueError(f"未找到图片“{text}”。已保存的图片：{names}")
    return LIB_DIR / entry["file"], entry


def resolve_image(ref: str | pathlib.Path) -> pathlib.Path:
    """兼容接口：只返回图片路径。"""
    return resolve_image_entry(ref)[0]


def remove_image(name: str) -> None:
    items = list_images()
    entry = _find_by_name(items, name)
    if entry is None:
        raise ValueError(f"未找到图片：{name}")
    items = [item for item in items if item is not entry]
    _save_index(items)
    if not any(item.get("file") == entry.get("file") for item in items):
        (LIB_DIR / entry["file"]).unlink(missing_ok=True)


def format_images() -> str:
    items = list_images()
    if not items:
        return f"图库为空：{LIB_DIR}"
    lines = [f"图库目录：{LIB_DIR}", ""]
    for item in items:
        width = item.get("width_px") or "?"
        height = item.get("height_px") or "?"
        lines.append(
            f"- {item.get('name')}  ({width}×{height}px，{item.get('original_name', '')}，{item.get('added_at', '')})"
        )
    return "\n".join(lines)
