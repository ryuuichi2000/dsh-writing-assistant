# 写作模块接入契约

这份文档给写插件的人看：模块已经具备什么，插件要补什么，两边怎么对接。模块本身不包含插件代码。

## 模块边界

模块（`dsh-writing/`）提供：

- 一套写作流程（`SKILL.md` + `references/`）。
- 一个只依赖 Python 标准库的 CLI（`scripts/writing.py`）：语料、档案校验、渲染、选区补丁、撤回、自检。
- 一个单文件预览页（`assets/preview.css` / `assets/preview.js`），带选区工具条和修改请求协议。
- 一套数据契约：`<home>/voice/<profile>/` 与 `<project>/` 的文件布局。

插件负责：

- 存储与沙箱：把 `<home>` 指到插件数据目录；工作区外读写由宿主工具完成。
- UI：语料上传、档案页、成文入口、预览页、修改请求投递。
- 会话：把修改请求填进新对话；把对话里学到的修正写回档案。
- 可选：从 DSH 会话记录收集语料（脚本读不到 `$DSH_HOME/sessions`）。

## 数据目录

```
<home>/                                  # 默认 ~/.dsh-writing，插件可指到 <pluginData>/writing
  voice/
    active                               # 当前档案名
    <profile>/
      profile.md                         # 语气档案
      corpus.md                           # 给模型读的语料合集
      index.json                          # 样本元数据与统计
      samples/s-001-标题.md               # 单篇语料
  projects/
    <slug>/
      brief.md sources.md outline.md draft.md
      meta.json revisions.jsonl preview.html research/
```

- 环境变量 `DSH_WRITING_HOME` 或 `--home` 覆盖默认目录。
- 插件里建议把 `<home>` 设为 `<pluginDataDir>/writing`，并把「当前项目」放 `<home>/projects/<slug>`，这样预览路由只放行这一个目录。
- `draft.md` 是唯一真相源；`preview.html` 可以随时重新生成，不要反向编辑。

## 建议注册的宿主工具

CLI 的全部能力都可以由宿主工具包一层。推荐四个，按使用频率排序：

### 1. `writing_voice`

| 参数 | 说明 |
|---|---|
| `action` | `show / save / note / stats / list / use` |
| `profile` | 档案名，默认当前 active |
| `text` | `save` 时是整份档案；`note` 时是一条观察 |

返回建议：`{ ok, path, text?, stats? }`。`show` 没有档案时返回说明而不是错误（做法上：没有档案不是失败）。

### 2. `writing_corpus`

| 参数 | 说明 |
|---|---|
| `action` | `add / list / rebuild / collect` |
| `paths` | 绝对路径数组；由宿主读取，不受沙箱限制 |
| `title` | 可选，单篇标题 |
| `origin` | `upload / chat / article` |

`collect` 由宿主读 DSH 会话记录，生成 `corpus.md`，返回条数与路径；脚本不碰 `$DSH_HOME/sessions`。

返回建议：`{ ok, added, skipped, corpusPath }`。收录后自动 `rebuild`。

### 3. `writing_preview`

| 参数 | 说明 |
|---|---|
| `action` | `render / open / status` |
| `project` | 项目绝对路径或 slug |

返回建议：`{ ok, url, blocks, words }`，`url` 是 `/writing/preview/<slug>`。`render` 内部调用同一套渲染逻辑；`open` 只返回已有页面。

### 4. `writing_apply_edits`

| 参数 | 说明 |
|---|---|
| `project` | 项目路径 |
| `edits` | 解析后的 `edits.json` 对象 |
| `dryRun` | 可选 |

返回建议：`{ ok, applied, warnings, revisionId, previewUrl }`。应用后自动重新渲染，省掉模型再跑一次命令。

最小可用版本可以只做 `writing_voice` + `writing_preview`，其余继续让模型跑 CLI（前提：项目目录在 workspace 内、`<home>` 可写）。

## Web 路由

建议注册一个前缀 `/writing`：

| 路由 | 用途 |
|---|---|
| `GET /writing/` | 面板页（语料、档案、成文、预览入口） |
| `GET /writing/preview/<slug>` | 返回该项目的 `preview.html`（单文件，无需额外静态资源） |
| `GET /writing/api/catalog` | 档案列表、项目列表、当前 active |
| `POST /writing/api/voice/collect` | 可选：从 DSH 会话收集语料，返回 `corpus.md` 路径与条数 |
| `GET /writing/works/<slug>/<file>` | 可选：允许下载 draft.md / sources.md |

安全要求：

- 只放行已登记的项目目录，路径要 `realpath` 后确认在根目录内，拒绝 `..` 和点文件。
- `collect` 这类 POST 只接受同源 JSON（参考同类插件的 `readJson` 做法）。
- 预览页允许 iframe 嵌入；不要给 `allow-same-origin` 之外的额外权限。

## 预览页事件协议

### 页面 → 父页面

```js
// 页面加载完成
{ type: 'writing:ready', project: { slug: 'demo', title: '…' } }

// 用户在预览里点了工具条按钮
{ type: 'writing:edit-request', payload: { /* 见 references/revise.md */ } }
```

