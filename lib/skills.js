// skill 提供方：把插件自带的两个 skill 注册进 DSH 的 skill 目录（ctx.skills）。
//   research-writing            研究型写作：语料 → 语气档案、资料 / 描述 → 成文、预览选区改稿
//   official-document-drafting  公文起草：8 个文种，GB/T 9704-2012，导出 Word
// 用户自己在 ~/.dsh/skills 或项目里装了同名 skill 时，那一份优先（本提供方按「随包提供」的 rank 600 排在最后）。
// 加载正文时把 <SKILL_ROOT> 换成实际目录，并在**正文前面**补一段「在这个插件里怎么交付」的说明——
// 放前面是为了先盖住模块原文里「跑 scripts/writing.py」的旧路径，让模型先看见插件工具。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RANK = 600
const INVOCATION = { modelInvocable: true, userInvocable: true }

function parse(file) {
  // 去 BOM：编辑器另存、Windows 脚本写出来的文件常带 BOM，会让 ^--- 匹配失败、skill 直接消失
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return null
  const field = (k) => (m[1].match(new RegExp(`^${k}:\\s*(.+)$`, 'm')) || [])[1]?.trim().replace(/^(["'])(.*)\1$/, '$2')
  const name = field('name')
  const description = field('description')
  return name && description ? { name, description, body: text.slice(m[0].length) } : null
}

export function readSkills(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'SKILL.md')))
    .map((d) => ({ dir: join(dir, d.name), file: join(dir, d.name, 'SKILL.md'), ...parse(join(dir, d.name, 'SKILL.md')) }))
    .filter((s) => s.name)
}

const COMMON = [
  '## 在「写作助手」插件（DSH）里使用',
  '',
  '- 这是一个插件，不是命令行项目：稿库在 `$DSH_HOME/writing-assistant`，页面在旁边显示进度和预览。下面这些工具在 Host 进程里执行，直接写稿库，**不要**用 bash 去写数据目录。',
  '- 交付 = 调用工具把成稿写进稿库。**只在回复里贴正文等于没交付**：用户看不到预览，也改不了。',
  '- 稿子写完用 `writing_save_work`（新建传 kind + draft；改已有传 id）。改某一段用 `writing_read_work` 拿块 id 和哈希，再 `writing_patch_blocks`；选区外的块一个字都不动。',
  '- 用户已经在页面上填了任务单，prompt 里的字段就是他的输入；信息不足时留占位符并在 note 里说明，不要反问（后台任务没人回答）。',
]

function header(skill) {
  const lines = [...COMMON, `- 本 skill 的目录是 \`${skill.dir}\`，下文的 \`references/\`、\`assets/\`、\`scripts/\` 都相对这个目录。`]
  if (skill.name === 'research-writing') {
    lines.push(
      '- 后台文章只按本次任务单使用随任务附上的档案；任务单写「本次不用」时，不读取默认档案。普通对话需要档案时才调用 `writing_voice show`。只有用户明确希望记录长期措辞偏好时才使用 `note`。使用插件的宿主工具保存，勿用独立命令行脚本写入插件数据目录。',
      '- 写文章写作前先读 `references/analysis-playbook.md`：先拆用户原话（核心问题、对象/时间、判断数、角度、证据、标题归属），预测稿先写基线/机制/条件；标题、结构、人物和比喻都没有硬配额。',
      '- 文章写作写正文或大幅重写前读 `references/wechat-analysis/drafting.md`（真实材料开稿、对象和动作先出现、每段增加一项读者需要的信息）；拿到草稿、只润色或交稿前读 `references/wechat-analysis/editing.md`（先改判断再改句子，改完对原稿和来源回读：引语逐字、期间/范围/数字/判断强度不漂移）。这两份只管句子，任务拆解和证据口径仍以 analysis-playbook.md 为准。',
      '- 分析型任务必须先调 `writing_save_outline` 交提纲，通过后再写正文；保存后按 `review` / warnings 修掉 error，仍有缺口就写「草稿已保存，需核对」。',
      '- 写深度研究时按 `references/deep-research.md` 执行，并按其中指引读 `references/deep-research-methods.md`。按题目/材料选择研究角度，梳理决定性变化、同期可比对象和当前证据边界。',
      '- 引用按文体：分析型使用行内归属。深度研究按页面设置使用行内归属或编号，编号与文末条目对应。文末用 `## 参考资料` 列来源。',
      '- 交付前必须读 `references/quality-gate.md` 过一遍去 AI 味自检（第一节的判断顺序 + 第五节的反例清单），这一道不能跳。',
      '- 成稿存进稿库后，页面会把 `draft.md` 渲染成可选中、可逐块修改的预览；`sources.md`（来源台账）一起传进 `writing_save_work` 的 `sources`，用户能在稿子详情里查。',
      '- 导出时，在预览顶栏点击「导出 Word」。各类文章和导入稿使用 A4 阅读版式，包含标题、小节、正文、列表、表格和参考资料；公文按文种版式导出。',
      '- 每处具体数字、日期、引文都要能回到 `sources.md`；没有证据写 `〔待核：…〕`，不要编。',
    )
  }
  if (skill.name === 'official-document-drafting') {
    lines.push(
      '- 文种在 `assets/registry.toml` 里只有 8 个（通告、函、纪要、通报、情况专报、讲话稿、工作总结、危机处置报告）。用户点名的文种不在列表里（包括已移除的决议、通知、报告、请示、方案等），就说明没有这个模板，别硬套别的文种。',
      '- 用户在页面上勾了模板、填了要素，prompt 里会带「文种 + 要素」：按 `references/doc-types/<id>.md` 的「起草前确认—撰写思路—写作规则—模板」写，缺的要素留 `[占位符]`，不要编。',
      '- 写完调用 `writing_save_work`（`kind: "official"`，同时传 `docTypeName`，例如「纪要」），再调 `writing_check` 跑机检；有 errors 就补齐后重新保存。',
      '- 在预览顶栏点击「导出 Word」。公文使用 `scripts/generate_docx.py`，文章使用 `scripts/export_article.py`。',
      '- 自由撰写模式（用户给的是自定义提示词而不是模板）：也按 `references/rules.md` 的事实边界和行文规则写，文种自己判断并在 note 里说明。',
    )
  }
  return `${lines.join('\n')}\n\n---\n`
}

export function createSkillProvider(dir) {
  const candidate = (s) => ({
    name: s.name,
    description: s.description,
    path: s.file,
    invocation: INVOCATION,
    source: 'bundled',
    provider: 'writing-assistant',
    rank: RANK,
    locator: s.dir,
    resourceBase: { kind: 'directory', path: s.dir },
  })
  return {
    name: 'writing-assistant',
    async list() {
      return readSkills(dir).map(candidate)
    },
    async get(c) {
      const s = readSkills(dir).find((x) => x.dir === c.locator && x.name === c.name)
      if (!s) return undefined
      const content = `${header(s)}\n${s.body.replaceAll('<SKILL_ROOT>', s.dir)}`
      const { rank, locator, ...summary } = candidate(s)
      return { ...summary, content }
    },
  }
}
