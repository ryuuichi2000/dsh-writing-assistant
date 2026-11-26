---
name: research-writing
description: 研究型写作：从用户上传的语料学习写作习惯并建立语气档案，把上传的资料或一句描述写成有出处的中文文章，成稿进插件稿库后在侧栏预览，并能按选区改稿。用于「写一篇…」「按我的风格写」「上传资料写成文章」「自己找资料写」「选中这段改一下」「先建语气档案」等请求；法定公文文种交给 official-document-drafting，脱离文章上下文的单段润色交给 humanizer-zh。
---

# 写作模块

这个模块负责四件事，共用一套文件：

1. **语料 → 语气档案**：用户上传自己写过的文章，提炼可观察的写作习惯，存成本机档案。
2. **资料 → 成文**：用户给文件、链接、材料，写成一篇文章，每个具体事实都能回到来源。
3. **描述 → 检索 → 成文**：用户只给一句描述或题目，先搜集资料、落账，再写。
4. **预览 → 选区 → 改稿**：成稿渲染成网页，用户选中一段点按钮，模型按选区改，只改选中的块。

硬约束只有一条：**不编造事实、数字、引文、链接、来源**。缺证据就写 `〔待核：…〕` 并告诉用户，不用猜测填空。

## 先判断走哪条线

| 用户给了什么 | 走哪条线 | 先读 |
|---|---|---|
| 自己的文章、文件、粘贴的旧稿；「学我的语气」「建档案」 | 语料 → 语气档案 | `references/voice.md` |
| 资料、链接、附件；「把这些写成文章」「整理成一篇」 | 资料 → 成文 | `references/analysis-playbook.md` + `references/drafting.md` |
| 一句描述、一个题目；「你自己找资料写」 | 描述 → 检索 → 成文 | `references/analysis-playbook.md` + `references/drafting.md` |
| 「写一篇分析文章」「写篇稿子」 | 文章写作：先拆任务和判断，再写 | `references/analysis-playbook.md` |
| 「写篇随笔」「写点感受」 | 随笔：第一人称、写一件具体的事 | `references/quality-gate.md` |
| 「做份深度研究」「写长文，要多方核对」 | 深度研究型文章：一手材料、关键变化、同口径比较与证据审查 | `references/deep-research.md` + `references/deep-research-methods.md` |
| 已经有 `preview.html`；「选中这段改一下」或贴来一段修改请求 JSON | 预览 → 选区 → 改稿 | `references/revise.md` |
| 已有草稿要整篇改语气、改结构 | 整篇修订（revise 的整篇模式） | `references/revise.md` |
| 法定公文、通知、请示、纪要等文种 | 交接给 `official-document-drafting`，本模块不写 | — |
| 只有一段文字要去 AI 味，没有文章上下文 | 交接给 `humanizer-zh` | — |

判断不了时问一句「这次是要我学你的写法，还是直接开写」。不要一上来做完整访谈。

## 铁律

1. **不编造**。数字、日期、人名、机构、引文、URL 必须能指回 `sources.md`；没有就标 `〔待核：…〕`。不要用「据媒体报道」「专家认为」这类无署名归因糊过去。
2. **引用方式按文体**。分析型 / 随笔：正文不挂编号，出处写在句子里（「根据《XX》报道」「据 XX 统计」「XX 数据显示」）；深度研究型：行内归属，或文中编号 `[1]` + 文末「## 参考资料」一一对应，两种选一种。文末都要列全来源。
3. **语气档案优先于去 AI 味清单**。档案来自用户自己的样本；用户本人就爱用的表达，即使像模板，也保留。事实与文体要求又优先于两者。
4. **选区修改只改选区**。选区外一个字不动；需要相邻改动时列成建议，不擅自扩写范围。
5. **没有预览不算写完**。交付是 `draft.md` + `preview.html` 两份，预览页要能被用户打开、选中、发修改请求。
6. **引文逐字**。转述不加引号；改写过的句子不能标成原文。
7. **数据流向**。插件把样本、档案和稿件保存于本机。提炼时把所选样本文本交给 DSH 当前配置的模型；写作时把本次选用的档案正文交给该模型。检索只使用公开资料，避免把私有文本或者档案例句送入检索服务。

## 命令（在 skill 根目录运行）

