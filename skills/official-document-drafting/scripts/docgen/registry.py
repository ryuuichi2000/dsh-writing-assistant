# -*- coding: utf-8 -*-
"""文种、字体方案与版式方案的加载与检索（单一数据源：assets/*.toml）。"""
from __future__ import annotations

import pathlib
import tomllib
from dataclasses import dataclass
from functools import lru_cache

ROOT = pathlib.Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets"


@dataclass(frozen=True)
class FontProfile:
    id: str
    display_name: str
    description: str
    header_family: str
    title_family: str
    heading_family: str
    subheading_family: str
    body_family: str
    header_size: int
    title_size: int
    heading_size: int
    body_size: int


@dataclass(frozen=True)
class LayoutProfile:
    id: str
    display_name: str
    description: str
    body_line_spacing_twips: int
    title_line_spacing_twips: int
    header_after_twips: int
    doc_number_after_twips: int
    title_after_twips: int
    recipient_after_twips: int
    signing_before_twips: int
    body_first_line_chars: int
    margin_top_twips: int
    margin_bottom_twips: int
    margin_left_twips: int
    margin_right_twips: int
    title_max_chars: int


@dataclass(frozen=True)
class DocType:
    id: str
    name: str
    aliases: tuple[str, ...]
    category: str
    description: str
    font_profile: str
    layout_profile: str
    required_sections: tuple[str, ...]
    reference: str
    fields: tuple[dict, ...] = ()


def _load_toml(name: str) -> dict:
    with (ASSETS / name).open("rb") as handle:
        return tomllib.load(handle)


@lru_cache(maxsize=1)
def load_doc_types() -> tuple[DocType, ...]:
    raw = _load_toml("registry.toml")
    items = []
    for entry in raw["doc_types"]:
        items.append(
            DocType(
                id=entry["id"],
                name=entry["name"],
                aliases=tuple(entry.get("aliases", [])),
                category=entry["category"],
                description=entry["description"],
                font_profile=entry["font_profile"],
                layout_profile=entry["layout_profile"],
                required_sections=tuple(entry.get("required_sections", [])),
                reference=entry.get("reference", f"references/doc-types/{entry['id']}.md"),
                fields=tuple(entry.get("fields", [])),
            )
        )
    return tuple(items)


@lru_cache(maxsize=1)
def load_font_profiles() -> dict[str, FontProfile]:
    raw = _load_toml("font-profiles.toml")
    profiles = {}
    for item in raw["profiles"]:
        profile = FontProfile(
            id=item["id"],
            display_name=item["display_name"],
            description=item["description"],
            header_family=item["header_family"],
            title_family=item["title_family"],
            heading_family=item["heading_family"],
            subheading_family=item["subheading_family"],
            body_family=item["body_family"],
            header_size=int(item["header_size"]),
            title_size=int(item["title_size"]),
            heading_size=int(item["heading_size"]),
            body_size=int(item["body_size"]),
        )
        profiles[profile.id] = profile
    return profiles


@lru_cache(maxsize=1)
def load_layout_profiles() -> dict[str, LayoutProfile]:
    raw = _load_toml("layout-profiles.toml")
    profiles = {}
    for item in raw["profiles"]:
        profile = LayoutProfile(
            id=item["id"],
            display_name=item["display_name"],
            description=item["description"],
            body_line_spacing_twips=int(item["body_line_spacing_twips"]),
            title_line_spacing_twips=int(item.get("title_line_spacing_twips", item["body_line_spacing_twips"])),
            header_after_twips=int(item.get("header_after_twips", item["body_line_spacing_twips"] // 2)),
            doc_number_after_twips=int(item.get("doc_number_after_twips", item["body_line_spacing_twips"] // 2)),
            title_after_twips=int(item.get("title_after_twips", item["body_line_spacing_twips"])),
            recipient_after_twips=int(item.get("recipient_after_twips", 0)),
            signing_before_twips=int(item.get("signing_before_twips", item["body_line_spacing_twips"] * 3)),
            body_first_line_chars=int(item.get("body_first_line_chars", 200)),
            margin_top_twips=int(item["margin_top_twips"]),
            margin_bottom_twips=int(item["margin_bottom_twips"]),
            margin_left_twips=int(item["margin_left_twips"]),
            margin_right_twips=int(item["margin_right_twips"]),
            title_max_chars=int(item.get("title_max_chars", 20)),
        )
        profiles[profile.id] = profile
    return profiles


def _normalize_key(value: str) -> str:
    text = (value or "").strip().lower().replace("_", "-")
    for suffix in ("文种", "文件"):
        if text.endswith(suffix) and len(text) > len(suffix):
            text = text[: -len(suffix)]
    return text


@lru_cache(maxsize=1)
def _doc_type_lookup() -> dict[str, DocType]:
    lookup: dict[str, DocType] = {}
    for item in load_doc_types():
        for key in (item.id, item.name, *item.aliases):
            normalized = _normalize_key(key)
            if normalized:
                lookup[normalized] = item
    return lookup


def resolve_doc_type(key: str | None) -> DocType | None:
    if not key:
        return None
    item = _doc_type_lookup().get(_normalize_key(key))
    if item is None:
        supported = "、".join(item.name for item in load_doc_types())
        raise ValueError(f"未识别文种：{key}。当前支持：{supported}")
    return item


def resolve_font_profile(key: str | None) -> FontProfile | None:
    if not key:
        return None
    for profile in load_font_profiles().values():
        if _normalize_key(key) in {_normalize_key(profile.id), _normalize_key(profile.display_name)}:
            return profile
    raise ValueError(f"未识别字体方案：{key}")


def resolve_layout_profile(key: str | None) -> LayoutProfile | None:
    if not key:
        return None
    for profile in load_layout_profiles().values():
        if _normalize_key(key) in {_normalize_key(profile.id), _normalize_key(profile.display_name)}:
            return profile
    raise ValueError(f"未识别版式方案：{key}")
