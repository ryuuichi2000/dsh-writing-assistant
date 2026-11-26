# -*- coding: utf-8 -*-
"""把 CLI 参数、文种绑定与字体/版式方案合并为最终导出设置。"""
from __future__ import annotations

import argparse

from docgen.constants import DEFAULT_FONT_SETTINGS, DEFAULT_LAYOUT_SETTINGS
from docgen.registry import (
    FontProfile,
    LayoutProfile,
    load_font_profiles,
    load_layout_profiles,
    resolve_doc_type,
    resolve_font_profile,
    resolve_layout_profile,
)


def apply_font_profile(args: argparse.Namespace, profile: FontProfile) -> None:
    if args.header_font is None:
        args.header_font = profile.header_family
    if args.title_font is None:
        args.title_font = profile.title_family
    if args.heading_font is None:
        args.heading_font = profile.heading_family
    if args.subheading_font is None:
        args.subheading_font = profile.subheading_family
    if args.body_font is None:
        args.body_font = profile.body_family
    if args.header_size is None:
        args.header_size = profile.header_size
    if args.title_size is None:
        args.title_size = profile.title_size
    if args.heading_size is None:
        args.heading_size = profile.heading_size
    if args.body_size is None:
        args.body_size = profile.body_size


def apply_layout_profile(args: argparse.Namespace, profile: LayoutProfile) -> None:
    mapping = {
        "body_line_spacing_twips": profile.body_line_spacing_twips,
        "title_line_spacing_twips": profile.title_line_spacing_twips,
        "header_after_twips": profile.header_after_twips,
        "doc_number_after_twips": profile.doc_number_after_twips,
        "title_after_twips": profile.title_after_twips,
        "recipient_after_twips": profile.recipient_after_twips,
        "signing_before_twips": profile.signing_before_twips,
        "body_first_line_chars": profile.body_first_line_chars,
        "margin_top_twips": profile.margin_top_twips,
        "margin_bottom_twips": profile.margin_bottom_twips,
        "margin_left_twips": profile.margin_left_twips,
        "margin_right_twips": profile.margin_right_twips,
        "title_max_chars": profile.title_max_chars,
    }
    for key, value in mapping.items():
        if getattr(args, key, None) is None:
            setattr(args, key, value)


def apply_font_preset(args: argparse.Namespace) -> None:
    presets = {
        "system-cn": ("方正小标宋简体", "黑体", "楷体_GB2312", "仿宋_GB2312"),
        "source-han": ("Source Han Serif SC", "Source Han Sans SC", "Source Han Serif SC", "Source Han Serif SC"),
        "noto-cjk": ("Noto Serif SC", "Noto Sans SC", "Noto Serif SC", "FandolFang"),
        "fandol": ("FandolSong", "FandolHei", "FandolSong", "FandolFang"),
    }
    if not args.font_preset:
        return
    title_font, heading_font, subheading_font, body_font = presets[args.font_preset]
    if args.header_font is None:
        args.header_font = title_font
    if args.title_font is None:
        args.title_font = title_font
    if args.heading_font is None:
        args.heading_font = heading_font
    if args.subheading_font is None:
        args.subheading_font = subheading_font
    if args.body_font is None:
        args.body_font = body_font


def finalize_export_settings(
    args: argparse.Namespace,
) -> tuple[FontProfile | None, LayoutProfile | None]:
    selected_font: FontProfile | None = None
    selected_layout: LayoutProfile | None = None

    doc_type = resolve_doc_type(args.doc_type)
    if doc_type is not None:
        selected_font = load_font_profiles()[doc_type.font_profile]
        selected_layout = load_layout_profiles()[doc_type.layout_profile]
        apply_font_profile(args, selected_font)
        apply_layout_profile(args, selected_layout)
    else:
        if args.font_profile:
            selected_font = resolve_font_profile(args.font_profile)
            apply_font_profile(args, selected_font)
        if args.layout_profile:
            selected_layout = resolve_layout_profile(args.layout_profile)
            apply_layout_profile(args, selected_layout)

    apply_font_preset(args)

    if args.line_spacing_pt is not None:
        line = round(float(args.line_spacing_pt) * 20)
        if args.body_line_spacing_twips is None:
            args.body_line_spacing_twips = line
        if args.title_line_spacing_twips is None:
            args.title_line_spacing_twips = line
        if args.header_after_twips is None:
            args.header_after_twips = line // 2
        if args.doc_number_after_twips is None:
            args.doc_number_after_twips = line // 2
        if args.title_after_twips is None:
            args.title_after_twips = line
        if args.recipient_after_twips is None:
            args.recipient_after_twips = 0
        if args.signing_before_twips is None:
            args.signing_before_twips = line * 3

    for key, value in {**DEFAULT_FONT_SETTINGS, **DEFAULT_LAYOUT_SETTINGS}.items():
        if getattr(args, key, None) is None:
            setattr(args, key, value)

    if args.title_max_chars is None:
        args.title_max_chars = 20

    return selected_font, selected_layout


def body_line_spacing_twips(args: argparse.Namespace) -> int:
    return args.body_line_spacing_twips


def title_line_spacing_twips(args: argparse.Namespace) -> int:
    return args.title_line_spacing_twips


def render_font_plan(args: argparse.Namespace, profile: FontProfile | None) -> str:
    if profile is not None:
        return "\n".join(
            [
                f"- 字体方案：{profile.display_name}（{profile.id}）",
                f"- 标题：{profile.title_family} / {profile.title_size}pt",
                f"- 一级标题：{profile.heading_family} / {profile.heading_size}pt",
                f"- 二级标题：{profile.subheading_family} / {profile.heading_size}pt",
                f"- 正文：{profile.body_family} / {profile.body_size}pt",
            ]
        )
    return "\n".join(
        [
            f"- 标题：{args.title_font} / {args.title_size}pt",
            f"- 一级标题：{args.heading_font} / {args.heading_size}pt",
            f"- 二级标题：{args.subheading_font} / {args.heading_size}pt",
            f"- 正文：{args.body_font} / {args.body_size}pt",
        ]
    )


def render_layout_plan(args: argparse.Namespace, profile: LayoutProfile | None) -> str:
    if profile is not None:
        return "\n".join(
            [
                f"- 版式方案：{profile.display_name}（{profile.id}）",
                f"- 正文固定行距：{profile.body_line_spacing_twips / 20:.2f}pt",
                f"- 正文首行缩进：{profile.body_first_line_chars / 100:.2f} 字符",
                "- 页边距（上/下/左/右，mm）："
                f"{profile.margin_top_twips / 56.6929:.0f}/"
                f"{profile.margin_bottom_twips / 56.6929:.0f}/"
                f"{profile.margin_left_twips / 56.6929:.0f}/"
                f"{profile.margin_right_twips / 56.6929:.0f}",
            ]
        )
    return "\n".join(
        [
            f"- 正文固定行距：{args.body_line_spacing_twips / 20:.2f}pt",
            f"- 正文首行缩进：{args.body_first_line_chars / 100:.2f} 字符",
        ]
    )


def format_font_catalog() -> str:
    return "\n".join(
        f"- `{p.id}` / {p.display_name} / {p.description}"
        for p in load_font_profiles().values()
    )


def format_layout_catalog() -> str:
    return "\n".join(
        f"- `{p.id}` / {p.display_name} / {p.description}"
        for p in load_layout_profiles().values()
    )
