---
name: official-document-drafting
description: "中文公文与正式材料写作技能：按 GB/T 9704-2012 起草、改写、润色、规范并导出 Word。当前保留 8 个文种入口——法定公文 4 种（通告、函、纪要、通报）和常见正式材料 4 类（情况专报、讲话稿、工作总结、危机处置报告）。当用户要求写通告、函、纪要、通报、情况专报、讲话稿、工作总结、危机处置报告，或把素材整理成正式文稿、规范既有文稿格式、导出机关版式 Word 时使用。"
version: 2.2.0
agent_created: true
---

# 公文起草

把用户提供的素材、主题或既有文稿，整理成结构正确、事实可核、格式规范的中文公文与正式材料，并按需导出 Word。

**核心纪律：真实性优先于文采。** 每一个具体值要么有来源，要么是占位符或“待核实”，没有第三种。
**语体纪律：** 除讲话稿外一律零口语；讲话稿也只允许极少量口语色彩（全篇不超过三处）。小标题写成动宾并列双句（“坚持……，把……放在首位”），不用冒号引出解释、不设问、不喊口号。

## 何时用 / 何时不用

**用**：起草、改写、润色、扩写、压缩、规范公文；写通告、函、纪要、通报、情况专报、讲话稿、工作总结、危机处置报告；把新闻/会议记录/汇报素材转成正式文稿；给既有文稿套公文结构；导出公文 Word。

**不用**：分析型 / 深度研究型文章（走研究型写作）、公众号排版、PPT、宣传软文、营销文案、小说散文。这些不是公文。

## 使用顺序

1. **读共享规则**：[references/rules.md](references/rules.md)。所有文种共用，包含事实边界、行文规则、结构语言、版式、自检清单。
2. **定文种**：按下方目录和 `rules.md` 第 2 节判定；拿不准先问用户一句。
3. **读该文种参考**：`references/doc-types/<id>.md`，含“起草前确认—撰写思路—写作规则—常见误写—模板”。
4. **起草**：默认直接输出 Markdown 成稿；信息不足留占位符。
5. **校验**：`python scripts/check_draft.py <文种> <成稿.md>`，再按 `rules.md` 6.3 人工校对。
6. **导出**（用户要 Word 时）：`python scripts/generate_docx.py <成稿.md> --doc-type <文种>`。

上下文有限时只读 1、3 两份；不要一次读多个文种参考。

## 文种目录

> 当前只保留下面 8 个模板。决议已按用户要求从模板列表移除；通知、报告、请示、批复、公告、决定、意见、方案、简报、汇报材料等也不在本模块。用户点名这些文种时，先说明“当前模板列表没有该文种”，不要假装存在对应模板，也不要套用其他文种的模板硬写。

### 法定公文

| id | 文种 | 适用 | 方案 |
| --- | --- | --- | --- |
| `public-notice` | 通告 | 一定范围内公布应当遵守或周知的事项 | official-standard |
| `letter` | 函 | 平行或不相隶属机关商洽、询问、答复（含复函） | official-standard |
| `circular` | 通报 | 表彰先进、批评错误或传达重要情况 | official-standard |
| `minutes` | 纪要 | 记载会议主要情况和议定事项 | official-standard |

### 常见正式材料

| id | 文种 | 适用 | 方案 |
| --- | --- | --- | --- |
| `special-report` | 情况专报 | 向领导或上级报送专题信息、风险、舆情 | internal-readable |
| `speech` | 讲话稿 | 领导讲话、会议发言、动员部署 | speech-readable |
| `summary` | 工作总结 | 阶段复盘、年度总结、专项总结 | internal-readable |
| `crisis-report` | 危机处置报告 | 安全事件/突发事件/整改通知后向相对方报告总体情况、经过和整改 | official-standard |

## 硬约束（不可越过）

- 不编造事实、数据、文件号、会议结论、政策依据、人名职务、机构名称、时间地点。
- 信息不足时保留 `[主送单位]`、`[发文单位]`、`[日期]`、`[待核实]` 等占位符，不删结构、不猜测。
- 不把推测、常识补全、网络传闻写成确定事实。
- 文种按目录使用：不把通告写成通报，不把函写成通报，不把情况专报写成新闻稿。
- 涉及具体单位的人名、部门、数据，材料没有就问用户或留占位，不从其他技能、记忆或历史对话推测。
- 正式发文、对外报送、政策法律敏感、涉密、涉隐私文本，必须经有权限人员审核后使用；本技能产出的是初稿。

## 输出约定

- 默认输出完整 Markdown 成稿；用户只要提纲时输出提纲。
- 成稿不写模型自我说明，不写“以下是……”。
- 未指定文件名：`YYYYMMDD-标题-vNN.md`；同日同标题递增版本号，不覆盖旧稿。
- 未指定目录：保存到当前工作目录下的 `公文/`；用户指定路径时以用户为准。
- 联网核实过的来源写入同目录 `materials.md` 或 `-来源.md`，正文不堆 URL。