```bash
python scripts/writing.py init <项目目录> --title "标题" --mode materials|prompt|draft
python scripts/writing.py corpus add <文件…> [--profile 名字]      # md/txt/docx/html/rtf；`-` 读标准输入
python scripts/writing.py corpus list
python scripts/writing.py extract <文件> [--out research/名.md]   # docx/html/rtf 抽成纯文本
python scripts/writing.py voice show [--profile 名字]              # 读当前档案
python scripts/writing.py voice path                               # 档案、语料、active 的路径
python scripts/writing.py voice stats [--json]                     # 句长、标点、人称、高频词
python scripts/writing.py voice check [档案路径]
python scripts/writing.py voice note "用户原话：… → 改法：…"
python scripts/writing.py voice use <名字>
python scripts/writing.py render <项目>
python scripts/writing.py patch <项目> --edits edits.json [--dry-run]
python scripts/writing.py revert <项目>                            # 只撤回最近一次
python scripts/writing.py check <项目>
python scripts/writing.py status <项目>
```

数据目录默认 `~/.dsh-writing`，可以用 `--home` 或环境变量 `DSH_WRITING_HOME` 改。插件里如果注册了 `writing_voice` 等宿主工具，优先用宿主工具，文件路径与 `INTEGRATION.md` 的映射保持一致。

## 一、语料 → 语气档案

插件的后台任务已经附上采样文本，直接分析并调用 `writing_voice save` 保存到目标档案。下列命令只适用于独立脚本。

1. 用 `corpus add` 收录样本（或读插件整理好的 `corpus.md`）。先看 `corpus list`：少于 3 篇就直接标「置信度较低」，不要等。
2. 跑 `voice stats`。统计只作提示：平均句长、长短句比例、破折号/省略号/问号、第一人称、中英空格、高频二字词。**结论必须回原文核对**，不能拿统计当特征。
3. 读 `corpus.md`，按 `references/voice.md` 的八类特征逐条提炼：每条至少一处逐字例句，重要特征尽量两处。找不到证据的条目不写。
4. 写 `<home>/voice/<名字>/profile.md`（结构见 `references/voice.md` 的模板；插件里用 `writing_voice` 的 `save`），然后 `voice check`。有错误就修，有提醒就判断是否接受。
5. 把档案给用户过目，用一两句话说明「我按哪几条写」。用户指出哪条不对，改完再 `check`。

用户当场纠正措辞时（「别用这个词」「我一般这么说」），先照改，再用 `voice note` 记一条。同一条规律第二次出现，把它从「对话中学到的」挪进对应小节。

## 二、资料 → 成文

1. `init` 建项目，填 `brief.md`：题眼、读者、文体、篇幅。缺什么最多问 3 个问题，其余按假设写，并在交付时说明假设。
2. **按文体读写法**。文章写作读 `references/analysis-playbook.md`，按其中的任务拆解、分流和提纲检查执行。写正文前读 `references/wechat-analysis/drafting.md`，交稿前读 `references/wechat-analysis/editing.md`。`style-analysis.md` 是作者样本观察。随笔按第一人称写一件具体的事。深度研究读 `references/deep-research.md`，按其指引使用 `references/deep-research-methods.md` 选角度、查证、写作和复核。
3. 把每份材料读进 `sources.md` 台账：主张、来源、日期、逐字摘录、链接、可信度、用在哪节。原文摘录必须逐字；转述标「转述」。台账要分开「来源 / 口径 / 本文推算 / 待核」四类，后两类不是外部证据。
4. 写 `outline.md`：主线一句话、每节一个判断或可检验的问题、对应哪条证据、预测稿的基线与成立条件。分析型任务先调 `writing_save_outline`，Host 通过后再写正文。
5. 逐节写 `draft.md`。先事实后判断，给具体数字和引文标出处，文末 `## 参考资料` 列全部来源。分析型使用行内归属。深度研究按本次设置采用行内归属或编号。
6. `check` 修掉错误，`render` 出预览，按「交付」一节给用户。保存后读 `review`：error 要改，仍有缺口写「草稿已保存，需核对」。

材料里的事实和材料本身的立场要分开：可以引述材料，不要把材料的判断写成自己的结论。

## 三、描述 → 检索 → 成文

深度研究按 `references/deep-research-methods.md` 制订检索计划，以 `references/deep-research.md` 的证据要求控制结论强度。检索关闭时只用用户材料。下列是其他文章的通用检索步骤：

1. **收窄**：把题目变成一句可回答的问题，再写一个可被证伪的判断假设。题目太大就自己收，说明收了什么。
2. **设计查询**：4 类各至少一条——官方/一手、数据、反例、背景。时间窗写进 `brief.md`。
3. **执行与落账**：`web_search` 找线索，**打开原文**再摘录；不引用搜索摘要。每条落进 `sources.md`，记发布者、日期、可信度。
4. **停车条件**：关键主张有一手来源或两个独立来源；反例看过；连续两条查询没有新信息。够了就停，不要堆资料。
5. 写大纲、成文、`check`、`render`。

打不开、付费墙、没有日期、只有二手转述：在台账里写明，正文里降低确定程度或标 `〔待核〕`，不要假装核过。

