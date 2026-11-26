# 预览与选区改稿

## 为什么按「块」改

文章不是纯文本流。预览页把 `draft.md` 切成块（段落、标题、列表、引用、表格），每块带：

- `data-bid`：块 id，如 `b-004`
- `data-hash`：块原文的 sha256
- 块原文：嵌在页面里的 `window.__WRITING_DOC__.blocks`

用户在预览里选中一段，前端把**选区 + 所在块原文 + 哈希**打包成一份修改请求。模型据此只改这几块，`patch` 再按「id + 哈希 + 原文」三重校验写回 `draft.md`，避免改错位置。

块 id 在一次渲染内稳定；一旦增删块，后续 id 会顺移。所以**每次 patch 后必须重新 render**，不要拿旧预览继续改。

## 渲染

```bash
python scripts/writing.py render <项目>
```

生成 `<项目>/preview.html`：单文件，样式与选区脚本都内联，可以直接双击打开，也可以由插件 iframe 引用。

预览页能做三件事：

1. 阅读成稿（衬线正文、来源角标、深色模式、打印样式）。
2. 选中正文任意一段，浮出工具条：改写 / 精简 / 扩写 / 按我的语气 / 查依据 / 问一句。
3. 生成修改请求：复制到剪贴板；嵌在宿主页面里时同时 `postMessage` 给父页面。

「查依据」和「问一句」不改稿，只要求回答；不要为它们生成 `edits.json`。

## 修改请求 JSON

```json
{
  "type": "writing:edit-request",
  "version": 1,
  "project": {
    "path": "/path/to/article",
    "slug": "article",
    "title": "标题",
    "draftHash": "…",
    "voice": "default"
  },
  "action": "rewrite",
  "actionLabel": "改写",
  "instruction": "改写选中的内容：保持原意、事实、判断强度和篇幅量级不变，只改表达。",
  "selection": {
    "text": "选区里的可见文字",
    "blocks": [
      {
        "id": "b-004",
        "hash": "…",
        "type": "para",
        "section": "一、发生了什么",
        "raw": "整块的 Markdown 原文",
        "start": 12,
        "end": 48,
        "selected": "块内被选中的文字"
      }
    ]
  },
  "page": { "url": "file:///…/preview.html", "at": "2026-11-17T11:20:00+08:00" }
}
```

字段说明：

| 字段 | 用途 |
|---|---|
| `project.path` | 项目目录；`patch` 用它找 `draft.md` |
| `project.draftHash` | 预览时的全稿哈希；和当前不一致说明预览过期（`patch` 会提醒） |
| `action` | `rewrite / condense / expand / retone / verify / ask` |
| `instruction` | 前端给的操作说明，含用户的补充要求；以它为准 |
| `selection.text` | 选区可见文字，用来核对语义 |
| `selection.blocks[].id` | 要改的块；只改这里列出的块 |
| `raw` | 块原文，用来构造 `before`；也是「未选中部分保持原样」的参照 |
| `selected` | 块内被选中的部分；重写时保持未选中部分不变 |
| `hash` | 块原文哈希；`patch` 的 `expect` 用它 |

用户可能只贴来一段带 ```json 的消息；从消息里解析出这个对象即可。也可能只给文字（「把第二段改短」）：先 render 让用户从预览选；确实能唯一定位时，直接按块改，并说明改的是哪一块。

## 收到请求后怎么做

### 1. 校验

- `project.path` 存在，`draft.md` 存在。
- `selection.blocks` 非空；每块能和当前 `draft.md` 的块对上（id 或 hash/before）。
- 对不上：不要猜。重新 render，告诉用户「预览过期了，重新选一次」。

### 2. 确定改动范围

- **只改 `selection.blocks` 里的块**，别碰其它块。
- 块内：只改 `selected` 覆盖的部分；`raw` 里选区前后的文字逐字保留。
- 选区跨块时，每块单独给一个 edit；不要合并块（合并会改变块结构，属于结构级改动）。
- 选区是整块时，可以重写整块。

### 3. 写 `replaceRaw`

`replaceRaw` 是**整块**改好后的 Markdown，不是只有选区：

| 块类型 | 写法 |
|---|---|
| 标题 | 保留 `#` 和层级，只改标题文字 |
| 段落 | 整段正文；不换行（Markdown 软换行会并入一段） |
| 列表 | 保留每个 `-` / `1.` 标记与缩进；除非用户要求增删项，否则项数不变 |
| 引用 | 保留 `> ` 前缀 |
| 表格 | 保留表头、分隔行、列数 |
| 代码 | 不改代码块，除非用户明确要求 |

硬要求：

- 不新增未证实的数字、日期、人名、引文、链接。
- 保留原有的行内归属句（「根据《X》报道」「据 Y 统计」）；删掉整句时把归属一起删掉，不要留下没有出处的数字，也不要在文末参考资料里留下没人用的条目。
- 保留 `〔待核：…〕` 占位符，除非这次修改正是在补它（补了就在回复里说明依据）。
- 未选中的句子逐字不变。需要顺手改邻近的错字或标点时，写进回复的「建议」，不要直接改。