## 导出 Word

```bash
# 按文种自动套字体与版式
python scripts/generate_docx.py 成稿.md --doc-type 纪要

# 指定输出与字体替代
python scripts/generate_docx.py 成稿.md -o 成稿.docx --doc-type 通报 --font-preset noto-cjk

# 电子版（不加盖印章）：日期右空 2 字
python scripts/generate_docx.py 成稿.md --doc-type 函 --unsealed

# 只看解析结果，不导出
python scripts/generate_docx.py --doc-type 危机处置报告 --show-font-plan
```

- 只依赖 Python 3.11+ 标准库，不需要 `python-docx`、不需要联网。
- 支持标题、主送、正文、层级标题、附件说明、落款、附注、版记、奇偶页页码、图片。
- 导出器只写字体名、不嵌入字体；目标机器需安装仿宋_GB2312、黑体、楷体_GB2312、方正小标宋，或用 `--font-preset` 选择开源替代。
- 导出的 `.docx` 是排版初稿，红头、印章、发文机关标志、完整版记仍需本单位模板套版。

## 页眉页脚图片（可复用）

用户上传的页眉/页脚图片会自动保存到 DSH 数据目录的 `doc-images/`（插件运行时由 `OFFICIAL_DOC_IMAGE_DIR` 指向该目录），下次直接按名称复用。

```bash
# 导入并命名（也可以跳过这步，导出时直接给路径，会自动入库）
python scripts/image_library.py add ./单位页眉.png --name 单位页眉
python scripts/image_library.py add ./单位页脚.png --name 单位页脚

# 查看已保存图片
python scripts/image_library.py list

# 导出时引用
python scripts/generate_docx.py 成稿.md --doc-type 危机处置报告 \
  --header-image 单位页眉 --footer-image 单位页脚
```

- 支持 png/jpg/jpeg；页眉默认宽 35mm、页脚默认宽 30mm，可用 `--header-image-width-mm`、`--footer-image-width-mm` 调整。
- 可用 `--header-image-align left|center|right`、`--footer-image-align left|center|right` 调整对齐。
- 公文表单与稿件预览均可从「更多 → 页码」指定样式和位置。脚本可用 `--page-number-style number|page|chinese|dash`、`--page-number-position left|center|right|outside`、`--hide-first-page-number` 和 `--hide-page-number`。首页隐藏页码时仍保留首页的页眉、页脚图片。
- 图片库默认在技能目录下，可用环境变量 `OFFICIAL_DOC_IMAGE_DIR` 改为共享目录。

## 成稿校验

```bash
python scripts/check_draft.py 纪要 成稿.md          # 章节、顺序、层级、格式、结尾
python scripts/check_draft.py 函 成稿.md --strict   # 警告也按错误处理
python scripts/check_draft.py 情况专报 成稿.md --facts # 列出非占位具体值，核对来源
```

校验覆盖：必备章节、结构顺序、层级跳级、文号/日期/主题词红线、结尾套语、未填占位符、附件位置、危机处置报告三部分完整性。机器校验只做提示，最终以人工校对为准。

## 文件结构

```
official-document-drafting/
├── SKILL.md                    # 本文件：入口、路由、约定
├── references/
│   ├── rules.md                # 共享规则（事实、行文、结构、版式、自检、兜底）
│   ├── examples.md             # 3 个通用示例（纪要/讲话稿/情况专报）
│   └── doc-types/<id>.md       # 8 个文种：起草前确认、思路、规则、误写、模板（resolution.md 留档未登记）
├── assets/
│   ├── registry.toml           # 文种注册表（id/别名/方案/必备章节）
│   ├── font-profiles.toml      # 3 套字体方案
│   ├── layout-profiles.toml    # 3 套版式方案（含页边距）
│   └── fonts/README.md         # 字体说明（不含字体二进制）
├── scripts/
│   ├── generate_docx.py        # Markdown → Word
│   ├── check_draft.py          # 成稿校验
│   ├── image_library.py        # 页眉/页脚图片入库、查看、删除
│   ├── selftest.py             # 9 文种导出 + XML + 校验冒烟测试
│   └── docgen/                 # 渲染引擎（标准库）
└── LICENSE
```

## 维护约定

- 规则只改 `references/rules.md` 和 `references/doc-types/<id>.md`；文种数据只改 `assets/registry.toml`。
- 改文种模板时，同步检查该文种的“必备章节”和 `assets/registry.toml` 的 `required_sections`。
- 字体文件不随包分发；需要本地安装时见 `assets/fonts/README.md`。

## 参考

- 格式依据：GB/T 9704-2012《党政机关公文格式》；GB/T 15834《标点符号用法》；GB/T 15835《出版物上数字用法》。
- 行文依据：《党政机关公文处理工作条例》（中办发〔2012〕14号）。
- 上游引擎：https://github.com/zhaohui-yang/official-document-drafting （MIT）。
