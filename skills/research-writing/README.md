# dsh-writing

DSH 写作插件的写作模块。一个 skill + 一套本地脚本 + 一个可选中改稿的预览页。

它把四件事做成一条链路：

1. **上传语料 → 语气档案**：从用户自己写过的文章里提炼写作习惯，存成本机档案。
2. **上传资料 → 成文**：材料读进来源台账，再写；每个具体事实能回到来源。
3. **一句描述 → 自己检索 → 成文**：收窄题目、检索、落账、停车、写。
4. **预览 → 选中 → 改稿**：成稿渲染成网页；选中一段，生成结构化修改请求；模型只改选中的块。

模块不包含插件 UI。接入方式见 [INTEGRATION.md](INTEGRATION.md)。

## 语气档案为什么这样设计

档案是一份 Markdown（`voice/<名字>/profile.md`），工具只做四件事：`show` / `note` / `save` / `collect`。这套结构借鉴了同类开源插件与公开 skill 的做法，并在本模块里落成：

- **一个文件就是档案**：整份 Markdown 读写；`note` 往「对话中学到的」小节追加一行，没有档案时先建骨架，不把「没有档案」当错误。
- **语料只取用户亲手发的文本**：上传的文件、粘贴的段落，或宿主收集的会话消息；长消息优先、去重、总量封顶，写成带日期和标题的 `corpus.md`。
- **提炼有纪律**：每条特征至少两处证据并摘原文，证据不足标「待验证」；分节固定为节奏与结构、人称与称呼、常用词/不用的词、判断与语气、标点与混排、对话中学到的、原文参照。
- **写作时档案优先于去 AI 味清单**：频率匹配、只借表达不搬内容；用户纠正措辞先照改，再记一条。

### 本模块改了什么，为什么

| 参考做法 | 本模块 | 原因 |
|---|---|---|
| 单份 `voice.md` | 按档案名分目录：`voice/<profile>/{profile.md,corpus.md,index.json,samples/}` | 同一个人可能有多种场景（公众号、论文、内部材料）；也方便重算统计、追溯每条例句来自哪篇 |
| 语料只在 `voice-corpus.md` 里 | 单篇存 `samples/`，元数据和统计进 `index.json`，再生成 `corpus.md` 给模型读 | 可以增量收录、去重、按篇回查；统计不必每次重算全文 |
| 语料主要来自会话 | 文件（md/txt/docx/html/rtf）+ 粘贴 + 宿主可选的会话收集 | 用户要「上传自己的语料」；docx 是最常见的稿件格式 |
| 靠 skill 自觉检查结构 | 加 `voice check`：小节、例句、原文参照、置信度与样本数是否对得上 | 档案是长期资产，结构坏了模型不会发现；机械检查能兜底 |
| 置信度靠模型判断 | 按语料篇数计算（<3 较低，3—9 中等，≥10 较高），档案里写实际篇数 | 减少「自称较高」的偏差 |
| 没有预览与选区 | 块级预览 + `writing:edit-request` + `patch` 三重校验 + 快照撤回 | 这是本模块新增的核心能力，见下 |
| 作者人格 / 外部语料参照 | 不引入；只学用户自己的样本 | 目标是「像本人」，不是扮演某位作家 |

## 综合了 humanizer-zh 的什么

