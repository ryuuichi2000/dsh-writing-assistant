# -*- coding: utf-8 -*-
"""docx 导出的版式常量、结构板块名与单位换算。"""

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
CP_NS = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
DC_NS = "http://purl.org/dc/elements/1.1/"
DCTERMS_NS = "http://purl.org/dc/terms/"
XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"
EP_NS = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
VT_NS = "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"

DEFAULT_BODY_LINE_SPACING_TWIPS = 579
PAGE_WIDTH_TWIPS = 11906
PAGE_HEIGHT_TWIPS = 16838
# GB/T 9704-2012 页边距：上 37mm、下 35mm、左 28mm、右 26mm（版心 156mm×225mm）。
MARGIN_TOP_TWIPS = 2098
MARGIN_BOTTOM_TWIPS = 1984
MARGIN_LEFT_TWIPS = 1587
MARGIN_RIGHT_TWIPS = 1474
PRINTABLE_WIDTH_TWIPS = PAGE_WIDTH_TWIPS - MARGIN_LEFT_TWIPS - MARGIN_RIGHT_TWIPS
PRINTABLE_HEIGHT_TWIPS = PAGE_HEIGHT_TWIPS - MARGIN_TOP_TWIPS - MARGIN_BOTTOM_TWIPS
CHARS_PER_LINE = 28
IMAGE_MAX_WIDTH_RATIO = 0.85
IMAGE_MAX_HEIGHT_RATIO = 0.72
IMAGE_PARAGRAPH_SPACING_TWIPS = 120
SIGNING_DATE_RIGHT_CHARS = 400
MIN_SIGNING_UNIT_RIGHT_CHARS = 200
PAGE_NUMBER_FONT = "宋体"
PAGE_NUMBER_SIZE_PT = 14
PAGE_NUMBER_FOOTER_TWIPS = 1587

# 这些是“版式结构板块”，不是正文标题：默认不把板块名打印进正文。
STRUCTURAL_HEADINGS = {
    "标题", "题注", "主送单位", "正文", "落款", "附注", "版记",
    "版头", "发文字号", "份号", "密级", "紧急程度", "签发人",
    "附件", "附件说明", "附图", "附表", "附录",
    "报送对象", "称谓", "会议信息", "会议基本信息",
    "出席", "参加", "请假", "列席", "记录", "报送范围",
}
# 只作为结构标记、内容按“标签：内容”打印的板块。
LABELLED_HEADINGS = {"出席", "参加", "请假", "列席", "记录"}
# 需要放在版心底部、带分隔线的版记。
END_MATTER_HEADINGS = {"版记"}

DEFAULT_FONT_SETTINGS = {
    "header_font": "方正小标宋简体",
    "title_font": "方正小标宋简体",
    "heading_font": "黑体",
    "subheading_font": "楷体_GB2312",
    "body_font": "仿宋_GB2312",
    "header_size": 26,
    "title_size": 22,
    "heading_size": 16,
    "body_size": 16,
}
DEFAULT_LAYOUT_SETTINGS = {
    "body_line_spacing_twips": DEFAULT_BODY_LINE_SPACING_TWIPS,
    "title_line_spacing_twips": DEFAULT_BODY_LINE_SPACING_TWIPS,
    "header_after_twips": 290,
    "doc_number_after_twips": 290,
    "title_after_twips": DEFAULT_BODY_LINE_SPACING_TWIPS,
    "recipient_after_twips": 0,
    "signing_before_twips": 1740,
    "body_first_line_chars": 200,
    "margin_top_twips": MARGIN_TOP_TWIPS,
    "margin_bottom_twips": MARGIN_BOTTOM_TWIPS,
    "margin_left_twips": MARGIN_LEFT_TWIPS,
    "margin_right_twips": MARGIN_RIGHT_TWIPS,
}


def chars_to_twips(chars_hundredths: int) -> int:
    return round((chars_hundredths / 100) * PRINTABLE_WIDTH_TWIPS / CHARS_PER_LINE)


def twips_to_emu(value: int) -> int:
    return value * 635