## 四、预览 → 选区 → 改稿

预览页由 `render` 生成，是单文件 HTML；每块正文带 `data-bid`、`data-hash`，选中后浮出的按钮会生成一段修改请求（JSON），复制到对话里或由插件直接投递。

收到修改请求后：

1. 读 `references/revise.md`，确认 `project.path` 与 `selection.blocks`。
2. 只改 `selection.blocks` 里的块；按块重写 `replaceRaw`，未选中的文字保持原样。选区通常只是块内一段，其余部分逐字保留。
3. 写 `edits.json`（blockId + expect 哈希 + before + replaceRaw），先 `patch --dry-run` 看 diff，再应用。
4. `render`，用一句话说明改了哪块、改了什么；不要贴全文。
5. 改错了用 `revert` 撤回，然后重新来。

用户没有用预览按钮、只在对话里说「把第二段改短」：先 `render` 并让用户从预览里选；已经能唯一定位时可以直接按块改，但要说明改的是哪一块。

结构级改动（合并/移动/新增小节）不走块补丁：直接改 `draft.md`，说明动了哪些块，再 `render`。跨块合并会让块 id 变化，改完必须重新渲染。

## 任务目录

```
<项目>/
  brief.md          任务卡：题眼、读者、文体、篇幅、假设
  sources.md        来源台账：主张 → 来源 → 原文 → 链接
  outline.md        大纲：主线、每节功能、证据编号
  draft.md          正文（唯一真相源）
  revisions.jsonl   每次选区修改的快照与说明
  meta.json         标题、模式、语气档案、状态
  preview.html      render 生成的预览页
  research/         抓取的资料、摘录、笔记
```

## 交付

- `draft.md`：成稿，文末带 `## 参考资料`；引用方式按文体（分析型 / 随笔不挂编号，深度研究型可挂编号但要一一对应）。
- `preview.html`：预览页。用 `present` 或直接给路径，让用户能打开。
- 一两句话：用了哪份语气档案、哪些地方是假设、哪些还标着 `〔待核〕`。
- 不要粘贴全文，也不要把 `sources.md` 全文倒出来；需要细节时给路径。

## 自检

交付前至少跑一次 `check`，并逐项确认：

- 每个具体数字、日期、引文都能在 `sources.md` 找到；引文逐字。
- 引用方式符合文体：分析型 / 随笔正文没有编号、出处都在句子里；深度研究型用编号时与「## 参考资料」一一对应。
- 没有无署名归因（「专家认为」「据悉」）撑着关键判断。
- 开头提出的问题，结尾有回应；每节都在服务主线。
- 语气像用户本人：档案里的高频习惯用到了，但没有每段都堆。
- 没有为了工整硬凑三段式、编号列表或口号收尾。
- 文章写作的比喻只在真正解释机制时使用；深度研究按自身规范保持分析语言直白。
- 分析型预测稿每一节都有判断、基线、证据和条件；深度研究归纳截至研究日期已有证据支持的结论。
- 没有 `references/quality-gate.md` 第五节和 `style-analysis.md` 第五、六节列的 AI 味症状（「随着……的发展」「综上所述」「值得注意的是」「赋能/闭环」这类）。
- 占位符要么替换，要么在交付说明里列出来。
- `preview.html` 能打开，选中段落能出按钮。

细节在 `references/quality-gate.md`。

## 资源

| 文件 | 什么时候读 |
|---|---|
| `references/voice.md` | 建档案、改档案、判断某条特征该不该写 |
| `references/analysis-playbook.md` | 写文章写作前：任务拆解、预测/机制/争议分流、提纲检查点、证据口径、结构与文风 |
| `references/wechat-analysis/drafting.md` | 文章写作写正文前：材料开稿、对象与动作、每段的信息增量、收笔 |
| `references/wechat-analysis/editing.md` | 文章写作交稿前 / 只润色时：改判断再看句子、局部最小修法、保真回读 |
| `references/style-analysis.md` | 作者样本观察（不是硬配额；先读 analysis-playbook.md） |
| `references/deep-research.md` | 深度研究的规范与入口，涵盖信源、结构、引用、审查与交稿 |
| `references/deep-research-methods.md` | 深度研究选角度、检索与交叉核对，梳理时间线、做同期比较并归纳证据 |
| `references/drafting.md` | 资料成文、检索、大纲、逐节写、引用格式 |
| `references/revise.md` | 预览选区请求、edits.json、撤回、整篇修订 |
| `references/quality-gate.md` | 交付前：事实核对、去 AI 味、文章级检查 |
| `INTEGRATION.md` | 把模块接进 DSH 写作插件：工具、路由、事件、验收 |
| `README.md` | 模块结构、来源、许可、维护 |