以 [ai-zixun/humanizer-zh](https://github.com/ai-zixun/humanizer-zh) v1.3.0（MIT）为主，另参考 [op7418/Humanizer-zh](https://github.com/op7418/Humanizer-zh)：

- **保留**：Core Rules 的八条、13 类模式（机械对照、翻译腔、空泛大词、口号收束、列表成瘾、标点、官样腔、判断强度、主线脱节、预告式收束、抽象抬升、排版装饰、中文混排）、引号与术语约定、Final Check。
- **改写**：每条模式补上「什么时候保留」；把「模式是线索不是黑名单」变成可执行的判断顺序（事实 > 用户/文体 > 档案 > 清单 > 默认）。
- **放弃**：8 位作者的 Voice Adoption 人格档案、按文体选参照的语料索引。前者与本模块「用户自己的档案」冲突；后者会把外部作者的腔调带进来，且会显著增加上下文。
- **落点**：规则压进 `references/quality-gate.md`，不单独作为一个 skill 触发；写作、改稿、选区修改共用同一份清单。

原文留档在 `vendor/humanizer-zh/`。

## 综合了《研究型写作》的什么

一份外部提供的《研究型写作》材料（origin: `content-research-writer`）提供的是「写作伙伴」流程：

- **保留**：先大纲后成文、调研并加引用、钩子打磨、逐节反馈、引用管理（行内/编号/脚注）、按文体切换工作流、终审清单。
- **改写**：把访谈压到最多 3 个问题；把「research.md」升级成带字段的来源台账（主张、日期、逐字摘录、可信度、用在哪节）；补上中文检索的失败处理（打不开、付费墙、无日期、只有二手）与停车条件；目录创建换成 `writing.py init`。
- **放弃**：`mkdir/touch` 的本地编辑器工作流、按「文章类型」列的长清单（合并进 `drafting.md` 的文体表）。
- **落点**：`references/drafting.md`。

该材料的原文未随包分发（来源许可未明确）；本模块只保留重写后的规则。

## 快速开始

```bash
# 1. 收录语料（可多篇；支持 md / txt / docx / html / rtf）
python scripts/writing.py corpus add 我的旧稿1.md 我的旧稿2.docx --origin article

# 2. 看统计，再读 corpus.md 提炼
python scripts/writing.py voice stats
python scripts/writing.py voice check

# 3. 建项目
python scripts/writing.py init projects/ai-and-writing --title "AI 先改变了写作的哪个环节" --mode prompt

# 4. 写 draft.md 后渲染
python scripts/writing.py render projects/ai-and-writing

# 5. 从预览选中一段，复制修改请求，交给模型；模型产出 edits.json
python scripts/writing.py patch projects/ai-and-writing --edits edits.json --dry-run
python scripts/writing.py patch projects/ai-and-writing --edits edits.json
python scripts/writing.py render projects/ai-and-writing
```

完整流程见 [SKILL.md](SKILL.md)。

## 目录

```
dsh-writing/
  SKILL.md                   skill 入口：路由、铁律、四条线、命令、交付
  README.md                  本文件：实现分析、取舍、来源
  INTEGRATION.md             插件接入：工具、路由、事件、验收
  references/
    voice.md                 语料 → 档案：收录、统计、八类特征、模板、冲突
    drafting.md              资料/描述 → 成文：台账、检索、大纲、逐节写
    revise.md                预览 → 选区：请求协议、edits.json、patch、撤回
    quality-gate.md          交付前：事实、13 类 AI 味、文章级检查
  scripts/
    writing.py               CLI（仅标准库）
    selftest.py              端到端自检
  assets/
    preview.css             预览页样式（纸感、深色、打印）
    preview.js              选区工具条与修改请求
  vendor/                    humanizer-zh 上游留档
```

## 设计取舍

### 为什么补丁按块，不按字符偏移

预览里选中的是**渲染后**的文字，`draft.md` 里却是 Markdown。按字符偏移映射回源文件，遇到粗体、链接、引用角标就会错位。按块（段落/标题/列表）定位，模型的输入是「整块原文 + 选区内文字」，输出是「整块新原文」，`patch` 用「id + 哈希 + 原文」三重校验写回。简单、可解释、失败时能明确报错。

代价：跨块合并、块内局部替换都要以整块重写表达；一次请求只覆盖一个连续选区。这两点在 `references/revise.md` 里写明了，不假装支持。

### 为什么语气档案优先于去 AI 味

档案来自用户自己；清单来自通用观察。用户本人爱用的「其实」「说白了」，清单可能判为口头禅，但那是他的声音。反过来，事实和文体要求又高于档案：正式材料不能为了「像本人」把「应当」改成「我觉得」。这个顺序写在 `SKILL.md` 的铁律和 `quality-gate.md` 的开头。

### 为什么用 Python 标准库

模块要能单独拷进任何插件、在任何机器上跑。`writing.py` 不依赖 `python-docx`、`markdown`、`jieba`：docx 用 `zipfile` + XML 解析，渲染用自写的块解析器，统计用正则。代价是 Markdown 支持是子集（标题、段落、列表、引用、表格、代码、粗斜体、链接、引用编号），不追求完整 CommonMark。

### 为什么不做插件 UI

插件 UI、宿主工具、会话投递属于插件层，变化快；模块先把文件契约、命令、事件协议定下来。`INTEGRATION.md` 给的是接口和验收清单，不是实现。

## 自检

```bash
python scripts/selftest.py
```

覆盖：md/docx 语料提取与去重、统计、档案校验（合格/不合格）、渲染（块、角标、来源锚点、选区脚本）、选区补丁（只改目标块、留快照）、旧补丁拒绝、撤回、成稿检查（引用缺失）、状态输出。

## 许可与来源

- 本模块代码与文档：随所属插件分发。
- `vendor/humanizer-zh/`：MIT，版权与许可声明保留在该目录。
- 语气档案的机制参考了公开的 voice skill 做法；预览页的 iframe / `startSession` 投递方式参考了开源插件的客户端实现。