### 4. 写 `edits.json`

```json
{
  "action": "rewrite",
  "instruction": "把选中的第二段改短，保留出处句",
  "project": { "draftHash": "…" },
  "selection": { "text": "…", "blocks": [{ "id": "b-004" }] },
  "edits": [
    {
      "blockId": "b-004",
      "expect": "块原文的 sha256，来自 selection.blocks[].hash",
      "before": "块原文，来自 selection.blocks[].raw",
      "replaceRaw": "改好后的整块 Markdown"
    }
  ]
}
```

`patch` 只用 `blockId / expect / before / replaceRaw`，其余字段原样存进修改记录，方便回看。

### 5. 先 dry-run，再应用

```bash
python scripts/writing.py patch <项目> --edits edits.json --dry-run
python scripts/writing.py patch <项目> --edits edits.json
python scripts/writing.py render <项目>
```

dry-run 会打印每块的 diff 和相似度。相似度低于 35% 或高于 300% 会提醒：确认不是误删/误扩。整块删除（`replaceRaw` 为空）也会提醒；删除标题、表格这类结构块更要谨慎。

应用后：

- `draft.md` 写回，块之间用空行分隔（CRLF 会规整成 LF）。
- `revisions.jsonl` 追加一条：操作、说明、选区、每块 before/after、整稿哈希、改动前全文快照。
- `meta.json` 的 `revisions` 计数 +1。

### 6. 回复用户

一句话说明：改了哪块、改了什么、有没有留下待核/建议。不要贴全文，不要贴 diff 全文；需要时给 `preview.html` 路径让用户自己看。

## 定位规则与失败处理

`patch` 按以下顺序定位：

1. `blockId` 命中，且当前块哈希等于 `expect`（或原文等于 `before`）→ 改。
2. 块 id 对不上，但全稿恰有一块哈希/原文等于 `expect` / `before` → 改那一块（块被移动过的情况）。
3. 匹配到多块 → 拒绝，要求重新渲染。
4. 一块都匹配不上 → 拒绝，报「内容已经变了」，并给出最接近的块。

不要绕过 `patch` 手动改 `draft.md` 来「修好」定位失败：那会让预览、块哈希、修改记录三者脱节。正确做法是重新 `render`，让用户重新选。

## 撤回

```bash
python scripts/writing.py revert <项目>
python scripts/writing.py revert <项目> --rev r-20261117112000
```

只能撤回**最近一次**修改：

- 校验当前 `draft.md` 的哈希等于那次修改后的哈希；不一致说明之后又改过，拒绝。
- 恢复那次修改前的全文快照（`draftBefore`），并追加一条 `revert` 记录。
- 撤回本身也可以再被撤回（再执行一次 `revert` 会回到撤回前）。

## 整篇修订

以下情况不走块补丁，直接改 `draft.md`：

- 整篇按语气档案重写表达。
- 整篇去 AI 味。
- 结构调整：合并/拆分/移动小节、增删段落、换开头结尾。

流程：

1. 先把当前稿另存一份：`research/draft-<YYYYMMDD-HHMM>.md`（Windows 用 `Copy-Item`），并在回复里说明备份路径。
2. 改 `draft.md`。
3. `check` + `render`。
4. 交付时给「改动摘要」：动了哪几节、删了什么、加了什么、哪些判断变强/变弱。不要只给「已优化」。

整篇重写时守住：

- 不改变事实与判断强度；原文没有的数字不补，原文的「可能」不写成「确定」。
- 语气档案优先于去 AI 味清单。
- 如果整篇重写后与原文差异很大，主动提示用户可以用备份对比。

## 常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| `patch` 报「内容已经变了」 | 预览后手动改过 draft，或上一次 patch 后没 render | 重新 render，让用户重新选 |
| 块 id 和预期不一致 | 增删过块，id 顺移 | 以 `selection.blocks[].hash` / `raw` 为准；重新 render 后重来 |
| `draft.md` 出现 CRLF | 手动编辑或外部工具写入 | `patch` 会规整成 LF；`draftBefore` 保留原样，撤回时会还原 |
| 预览页按钮不出来 | 选区落在页眉/页脚，或选择被折叠 | 只在正文 `.prose` 内选；选完不要点输入框再点按钮 |
| 复制失败 | 浏览器限制 `file://` 剪贴板 | 预览页会弹出文本框，手动复制；或用插件宿主页面 |
| 行内归属与文末对不上 | 改稿时删了句子没调整参考资料 | `check` 会提示；补出处或删掉对应条目 |

## 插件接入

预览页在 iframe 里时会把请求 `postMessage` 给父页面：

```js
window.parent.postMessage({ type: 'writing:edit-request', payload }, '*')
```

父页面（插件客户端）应当：

1. 校验 `event.source` 是这个 iframe、`event.origin` 是同源。
2. 把 `payload` 序列化成一段用户请求，填进新对话的输入框（不自动发送）。
3. 模型收到后按本节流程处理。

完整的工具、路由、事件与验收清单见 `INTEGRATION.md`。