### 父页面 → 页面

```js
{ type: 'writing:refresh' }   // 重新加载预览（重新 render 之后用）
```

页面会校验消息来源吗？页面只负责发；父页面必须校验：

```js
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin) return
  if (!event.source || event.source !== frameRef.current?.contentWindow) return
  const data = event.data
  if (!data || data.type !== 'writing:edit-request' || !data.payload) return
  // 只接受本插件 iframe 发来的
})
```

### 客户端把请求填进对话

参考同类插件的 `startSession` 做法：**只填草稿，不自动发送**。

```js
const prompt = [
  '（写作模块 · 选区修改请求）',
  `文章：${payload.project.title}（${payload.project.path}）`,
  `操作：${payload.actionLabel}`,
  '',
  '请按下面的 JSON 改稿：只改 selection.blocks 里的块，选区外不动；改完用 scripts/writing.py patch 应用并重新 render。',
  '',
  '```json',
  JSON.stringify(payload, null, 2),
  '```',
].join('\n')

ctx.uiWorkspace.startSession(undefined, { prompt, whenDraftExists: 'replace' })
```

模型加载 `dsh-writing` skill 后，按 `references/revise.md` 处理。插件不需要理解 `edits.json` 的细节。

## Skill 注册

模块按 DSH 的 skill 目录约定组织：`SKILL.md` + `references/`，frontmatter 只有 `name` 和 `description`。

插件里可以照同类插件的 skill 注册做法：

- `ctx.skills.registerProvider(() => createSkillProvider([...], pluginRoot))`
- `candidate` 用 `source: 'bundled'`、`rank: 600`（用户自己装的同名 skill 优先）
- `get` 时把 `<SKILL_ROOT>` 换成实际目录，并在末尾加插件补充说明（数据目录、宿主工具优先、不要跑 git）。

补充说明至少写三句：

1. 本 skill 的目录是 `<dir>`，命令里的 `scripts/` 相对这个目录。
2. 数据目录是 `<home>`；有 `writing_voice` / `writing_preview` 等工具时优先用工具，不要直接写工作区外的文件。
3. 交付的 `preview.html` 要能被插件页面打开；登记项目时用插件工具。

## 面板要素

最小面板（参考歸藏设计 gallery 的信息密度）：

1. **写作**：一个输入框（题目/描述）+「自己找资料」开关；点「开始」把草稿填进新对话。
2. **上传语料**：拖文件（md/txt/docx/html）→ 收录 → 显示篇数与字数；旁边一个「从我的对话学习」按钮（可选）。
3. **语气档案**：显示当前档案的画像、更新时间、置信度、特征条数；「重新学习」「查看全文」「切换档案」。
4. **项目列表**：标题、字数、来源数、最后修改、预览入口。
5. **预览页**：iframe 加载 `/writing/preview/<slug>`；顶部显示字数与来源数；选中正文弹工具条。

面板只做入口和状态，不重复实现写作逻辑。

## 无插件时的降级

模块必须能独立跑：skill 装在 `~/.dsh/skills/` 或项目 `.agents/skills/`，数据在 `~/.dsh-writing`，预览用文件路径打开，修改请求靠剪贴板复制粘贴。降级路径要一直保留，插件只是把它包了一层。

## 验收清单

- [ ] `python scripts/selftest.py` 全过。
- [ ] 上传 `.md` 与 `.docx` 语料，`corpus list` 篇数、字数正确；重复上传被跳过。
- [ ] `voice check` 对合格档案返回 0，对缺小节的档案返回 1。
- [ ] `init` 建项目，`render` 出预览；浏览器打开能选中、能出工具条、能复制 JSON。
- [ ] 把复制出的 JSON 交给模型，`patch --dry-run` 的 diff 只落在选区所在块。
- [ ] 旧预览再提交，`patch` 报「内容已经变了」，不静默改错。
- [ ] `revert` 能恢复上一版；恢复后哈希与 `draftHashBefore` 一致。
- [ ] `check` 能报出引用编号缺失；补齐后通过。
- [ ] 插件 iframe 里点按钮，父页面收到 `writing:edit-request`，新对话输入框已填好、未自动发送。
- [ ] 预览页不能读到项目目录外的文件；路由拒绝 `..`。
- [ ] 档案与语料只写在本机 `<home>`，不上传。

## 后续可以做的

- 语料「从 DSH 会话收集」：读取会话事件、只保留用户亲手发的消息，按长度排序、去重、封顶。
- 预览页主题跟随 DSH：父页面发 `{type:'writing:scheme', scheme}`，页面加 `data-theme`。
- 多处选区批量修改：现在一次请求只覆盖一个连续选区；需要多选时，前端累积多个 payload，模型合并成一次 `edits.json`。
- 稿件版本对比：`revisions.jsonl` 已有 `draftBefore`，可加「和上一版对比」视图。
- 导出：`draft.md` → docx/pdf 可以复用 `official-document-drafting` 的导出器，或 `office` 系列 skill；本模块不重复实现。
