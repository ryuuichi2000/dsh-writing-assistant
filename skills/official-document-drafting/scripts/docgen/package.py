# -*- coding: utf-8 -*-
"""OPC 包各部件（内容类型、关系、样式、设置、页眉、页脚、属性）的生成与 .docx 落盘。"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import pathlib
import zipfile
from typing import Iterable
from xml.sax.saxutils import escape

from docgen.constants import (
    CP_NS,
    DC_NS,
    DCTERMS_NS,
    EP_NS,
    PAGE_NUMBER_FONT,
    PAGE_NUMBER_SIZE_PT,
    VT_NS,
    W_NS,
    XSI_NS,
)
from docgen.images import image_run_xml
from docgen.models import ImageAsset
from docgen.oxml import run_properties
from docgen.settings import body_line_spacing_twips

APP_NAME = "official-document-drafting"


def collect_fonts(args: argparse.Namespace) -> list[str]:
    fonts = [args.header_font, args.title_font, args.heading_font, args.subheading_font, args.body_font]
    return list(dict.fromkeys(fonts))


def build_styles_xml(args: argparse.Namespace) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:styles xmlns:w="{W_NS}">'
        "<w:docDefaults>"
        "<w:rPrDefault><w:rPr>"
        f'<w:rFonts w:ascii="{escape(args.body_font)}" w:hAnsi="{escape(args.body_font)}" '
        f'w:eastAsia="{escape(args.body_font)}" w:cs="{escape(args.body_font)}"/>'
        f'<w:sz w:val="{args.body_size * 2}"/>'
        f'<w:szCs w:val="{args.body_size * 2}"/>'
        "</w:rPr></w:rPrDefault>"
        "<w:pPrDefault><w:pPr>"
        f'<w:spacing w:line="{body_line_spacing_twips(args)}" w:lineRule="exact"/>'
        "</w:pPr></w:pPrDefault>"
        "</w:docDefaults>"
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">'
        '<w:name w:val="Normal"/>'
        "</w:style>"
        "</w:styles>"
    )


def build_settings_xml(*, even_and_odd: bool) -> str:
    even = "<w:evenAndOddHeaders/>" if even_and_odd else ""
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:settings xmlns:w="{W_NS}">'
        f"{even}"
        '<w:defaultTabStop w:val="420"/>'
        '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>'
        "</w:settings>"
    )


def build_font_table_xml(fonts: list[str]) -> str:
    items = []
    for font_name in fonts:
        items.append(
            f'<w:font w:name="{escape(font_name)}">'
            '<w:charset w:val="86"/>'
            '<w:family w:val="auto"/>'
            '<w:pitch w:val="variable"/>'
            "</w:font>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:fonts xmlns:w="{W_NS}">{"".join(items)}</w:fonts>'
    )


def build_content_types_xml(
    *,
    show_page_number: bool = False,
    has_header_image: bool = False,
    has_footer_image: bool = False,
    image_content_types: Iterable[str] = (),
) -> str:
    overrides = []
    if show_page_number or has_footer_image:
        overrides.append(
            '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
        )
        overrides.append(
            '<Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
        )
    if show_page_number:
        overrides.append(
            '<Override PartName="/word/footer3.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
        )
    if has_header_image:
        overrides.append(
            '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
        )
    if has_header_image and show_page_number:
        overrides.append(
            '<Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
        )
        overrides.append(
            '<Override PartName="/word/header3.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
        )

    image_defaults = []
    seen: set[str] = set()
    for content_type in image_content_types:
        if content_type in seen:
            continue
        seen.add(content_type)
        if content_type == "image/png":
            image_defaults.append('<Default Extension="png" ContentType="image/png"/>')
        elif content_type == "image/jpeg":
            image_defaults.append('<Default Extension="jpg" ContentType="image/jpeg"/>')
            image_defaults.append('<Default Extension="jpeg" ContentType="image/jpeg"/>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        f"{''.join(image_defaults)}"
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
        '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>'
        f"{''.join(overrides)}"
        "</Types>"
    )


def build_root_relationships_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
        "</Relationships>"
    )


def build_document_relationships_xml(
    *,
    show_page_number: bool = False,
    has_header_image: bool = False,
    has_footer_image: bool = False,
    image_assets: dict[str, ImageAsset] | None = None,
) -> str:
    relationships = [
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>',
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
    ]
    # rId4/rId5：默认/偶页页脚；rId6/rId7：默认/偶页页眉；rId8/rId9：首页页脚/页眉。
    if show_page_number or has_footer_image:
        relationships.append(
            '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
        )
        relationships.append(
            '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/>'
        )
    if show_page_number:
        relationships.append(
            '<Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer3.xml"/>'
        )
    if has_header_image:
        relationships.append(
            '<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
        )
    if has_header_image and show_page_number:
        relationships.append(
            '<Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/>'
        )
        relationships.append(
            '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header3.xml"/>'
        )
    if image_assets:
        for asset in image_assets.values():
            relationships.append(
                f'<Relationship Id="{asset.rel_id}" '
                'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
                f'Target="media/{asset.target_name}"/>'
            )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f"{''.join(relationships)}"
        "</Relationships>"
    )


def build_furniture_relationships_xml(asset: ImageAsset) -> str:
    """页眉/页脚 part 自己的图片关系（每个 part 独立，固定 rId1）。"""
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
        f'Target="media/{asset.target_name}"/>'
        "</Relationships>"
    )


def build_core_xml(title: str) -> str:
    timestamp = dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    safe_title = escape(title or "公文稿件")
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<cp:coreProperties xmlns:cp="{CP_NS}" xmlns:dc="{DC_NS}" xmlns:dcterms="{DCTERMS_NS}" xmlns:xsi="{XSI_NS}">'
        f"<dc:title>{safe_title}</dc:title>"
        f"<dc:creator>{APP_NAME}</dc:creator>"
        f"<cp:lastModifiedBy>{APP_NAME}</cp:lastModifiedBy>"
        f'<dcterms:created xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:created>'
        f'<dcterms:modified xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:modified>'
        "</cp:coreProperties>"
    )


def build_app_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Properties xmlns="{EP_NS}" xmlns:vt="{VT_NS}">'
        f"<Application>{APP_NAME}</Application>"
        "</Properties>"
    )


def _furniture_image_paragraph(asset: ImageAsset, *, align: str, drawing_id: int) -> str:
    return (
        "<w:p><w:pPr>"
        f'<w:jc w:val="{align}"/>'
        '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>'
        "</w:pPr>"
        f"{image_run_xml(asset, alt_text='页眉页脚图片', drawing_id=drawing_id)}"
        "</w:p>"
    )


def build_header_xml(asset: ImageAsset, *, align: str = "center") -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:hdr xmlns:w="{W_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        f"{_furniture_image_paragraph(asset, align=align, drawing_id=9001)}"
        "</w:hdr>"
    )


def _page_number_paragraph(args: argparse.Namespace, even: bool) -> str:
    style = args.page_number_style
    position = args.page_number_position
    indent = ""
    if position == "outside":
        position = "left" if even else "right"
        indent = f'<w:ind w:{position}Chars="100" w:{position}="316"/>'
    before, after = {"number": ("", ""), "dash": ("— ", " —"),
                     "page": ("第", "页"), "chinese": ("第", "页")}[style]
    props = run_properties(PAGE_NUMBER_FONT, PAGE_NUMBER_SIZE_PT)
    def literal(value: str) -> str:
        return f'<w:r>{props}<w:t xml:space="preserve">{value}</w:t></w:r>' if value else ""
    return (
        f'<w:p><w:pPr>{indent}<w:jc w:val="{position}"/></w:pPr>{literal(before)}'
        f'<w:fldSimple w:instr=" PAGE ">{literal("一" if style == "chinese" else "1")}</w:fldSimple>'
        f'{literal(after)}</w:p>'
    )


def build_footer_xml(
    args: argparse.Namespace,
    *,
    even: bool = False,
    image: ImageAsset | None = None,
    with_page_number: bool = True,
    align: str = "center",
    drawing_id: int = 9002,
) -> str:
    parts = []
    if image is not None:
        parts.append(_furniture_image_paragraph(image, align=align, drawing_id=drawing_id))
    if with_page_number:
        parts.append(_page_number_paragraph(args, even))
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:ftr xmlns:w="{W_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        f"{''.join(parts)}"
        "</w:ftr>"
    )


def resolve_output_path(input_path: pathlib.Path, explicit_output: pathlib.Path | None) -> pathlib.Path:
    if explicit_output:
        return explicit_output
    return input_path.with_suffix(".docx")


def write_docx_package(
    output_path: pathlib.Path,
    *,
    args: argparse.Namespace,
    title: str,
    document_xml: str,
    image_assets: dict[str, ImageAsset],
    header_asset: ImageAsset | None = None,
    footer_asset: ImageAsset | None = None,
) -> None:
    """先写临时文件，成功后原子改名，避免留下半截损坏的 .docx。"""
    tmp_path = output_path.with_name(output_path.name + ".tmp")
    has_header = header_asset is not None
    has_footer_image = footer_asset is not None
    try:
        with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            all_assets = list(image_assets.values())
            if header_asset is not None:
                all_assets.append(header_asset)
            if footer_asset is not None:
                all_assets.append(footer_asset)
            archive.writestr(
                "[Content_Types].xml",
                build_content_types_xml(
                    show_page_number=args.show_page_number,
                    has_header_image=has_header,
                    has_footer_image=has_footer_image,
                    image_content_types=[asset.content_type for asset in all_assets],
                ),
            )
            archive.writestr("_rels/.rels", build_root_relationships_xml())
            archive.writestr("docProps/core.xml", build_core_xml(title))
            archive.writestr("docProps/app.xml", build_app_xml())
            archive.writestr("word/document.xml", document_xml)
            archive.writestr("word/styles.xml", build_styles_xml(args))
            archive.writestr(
                "word/settings.xml",
                build_settings_xml(even_and_odd=args.show_page_number),
            )
            archive.writestr("word/fontTable.xml", build_font_table_xml(collect_fonts(args)))
            archive.writestr(
                "word/_rels/document.xml.rels",
                build_document_relationships_xml(
                    show_page_number=args.show_page_number,
                    has_header_image=has_header,
                    has_footer_image=has_footer_image,
                    image_assets=image_assets,
                ),
            )
            for asset in all_assets:
                archive.writestr(f"word/media/{asset.target_name}", asset.source.read_bytes())

            if header_asset is not None:
                align = getattr(args, "header_image_align", "center")
                archive.writestr("word/header1.xml", build_header_xml(header_asset, align=align))
                archive.writestr("word/_rels/header1.xml.rels", build_furniture_relationships_xml(header_asset))
                if args.show_page_number:
                    archive.writestr("word/header2.xml", build_header_xml(header_asset, align=align))
                    archive.writestr("word/_rels/header2.xml.rels", build_furniture_relationships_xml(header_asset))
                    archive.writestr("word/header3.xml", build_header_xml(header_asset, align=align))
                    archive.writestr("word/_rels/header3.xml.rels", build_furniture_relationships_xml(header_asset))

            if args.show_page_number or footer_asset is not None:
                align = getattr(args, "footer_image_align", "center")
                archive.writestr(
                    "word/footer1.xml",
                    build_footer_xml(args, even=False, image=footer_asset, with_page_number=args.show_page_number, align=align),
                )
                if footer_asset is not None:
                    archive.writestr("word/_rels/footer1.xml.rels", build_furniture_relationships_xml(footer_asset))
                archive.writestr(
                    "word/footer2.xml",
                    build_footer_xml(args, even=True, image=footer_asset, with_page_number=args.show_page_number, align=align),
                )
                if footer_asset is not None:
                    archive.writestr("word/_rels/footer2.xml.rels", build_furniture_relationships_xml(footer_asset))
                if args.show_page_number:
                    archive.writestr(
                        "word/footer3.xml",
                        build_footer_xml(
                            args,
                            even=False,
                            image=footer_asset,
                            with_page_number=not args.hide_first_page_number,
                            align=align,
                        ),
                    )
                    if footer_asset is not None:
                        archive.writestr("word/_rels/footer3.xml.rels", build_furniture_relationships_xml(footer_asset))
        os.replace(tmp_path, output_path)
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise
